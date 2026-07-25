from fastapi import FastAPI

app = FastAPI(
    title="RematAR",
    version="0.1.0",
)


@app.get("/")
async def root():
    return {
        "status": "ok",
        "message": "RematAR Backend funcionando correctamente"
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy"
    }


@app.get("/ping")
async def ping():
    return {
        "ping": "pong"
    }

