#!/bin/bash

# Final Migration Validation Script
# This script performs comprehensive validation of the Edge Function migration

# Remove strict error handling for better validation experience
# set -e

echo "🔍 Final Migration Validation"
echo "================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Success/failure counters
PASSED=0
FAILED=0

# Function to print test results
print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ PASS${NC}: $2"
        ((PASSED++))
    else
        echo -e "${RED}❌ FAIL${NC}: $2"
        ((FAILED++))
    fi
}

# Function to print warning
print_warning() {
    echo -e "${YELLOW}⚠️  WARN${NC}: $1"
}

echo ""
echo "🏗️  Infrastructure Checks"
echo "-------------------------"

# Check if all required files exist
if [ -f "functions/assets-with-latest-rul/index.ts" ]; then
    print_result 0 "Edge Function source code exists"
else
    print_result 1 "Edge Function source code missing"
fi

if [ -f "config.toml" ]; then
    print_result 0 "Supabase config file exists"
else
    print_result 1 "Supabase config file missing"
fi

if [ -f "../frontend/.env.local" ]; then
    print_result 0 "Frontend environment file exists"
else
    print_result 1 "Frontend environment file missing"
fi

# Check if scripts are executable
if [ -x "deploy.sh" ] && [ -x "dev-setup.sh" ] && [ -x "test-migration.sh" ]; then
    print_result 0 "All scripts are executable"
else
    print_result 1 "Some scripts are not executable"
fi

echo ""
echo "🔧 Configuration Validation"
echo "---------------------------"

# Check frontend environment variables
if [ -f "../frontend/.env.local" ]; then
    cd ../frontend
    
    if grep -q "VITE_SUPABASE_URL" .env.local && ! grep -q "your-project" .env.local; then
        print_result 0 "VITE_SUPABASE_URL is configured"
    else
        print_result 1 "VITE_SUPABASE_URL needs to be updated"
    fi
    
    if grep -q "VITE_SUPABASE_ANON_KEY" .env.local && ! grep -q "your-anon-key" .env.local; then
        print_result 0 "VITE_SUPABASE_ANON_KEY is configured"
    else
        print_result 1 "VITE_SUPABASE_ANON_KEY needs to be updated"
    fi
    
    cd ../supabase
else
    print_result 1 "Cannot validate frontend environment (file missing)"
fi

echo ""
echo "🔌 Connectivity Tests"
echo "---------------------"

# Test if jq is available for JSON parsing
if command -v jq &> /dev/null; then
    print_result 0 "jq is available for JSON parsing"
else
    print_warning "jq not found - install with: sudo apt-get install jq"
fi

# Test Docker (needed for local Supabase)
if docker info &> /dev/null 2>&1; then
    print_result 0 "Docker is running"
else
    print_result 1 "Docker is not running or not installed"
fi

# Test Supabase CLI
if command -v supabase &> /dev/null; then
    print_result 0 "Supabase CLI is installed"
    
    # Check if logged in (for production deployment)
    if supabase auth list &> /dev/null; then
        print_result 0 "Authenticated with Supabase (ready for production deploy)"
    else
        print_warning "Not authenticated with Supabase (needed for production deploy)"
    fi
else
    print_result 1 "Supabase CLI is not installed"
fi

echo ""
echo "📦 Code Quality Checks"
echo "----------------------"

# Check Edge Function TypeScript syntax
cd functions/assets-with-latest-rul
if command -v deno &> /dev/null; then
    if deno check index.ts &> /dev/null; then
        print_result 0 "Edge Function TypeScript syntax is valid"
    else
        print_result 1 "Edge Function has TypeScript errors"
    fi
else
    print_warning "Deno not available - cannot validate TypeScript syntax"
fi

cd ../../

# Check if frontend compiles
cd ../frontend
if [ -f "package.json" ]; then
    if npm run build --silent &> /dev/null; then
        print_result 0 "Frontend builds successfully"
    else
        print_result 1 "Frontend has build errors"
    fi
else
    print_warning "Frontend package.json not found"
fi

cd ../supabase

echo ""
echo "📊 Summary"
echo "==========="
echo -e "Total Tests: $((PASSED + FAILED))"
echo -e "${GREEN}Passed: ${PASSED}${NC}"
echo -e "${RED}Failed: ${FAILED}${NC}"

if [ $FAILED -eq 0 ]; then
    echo ""
    echo -e "${GREEN}🎉 ALL VALIDATIONS PASSED!${NC}"
    echo ""
    echo "Your migration is ready to deploy:"
    echo "1. For local testing: ./dev-setup.sh"
    echo "2. For production: ./deploy.sh"
    echo ""
    echo "🚀 Ready to go live!"
else
    echo ""
    echo -e "${RED}⚠️  SOME VALIDATIONS FAILED${NC}"
    echo ""
    echo "Please fix the failed checks before deploying:"
    echo "- Review the error messages above"
    echo "- Update configuration files as needed"
    echo "- Re-run this validation script"
    echo ""
    echo "Need help? Check the README.md or QUICKSTART.md"
fi

echo ""
