from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from .routes import events, gallery, stockists, contact, reserve

app = FastAPI(title='ei8ht plants API')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:5173'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(events.router, prefix='/api')
app.include_router(gallery.router, prefix='/api')
app.include_router(stockists.router, prefix='/api')
app.include_router(contact.router, prefix='/api')
app.include_router(reserve.router, prefix='/api')

# 本番: Viteビルド済みSPAを配信
DIST = os.path.join(os.path.dirname(__file__), '../../frontend/dist')
if os.path.isdir(DIST):
    app.mount('/assets', StaticFiles(directory=os.path.join(DIST, 'assets')), name='assets')

    @app.get('/{full_path:path}')
    def serve_spa(full_path: str):
        return FileResponse(os.path.join(DIST, 'index.html'))
