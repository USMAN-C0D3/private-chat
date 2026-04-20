# Premium Private Chat

Private two-user chat built with React, Vite, Flask, and Flask-SocketIO.

## Local Development

Create a `.env` file from `.env.example` if you want local credentials and deployment-style settings loaded automatically by `python app.py`.

Install dependencies:

```bash
pip install -r requirements.txt
npm install
```

Run the backend:

```bash
python app.py
```

Run the frontend dev server in a second terminal:

```bash
npm run dev
```

Open `http://localhost:5173`.

## Production Build

Build the frontend:

```bash
npm run build
```

Run the app with Gunicorn:

```bash
gunicorn --worker-class gthread --workers 1 --threads 8 --timeout 120 app:app
```

The Flask server will serve the built SPA from `dist/`.

## Environment

Copy `.env.example` to `.env` for local use or to your deployment environment and set:

- `SECRET_KEY`
- `PRIVATE_ACCOUNT_1_*`
- `PRIVATE_ACCOUNT_2_*`
- `SOCKET_IO_CORS_ORIGINS`
- `SESSION_COOKIE_SECURE=true`

Change the private usernames and passwords through:

- `PRIVATE_ACCOUNT_1_USERNAME`
- `PRIVATE_ACCOUNT_1_PASSWORD`
- `PRIVATE_ACCOUNT_2_USERNAME`
- `PRIVATE_ACCOUNT_2_PASSWORD`

Messages and read receipts are stored in SQLite at `DATABASE_PATH`.

Uploaded bot wordlists are also stored server-side in SQLite, so the bot can start from a full uploaded `.txt` file without pushing the whole list through the socket handshake.

## Health

Liveness:

```bash
GET /api/health
```

Readiness:

```bash
GET /api/ready
```

## Docker

Build the container:

```bash
docker build -t premium-private-chat .
```

Run it:

```bash
docker run --rm -p 5000:5000 --env-file .env premium-private-chat
```

## Verification

Backend and frontend checks:

```bash
python -m compileall app.py server
npm run build
python -m unittest discover -s tests
```
