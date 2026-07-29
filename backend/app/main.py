from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from .routes import events, gallery, stockists, contact, reserve, collaborations, upload, products, shipping, orders

app = FastAPI(title='ei8ht plants API')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:5173'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.middleware('http')
async def cache_control(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith('/api/'):
        # API responses must never be cached (CDN-Cache-Control targets Cloudflare specifically)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['CDN-Cache-Control'] = 'no-store'
    elif path.startswith('/assets/'):
        # Vite hashed assets are safe to cache forever
        response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
    else:
        # HTML (index.html) must always be revalidated
        response.headers['Cache-Control'] = 'no-cache'
    return response

app.include_router(events.router, prefix='/api')
app.include_router(gallery.router, prefix='/api')
app.include_router(stockists.router, prefix='/api')
app.include_router(contact.router, prefix='/api')
app.include_router(reserve.router, prefix='/api')
app.include_router(collaborations.router, prefix='/api')
app.include_router(upload.router, prefix='/api')
app.include_router(products.router, prefix='/api')
app.include_router(shipping.router, prefix='/api')
app.include_router(orders.router, prefix='/api')

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
