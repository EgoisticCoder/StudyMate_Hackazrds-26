# StudyMate Backend Setup Guide

This document explains how to set up the separate backend repository and deploy it to Vercel.

## What Goes in the Backend Repo

The backend repo should contain only these files from this project:

```
studymate-backend/
├── api/
│   ├── neo4j.js       # Neo4j database proxy
│   ├── ai.js          # Sarvam AI integration
│   ├── ocr.js         # OCR processing
│   ├── voice.js       # Voice/speech endpoints
│   └── search.js      # Tavily search integration
├── server.js          # Local Express dev server
├── package.json       # Backend dependencies only
├── .env.example       # Environment template
├── vercel.json        # Vercel deployment config
├── .gitignore         # Git ignore rules
└── README.md          # Backend documentation
```

## Step-by-Step Setup

### 1. Create Fresh Neo4j Database (Recommended)

Your current database seems to have connection issues. Creating a fresh one is fastest:

1. Go to https://console.neo4j.io/
2. Click "New Instance" → "Create Free Instance"
3. Name it `studymate-prod` (or any name)
4. **Important**: Save these credentials somewhere safe:
   - URI: `neo4j+s://xxxxx.databases.neo4j.io`
   - Username: (usually same as ID)
   - Password: (long random string - COPY THIS NOW, you can't see it again!)
5. Wait ~60 seconds for it to provision
6. Status should show green "RUNNING"

### 2. Prepare Backend Repository

```bash
# Navigate to a directory outside this project
cd ~/
mkdir studymate-backend
cd studymate-backend

# Initialize git
git init
git remote add origin https://github.com/EgoisticCoder/studymate-backend.git
```

### 3. Copy Backend Files (Do this manually)

Copy these folders/files from StudyMate_App_main:
- `api/` folder (entire directory)
- `server.js`
- `package.json` (we'll modify this)
- `.env.example`
- `vercel.json`

### 4. Create Backend package.json

The backend needs different dependencies than the Expo app. Replace package.json with:

```json
{
  "name": "studymate-backend",
  "version": "1.0.0",
  "description": "Backend API server for StudyMate AI app",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node server.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.18.2",
    "neo4j-driver": "^5.27.0"
  },
  "engines": {
    "node": ">=18.x"
  }
}
```

### 5. Create .env for Backend

```bash
# In the backend repo
cp .env.example .env
```

Then edit `.env` with your **new** Neo4j credentials:

```env
# Neo4j Credentials (from Step 1)
NEO4J_URI=neo4j+s://YOUR_NEW_ID.databases.neo4j.io
NEO4J_USERNAME=YOUR_NEW_USERNAME
NEO4J_PASSWORD=YOUR_NEW_PASSWORD

# Sarvam AI (copy from main app .env)
SARVAM_API_KEY=sk_fz90nnrh_etgDmIECRCNpn2XMA2g5d4Tp

# Tavily Search (copy from main app .env)
TAVILY_API_KEY=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
```

### 6. Create .gitignore

```bash
node_modules/
.env
.vercel
*.log
.DS_Store
```

### 7. Test Locally

```bash
npm install
npm start
```

You should see:
```
🚀 Local API server running on http://localhost:3001
```

Test the health check:
```bash
curl http://localhost:3001/health
```

### 8. Deploy to Vercel

```bash
# Install Vercel CLI globally
npm install -g vercel

# Login to Vercel
vercel login

# Deploy
vercel
```

Follow the prompts:
- "Set up and deploy?" → **Yes**
- "Which scope?" → Your personal account
- "Link to existing project?" → **No**
- "What's your project's name?" → `studymate-backend`
- "In which directory is your code located?" → `./`

After deployment completes, you'll get a URL like:
```
https://studymate-backend-xxxxx.vercel.app
```

### 9. Add Environment Variables to Vercel

```bash
vercel env add NEO4J_URI
# Paste: neo4j+s://YOUR_NEW_ID.databases.neo4j.io

vercel env add NEO4J_USERNAME
# Paste: YOUR_NEW_USERNAME

vercel env add NEO4J_PASSWORD
# Paste: YOUR_NEW_PASSWORD

vercel env add SARVAM_API_KEY
# Paste: sk_fz90nnrh_etgDmIECRCNpn2XMA2g5d4Tp

vercel env add TAVILY_API_KEY
# Paste: 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
```

After adding each variable, select:
- Production: **Yes**
- Preview: **Yes**
- Development: **Yes**

### 10. Redeploy with Environment Variables

```bash
vercel --prod
```

### 11. Test Production Deployment

```bash
curl https://studymate-backend-xxxxx.vercel.app/health
```

You should see:
```json
{"status":"ok","timestamp":"2026-07-13T..."}
```

### 12. Update Main App to Use Deployed Backend

In your StudyMate_App_main `.env`:

```env
# Replace this line:
EXPO_PUBLIC_PROXY_BASE_URL=

# With your Vercel URL (NO trailing slash):
EXPO_PUBLIC_PROXY_BASE_URL=https://studymate-backend-xxxxx.vercel.app
```

### 13. Restart Expo

```bash
# In StudyMate_App_main directory
# Stop the dev server (Ctrl+C)
# Clear cache and restart
npx expo start -c
```

## You're Done! 🎉

- **Local dev**: App now uses your deployed Vercel backend (no more `npm run server`)
- **Production**: Same Vercel backend works for EAS builds, TestFlight, Play Store
- **Scaling**: Vercel auto-scales, no server management needed

## Troubleshooting

### "Connection acquisition timed out"
- Check Neo4j console - database must show green "RUNNING"
- Verify URI/username/password in Vercel environment variables match exactly

### "CORS error"
- Vercel deployment sets CORS automatically (check `api/neo4j.js` has `Access-Control-Allow-Origin: *`)

### "Environment variables not working"
```bash
# Redeploy after adding env vars
vercel --prod
```

### "Still using localhost:3001"
- Check `EXPO_PUBLIC_PROXY_BASE_URL` in app's `.env` is set to your Vercel URL
- Restart Expo with `npx expo start -c` to clear cache

## Development Workflow

1. Make backend changes in `studymate-backend` repo
2. Test locally: `npm start`
3. Push to GitHub: `git push origin main`
4. Vercel auto-deploys (if you enabled GitHub integration)
5. OR manually deploy: `vercel --prod`

## GitHub Setup (Optional but Recommended)

Enable automatic deployments from GitHub:

1. Go to https://vercel.com/dashboard
2. Click "Import Project" → "Import Git Repository"
3. Connect your GitHub account
4. Select `EgoisticCoder/studymate-backend`
5. Vercel will auto-deploy on every push to `main`
