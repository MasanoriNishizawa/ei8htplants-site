"""ei8ht plants 分析ダッシュボードの入り口。

起動: analytics フォルダで `.venv/bin/streamlit run app.py`
本番の Supabase を読み取り専用で参照し、イベント収支・WS・ショップ・問い合わせを分析する。
Streamlit Community Cloud で公開するため、管理画面と同じ Supabase のアカウントでログインした人だけが見られる（lib/auth.py）。
"""

import streamlit as st

# 0. 予期しないエラーの詳細（例外の種類・メッセージ・ファイルの場所）を画面に出さない。
#    設定ファイル（.streamlit/config.toml）が読まれない起動の仕方でも効くように、コードでも同じ値を入れる。
#    下の lib・views の import で起きたエラーにも効くよう、ほかの import より前に置く
st.set_option("client.showErrorDetails", "none")

from lib.auth import render_sidebar, require_login  # noqa: E402
from lib.data import CACHE_TTL  # noqa: E402
from lib.secrets_env import load_secrets_into_env  # noqa: E402
from views import advanced, events, inbox, overview, shop, traffic, workshop  # noqa: E402

# 1. ページ全体の設定（タブのタイトル・タブのアイコン（Material の植物のアイコン）・横幅いっぱいに使う）
st.set_page_config(page_title="ei8ht plants 分析", page_icon=":material/eco:", layout="wide")

# 2. Community Cloud の Secrets（secrets.toml）を環境変数に反映させる。
#    接続情報は各モジュールが os.getenv で読むため、ログインの判定より前に済ませる。
#    secrets.toml が無いローカル環境では何もしない（.env の値がそのまま使われる）
load_secrets_into_env()

# 変数の内容: user_email: ログインに成功した利用者のメールアドレス。
# 3. ログインしていなければログインフォームだけを出してここで止める（以降の画面・データ読み込みは行わない）
user_email = require_login()

# 4. 画面の一覧。左のメニューにこの順番で並ぶ
# 変数の内容: pages: サイドバーに表示する分析画面のナビゲーション。
pages = st.navigation(
    {
        "ダッシュボード": [
            st.Page(overview.render, title="概要", icon=":material/dashboard:", default=True),
            st.Page(events.render, title="イベント収支", icon=":material/storefront:", url_path="events"),
            st.Page(workshop.render, title="ワークショップ", icon=":material/potted_plant:", url_path="workshop"),
            st.Page(shop.render, title="ショップ", icon=":material/shopping_cart:", url_path="shop"),
            st.Page(inbox.render, title="問い合わせ・記事", icon=":material/mail:", url_path="inbox"),
        ],
        "分析": [
            st.Page(traffic.render, title="アクセス解析", icon=":material/travel_explore:", url_path="traffic"),
            st.Page(advanced.render, title="予測・シミュレーション", icon=":material/insights:", url_path="advanced"),
        ],
    }
)

# 5. サイドバーの下にログイン中のアカウント・ログアウト・再読み込みボタンを置く（キャッシュを消して本番から取り直す）
render_sidebar(user_email)
with st.sidebar:
    if st.button("データを再読み込み", icon=":material/refresh:", width="stretch"):
        st.cache_data.clear()
        st.rerun()
    # キャッシュは時間で自動的に取り直すのではなく、期限（CACHE_TTL）を過ぎてから操作したときに取り直す
    st.caption(
        f"本番データを読み取り専用で表示しています。最大{CACHE_TTL // 60}分前のデータです（操作したときに取り直します）。"
    )

# 6. 選ばれた画面を表示する
pages.run()
