#!/usr/bin/env bash
# setup.sh — Local development setup

set -euo pipefail

echo "🏈 Setting up Gridiron Cards for local development..."

# API
echo "📦 Installing API dependencies..."
cd api && npm install
cd ..

# Frontend
echo "📦 Installing frontend dependencies..."
cd src && npm install
cd ..

# Env
if [ ! -f .env ]; then
  echo "📝 Creating .env from .env.example..."
  cp .env.example .env
  echo "⚠️  Edit .env and fill in your Supabase credentials!"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "🚀 To start development:"
echo "   Terminal 1: cd api && npm run dev"
echo "   Terminal 2: cd src && npm run dev"
echo "   → Frontend: http://localhost:5173"
echo "   → API:      http://localhost:3000"
