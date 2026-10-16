"""ei8ht plants 分析ダッシュボードの入り口。

起動: analytics フォルダで `.venv/bin/streamlit run app.py`
本番の Supabase を読み取り専用で参照し、イベント収支・WS・ショップ・問い合わせを分析する。
Render で公開するため、管理画面と同じ Supabase のアカウントでログインした人だけが見られる（lib/auth.py）。
"""

import streamlit as st

from lib.auth import render_sidebar, require_login
from views import advanced, events, inbox, overview, shop, traffic, workshop

# 1. ページ全体の設定（タブのタイトル・横幅いっぱいに使う）
st.set_page_config(page_title="ei8ht plants 分析", page_icon="🌵", layout="wide")

# 2. ログインしていなければログインフォームだけを出してここで止める（以降の画面・データ読み込みは行わない）
user_email = require_login()

# 3. 画面の一覧。左のメニューにこの順番で並ぶ
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

# 4. サイドバーの下にログイン中のアカウント・ログアウト・再読み込みボタンを置く（キャッシュを消して本番から取り直す）
render_sidebar(user_email)
with st.sidebar:
    if st.button("データを再読み込み", icon=":material/refresh:", width="stretch"):
        st.cache_data.clear()
        st.rerun()
    st.caption("本番データを読み取り専用で表示しています（10分ごとに自動更新）。")

# 5. 選ばれた画面を表示する
pages.run()
