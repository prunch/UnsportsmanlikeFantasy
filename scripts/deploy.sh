#!/usr/bin/env bash
# deploy.sh — Deploy Gridiron Cards to Hostinger VPS
# Run on the VPS: bash scripts/deploy.sh

set -euo pipefail

PROJECT_DIR="/opt/gridiron-cards"
LOG_DIR="/var/log/gridiron"

echo "🏈 Gridiron Cards Deployment Script"
echo "======================================"

# Check required vars
if [ -z "${SUPABASE_URL:-}" ]; then
  echo "❌ SUPABASE_URL is not set. Source your .env file first:"
  echo "   source .env && bash scripts/deploy.sh"
  exit 1
fi

echo "📁 Setting up directories..."
mkdir -p "$PROJECT_DIR"
mkdir -p "$LOG_DIR"

echo "📦 Copying files..."
rsync -av --exclude='node_modules' --exclude='dist' --exclude='.git' \
  . "$PROJECT_DIR/"

cd "$PROJECT_DIR"

echo "📦 Installing API dependencies..."
cd api && npm ci
npm run build
cd ..

echo "🏗️  Building frontend..."
cd src && npm ci && npm run build
cd ..

echo "🔒 Copying .env..."
if [ ! -f "$PROJECT_DIR/.env" ]; then
  echo "⚠️  No .env found at $PROJECT_DIR/.env — please create it from .env.example"
fi

echo "🐳 Starting services with Docker Compose..."
cd docker
docker compose --env-file "../.env" up -d --build
cd ..

echo "🔧 Configuring nginx on port 4444..."
if command -v nginx &> /dev/null; then
  cp docker/nginx.conf /etc/nginx/sites-available/gridiron
  ln -sf /etc/nginx/sites-available/gridiron /etc/nginx/sites-enabled/gridiron
  nginx -t && systemctl reload nginx
  echo "✅ Nginx configured on port 4444"
else
  echo "⚠️  nginx not found — configure manually using docker/nginx.conf"
fi

echo ""
echo "✅ Deployment complete!"
echo "🌐 App should be available at: http://srv1561102.hstgr.cloud:4444"
echo "🔍 Health check: http://srv1561102.hstgr.cloud:4444/api/health"
echo ""
echo "🔑 NEXT STEPS:"
echo "  1. Set your Supabase credentials in .env"
echo "  2. Run migrations in Supabase SQL editor:"
echo "     → db/migrations/001_initial_schema.sql"
echo "     → db/migrations/002_rls_policies.sql"
echo "  3. Set Tank01 API key via admin panel: /admin/config"
echo "  4. Create your first admin user"
