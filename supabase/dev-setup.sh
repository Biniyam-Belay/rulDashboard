#!/bin/bash

# Local Development Setup for Supabase Edge Functions
# This script sets up local Supabase development environment

set -e

echo "🛠️  Setting up local Supabase development environment..."

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI is not installed. Installing..."
    npm install -g supabase
fi

# Check if Docker is running (required for local Supabase)
if ! docker info &> /dev/null; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Initialize Supabase project if not already done
if [ ! -f "supabase/config.toml" ]; then
    echo "📋 Initializing Supabase project..."
    supabase init
fi

# Start local Supabase development server
echo "🚀 Starting local Supabase development server..."
supabase start

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Deploy Edge Functions locally
echo "📦 Deploying Edge Functions locally..."
supabase functions serve assets-with-latest-rul --env-file supabase/.env.local &

# Store the PID to kill the process later if needed
FUNCTIONS_PID=$!

echo ""
echo "✅ Local development environment is ready!"
echo ""
echo "🔗 Services:"
echo "   - Supabase Studio: http://localhost:54323"
echo "   - Database: postgresql://postgres:postgres@localhost:54322/postgres"
echo "   - API: http://localhost:54321"
echo "   - Edge Functions: http://localhost:54321/functions/v1/"
echo ""
echo "🧪 Test your Edge Function:"
echo "curl -X GET 'http://localhost:54321/functions/v1/assets-with-latest-rul' \\"
echo "     -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'"
echo ""
echo "📝 Next steps:"
echo "1. Update frontend/.env.local with local Supabase URL"
echo "2. Set up your database schema if needed"
echo "3. Start your frontend development server"
echo ""
echo "🛑 To stop services:"
echo "   supabase stop"
echo "   kill $FUNCTIONS_PID"

# Keep the script running to maintain the functions server
wait $FUNCTIONS_PID
