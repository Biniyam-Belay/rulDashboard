#!/bin/bash

# Supabase Edge Functions Deployment Script
# This script deploys the assets-with-latest-rul Edge Function

set -e

echo "🚀 Deploying Supabase Edge Functions..."

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI is not installed. Please install it first:"
    echo "   npm install -g supabase"
    echo "   Or follow: https://supabase.com/docs/guides/cli"
    exit 1
fi

# Check if we're logged in to Supabase
if ! supabase status &> /dev/null; then
    echo "⚠️  You need to log in to Supabase and link your project:"
    echo "   supabase login"
    echo "   supabase link --project-ref YOUR_PROJECT_ID"
    exit 1
fi

# Deploy the Edge Function
echo "📦 Deploying assets-with-latest-rul function..."
supabase functions deploy assets-with-latest-rul

echo "✅ Edge Function deployed successfully!"
echo ""
echo "🔗 Function URL: https://YOUR_PROJECT_ID.supabase.co/functions/v1/assets-with-latest-rul"
echo ""
echo "📝 Next steps:"
echo "1. Update your frontend .env file with the correct SUPABASE_URL and SUPABASE_ANON_KEY"
echo "2. Test the function endpoint"
echo "3. Update any remaining backend API calls to use Edge Functions"
echo ""
echo "🧪 Test the function:"
echo "curl -X GET 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/assets-with-latest-rul' \\"
echo "     -H 'Authorization: Bearer YOUR_ANON_KEY'"
