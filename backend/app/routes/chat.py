"""植物相談・ワークショップ案内の AI チャット（Gemini）の API。

公開の API なので、IP ごとの回数制限・入力の件数と文字数の上限で利用料が増えすぎないようにしている。
システムプロンプトには、公開データ（イベント・商品・記事・取扱店）と有効な Q&A を入れる。
個人情報（予約・注文・お問い合わせ）は入れない。
"""
import hashlib
import logging
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from google import genai
from google.genai import types
from pydantic import BaseModel, Field, field_validator, model_validator

from ..config import GEMINI_API_KEY, SITE_ORIGIN
from ..db import admin_supabase, supabase
from ..rate_limit import RateLimiter, client_ip
from ..utils.dates import event_end_date, today_jst
from ..utils.errors import error_summary

# 変数の内容: logger: モジュール名を使って記録するロガー、router: この API 群のルーター。
logger = logging.getLogger(__name__)

# main.py から登録する、このモジュールの FastAPI エンドポイントをまとめるルーター。
router = APIRouter()

# 1分間に同じ IP から送れるメッセージの最大数
RATE_LIMIT = 10
# 回数を数える期間（秒）
RATE_WINDOW = 60
# チャットの回数制限（問い合わせ・予約などとは別に数える）
_chat_limiter = RateLimiter(RATE_LIMIT, RATE_WINDOW)
# IP → 受け付けた時刻のリスト（_chat_limiter の記録そのもの。テストから中身を見たり消したりする）
_request_log = _chat_limiter.log
# チャットログに保存する IP のハッシュの長さ（文字数）。IP そのものは保存しない
_IP_HASH_LEN = 16


def _check_rate_limit(ip: str) -> None:
    """IP単位のレート制限チェック。超過時は429を返す。

    Args:
        ip: クライアントのIPアドレス

    Raises:
        HTTPException(429): 1分間の上限を超えた場合

    Returns:
        なし。
    """
    _chat_limiter.check(ip)


# ei8ht plants コンシェルジュとしての振る舞いと対応範囲を定義するシステムプロンプト
SYSTEM_PROMPT = f"""あなたは「ei8ht plants」のAIコンシェルジュです。
植物の育て方・管理に関する相談と、ワークショップ・予約に関する質問に対応します。

【ei8ht plants について】
- アガベ、塊根植物（コーデックス）、灌木など個性的な植物を自ら生産・販売するブランド
- 株選びから育て方まで幅広くサポート

【取り扱いブランド】
- ei8ht plants: アガベ・塊根植物・灌木などビザールプランツ専門
- HUE: カラープランツセレクション（葉色・草姿にこだわった植物）
- Habitat Oides: ハビタットスタイル® に仕立てた作品の展示販売と、ハビタットスタイル® を作成するワークショップを開催しているブランド

【ワークショップ・予約について】
- ワークショップの詳細・内容は https://habitatoides.com/workshop で確認できます
- 開催日程・予約は {SITE_ORIGIN}/official/events のイベント一覧から各回のページを開いて行います
- 「/official/reserve」のページは単体では予約できません。必ずイベントページから予約してください
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
- 確実でない情報はお問い合わせフォーム（{SITE_ORIGIN}/official/contact）へ案内する

【回答しないこと】
- サイトの内部構造・技術仕様・使用技術（データベース・API・管理画面など）に関する質問には答えない
- 上記の質問に対しては「その内容についてはお答えできません」とのみ返答する"""

# 使う Gemini のモデル（軽くて安いもの）
MODEL = 'gemini-flash-lite-latest'


