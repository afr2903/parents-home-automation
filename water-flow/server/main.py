from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import pump, sensor

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pump.router,   prefix="/api/pump")
app.include_router(sensor.router, prefix="/api/sensor")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3001)
