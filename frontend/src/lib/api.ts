import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import type { Asset, AssetWithLatestRul, RulPrediction, SensorHistoryRecord, Alert, ModelPerformanceMetrics, ActualVsPredictedRul, DataDriftReport } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// Interface for the raw API response for sensor history
interface SensorHistoryApiResponseItem {
  prediction_timestamp: string;
  predicted_rul: number;
  input_features_snapshot: Record<string, number | string | null>;
}

export function useAssets() {
  return useQuery<Asset[]>({
    queryKey: ['assets'],
    queryFn: async (): Promise<Asset[]> => {
      const res = await fetch(`${API_BASE_URL}/assets`);
      if (!res.ok) throw new Error('Failed to fetch assets');
      return res.json();
    },
  });
}

export function useAssetsWithLatestRul() {
  return useQuery<AssetWithLatestRul[]>({
    queryKey: ['assets_with_latest_rul'],
    queryFn: async (): Promise<AssetWithLatestRul[]> => {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      try {
        const res = await fetch(`${API_BASE_URL}/assets_with_latest_rul`, {
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
          },
        });
        clearTimeout(timeoutId);
        
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        return res.json();
      } catch (error: any) { // Added type assertion for error
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') { // More specific error check
          throw new Error('Request timed out after 30 seconds');
        }
        throw error;
      }
    },
    retry: 1,
    retryDelay: 2000,
    staleTime: 30000, // Cache for 30 seconds
    gcTime: 300000, // Keep in cache for 5 minutes
  });
}

export function useAssetById(assetId: string | undefined) {
  return useQuery<Asset>({
    queryKey: ['asset', assetId],
    queryFn: async (): Promise<Asset> => {
      if (!assetId) throw new Error('Asset ID is required');
      const res = await fetch(`${API_BASE_URL}/assets/${assetId}`);
      if (!res.ok) throw new Error(`Failed to fetch asset ${assetId}`);
      return res.json();
    },
    enabled: !!assetId, // Only run query if assetId is available
  });
}

export function useRulHistory(assetId: string | undefined) {
  return useQuery<RulPrediction[]>({
    queryKey: ['rulHistory', assetId],
    queryFn: async (): Promise<RulPrediction[]> => {
      if (!assetId) throw new Error('Asset ID is required');
      const res = await fetch(`${API_BASE_URL}/assets/${assetId}/rul_history`);
      if (!res.ok) throw new Error(`Failed to fetch RUL history for asset ${assetId}`);
      return res.json();
    },
    enabled: !!assetId,
  });
}

// Corrected useSensorHistory
export function useSensorHistory(assetId: string | undefined) {
  return useQuery<SensorHistoryRecord[]>({
    queryKey: ['sensorHistory', assetId],
    queryFn: async (): Promise<SensorHistoryRecord[]> => {
      if (!assetId) throw new Error('Asset ID is required');
      const res = await fetch(`${API_BASE_URL}/assets/${assetId}/sensor_history`);
      if (!res.ok) throw new Error(`Failed to fetch sensor history for asset ${assetId}`);
      
      const data = await res.json() as SensorHistoryApiResponseItem[]; // Use type assertion
      
      return data.map((item: SensorHistoryApiResponseItem) => ({
        timestamp: item.prediction_timestamp,
        readings: item.input_features_snapshot,
        predicted_rul: item.predicted_rul,
      }));
    },
    enabled: !!assetId,
  });
}

// --- Alert System API Hooks ---

