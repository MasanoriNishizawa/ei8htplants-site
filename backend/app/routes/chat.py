from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from collections import defaultdict
import time
from google import genai
from google.genai import types
from ..config import GEMINI_API_KEY
from ..db import supabase

router = APIRouter()

# IP単位のリクエスト履歴（インメモリ）
_request_log: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT = 10   # 1分間の最大メッセージ数
RATE_WINDOW = 60  # 秒


def _check_rate_limit(ip: str) -> None:
    """IP単位のレート制限チェック。超過時は429を返す。

    Args:
        ip: クライアントのIPアドレス

    Raises:
        HTTPException(429): 1分間の上限を超えた場合
    """
    now = time.time()
    _request_log[ip] = [t for t in _request_log[ip] if now - t < RATE_WINDOW]
    if len(_request_log[ip]) >= RATE_LIMIT:
        raise HTTPException(status_code=429, detail='送信回数の上限に達しました。しばらく待ってから再試行してください。')
    _request_log[ip].append(now)

# ei8ht plants コンシェルジュとしての振る舞いと対応範囲を定義するシステムプロンプト
SYSTEM_PROMPT = """あなたは「ei8ht plants」のAIコンシェルジュです。
植物の育て方・管理に関する相談と、ワークショップ・予約に関する質問に対応します。

【ei8ht plants について】
- アガベ、塊根植物（コーデックス）、灌木など個性的な植物を自ら生産・販売するブランド
- 株選びから育て方まで幅広くサポート

【取り扱いブランド】
- ei8ht plants: アガベ・塊根植物・灌木などビザールプランツ専門
- HUE: カラープランツセレクション（葉色・草姿にこだわった植物）
- Habitat Oides: ハビタットスタイル® に仕立てた作品の展示販売と、ハビタットスタイル® を作成するワークショップを開催しているブランド

【ワークショップ・予約について】
- ワークショップの詳細・内容は https://ei8htplants.com/habitatoides/workshop で確認できます
- 開催日程・予約は https://ei8htplants.com/events のイベント一覧から各回のページを開いて行います
- 「/reserve」のページは単体では予約できません。必ずイベントページから予約してください
- キャンセルはご予約時にお送りした受付メールに記載のキャンセルリンクから手続きできます

【対応方針】
- 植物の育て方・水やり・日当たり・土・肥料・病害虫などの相談に丁寧に答える
- ワークショップや予約に関する質問に答える
- 回答は簡潔に、親しみやすいトーンで
- 日本語で質問されたら日本語で、英語で質問されたら英語で答える
- 「ハビタットスタイル」という言葉を使う場合は必ず「ハビタットスタイル®」と記載する
- 「HABITATSTYLE / ハビタットスタイル」は Shabomaniac!（およびTHE SUCCULENTIST）の登録商標である

【回答の優先順位】
- 後述の「よくある質問と回答」に該当する質問には、その回答内容をそのまま使って答える
- Q&Aに記載のない店舗情報・価格・在庫・スケジュールなどの具体的な情報は推測して答えない
- 確実でない情報はお問い合わせフォーム（https://ei8htplants.com/contact）へ案内する"""

MODEL = 'gemini-flash-lite-latest'


class Message(BaseModel):
    """チャットメッセージの単一エントリ。"""
    role: str  # 'user' または 'model'
    content: str


class ChatRequest(BaseModel):
    """チャットAPIのリクエストボディ。

    Args:
        messages: これまでの会話履歴（role + content のリスト）
    """
    messages: list[Message]


@router.post('/chat')
def chat(body: ChatRequest, request: Request):
    """Gemini を使った植物相談・予約チャットエンドポイント。

    会話履歴を受け取り Gemini に送信して返答を返す。
    システムプロンプトで ei8ht plants コンシェルジュとして振る舞うよう設定している。

    Args:
        body: 会話履歴を含むリクエスト

    Returns:
        dict: { reply: str } — モデルの返答テキスト

    Raises:
        HTTPException(503): GEMINI_API_KEY が未設定の場合
        HTTPException(500): Gemini API 呼び出しに失敗した場合
    """
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail='Chat is not available')

    ip = request.client.host if request.client else 'unknown'
    _check_rate_limit(ip)

    client = genai.Client(api_key=GEMINI_API_KEY)

    # DBから有効なQ&Aを取得してシステムプロンプトに追記する（テーブル未作成時もエラーにしない）
    system_prompt = SYSTEM_PROMPT
    try:
        qa_rows = supabase.table('chat_qa').select('question,answer').eq('enabled', True).order('sort_order').execute().data
        if qa_rows:
            qa_text = '\n'.join(f'Q: {row["question"]}\nA: {row["answer"]}' for row in qa_rows)
            system_prompt = f'{SYSTEM_PROMPT}\n\n【よくある質問と回答】\n{qa_text}'
    except Exception:
        pass

    # Gemini の history 形式（最後のユーザーメッセージを除いた履歴）に変換
    history = [
        types.Content(role=msg.role, parts=[types.Part(text=msg.content)])
        for msg in body.messages[:-1]
    ]

    chat_session = client.chats.create(
        model=MODEL,
        history=history,
        config=types.GenerateContentConfig(system_instruction=system_prompt),
    )

    try:
        response = chat_session.send_message(body.messages[-1].content)
        return {'reply': response.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
