#!/bin/bash

# StudyMate Backend Repository Setup Script
# This script creates a separate backend repository with only the necessary files

echo "🚀 StudyMate Backend Repository Setup"
echo "======================================"
echo ""

# Check if we're in the right directory
if [ ! -d "api" ] || [ ! -f "server.js" ]; then
    echo "❌ Error: Run this script from the StudyMate_App_main directory"
    exit 1
fi

# Create temporary directory for backend
BACKEND_DIR="../studymate-backend"
echo "📁 Creating backend directory at $BACKEND_DIR"

if [ -d "$BACKEND_DIR" ]; then
    echo "⚠️  Warning: $BACKEND_DIR already exists"
    read -p "Delete and recreate? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$BACKEND_DIR"
    else
        echo "Aborting."
        exit 1
    fi
fi

mkdir -p "$BACKEND_DIR"

# Copy backend files
echo "📋 Copying backend files..."
cp -r api "$BACKEND_DIR/"
cp server.js "$BACKEND_DIR/"
cp vercel.json "$BACKEND_DIR/"
cp backend-package.json "$BACKEND_DIR/package.json"
cp backend-README.md "$BACKEND_DIR/README.md"
cp backend-.env.example "$BACKEND_DIR/.env.example"
cp backend-.gitignore "$BACKEND_DIR/.gitignore"

echo "✅ Files copied successfully"
echo ""

# Initialize git
cd "$BACKEND_DIR"
echo "🔧 Initializing git repository..."
git init
git remote add origin https://github.com/EgoisticCoder/studymate-backend.git

echo "📝 Creating initial commit..."
git add .
git commit -m "Initial commit: StudyMate backend API server

- Neo4j proxy endpoint
- Sarvam AI integration
- OCR processing
- Voice/speech endpoints
- Web search integration
- Express.js server for local development
- Vercel serverless deployment config"

echo ""
echo "✅ Backend repository setup complete!"
echo ""
echo "📋 Next Steps:"
echo ""
echo "1. Create a fresh Neo4j database:"
echo "   → Go to https://console.neo4j.io/"
echo "   → Click 'New Instance' → 'Create Free Instance'"
echo "   → Save the URI, username, and password"
echo ""
echo "2. Configure environment variables:"
echo "   cd $BACKEND_DIR"
echo "   cp .env.example .env"
echo "   # Edit .env with your Neo4j and API credentials"
echo ""
echo "3. Test locally:"
echo "   npm install"
echo "   npm start"
echo "   # Should see: 🚀 Local API server running on http://localhost:3001"
echo ""
echo "4. Push to GitHub:"
echo "   git push -u origin main"
echo ""
echo "5. Deploy to Vercel:"
echo "   npm install -g vercel"
echo "   vercel login"
echo "   vercel --prod"
echo ""
echo "6. Add environment variables to Vercel:"
echo "   vercel env add NEO4J_URI"
echo "   vercel env add NEO4J_USERNAME"
echo "   vercel env add NEO4J_PASSWORD"
echo "   vercel env add SARVAM_API_KEY"
echo "   vercel env add TAVILY_API_KEY"
echo "   vercel --prod  # Redeploy with env vars"
echo ""
echo "7. Update main app .env:"
echo "   EXPO_PUBLIC_PROXY_BASE_URL=https://your-deployment.vercel.app"
echo ""
echo "📖 For detailed instructions, see BACKEND_SETUP.md"
