# Supabase Edge Functions Migration

## Overview

This migration replaces the slow Postgres function `get_assets_with_latest_rul` with a high-performance Supabase Edge Function. This addresses the timeout issues and improves overall dashboard performance.

## Benefits

- ✅ **Performance**: Runs on Supabase's global edge network
- ✅ **Reliability**: Longer execution timeouts than Postgres functions
- ✅ **Flexibility**: TypeScript/JavaScript logic instead of complex SQL
- ✅ **Type Safety**: Proper TypeScript interfaces and error handling
- ✅ **Scalability**: Better handling of large datasets with efficient queries
- ✅ **Debugging**: Better error messages and logging

## Architecture

### Before (Postgres Function)
```
Frontend -> Backend API -> Postgres Function -> Database Query -> Response
```

### After (Edge Function)
```
Frontend -> Supabase Edge Function -> Optimized Database Queries -> Response
```

## Files Created/Modified

### New Files
- `supabase/functions/assets-with-latest-rul/index.ts` - Main Edge Function
- `supabase/config.toml` - Supabase configuration
- `supabase/deploy.sh` - Deployment script
- `frontend/.env.example` - Environment variables template
- `frontend/.env.local` - Local development environment

### Modified Files
- `frontend/src/lib/api.ts` - Updated to use Edge Function instead of backend API

## Setup Instructions

### 1. Install Supabase CLI
```bash
npm install -g supabase
```

### 2. Login and Link Project
```bash
supabase login
supabase link --project-ref YOUR_PROJECT_ID
```

### 3. Deploy Edge Function
```bash
cd /workspaces/rulDashboard/supabase
./deploy.sh
```

### 4. Update Environment Variables
Update `frontend/.env.local` with your actual Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-actual-anon-key
```

### 5. Test the Migration
1. Start your frontend application
2. Open the dashboard
3. Verify that asset data loads without timeout errors
4. Check browser network tab to confirm requests go to Edge Function

## Edge Function Details

### Endpoint
```
GET https://YOUR_PROJECT_ID.supabase.co/functions/v1/assets-with-latest-rul
```

### Response Format
```typescript
interface AssetWithLatestRul {
  id: string;
  name: string | null;
  asset_type: string | null;
  description: string | null;
  location: string | null;
  purchase_date: string | null;
  initial_cost: number | null;
  operational_status: string | null;
  created_at: string;
  latest_rul: number | null;
  latest_rul_timestamp: string | null;
}
```

### Performance Optimizations

1. **Efficient Queries**: Two separate queries instead of complex JOINs
2. **In-Memory Processing**: JavaScript Map for O(1) lookups
3. **Graceful Degradation**: Returns assets without RUL if predictions fail
4. **Proper Error Handling**: Detailed logging and user-friendly error messages

## Testing

### Manual Testing
```bash
# Test the Edge Function directly
curl -X GET 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/assets-with-latest-rul' \
     -H 'Authorization: Bearer YOUR_ANON_KEY'
```

### Frontend Testing
1. Open browser developer tools
2. Navigate to the dashboard
3. Check Network tab for successful requests to Edge Function
4. Verify asset data displays correctly
5. Check console for any errors

## Troubleshooting

### Common Issues

#### 1. Environment Variables Not Set
**Error**: `Failed to fetch assets with latest RUL`
**Solution**: Ensure `.env.local` has correct SUPABASE_URL and SUPABASE_ANON_KEY

#### 2. Function Not Deployed
**Error**: 404 on function endpoint
**Solution**: Run `./deploy.sh` to deploy the function

#### 3. Database Permissions
**Error**: 403 or permission denied
**Solution**: Verify RLS policies on `assets` and `rul_predictions` tables

#### 4. CORS Issues
**Error**: CORS policy errors in browser
**Solution**: Edge Function already includes CORS headers; check if you're using correct domain

## Monitoring and Maintenance

### Performance Monitoring
- Monitor Edge Function execution time in Supabase dashboard
- Set up alerts for high error rates
- Track response times and optimize queries as needed

### Data Growth Considerations
- If `rul_predictions` table grows large, consider:
  - Adding indexes on `asset_id` and `prediction_timestamp`
  - Implementing pagination for large result sets
  - Adding data archival for old predictions

## Migration Rollback

If you need to rollback to the old system:

1. Revert `frontend/src/lib/api.ts` to use backend API:
```typescript
const res = await fetch(`${API_BASE_URL}/assets_with_latest_rul`);
```

2. Ensure backend API server is running
3. Fix any Postgres function issues

## Next Steps

Consider migrating other heavy API endpoints to Edge Functions:
- Asset details with RUL history
- Model performance metrics
- Bulk RUL predictions
- Alert generation

## Support

For issues with this migration:
1. Check Supabase function logs in dashboard
2. Review browser console errors
3. Verify environment variables are correct
4. Test function endpoint directly with curl
