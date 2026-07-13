# Quick Start: Backend Setup (5 minutes)

Follow these steps in order. Don't skip any.

## ✅ Checklist

### 1. Create Fresh Neo4j Database (2 min)

- [ ] Go to https://console.neo4j.io/
- [ ] Click **"New Instance"** → **"Create Free Instance"**
- [ ] Name: `studymate-prod`
- [ ] Click **"Create"**
- [ ] ⚠️ **IMMEDIATELY COPY** these (you can't see password again!):
  ```
  URI: neo4j+s://____________.databases.neo4j.io
  Username: ____________
  Password: ____________________________________________
  ```
- [ ] Wait 60 seconds for status to show green **"RUNNING"**

### 2. Set Up Backend Repo (1 min)

```bash
# In StudyMate_App_main directory
./setup-backend-repo.sh
```

This creates `../studymate-backend/` with all necessary files.

### 3. Configure Backend (30 sec)

```bash
cd ../studymate-backend
cp .env.example .env
nano .env  # or use any editor
```

Paste your credentials from Step 1:
```env
NEO4J_URI=neo4j+s://YOUR_NEW_ID.databases.neo4j.io
NEO4J_USERNAME=YOUR_USERNAME
NEO4J_PASSWORD=YOUR_LONG_PASSWORD
SARVAM_API_KEY=sk_fz90nnrh_etgDmIECRCNpn2XMA2g5d4Tp
TAVILY_API_KEY=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
```

Save and exit.

### 4. Test Locally (30 sec)

```bash
npm install
npm start
```

You should see:
```
🚀 Local API server running on http://localhost:3001
```

In another terminal, test it:
```bash
curl http://localhost:3001/health
```

Expected: `{"status":"ok","timestamp":"..."}`

If it works, press Ctrl+C to stop the server.

### 5. Push to GitHub (30 sec)

```bash
# Still in studymate-backend directory
git branch -M main
git push -u origin main
```

If it asks for authentication, follow GitHub's instructions.

### 6. Deploy to Vercel (1 min)

```bash
npm install -g vercel
vercel login
# Follow browser login
vercel --prod
```

When asked:
- "Set up and deploy?" → **Yes**
- "Which scope?" → Your account
- "Link to existing project?" → **No**
- "Project name?" → `studymate-backend`
- "Directory?" → `./`

After deploy completes, **COPY THE URL** shown (looks like `https://studymate-backend-xxxxx.vercel.app`)

### 7. Add Secrets to Vercel (1 min)

```bash
vercel env add NEO4J_URI
# Paste: neo4j+s://YOUR_NEW_ID.databases.neo4j.io
# Select: Production, Preview, Development (all yes)

vercel env add NEO4J_USERNAME
# Paste: YOUR_USERNAME
# Select: all yes

vercel env add NEO4J_PASSWORD
# Paste: YOUR_LONG_PASSWORD
# Select: all yes

vercel env add SARVAM_API_KEY
# Paste: sk_fz90nnrh_etgDmIECRCNpn2XMA2g5d4Tp
# Select: all yes

vercel env add TAVILY_API_KEY
# Paste: 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
# Select: all yes

# Redeploy with secrets
vercel --prod
```

### 8. Test Production Backend (10 sec)

```bash
curl https://YOUR_VERCEL_URL/health
```

Expected: `{"status":"ok","timestamp":"..."}`

### 9. Update Main App (30 sec)

```bash
cd ../StudyMate_App_main
nano .env  # or use any editor
```

Find this line:
```env
EXPO_PUBLIC_PROXY_BASE_URL=
```

Change to (use YOUR actual Vercel URL, **NO trailing slash**):
```env
EXPO_PUBLIC_PROXY_BASE_URL=https://studymate-backend-xxxxx.vercel.app
```

Save and exit.

Also update your NEW Neo4j credentials:
```env
EXPO_PUBLIC_NEO4J_URI=neo4j+s://YOUR_NEW_ID.databases.neo4j.io
EXPO_PUBLIC_NEO4J_USERNAME=YOUR_NEW_USERNAME
EXPO_PUBLIC_NEO4J_PASSWORD=YOUR_NEW_PASSWORD

# Keep mock mode OFF now
EXPO_PUBLIC_NEO4J_MOCK_MODE=false
```

### 10. Restart App (10 sec)

```bash
# Stop expo if running (Ctrl+C)
npx expo start -c
```

## ✅ You're Done!

You should now see:
- ✅ App loads instantly (no skeleton hang)
- ✅ No "Neo4j proxy unreachable" errors
- ✅ Signup works
- ✅ Exam adding works
- ✅ Dashboard shows data

## 🆘 Still Seeing Errors?

### "Connection acquisition timed out"
→ Neo4j database is paused. Go to console.neo4j.io → Click "Resume"

### "Neo4j proxy unreachable"
→ Check `EXPO_PUBLIC_PROXY_BASE_URL` in app's `.env` matches your Vercel URL exactly

### "CORS error"
→ Vercel deployment failed. Run `vercel --prod` again

### App still slow
→ Make sure `EXPO_PUBLIC_PROXY_BASE_URL` is set (not empty)
→ Restart Expo with `-c` flag to clear cache

## 📝 From Now On

**You NEVER need to run `npm run server` again!**

- Local dev: App uses Vercel backend automatically
- Prod builds: Same Vercel backend
- Backend changes: Push to GitHub → Vercel auto-deploys
