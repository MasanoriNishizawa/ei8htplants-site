import os
import json
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
import gspread
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from datetime import datetime
import uvicorn
from urllib.parse import quote

app = FastAPI()
templates = Jinja2Templates(directory="templates")

# --- Google Spreadsheet & Drive 設定 ---
SPREADSHEET_ID = '1_18mozgallwxSZ_u9d5iCdP9CftT7nZ9lgo-v3jbzwU'
scopes = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
google_creds_env = os.environ.get("GOOGLE_CREDENTIALS")

if google_creds_env:
    creds_dict = json.loads(google_creds_env)
    credentials = Credentials.from_service_account_info(creds_dict, scopes=scopes)
else:
    credentials = Credentials.from_service_account_file('secret_key.json', scopes=scopes)

gc = gspread.authorize(credentials)
drive_service = build('drive', 'v3', credentials=credentials)

# 🌟【重要】URL変換ヘルパー関数
def get_display_url(drive_url_or_id):
    """Google DriveのURLやIDを、サイト表示に最も適したthumbnail形式に変換する"""
    if not drive_url_or_id: return ""
    file_id = ""
    drive_url_or_id = str(drive_url_or_id).strip()
    
    if 'id=' in drive_url_or_id:
        file_id = drive_url_or_id.split('id=')[1].split('&')[0]
    elif 'd/' in drive_url_or_id:
        file_id = drive_url_or_id.split('d/')[1].split('/')[0]
    else:
        file_id = drive_url_or_id
    
    # EVENTSのロゴなどでも使われている、最も安定して高速な形式
    return f"https://drive.google.com/thumbnail?id={file_id}&sz=w1000"

def parse_date(date_val):
    if not date_val: return None
    date_str = str(date_val).strip().replace('/', '-')
    try:
        return datetime.strptime(date_str.split(' ')[0], '%Y-%m-%d').date()
    except:
        return None

def get_events_data(is_past=False):
    sh = gc.open_by_key(SPREADSHEET_ID)
    worksheet = sh.get_worksheet(0)
    all_data = worksheet.get_all_records()
    today = datetime.now().date()
    target_events = []

    for item in all_data:
        start_date = parse_date(item.get('開始日'))
        if not start_date: continue
        
        end_date = parse_date(item.get('終了日')) or start_date
        
        if is_past:
            if end_date >= today: continue 
        else:
            if end_date < today: continue  

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

        # 🌟EVENTSの画像URLも変換を適用
        images_str = str(item.get('画像', '')).strip()
        if images_str:
            raw_urls = [url.strip() for url in images_str.split(',')]
            image_urls = [get_display_url(u) for u in raw_urls if u]
        else:
            image_urls = []
        item['image_urls'] = image_urls

        target_events.append(item)
            
    target_events.sort(key=lambda x: x['start_obj'], reverse=is_past)
    return target_events

@app.get("/", response_class=HTMLResponse)
async def read_home(request: Request):
    try:
        active_events = get_events_data(is_past=False)
        next_event = active_events[0] if active_events else None
        return templates.TemplateResponse(request=request, name="home.html", context={"request": request, "next_event": next_event})
    except Exception as e:
        return HTMLResponse(content=f"Home Error: {str(e)}", status_code=500)

@app.get("/events", response_class=HTMLResponse)
async def read_events(request: Request, page: str = None):
    try:
        is_past = (page == 'past')
        events_list = get_events_data(is_past=is_past)
        if is_past:
            return templates.TemplateResponse(request=request, name="events.html", context={"request": request, "pinned_event": None, "scheduled_events": events_list, "is_past": True})
        else:
            pinned_event = events_list[0] if events_list else None
            scheduled_events = events_list[1:] if len(events_list) > 1 else []
            return templates.TemplateResponse(request=request, name="events.html", context={"request": request, "pinned_event": pinned_event, "scheduled_events": scheduled_events, "is_past": False})
    except Exception as e:
        return HTMLResponse(content=f"Events Error: {str(e)}", status_code=500)

@app.get("/concept", response_class=HTMLResponse)
async def read_concept(request: Request):
    try:
        return templates.TemplateResponse(request=request, name="concept.html", context={"request": request})
    except Exception as e:
        return HTMLResponse(content=f"Concept Error: {str(e)}", status_code=500)

@app.get("/gallery", response_class=HTMLResponse)
async def read_gallery(request: Request):
    try:
        folder_id = '12LHiPz4tyUK9UHVcOqgZQ3ltjk9rlLP_'
        query = f"'{folder_id}' in parents and mimeType contains 'image/' and trashed = false"
        
        results = drive_service.files().list(
            q=query,
            fields="files(id, name)",
            pageSize=100
        ).execute()
        
        items = results.get('files', [])
        
        # 🌟GALLERYもEVENTSと同じ変換ロジックを使用
        gallery_images = [get_display_url(item['id']) for item in items]
        
        return templates.TemplateResponse(request=request, name="gallery.html", context={"request": request, "images": gallery_images})
    except Exception as e:
        return HTMLResponse(content=f"Gallery Error: {str(e)}", status_code=500)

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)