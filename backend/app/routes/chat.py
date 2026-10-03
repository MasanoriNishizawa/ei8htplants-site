from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from collections import defaultdict
from datetime import datetime, timezone, timedelta
import time
from google import genai
from google.genai import types
from ..config import GEMINI_API_KEY
from ..db import supabase, admin_supabase

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
- 回答はプレーンテキストで記述する。Markdown記法（**、##、*、`など）は使わない

【回答の優先順位】
- 後述の「よくある質問と回答」に該当する質問には、その回答内容をそのまま使って答える
- Q&Aに記載のない店舗情報・価格・在庫・スケジュールなどの具体的な情報は推測して答えない
- 確実でない情報はお問い合わせフォーム（https://ei8htplants.com/contact）へ案内する"""

MODEL = 'gemini-flash-lite-latest'

_JST = timezone(timedelta(hours=9))


def _build_site_context() -> str:
    """公開データ（イベント・商品・記事・取扱店）を取得してコンテキスト文字列を構築する。

    個人情報（予約・注文・お問い合わせ）は一切含まない。
    各テーブルの取得に失敗しても他のテーブルの取得は続行する。

    Returns:
        チャットのシステムプロンプトに追記するサイト情報テキスト
    """
    today = datetime.now(_JST).date().isoformat()
    parts = []

    # 開催予定・開催中のイベント（過去分は除外）
    try:
        rows = supabase.table('events').select('name,start_date,end_date,time,location,has_workshop').order('start_date').execute().data
        upcoming = [e for e in rows if (e.get('end_date') or e.get('start_date', '')) >= today]
        if upcoming:
            lines = ['【開催予定のイベント・ワークショップ】']
            for e in upcoming:
                date_str = e['start_date']
                if e.get('end_date') and e['end_date'] != e['start_date']:
                    date_str += f"〜{e['end_date']}"
                time_str = f" {e['time']}" if e.get('time') else ''
                ws = '（ワークショップあり・要予約）' if e.get('has_workshop') else ''
                lines.append(f"- {e['name']}：{date_str}{time_str}、{e['location']}{ws}")
            parts.append('\n'.join(lines))
    except Exception:
        pass

    # 販売中の商品（公開済み・在庫あり）
    try:
        rows = supabase.table('products').select('name,price,stock,category').eq('is_published', True).gt('stock', 0).order('display_order').execute().data
        if rows:
            lines = ['【販売中の商品】']
            for p in rows:
                cat = f"[{p['category']}] " if p.get('category') else ''
                lines.append(f"- {cat}{p['name']}：¥{p['price']:,}（在庫{p['stock']}点）")
            parts.append('\n'.join(lines))
    except Exception:
        pass

    # 公開記事（タイトルとタグのみ。本文は含めない）
    try:
        rows = admin_supabase.table('articles').select('title,tags').eq('is_published', True).order('display_order').execute().data
        if rows:
            lines = ['【ジャーナル・記事】']
            for a in rows:
                tags = '、'.join(a['tags']) if a.get('tags') else ''
                tag_str = f"（{tags}）" if tags else ''
                lines.append(f"- {a['title']}{tag_str}")
            parts.append('\n'.join(lines))
    except Exception:
        pass

    # 取扱店
    try:
        rows = supabase.table('stockists').select('name,area,brands').order('display_order').execute().data
        if rows:
            lines = ['【取扱店】']
            for s in rows:
                area = f"（{s['area']}）" if s.get('area') else ''
                brands = '・'.join(s['brands']) if s.get('brands') else ''
                brand_str = f" ※{brands}取扱" if brands else ''
                lines.append(f"- {s['name']}{area}{brand_str}")
            parts.append('\n'.join(lines))
    except Exception:
        pass

    return '\n\n'.join(parts)


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

    system_prompt = SYSTEM_PROMPT

    # サイトの公開データ（イベント・商品・記事・取扱店）を注入する
    site_context = _build_site_context()
    if site_context:
        system_prompt += f'\n\n{site_context}'

    # DBから有効なQ&Aを取得してシステムプロンプトに追記する（テーブル未作成時もエラーにしない）
    try:
        qa_rows = supabase.table('chat_qa').select('question,answer').eq('enabled', True).order('sort_order').execute().data
        if qa_rows:
            qa_text = '\n'.join(f'Q: {row["question"]}\nA: {row["answer"]}' for row in qa_rows)
            system_prompt += f'\n\n【よくある質問と回答】\n{qa_text}'
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
