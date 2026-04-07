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

app = FastAPI()
templates = Jinja2Templates(directory="templates")

# --- Google Spreadsheet 設定 ---
SPREADSHEET_ID = '1_18mozgallwxSZ_u9d5iCdP9CftT7nZ9lgo-v3jbzwU'
scopes = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
google_creds_env = os.environ.get("GOOGLE_CREDENTIALS")

if google_creds_env:
    creds_dict = json.loads(google_creds_env)
    credentials = Credentials.from_service_account_info(creds_dict, scopes=scopes)
else:
    credentials = Credentials.from_service_account_file('secret_key.json', scopes=scopes)

gc = gspread.authorize(credentials)

def parse_date(date_val):
    if not date_val: return None
    date_str = str(date_val).strip().replace('/', '-')
    try:
        return datetime.strptime(date_str.split(' ')[0], '%Y-%m-%d').date()
    except:
        return None

def get_events_data(is_past=False):
    """スプレッドシートからイベントを取得し、過去/未来で分ける"""
    sh = gc.open_by_key(SPREADSHEET_ID)
    worksheet = sh.get_worksheet(0)
    all_data = worksheet.get_all_records()
    today = datetime.now().date()
    target_events = []

    for item in all_data:
        start_date = parse_date(item.get('開始日'))
        if not start_date: continue
        
        end_date = parse_date(item.get('終了日')) or start_date
        
        # 過去か未来かでフィルタリング
        if is_past:
            if end_date >= today: continue 
        else:
            if end_date < today: continue  

        # 日付フォーマット
        if end_date > start_date:
            if start_date.year == end_date.year:
                item['display_date'] = f"{start_date.year}年{start_date.month}月{start_date.day}日 〜 {end_date.month}月{end_date.day}日"
            else:
                item['display_date'] = f"{start_date.year}年{start_date.month}月{start_date.day}日 〜 {end_date.year}年{end_date.month}月{end_date.day}日"
        else:
            item['display_date'] = f"{start_date.year}年{start_date.month}月{start_date.day}日"
        
        addr = item.get('住所') or item.get('場所') or ""
        item['map_url'] = f"https://www.google.com/maps/search/?api=1&query={quote(addr)}"
        item['start_obj'] = start_date
        target_events.append(item)
            
    # 過去イベントは「新しい順（降順）」、未来イベントは「日付順（昇順）」でソート
    target_events.sort(key=lambda x: x['start_obj'], reverse=is_past)
    return target_events

# --- HOME (TOPページ) ---
@app.get("/", response_class=HTMLResponse)
async def read_home(request: Request):
    try:
        active_events = get_events_data(is_past=False)
        next_event = active_events[0] if active_events else None
        
        # ⚠️ ここを修正しました (request=request, name=... を追加)
        return templates.TemplateResponse(
            request=request, 
            name="home.html", 
            context={"request": request, "next_event": next_event}
        )
    except Exception as e:
        return HTMLResponse(content=f"Home Error: {str(e)}", status_code=500)

# --- EVENTS (一覧ページ) ---
@app.get("/events", response_class=HTMLResponse)
async def read_events(request: Request, page: str = None):
    try:
        is_past = (page == 'past')
        events_list = get_events_data(is_past=is_past)
        
        if is_past:
            # ⚠️ ここを修正しました
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
            pinned_event = events_list[0] if events_list else None
            scheduled_events = events_list[1:] if len(events_list) > 1 else []
            
            # ⚠️ ここを修正しました
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

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)