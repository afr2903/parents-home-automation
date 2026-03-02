from app import create_app
from app.db import insert_event
from app.pump_state import state

app = create_app()
insert_event("off", "server_start")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3001)
