# VitalTrack

VitalTrack is a React app for recording blood-pressure and blood-glucose readings. It supports camera or image upload, browser-based OCR, editable local readings, History filters, trends, and non-diagnostic Insights. Data remains in the browser on the current device.

## Technology

- React
- Vite
- Tesseract.js for browser-based text extraction
- LocalStorage for prototype data

## Run locally

You need Node.js 20 or newer.

```bash
git clone https://github.com/nahomtesfay212025-cmyk/Chronic.git
cd Chronic
npm install
npm run dev
```

Open the local link shown in your terminal, usually:

```text
http://localhost:5173
```

Using `localhost` allows the browser to request camera permission.

## Build for production

```bash
npm run build
npm run preview
```

## Update your local copy

```bash
git pull origin main
npm install
npm run dev
```

## Deploy with GitHub Pages

This repository includes a GitHub Actions deployment workflow.

1. Open the repository **Settings** → **Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to the `main` branch.

GitHub Actions will build the React app and publish it to:

```text
https://nahomtesfay212025-cmyk.github.io/Chronic/
```

> VitalTrack is for tracking only and does not provide medical advice.
