#!/bin/bash

# Quick Migration Test Script
# This script tests the Edge Function migration

set -e

echo "🧪 Testing Edge Function Migration..."

# Function to test endpoint
test_endpoint() {
    local url=$1
    local name=$2
    
    echo "Testing $name: $url"
    
    response=$(curl -s -w "\n%{http_code}" "$url" \
        -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0")
    
    # Extract HTTP status code (last line)
    http_code=$(echo "$response" | tail -n1)
    # Extract response body (all lines except last)
    body=$(echo "$response" | head -n -1)
    
    if [ "$http_code" = "200" ]; then
        echo "✅ $name: Success (200)"
        # Check if response is valid JSON
        if echo "$body" | jq . > /dev/null 2>&1; then
            echo "   📊 JSON response valid"
            # Count items if it's an array
            if echo "$body" | jq -e 'type == "array"' > /dev/null 2>&1; then
                count=$(echo "$body" | jq length)
                echo "   📈 Found $count items"
            fi
        else
            echo "   ⚠️  Response is not valid JSON"
        fi
    else
        echo "❌ $name: Failed ($http_code)"
        echo "   Response: $body"
    fi
    echo ""
}

# Test local Edge Function (if Supabase is running locally)
echo "=== Testing Local Environment ==="
if curl -s http://localhost:54321/health > /dev/null 2>&1; then
    echo "✅ Local Supabase is running"
    test_endpoint "http://localhost:54321/functions/v1/assets-with-latest-rul" "Local Edge Function"
else
    echo "⚠️  Local Supabase not running. Start with: supabase start"
fi

# Test backend API fallback
echo "=== Testing Backend API Fallback ==="
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo "✅ Backend API is running"
    test_endpoint "http://localhost:3001/assets_with_latest_rul" "Backend API"
else
    echo "⚠️  Backend API not running. Start with: cd backend-api && npm start"
fi

# Test frontend environment variables
echo "=== Testing Frontend Configuration ==="
if [ -f "/workspaces/rulDashboard/frontend/.env.local" ]; then
    echo "✅ Frontend .env.local exists"
    
    # Check if environment variables are set correctly
    cd /workspaces/rulDashboard/frontend
    if grep -q "VITE_SUPABASE_URL" .env.local; then
        echo "✅ VITE_SUPABASE_URL is configured"
    else
        echo "❌ VITE_SUPABASE_URL is missing"
    fi
    
    if grep -q "VITE_SUPABASE_ANON_KEY" .env.local; then
        echo "✅ VITE_SUPABASE_ANON_KEY is configured"
    else
        echo "❌ VITE_SUPABASE_ANON_KEY is missing"
    fi
else
    echo "❌ Frontend .env.local not found"
    echo "   Create it by copying .env.example and updating values"
fi

echo ""
echo "🏁 Migration test complete!"
echo ""
echo "📝 Next steps:"
echo "1. If local tests pass, deploy to production: cd supabase && ./deploy.sh"
echo "2. Update production environment variables"
echo "3. Test production endpoints"
echo "4. Monitor Edge Function performance in Supabase dashboard"
