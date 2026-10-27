# VitalTrack

A browser-based prototype for recording blood-pressure and blood-glucose readings. Users can take or upload a monitor photo, review extracted numbers, save readings, view History, and see simple tracking Insights. Data stays in the browser on the current device.

## Run locally

Use a local server so the camera button can work.

```bash
git clone https://github.com/nahomtesfay212025-cmyk/Chronic.git
cd Chronic
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

To stop the server, press `Control + C` in the terminal.

### Update your local copy

When new code is added to GitHub, run:

```bash
git pull origin main
```

Then refresh your browser.

## No installation needed

This project is a single HTML file. It does not need `npm install`, a database, or a backend server for the current prototype.

## Deploy with GitHub Pages

1. Open the repository **Settings**.
2. Choose **Pages** in the left menu.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Choose branch `main` and folder `/(root)`.
5. Click **Save**.

Your deployed website will be:

```text
https://nahomtesfay212025-cmyk.github.io/Chronic/
```

GitHub Pages uses HTTPS, which is needed for browser camera access.
