import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    )

    // Get all assets with their latest RUL predictions
    // This replaces the Postgres function with a more efficient approach
    const { data: assets, error: assetsError } = await supabaseClient
      .from('assets')
      .select(`
        id,
        name,
        asset_type,
        description,
        location,
        purchase_date,
        initial_cost,
        operational_status,
        created_at
      `)
      .order('created_at', { ascending: false })

    if (assetsError) {
      console.error('Error fetching assets:', assetsError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch assets' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    if (!assets || assets.length === 0) {
      return new Response(
        JSON.stringify([]),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // Get asset IDs for batch querying
    const assetIds = assets.map(asset => asset.id)

    // Get the latest RUL prediction for each asset
    // Using a subquery to get the most recent prediction per asset
    const { data: latestRuls, error: rulsError } = await supabaseClient
      .from('rul_predictions')
      .select(`
        asset_id,
        predicted_rul,
        prediction_timestamp
      `)
      .in('asset_id', assetIds)
      .order('prediction_timestamp', { ascending: false })

    if (rulsError) {
      console.error('Error fetching RUL predictions:', rulsError)
      // Return assets without RUL data rather than failing completely
      const assetsWithoutRul: AssetWithLatestRul[] = assets.map(asset => ({
        ...asset,
        latest_rul: null,
        latest_rul_timestamp: null,
      }))

      return new Response(
        JSON.stringify(assetsWithoutRul),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // Create a map of asset_id to latest RUL for efficient lookup
    const latestRulMap = new Map<string, { rul: number; timestamp: string }>()
    
    if (latestRuls) {
      // Group predictions by asset_id and keep only the latest one
      for (const prediction of latestRuls) {
        const existing = latestRulMap.get(prediction.asset_id)
        if (!existing || new Date(prediction.prediction_timestamp) > new Date(existing.timestamp)) {
          latestRulMap.set(prediction.asset_id, {
            rul: prediction.predicted_rul,
            timestamp: prediction.prediction_timestamp,
          })
        }
      }
    }

    // Combine assets with their latest RUL data
    const assetsWithLatestRul: AssetWithLatestRul[] = assets.map(asset => {
      const latestRul = latestRulMap.get(asset.id)
      return {
        ...asset,
        latest_rul: latestRul?.rul ?? null,
        latest_rul_timestamp: latestRul?.timestamp ?? null,
      }
    })

    return new Response(
      JSON.stringify(assetsWithLatestRul),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )

  } catch (error) {
    console.error('Unexpected error in assets-with-latest-rul function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
