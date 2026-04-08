# =========================================================
# 必要なライブラリ（便利な道具箱）の読み込み
# =========================================================
import os
import json
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
import gspread
from google.oauth2.service_account import Credentials
from datetime import datetime
import uvicorn
from urllib.parse import quote

# =========================================================
# FastAPIアプリケーションの初期設定
# =========================================================
# アプリケーション本体の作成
app = FastAPI()
# HTMLファイル（テンプレート）が入っているフォルダを指定
templates = Jinja2Templates(directory="templates")

# =========================================================
# Google Spreadsheet 連携の設定
# =========================================================
SPREADSHEET_ID = '1_18mozgallwxSZ_u9d5iCdP9CftT7nZ9lgo-v3jbzwU'
# スプレッドシートとドライブにアクセスするための権限設定
scopes = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']

# 🌟【重要セキュリティ処理】環境変数から秘密鍵を取得
# Render（本番サーバー）に設定した「GOOGLE_CREDENTIALS」の中身を読み込みます
google_creds_env = os.environ.get("GOOGLE_CREDENTIALS")

if google_creds_env:
    # もし環境変数があれば（＝Render等の本番環境で動いている場合）、そこから認証する
    creds_dict = json.loads(google_creds_env)
    credentials = Credentials.from_service_account_info(creds_dict, scopes=scopes)
else:
    # 環境変数がなければ（＝自分のパソコン等でテストしている場合）、ファイルから直接読み込む
    credentials = Credentials.from_service_account_file('secret_key.json', scopes=scopes)

# 認証情報を使って、スプレッドシートを操作する準備を完了させる
gc = gspread.authorize(credentials)


# =========================================================
# 日付データを扱いやすくするための補助関数
# =========================================================
def parse_date(date_val):
    """
    スプレッドシートに入力された日付の「表記揺れ（/ や -）」を吸収し、
    Pythonが過去・未来の計算をできる「日付オブジェクト」に変換する関数です。
    """
    if not date_val: return None
    date_str = str(date_val).strip().replace('/', '-')
    try:
        return datetime.strptime(date_str.split(' ')[0], '%Y-%m-%d').date()
    except:
        return None


# =========================================================
# メイン処理：スプレッドシートからイベントを取得し、整理する関数
# =========================================================
def get_events_data(is_past=False):
    """
    スプレッドシートのデータを読み込み、過去か未来かで振り分け、
    HTMLで表示しやすい綺麗な形（日付のフォーマットやマップURLの生成）に加工して返します。
    """
    # 1. スプレッドシートの1つ目のシートを開き、全データを取得
    sh = gc.open_by_key(SPREADSHEET_ID)
    worksheet = sh.get_worksheet(0)
    all_data = worksheet.get_all_records()
    
    # 今日の日付を取得（これより前か後かで過去・未来を判定する）
    today = datetime.now().date()
    target_events = []

    # 2. 取得したデータを1行ずつチェックしていくループ処理
    for item in all_data:
        start_date = parse_date(item.get('開始日'))
        if not start_date: continue # 開始日が空欄の行は無視する
        
        # 終了日が空欄なら、開始日と同じ日（1日限りのイベント）として扱う
        end_date = parse_date(item.get('終了日')) or start_date
        
        # 3. 過去ページ用か、未来ページ用かでフィルタリング（ふるい分け）
        if is_past:
            # 過去ページを作りたいのに、今日以降のイベントだったらスキップ
            if end_date >= today: continue 
        else:
            # 未来ページを作りたいのに、もう終わったイベントだったらスキップ
            if end_date < today: continue  

        # 4. 日付の綺麗な日本語フォーマット作成（例：2026年4月18日 〜 19日）
        if end_date > start_date:
            if start_date.year == end_date.year:
                item['display_date'] = f"{start_date.year}年{start_date.month}月{start_date.day}日 〜 {end_date.month}月{end_date.day}日"
            else:
                item['display_date'] = f"{start_date.year}年{start_date.month}月{start_date.day}日 〜 {end_date.year}年{end_date.month}月{end_date.day}日"
        else:
            item['display_date'] = f"{start_date.year}年{start_date.month}月{start_date.day}日"
        
        # 5. 住所データから、Googleマップでピンが立つURLを自動生成
        addr = item.get('住所') or item.get('場所') or ""
        item['map_url'] = f"https://www.google.com/maps/search/?api=1&query={quote(addr)}"
        
        # 並び替え用に、計算可能な日付データを一時的に保存
        item['start_obj'] = start_date
        
        # 加工したデータをリストに追加
        target_events.append(item)
            
    # 6. 並び替え（ソート）
    # is_past=True(過去)の時は「新しい順(降順)」、False(未来)の時は「日付順(昇順)」に並び替える
    target_events.sort(key=lambda x: x['start_obj'], reverse=is_past)
    
    return target_events


# =========================================================
# ルーティング設定（URLにアクセスされた時にどの画面を返すかの設定）
# =========================================================

# --- HOME (TOPページ: http://.../) にアクセスされた時の処理 ---
@app.get("/", response_class=HTMLResponse)
async def read_home(request: Request):
    try:
        # 未来のイベントを取得
        active_events = get_events_data(is_past=False)
        # リストの1番目（一番近いイベント）を next_event として抽出
        next_event = active_events[0] if active_events else None
        
        # home.html にデータを渡して画面を作成
        return templates.TemplateResponse(
            request=request, 
            name="home.html", 
            context={"request": request, "next_event": next_event}
        )
    except Exception as e:
        return HTMLResponse(content=f"Home Error: {str(e)}", status_code=500)

# --- EVENTS (一覧ページ: http://.../events) にアクセスされた時の処理 ---
# URLの末尾に「?page=past」がついていれば、変数 page に 'past' が入る
@app.get("/events", response_class=HTMLResponse)
async def read_events(request: Request, page: str = None):
    try:
        # ?page=past なら True、それ以外なら False になるフラグ
        is_past = (page == 'past')
        # フラグを渡してイベントを取得
        events_list = get_events_data(is_past=is_past)
        
        if is_past:
            # 過去イベント時は、全件をスケジュール枠に流し込む
            return templates.TemplateResponse(
                request=request, 
                name="events.html", 
                context={
                    "request": request,
                    "pinned_event": None,
                    "scheduled_events": events_list,
                    "is_past": True
                }
            )
        else:
            # 通常時（未来）は、1件目をNext Eventに、2件目以降をスケジュール枠に分ける
            pinned_event = events_list[0] if events_list else None
            scheduled_events = events_list[1:] if len(events_list) > 1 else []
            
            return templates.TemplateResponse(
                request=request, 
                name="events.html", 
                context={
                    "request": request, 
                    "pinned_event": pinned_event, 
                    "scheduled_events": scheduled_events,
                    "is_past": False
                }
            )
    except Exception as e:
        return HTMLResponse(content=f"Events Error: {str(e)}", status_code=500)
    
# --- CONCEPT (コンセプトページ) ---
@app.get("/concept", response_class=HTMLResponse)
async def read_concept(request: Request):
    try:
        return templates.TemplateResponse(
            request=request, 
            name="concept.html", 
            context={"request": request}
        )
    except Exception as e:
        return HTMLResponse(content=f"Concept Error: {str(e)}", status_code=500)
    
# =========================================================
# ローカルテスト用の起動コマンド
# =========================================================
# このファイルを直接実行した時だけ、ローカルサーバー（127.0.0.1:8000）を立ち上げる
if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)