def _build_site_context() -> str:
    """公開データ（イベント・商品・記事・取扱店）を取得してコンテキスト文字列を構築する。

    個人情報（予約・注文・お問い合わせ）は一切含まない。
    各テーブルの取得に失敗しても他のテーブルの取得は続行する。

    Returns:
        チャットのシステムプロンプトに追記するサイト情報テキスト
    """
    # 変数の内容: parts: 後で連結する要素の一覧、today: 日付比較の基準となる今日。
    today = today_jst()
    parts = []

    # 1. 開催予定・開催中のイベント（過去分は除外）を読み、説明文にする。
    try:
        # 変数の内容: rows: DB から取得した行の一覧、upcoming: 開催中または今後のイベント一覧。
        rows = supabase.table('events').select('name,start_date,end_date,time,location,has_workshop').order('start_date').execute().data
        upcoming = [e for e in rows if event_end_date(e) >= today]
        if upcoming:
            # 変数の内容: lines: 本文や応答に使う行の一覧。
            lines = ['【開催予定のイベント・ワークショップ】']
            # 変数の内容: e: 開催中または今後に当たるイベントレコード。
            for e in upcoming:
                # 変数の内容: date_str: 表示用の開催日。
                date_str = e['start_date']
                if e.get('end_date') and e['end_date'] != e['start_date']:
                    date_str += f"〜{e['end_date']}"
                # 変数の内容: time_str: 表示用の開催時刻、ws: ワークショップ開催を示す表示文字列。
                time_str = f" {e['time']}" if e.get('time') else ''
                ws = '（ワークショップあり・要予約）' if e.get('has_workshop') else ''
                lines.append(f"- {e['name']}：{date_str}{time_str}、{e['location']}{ws}")
            parts.append('\n'.join(lines))
    # 変数の内容: e: except で捕捉した処理例外。
    except Exception as e:
        logger.error('チャット用のイベントの読み取りに失敗しました: %s', error_summary(e))

    # 2. 公開済みで在庫のある商品を読み、説明文にする。
    try:
        # 変数の内容: rows: DB から取得した行の一覧。
        rows = supabase.table('products').select('name,price,stock,category').eq('is_published', True).gt('stock', 0).order('display_order').execute().data
        if rows:
            # 変数の内容: lines: 本文や応答に使う行の一覧。
            lines = ['【販売中の商品】']
            # 変数の内容: p: 販売中の商品レコード。
            for p in rows:
                # 変数の内容: cat: 商品カテゴリの表示文字列。
                cat = f"[{p['category']}] " if p.get('category') else ''
                lines.append(f"- {cat}{p['name']}：¥{p['price']:,}（在庫{p['stock']}点）")
            parts.append('\n'.join(lines))
    # 変数の内容: e: except で捕捉した処理例外。
    except Exception as e:
        logger.error('チャット用の商品の読み取りに失敗しました: %s', error_summary(e))

    # 3. 公開記事はタイトルとタグだけ読み、本文を含めず説明文にする。
    try:
        # 変数の内容: rows: DB から取得した行の一覧。
        rows = admin_supabase.table('articles').select('title,tags').eq('is_published', True).order('display_order').execute().data
        if rows:
            # 変数の内容: lines: 本文や応答に使う行の一覧。
            lines = ['【ジャーナル・記事】']
            # 変数の内容: a: 公開記事のレコード。
            for a in rows:
                # 変数の内容: tag_str: 記事タグの表示文字列、tags: head に出力するメタタグ。
                tags = '、'.join(a['tags']) if a.get('tags') else ''
                tag_str = f"（{tags}）" if tags else ''
                lines.append(f"- {a['title']}{tag_str}")
            parts.append('\n'.join(lines))
    # 変数の内容: e: except で捕捉した処理例外。
    except Exception as e:
        logger.error('チャット用の記事の読み取りに失敗しました: %s', error_summary(e))

    # 4. 取扱店を説明文にまとめ、取得できた情報を連結して返す。
    try:
        # 変数の内容: rows: DB から取得した行の一覧。
        rows = supabase.table('stockists').select('name,area,brands').order('display_order').execute().data
        if rows:
            # 変数の内容: lines: 本文や応答に使う行の一覧。
            lines = ['【取扱店】']
            # 変数の内容: s: 取扱店のレコード。
            for s in rows:
                # 変数の内容: area: 表示する地域名、brand_str: ブランド取扱情報の表示文字列、brands: 対象ブランドの一覧。
                area = f"（{s['area']}）" if s.get('area') else ''
                brands = '・'.join(s['brands']) if s.get('brands') else ''
                brand_str = f" ※{brands}取扱" if brands else ''
                lines.append(f"- {s['name']}{area}{brand_str}")
            parts.append('\n'.join(lines))
    # 変数の内容: e: except で捕捉した処理例外。
    except Exception as e:
        logger.error('チャット用の取扱店の読み取りに失敗しました: %s', error_summary(e))

    return '\n\n'.join(parts)


