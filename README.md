# VitalTrack

VitalTrack is a React app for recording blood-pressure and blood-glucose readings. It supports camera or image upload, browser-based OCR, editable local readings, History filters, trends, and non-diagnostic Insights.

## Technology

- React + Vite
- FastAPI + Python
- PostgreSQL
- SQLAlchemy + Psycopg
- Tesseract.js for browser-based text extraction

## Run the React app locally

You need Node.js 20 or newer.

```bash
git clone https://github.com/nahomtesfay212025-cmyk/Chronic.git
cd Chronic
npm install
npm run dev
```

Open the local link shown in your terminal, usually `http://localhost:5173`.

## Run the FastAPI backend locally

Install and start PostgreSQL first (Postgres.app works well on macOS). Create a database named `vitaltrack`, then run:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
python -m uvicorn main:app --reload
```

Open `http://127.0.0.1:8000/docs` to test the API.

The backend includes:

- `POST /readings` — create a reading
- `GET /readings` — retrieve readings
- `PUT /readings/{reading_id}` — edit a reading
- `DELETE /readings/{reading_id}` — delete a reading

> The React app currently keeps its existing browser storage behavior. Connecting its Save, History, and Insights screens to this API is the next integration step.

## Build the React app

```bash
npm run build
npm run preview
```

## Deploy with GitHub Pages

GitHub Pages deploys the React frontend only. A FastAPI backend needs its own server deployment, such as Railway, Render, or a cloud service, before the public website can use it.

> VitalTrack is for tracking only and does not provide medical advice.