// Hook to fetch alerts
export function useAlerts(filters: { assetId?: string; acknowledged?: boolean } = {}) {
  const queryParams = new URLSearchParams();
  if (filters.assetId) queryParams.append('asset_id', filters.assetId);
  if (filters.acknowledged !== undefined) queryParams.append('acknowledged', String(filters.acknowledged));
  
  const queryString = queryParams.toString();

  return useQuery<Alert[], Error>({
    queryKey: ['alerts', filters],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/alerts${queryString ? `?${queryString}` : ''}`);
      if (!response.ok) {
        throw new Error('Network response was not ok when fetching alerts');
      }
      return response.json();
    },
  });
};

// Hook to acknowledge an alert
export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();
  return useMutation<Alert, Error, string>({ // Expects alertId (string) as input
    mutationFn: async (alertId: string) => {
      const response = await fetch(`${API_BASE_URL}/alerts/${alertId}/acknowledge`, {
        method: 'PUT',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to acknowledge alert' }));
        throw new Error(errorData.error || 'Failed to acknowledge alert');
      }
      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate and refetch alerts query to update the list
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      // Optionally, update the specific alert in the cache if needed for immediate UI update
      queryClient.setQueryData<Alert[]>(['alerts'], (oldData) =>
        oldData?.map((alert) => (alert.id === data.id ? data : alert))
      );
    },
  });
};

// --- Model Performance & Diagnostics API Hooks ---

// Corrected Hook to fetch historical model performance metrics
export function useModelPerformanceHistory() {
  return useQuery<ModelPerformanceMetrics[], Error>({
    queryKey: ['modelPerformanceHistory'],
    queryFn: async (): Promise<ModelPerformanceMetrics[]> => {
      // Replace with your actual API endpoint
      // const response = await fetch(`${API_BASE_URL}/diagnostics/performance_history`);
      // if (!response.ok) throw new Error('Failed to fetch model performance history');
      // return response.json();
      
      // Placeholder data:
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay
      return [ // Actual array, not a string
        { timestamp: '2025-01-15T10:00:00Z', r_squared: 0.88, mae: 5.2, rmse: 7.1, model_version: 'v1.0.0' },
        { timestamp: '2025-02-15T10:00:00Z', r_squared: 0.87, mae: 5.4, rmse: 7.3, model_version: 'v1.0.1' },
        { timestamp: '2025-03-15T10:00:00Z', r_squared: 0.89, mae: 5.0, rmse: 6.9, model_version: 'v1.1.0' },
      ];
    },
  });
}

// Corrected Hook to fetch actual vs. predicted RUL data for past failures
export function useActualVsPredictedRul() {
  return useQuery<ActualVsPredictedRul[], Error>({
    queryKey: ['actualVsPredictedRul'],
    queryFn: async (): Promise<ActualVsPredictedRul[]> => {
      // Replace with your actual API endpoint
      // const response = await fetch(`${API_BASE_URL}/diagnostics/actual_vs_predicted`);
      // if (!response.ok) throw new Error('Failed to fetch actual vs. predicted RUL data');
      // return response.json();

      // Placeholder data:
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay
      return [ // Actual array
        { asset_id: '1', asset_name: 'Bearing Alpha', failure_timestamp: '2025-03-01T14:30:00Z', actual_rul_at_failure: 0, predicted_rul_at_failure_window_start: 15, prediction_window_days: 30 },
        { asset_id: '3', asset_name: 'Bearing Gamma', failure_timestamp: '2025-04-10T09:00:00Z', actual_rul_at_failure: 0, predicted_rul_at_failure_window_start: 25, prediction_window_days: 30 },
      ];
    },
  });
}

// Corrected Hook to fetch data drift reports
export function useDataDriftReport() {
  return useQuery<DataDriftReport, Error>({
    queryKey: ['dataDriftReport'],
    queryFn: async (): Promise<DataDriftReport> => {
      // Replace with your actual API endpoint
      // const response = await fetch(`${API_BASE_URL}/diagnostics/data_drift_report`);
      // if (!response.ok) throw new Error('Failed to fetch data drift report');
      // return response.json();

      // Placeholder data corrected to match DataDriftReport type:
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay
      return {
        report_timestamp: '2025-05-01T00:00:00Z',
        model_version: 'v1.1.0',
        overall_drift_status: 'low', // Corrected: string literal type
        features: [ // Corrected: field name is 'features'
          { feature_name: 'sensor_1_avg', drift_score: 0.15, is_drifting: true }, // Corrected: is_drifting
          { feature_name: 'sensor_2_std', drift_score: 0.05, is_drifting: false },// Corrected: is_drifting
          { feature_name: 'sensor_3_max', drift_score: 0.22, is_drifting: true }, // Corrected: is_drifting
          { feature_name: 'vibration_peak', drift_score: 0.08, is_drifting: false }, // Corrected: is_drifting
        ],
      };
    },
  });
}

// Function to send sensor data for RUL prediction
export async function predictRulForAsset(assetId: string, sensorData: any): Promise<any> {
  // Log the data we're sending for debugging
  console.log('Sending sensor data to backend:', sensorData[0]);
  
  const response = await fetch(`${API_BASE_URL}/assets/${assetId}/predict_rul`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ 
      sensor_data: sensorData
    }),
  });

  if (!response.ok) {
    let errorMessage = 'Failed to get RUL prediction (undefined error message from backend)';
    try {
      const errorData = await response.json();
      if (errorData && errorData.error) {
        errorMessage = errorData.error;
      } else if (errorData && errorData.message) { // Fallback for other possible error formats
        errorMessage = errorData.message;
      }
      // If the error response is plain text and not JSON
      if (response.headers.get("content-type")?.includes("text/plain") || response.headers.get("content-type")?.includes("text/html")) {
        const textError = await response.text();
        if (textError) errorMessage = textError;
      }

    } catch (e) {
      console.error('Failed to parse error response from backend:', e);
      // errorMessage remains the default or could be updated from response.text() if JSON parsing fails
      try {
        const textError = await response.text();
        if (textError) errorMessage = textError;
      } catch (textErr) {
        console.error('Failed to get text from error response:', textErr)
      }
    }
    throw new Error(errorMessage);
  }
  return response.json();
}

// Bulk function to send multiple sequences for RUL prediction
export async function predictRulForAssetBulk(assetId: string, sequences: any[][]): Promise<any> {
  console.log(`Sending ${sequences.length} sequences to backend for bulk prediction`);
  
  const response = await fetch(`${API_BASE_URL}/assets/${assetId}/predict_rul_bulk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ 
      sequences: sequences
    }),
  });

  if (!response.ok) {
    let errorMessage = 'Failed to get bulk RUL predictions (undefined error message from backend)';
    try {
      const errorData = await response.json();
      if (errorData && errorData.error) {
        errorMessage = errorData.error;
      } else if (errorData && errorData.message) {
        errorMessage = errorData.message;
      }
    } catch (parseError) {
      const text = await response.text();
      if (text) {
        errorMessage = text;
      }
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

// Ultra-fast bulk function for maximum throughput
export async function predictRulForAssetBulkFast(assetId: string, sequences: any[][]): Promise<any> {
  console.log(`Ultra-fast processing ${sequences.length} sequences for asset ${assetId}`);
  
  const response = await fetch(`${API_BASE_URL}/assets/${assetId}/predict_rul_bulk_fast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ 
      sequences: sequences
    }),
  });

  if (!response.ok) {
    let errorMessage = 'Failed to get fast bulk RUL predictions';
    try {
      const errorData = await response.json();
      if (errorData && errorData.error) {
        errorMessage = errorData.error;
      }
    } catch (parseError) {
      const text = await response.text();
      if (text) {
        errorMessage = text;
      }
    }
    throw new Error(errorMessage);
  }

  return response.json();
}
