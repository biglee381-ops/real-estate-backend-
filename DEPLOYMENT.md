# Deployment Guide

## 1. Install dependencies

```bash
cd "c:\Users\USER\Desktop\Real Estate Backend"
npm install
```

## 2. Configure environment

Create a `.env` file next to `server.js` with any of these values:

```ini
PORT=5000
FRONTEND_DIR=../Real Estate
FRONTEND_URL=http://localhost:5000
JWT_SECRET=your-secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-password
MONGO_URI=your-mongo-uri
```

Notes:
- If `ADMIN_USERNAME` and `ADMIN_PASSWORD` are not provided, defaults are:
	- username: `dbo_properties_limited`
	- password: `Bigbello2dworld!`

If you do not have MongoDB configured, the backend will use `properties.json` for listings.

## 3. Start the server

```bash
npm start
```

## 4. Verify

Open `http://localhost:5000` in the browser.

Visit:
- `/` for the frontend
- `/admin` for the admin panel
- `/api/properties` for property JSON
- `/health` for backend health check

## 5. Hosting notes

- The `public` folder is supported as an alternative frontend root.
- Use `FRONTEND_DIR` in hosting environments if the frontend is not in the default path.
- Ensure `uploads/` is writable if you plan to upload images/videos.
