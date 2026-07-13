# Post-Backend Setup: Main App Cleanup

After you've successfully deployed the backend to Vercel and confirmed it works, clean up the main app to remove redundant backend files.

## Files to Delete from Main App

These files are now in the separate backend repo and no longer needed here:

```bash
# In StudyMate_App_main directory

# Remove local server (no longer used)
rm server.js

# Remove backend deployment config (moved to backend repo)
rm vercel.json

# Remove backend setup files (one-time use)
rm setup-backend-repo.sh
rm BACKEND_SETUP.md
rm backend-package.json
rm backend-README.md
rm backend-.env.example
rm backend-.gitignore
rm POST_BACKEND_CLEANUP.md  # this file itself
rm QUICK_START_BACKEND.md
```

## Files to Keep

- `api/` folder: Keep it for reference/types, but it's not actually used by the Expo app
- `.env`: Your app's environment variables (now includes `EXPO_PUBLIC_PROXY_BASE_URL`)
- `.env.example`: Update it with the new structure (see below)

## Update .env.example

Edit `.env.example` to reflect the new backend setup:

```env
# =========================================================================
# StudyMate AI - Environment Variables (Template)
# =========================================================================

# -------------------------------------------------------------------------
# Neo4j AuraDB (via Backend Proxy)
# -------------------------------------------------------------------------
# These are used BY THE BACKEND, not directly by the app
# The app talks to EXPO_PUBLIC_PROXY_BASE_URL which handles Neo4j
EXPO_PUBLIC_NEO4J_URI=neo4j+s://your-instance-id.databases.neo4j.io
EXPO_PUBLIC_NEO4J_USERNAME=neo4j
EXPO_PUBLIC_NEO4J_PASSWORD=your_password_here

# -------------------------------------------------------------------------
# Backend API URL (REQUIRED)
# -------------------------------------------------------------------------
# Your deployed Vercel backend URL (NO trailing slash)
# Get this after running: vercel --prod
EXPO_PUBLIC_PROXY_BASE_URL=https://your-backend.vercel.app

# -------------------------------------------------------------------------
# Development Mode (Optional)
# -------------------------------------------------------------------------
# Set to 'true' to bypass Neo4j and use mock data for UI development
EXPO_PUBLIC_NEO4J_MOCK_MODE=false

# -------------------------------------------------------------------------
# Sarvam AI (Used by backend, kept here for reference)
# -------------------------------------------------------------------------
EXPO_PUBLIC_SARVAM_API_KEY=sk_your_sarvam_key
SARVAM_API_KEY=sk_your_sarvam_key

# -------------------------------------------------------------------------
# Tavily Search (Used by backend, kept here for reference)
# -------------------------------------------------------------------------
EXPO_PUBLIC_TAVILY_API_KEY=tvly-your_key
```

## Update package.json Scripts

Edit `package.json` and remove the server script:

```json
{
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "web": "expo start --web",
    "build": "expo export -p web"
    // REMOVED: "server": "node server.js"
  }
}
```

## Update package.json Dependencies

Remove backend-only dependencies (they're in the backend repo now):

```bash
npm uninstall express cors neo4j-driver
```

These were only needed for `server.js` which you no longer run.

## Update .gitignore

Ensure your `.gitignore` has:

```gitignore
# Environment variables
.env

# Backend repo (if you created it in parent directory)
../studymate-backend/

# Vercel (no longer deploying from this repo)
.vercel/
```

## Git Commit

After cleanup:

```bash
git add .
git commit -m "Remove backend files, now using separate backend repo

Backend deployed to Vercel at: https://your-backend.vercel.app
Backend repo: https://github.com/EgoisticCoder/studymate-backend

Changes:
- Removed server.js and vercel.json
- Removed backend setup scripts
- Updated .env.example with EXPO_PUBLIC_PROXY_BASE_URL
- Removed express/cors/neo4j-driver dependencies
- App now uses deployed backend for all API calls"

git push origin main
```

## Verification

After cleanup, your app should still work perfectly:

1. Start the app:
   ```bash
   npx expo start -c
   ```

2. Check there are NO errors about:
   - Missing server.js
   - localhost:3001
   - Neo4j connection

3. Test core features:
   - Signup/login
   - Dashboard loads
   - Add exam
   - Quiz generation

If any of these fail, the backend deployment isn't working correctly. Go back to QUICK_START_BACKEND.md Step 8.

## What You've Achieved

✅ **Cleaner codebase**: Frontend and backend are separated
✅ **No local server needed**: `npm run server` is gone forever
✅ **Production-ready**: Same backend works for dev, TestFlight, Play Store
✅ **Scalable**: Vercel handles traffic spikes automatically
✅ **Easier onboarding**: New developers don't need to configure local server

## Development Workflow Going Forward

### Working on Frontend (This Repo)
```bash
# Just start Expo as normal
npx expo start
```

### Working on Backend (Separate Repo)
```bash
cd ../studymate-backend
npm start  # Test locally
git push origin main  # Vercel auto-deploys
```

### Making Backend Changes
1. Edit backend code in `studymate-backend` repo
2. Test locally: `cd studymate-backend && npm start`
3. Test with app: Set `EXPO_PUBLIC_PROXY_BASE_URL=http://localhost:3001` temporarily
4. Push to GitHub: Vercel automatically deploys
5. Restore `EXPO_PUBLIC_PROXY_BASE_URL` to production URL

## Troubleshooting

### "Cannot find module './server.js'"
→ You deleted server.js (correct). Make sure you removed the `"server"` script from package.json

### "Module 'express' not found"
→ Run `npm uninstall express cors neo4j-driver` to clean up

### Still seeing localhost:3001 in errors
→ Check `EXPO_PUBLIC_PROXY_BASE_URL` in `.env` is set to your Vercel URL
→ Restart Expo with `npx expo start -c`

### Backend not working after deploy
→ Check Vercel dashboard → Your project → Deployments
→ Click latest deployment → Check "Functions" logs for errors
→ Ensure all 5 environment variables are set (Settings → Environment Variables)