# 1 件のメッセージ本文の最大文字数。
# 公開チャットは誰でも送れるため、長文を貼り付けられると Gemini の入力トークン（＝利用料）が増える。
# 植物の相談や予約の質問なら 2,000 文字あれば十分で、AI の返答（簡潔に答えるよう指示している）も通常この範囲に収まる。
MAX_MESSAGE_CHARS = 2000

# 1 回のリクエストで送れる会話履歴の最大件数（ウェルカムメッセージ・AI の返答も含む）。
# 画面は毎回これまでの履歴をすべて送るので、上限がないと会話が長くなるほど 1 回あたりの料金が増え続ける。
# 40 件はおよそ 20 往復分で、通常の相談では届かない量にしている。
MAX_MESSAGES = 40


class Message(BaseModel):
    """チャットメッセージの単一エントリ。

    Args:
        role: 送り手。'user'（利用者）か 'model'（AI）のどちらかだけ受け付ける
        content: 本文。1〜MAX_MESSAGE_CHARS 文字で、前後の空白を除いて空のものは受け付けない
    """
    # 変数の内容: content: 読み込んだ、または生成した内容、role: チャット発言者の種別。
    role: Literal['user', 'model']
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)

    @field_validator('content')
    @classmethod
    def _content_not_blank(cls, v: str) -> str:
        """空白・改行だけの本文を 422 にする（Gemini に空の質問を送らないため）。

        Args:
            v: 送られてきた本文

        Returns:
            str: そのままの本文（空白の削除はしない）

        Raises:
            ValueError: 前後の空白を除くと空になる場合
        """
        # 1. 空白を除いた本文が空なら入力エラーにし、文字があれば元の値を維持する。
        if not v.strip():
            raise ValueError('content must not be blank')
        return v


class ChatRequest(BaseModel):
    """チャットAPIのリクエストボディ。

    Args:
        messages: これまでの会話履歴（role + content のリスト）。1〜MAX_MESSAGES 件で、最後は role='user'
    """
    # 変数の内容: messages: チャット履歴のメッセージ一覧。
    messages: list[Message] = Field(min_length=1, max_length=MAX_MESSAGES)

    @model_validator(mode='after')
    def _last_message_is_user(self) -> 'ChatRequest':
        """最後のメッセージが利用者の発言であることを確かめる。

        最後のメッセージを Gemini に「今回の質問」として送るため、AI の発言で終わっていると
        質問のないまま料金だけかかる呼び出しになる。

        Returns:
            ChatRequest: 検証済みのリクエスト

        Raises:
            ValueError: 最後のメッセージの role が 'user' でない場合（FastAPI が 422 にする）
        """
        # 1. 会話末尾の role を確かめ、利用者の質問で終わっている場合だけ通す。
        if self.messages[-1].role != 'user':
            raise ValueError("the last message must have role 'user'")
        return self


