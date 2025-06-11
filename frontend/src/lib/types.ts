export interface AssetWithLatestRul {
  id: string | number;
  name: string;
  asset_type: string;
  location: string;
  operational_status: string;
  latest_rul: number | null;
  latest_prediction_timestamp: string | null;
  // Add other asset-specific fields if necessary from your API
  description?: string;
  serial_number?: string;
  installation_date?: string;
  manufacturer?: string;
  model_number?: string;
  // Fields from rul_predictions if joined directly and needed
  // prediction_id?: string | number;
  // prediction_timestamp?: string; // This is covered by latest_prediction_timestamp
  // input_features_snapshot?: Record<string, any>;
}

export interface Asset {
  id: string | number;
  name: string;
  asset_type: string;
  location: string;
  operational_status: string;
  description?: string;
  serial_number?: string;
  installation_date?: string;
  manufacturer?: string;
  model_number?: string;
}

export interface RulPrediction {
  prediction_timestamp: string;
  predicted_rul: number;
}

export interface SensorReading {
  [key: string]: number | string; // Allows for various sensor readings
}

export interface SensorHistoryRecord {
  timestamp: string; // Changed from prediction_timestamp
  readings: Record<string, number | string | null>; // Changed from input_features_snapshot and its type
  predicted_rul?: number; // Optional: if you also include RUL in this record from the hook
}


// --- Alert System Types ---
export interface AlertAssetInfo {
  name: string;
  asset_type: string;
  location: string;
}

export interface Alert {
  id: string;
  asset_id: string;
  timestamp: string;
  severity: 'critical' | 'warning' | 'info'; // Assuming these severities
  message: string;
  acknowledged: boolean;
  acknowledged_at?: string | null;
  rul_at_alert?: number | null;
  triggering_condition?: string | null;
  assets?: AlertAssetInfo; // Nested asset information from the backend join
}

// --- Model Performance & Diagnostics Types ---

export interface ModelPerformanceMetrics {
  timestamp: string; // Timestamp of when these metrics were calculated (e.g., after a retraining or batch evaluation)
  r_squared: number;
  mae: number; // Mean Absolute Error
  rmse: number; // Root Mean Squared Error
  model_version?: string; // Optional: version of the model these metrics apply to
}

export interface ActualVsPredictedRul {
  asset_id: string;
  asset_name?: string; // Optional: for easier display
  failure_timestamp: string;
  actual_rul_at_failure: number; // Should ideally be 0 or a very small number if caught at failure
  predicted_rul_at_failure_window_start: number; // RUL predicted some time before actual failure
  prediction_window_days?: number; // How many days before failure was this prediction made
}

export interface DataDriftFeatureMetric {
  feature_name: string;
  drift_score: number; // e.g., PSI, KS statistic
  is_drifting: boolean;
  // Potentially add baseline and current distribution summaries here for visualization
}

export interface DataDriftReport {
  report_timestamp: string;
  model_version?: string;
  overall_drift_status: 'low' | 'medium' | 'high' | 'unknown';
  features: DataDriftFeatureMetric[];
}
