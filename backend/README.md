# VitalTrack backend

FastAPI + PostgreSQL API for VitalTrack. It supports secure email/password accounts and private blood-pressure and glucose readings.

## Start locally

From the repository root:

```bash
cd backend
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload
```

Before starting, create a `.env` file beside `main.py` using `.env.example` as the guide. Set `JWT_SECRET` to a long random value. Do not commit `.env`.

Open `http://127.0.0.1:8000/docs` to test the API.

## Deployment settings

In Render, add these environment variables:

- `DATABASE_URL`: the Internal Database URL from your Render PostgreSQL database.
- `JWT_SECRET`: a long, private, random value. Use Render's **Generate** button; never put this value in GitHub.
- `CORS_ORIGINS`: `https://nahomtesfay212025-cmyk.github.io`

## Main routes

- `POST /auth/register`
- `POST /auth/token`
- `GET /auth/me`
- `POST /readings`
- `GET /readings`
- `PUT /readings/{reading_id}`
- `DELETE /readings/{reading_id}`

Every readings route requires a login token. A signed-in user can only read and change their own readings.
