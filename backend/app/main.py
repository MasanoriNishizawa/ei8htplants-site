from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from .routes import events, gallery, stockists, contact, reserve, collaborations

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
app.include_router(collaborations.router, prefix='/api')

# 本番: Viteビルド済みSPAを配信
DIST = os.path.join(os.path.dirname(__file__), '../../frontend/dist')
if os.path.isdir(DIST):
    for _subdir in ['assets', 'img', 'favicon']:
        _path = os.path.join(DIST, _subdir)
        if os.path.isdir(_path):
            app.mount(f'/{_subdir}', StaticFiles(directory=_path), name=_subdir)

    @app.get('/{full_path:path}')
    def serve_spa(full_path: str):
        file_path = os.path.join(DIST, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(DIST, 'index.html'))
