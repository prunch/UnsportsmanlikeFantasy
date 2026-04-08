#!/bin/bash
# Deploy script for Gridiron Cards Fantasy Football App
# Run this on your VPS as root

set -e

echo "🚀 Deploying Gridiron Cards to port 4000..."

# Create app directory
mkdir -p /opt/gridiron-cards
cd /opt/gridiron-cards

# Copy project files (you'll need to rsync/scp them first)
# Or clone from git if you set up a repo

echo "📦 Setting up environment..."
cat > .env << 'ENVFILE'
# Supabase (Required)
SUPABASE_URL=https://dwtvqphgeuxvzueiaurl.supabase.co
SUPABASE_ANON_KEY=sb_publishable_7K0k2iJ-j9ILyFvt5XKpWw_fVgCxcwp
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3dHZxcGhnZXV4dnp1ZWlhdXJsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTU5NzE3OCwiZXhwIjoyMDkxMTczMTc4fQ.1MvKq-OA5_0kDdndUANC7ljwl_tqW3dhToxDA_9We6Q

# App Config
NODE_ENV=production
PORT=3000
JWT_SECRET=your-jwt-secret-change-this-in-production

# CORS
CORS_ORIGIN=http://srv1561102.hstgr.cloud:4000

# Tank01 NFL API (Optional - can set via admin panel)
TANK01_API_KEY=

# Logging
LOG_LEVEL=info
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Frontend (Vite build-time vars)
VITE_API_URL=http://srv1561102.hstgr.cloud:4000/api
VITE_SUPABASE_URL=https://dwtvqphgeuxvzueiaurl.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_7K0k2iJ-j9ILyFvt5XKpWw_fVgCxcwp
ENVFILE

echo "🗄️ Running database migrations..."
# You'll need to run these SQL files in Supabase SQL Editor:
# 1. db/migrations/001_initial_schema.sql
# 2. db/migrations/002_rls_policies.sql

echo "🔧 Building frontend..."
cd src
npm install
npm run build
cd ..

echo "🔧 Setting up backend..."
cd api
npm install
npm run build
cd ..

echo "🐳 Starting services with Docker..."
docker-compose down 2>/dev/null || true
docker-compose up -d

echo "⚙️ Configuring nginx..."
cp docker/nginx.conf /etc/nginx/sites-available/gridiron-cards
ln -sf /etc/nginx/sites-available/gridiron-cards /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

echo "✅ Deployment complete!"
echo "🌐 App should be live at: http://srv1561102.hstgr.cloud:4000"
echo ""
echo "⚠️  IMPORTANT: Run the SQL migrations in Supabase first!"
echo "⚠️  After first signup, run this SQL to make yourself admin:"
echo "   UPDATE users SET role = 'admin' WHERE email = 'your@email.com';"