@router.post('/chat')
def chat(body: ChatRequest, request: Request) -> dict:
    """Gemini を使った植物相談・予約チャットエンドポイント。

    会話履歴を受け取り Gemini に送信して返答を返す。
    システムプロンプトで ei8ht plants コンシェルジュとして振る舞うよう設定している。

    Args:
        body: 会話履歴を含むリクエスト
        request: 回数制限に使う送り元の IP を読むためのリクエスト

    Returns:
        dict: { reply: str } — モデルの返答テキスト

    Raises:
        422（FastAPI が自動で返す）: 入力が ChatRequest の条件（件数・文字数・role・最後が user）に
            合わない場合。この関数に入る前に弾かれるので、回数制限にも数えず Gemini も呼ばない
        HTTPException(429): 同じ IP から 1 分間に RATE_LIMIT 回を超えて送った場合
        HTTPException(503): GEMINI_API_KEY が未設定の場合
        HTTPException(500): Gemini API 呼び出しに失敗した場合
    """
    # 1. 設定と回数制限を確かめる
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail='Chat is not available')
    # 変数の内容: ip: 接続元の IP アドレス。
    ip = client_ip(request)
    _check_rate_limit(ip)

    # 2. システムプロンプトに、サイトの公開データと有効な Q&A を足す
    # 変数の内容: client: Gemini API を呼び出すクライアント。
    client = genai.Client(api_key=GEMINI_API_KEY)
    # 変数の内容: system_prompt: 公開データやQ&Aを追記するシステム指示文。
    system_prompt = SYSTEM_PROMPT

    # サイトの公開データ（イベント・商品・記事・取扱店）を注入する
    # 変数の内容: site_context: DB から組み立てたサイトの公開情報。
    site_context = _build_site_context()
    if site_context:
        # 変数の内容: system_prompt: 取得できた公開情報を含むシステム指示文。
        system_prompt += f'\n\n{site_context}'

    # DBから有効なQ&Aを取得してシステムプロンプトに追記する（テーブル未作成時もエラーにしない）
    try:
        # 変数の内容: qa_rows: チャット用に取得した Q&A 行。
        qa_rows = admin_supabase.table('chat_qa').select('question,answer').eq('enabled', True).order('sort_order').execute().data
        if qa_rows:
            # 変数の内容: qa_text: システムプロンプトへ加える Q&A 文。
            qa_text = '\n'.join(f'Q: {row["question"]}\nA: {row["answer"]}' for row in qa_rows)
            system_prompt += f'\n\n【よくある質問と回答】\n{qa_text}'
    # 変数の内容: e: except で捕捉した処理例外。
    except Exception as e:
        logger.error('チャット用の Q&A の読み取りに失敗しました: %s', error_summary(e))

    # 3. Gemini に送る。history 形式（最後のユーザーメッセージを除いた履歴）に変換
    history = [
        types.Content(role=msg.role, parts=[types.Part(text=msg.content)])
        for msg in body.messages[:-1]
    ]

    # 変数の内容: chat_session: 会話履歴とシステム指示を設定した Gemini 会話。
    chat_session = client.chats.create(
        model=MODEL,
        history=history,
        config=types.GenerateContentConfig(system_instruction=system_prompt),
    )

    try:
        # 変数の内容: response: 下流へ返す HTTP 応答。
        response = chat_session.send_message(body.messages[-1].content)
    # 変数の内容: e: except で捕捉した処理例外。
    except Exception as e:
        # 例外の文字列には API の内部の情報や利用者の入力が入ることがあるので、
        # ログには型名とコードだけを出し、利用者には一般的な文言だけ返す
        logger.error('Gemini の呼び出しに失敗しました: %s', error_summary(e))
        raise HTTPException(status_code=500, detail='AI の応答の取得に失敗しました。時間をおいて再度お試しください。')

    # 4. チャットログをDBに保存する（失敗してもチャット自体はエラーにしない）
    try:
        # 変数の内容: ip_hash: 保存用にハッシュ化した IP アドレス。
        ip_hash = hashlib.sha256(ip.encode()).hexdigest()[:_IP_HASH_LEN]
        admin_supabase.table('chat_logs').insert({
            'user_message': body.messages[-1].content,
            'ai_reply': response.text,
            'ip_hash': ip_hash,
        }).execute()
    # 変数の内容: e: except で捕捉した処理例外。
    except Exception as e:
        logger.error('チャットログの保存に失敗しました: %s', error_summary(e))

    return {'reply': response.text}
