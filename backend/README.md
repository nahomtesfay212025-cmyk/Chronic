# VitalTrack backend

FastAPI API backed by PostgreSQL. It stores blood-pressure and glucose readings.

## Start locally

From the repository root:

```bash
cd backend
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload
```

Open `http://127.0.0.1:8000/docs` to test the API.

## Database

The default local connection is:

```text
postgresql+psycopg://nahomtesfay@localhost:5432/vitaltrack
```

Keep the Postgres.app server running. To use another database URL, copy `.env.example` to `.env` and edit the value. Do not commit `.env`; it can contain credentials.

## Routes

- `GET /health`
- `POST /readings`
- `GET /readings`
- `GET /readings?reading_type=bp`
- `PUT /readings/{reading_id}`
- `DELETE /readings/{reading_id}`
