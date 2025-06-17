from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, conlist
from typing import List
import numpy as np
import pandas as pd
import joblib
from tensorflow.keras.models import load_model
import os
import time
import sys
import logging

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = FastAPI()

# Load model and scalers at startup
MODEL_DIR = os.path.dirname(__file__)
MODEL_PATH = os.path.join(MODEL_DIR, "june15cnnlstm_model_full_pipeline_206.keras")
FEATURE_SCALER_PATH = os.path.join(MODEL_DIR, "june15feature_scaler_full_pipeline_206.gz")
RUL_SCALER_PATH = os.path.join(MODEL_DIR, "june15rul_scaler_full_pipeline_206.gz")

model = None
feature_scaler = None
rul_scaler = None

# Expected feature columns by the model, in order
# This list has been updated to reflect consistent naming and all engineered features.
FINAL_FEATURE_COLS = [
    # 9 engineered features, in order:
    'log_bearing_temperature',
    'log_abs_x_direction',
    'log_abs_y_direction',
    'rolling_mean_x',
    'rolling_mean_y',
    'ewma_x',
    'ewma_y',
    'delta_x',
    'delta_y',
    # 4 original/raw features, in order:
    'x_direction',
    'y_direction',
    'bearing_temperature',
    'env_temperature'
]
ENGINEERED_FEATURES_FOR_SCALING = FINAL_FEATURE_COLS[:9]
RAW_FEATURES_NOT_SCALED_BY_THIS_SCALER = FINAL_FEATURE_COLS[9:]
SEQUENCE_LENGTH = 50


@app.on_event("startup")
async def startup_event():
    global model, feature_scaler, rul_scaler
    if not os.path.exists(MODEL_PATH):
        raise RuntimeError(f"Model file not found at {MODEL_PATH}")
    if not os.path.exists(FEATURE_SCALER_PATH):
        raise RuntimeError(f"Feature scaler not found at {FEATURE_SCALER_PATH}")
    if not os.path.exists(RUL_SCALER_PATH):
        raise RuntimeError(f"RUL scaler not found at {RUL_SCALER_PATH}")

    model = load_model(MODEL_PATH)
    feature_scaler = joblib.load(FEATURE_SCALER_PATH)
    rul_scaler = joblib.load(RUL_SCALER_PATH)
    print("Model and scalers loaded successfully.")

class SensorDataPoint(BaseModel):
    x_direction: float
    y_direction: float
    bearing_temperature: float
    env_temperature: float

# conlist ensures the list has exactly SEQUENCE_LENGTH items
PredictionRequest = conlist(SensorDataPoint, min_length=SEQUENCE_LENGTH, max_length=SEQUENCE_LENGTH)

class PredictionResponse(BaseModel):
    predicted_rul: float

# New bulk prediction types
class BulkPredictionRequest(BaseModel):
    sequences: List[PredictionRequest]  # List of sequences, each containing 50 SensorDataPoints

class BulkPredictionResponse(BaseModel):
    predictions: List[PredictionResponse]  # List of predictions
    total_processed: int
    failed_count: int
    processing_time_seconds: float

def preprocess_data(sequence_data: List[SensorDataPoint]) -> np.ndarray:
    """
    Preprocesses the raw sensor data sequence:
    1. Converts to DataFrame.
    2. Renames columns to standardized names.
    3. Performs feature engineering using consistent column names.
    4. Orders columns as per FINAL_FEATURE_COLS.
    5. Scales features using the loaded feature_scaler.
    """
    data_dict = {k: v for k, v in sequence_data[0].model_dump().items()}
    logger.debug(f"preprocess_data: Input data: {data_dict}")
    df = pd.DataFrame([data_dict])
    logger.debug(f"preprocess_data: DataFrame created with columns: {df.columns.tolist()}")

    # Feature Engineering
    df['log_bearing_temperature'] = np.log1p(df['bearing_temperature'])
    df['log_abs_x_direction'] = np.log1p(np.abs(df['x_direction']))
    df['log_abs_y_direction'] = np.log1p(np.abs(df['y_direction']))
    # For single instance, rolling/ewma/diff might behave differently or produce NaNs if not handled.
    # We will use simplified versions or ensure they match batch logic if possible.
    # For simplicity, and given it's a single point, these might be less critical or need historical data not available here.
    # Let's assume for a single prediction, these might be set to 0 or a recent value if available.
    # However, to match the batch processing, we should ensure these columns exist.
    # The scaler expects these columns. If they are all NaNs or zeros, it might be fine.
    df['rolling_mean_x'] = df['x_direction'] # Simplified for single point
    df['rolling_mean_y'] = df['y_direction'] # Simplified for single point
    df['ewma_x'] = df['x_direction']         # Simplified for single point
    df['ewma_y'] = df['y_direction']         # Simplified for single point
    df['delta_x'] = 0                        # Simplified for single point
    df['delta_y'] = 0                        # Simplified for single point

    logger.debug(f"preprocess_data: DataFrame after feature engineering columns: {df.columns.tolist()}")

    # Separate features for scaling
    df_to_scale = df[ENGINEERED_FEATURES_FOR_SCALING]
    df_raw_unscaled = df[RAW_FEATURES_NOT_SCALED_BY_THIS_SCALER]
    logger.debug(f"preprocess_data: df_to_scale columns: {df_to_scale.columns.tolist()}")
    logger.debug(f"preprocess_data: df_raw_unscaled columns: {df_raw_unscaled.columns.tolist()}")

    # Scale only the engineered features
    try:
        scaled_engineered_features = feature_scaler.transform(df_to_scale)
        df_scaled_engineered = pd.DataFrame(scaled_engineered_features, columns=ENGINEERED_FEATURES_FOR_SCALING, index=df_to_scale.index)
        logger.debug(f"preprocess_data: Scaled engineered features shape: {df_scaled_engineered.shape}")
    except Exception as e:
        logger.error(f"Error during feature_scaler.transform in preprocess_data: {e}")
        logger.error(f"Columns passed to scaler: {df_to_scale.columns.tolist()}")
        logger.error(f"Scaler expected features: {feature_scaler.feature_names_in_ if hasattr(feature_scaler, 'feature_names_in_') else 'N/A'}")
        raise

    # Concatenate scaled engineered features with unscaled raw features
    df_processed = pd.concat([df_scaled_engineered, df_raw_unscaled], axis=1)
    logger.debug(f"preprocess_data: df_processed columns after concat: {df_processed.columns.tolist()}")

    # Ensure final column order
    df_processed = df_processed[FINAL_FEATURE_COLS]
    logger.debug(f"preprocess_data: df_processed columns after reordering: {df_processed.columns.tolist()}")
    logger.debug(f"preprocess_data: df_processed head:\n{df_processed.head()}")

    return df_processed.values.reshape(1, -1) # Reshape for single sample


def preprocess_data_batch(sequences_data: List[List[SensorDataPoint]]) -> np.ndarray:
    """
    Vectorized preprocessing for multiple sequences at once.
    More efficient than processing sequences individually.
    """
    all_dataframes = []
    for sequence_data in sequences_data:
        df = pd.DataFrame([item.model_dump() for item in sequence_data])
        print("\n[DEBUG] Raw DataFrame columns (batch):", list(df.columns))
        epsilon = 1e-6
        if (df['bearing_temperature'] <= 0).any():
            min_temp = df['bearing_temperature'].min()
            df['bearing_temperature_adj_for_log'] = df['bearing_temperature'] - min_temp + epsilon
        else:
            df['bearing_temperature_adj_for_log'] = df['bearing_temperature']
        df['log_bearing_temperature'] = np.log(df['bearing_temperature_adj_for_log'])
        df['abs_x_direction'] = df['x_direction'].abs()
        df['log_abs_x_direction'] = np.log(df['abs_x_direction'] + epsilon)
        df['abs_y_direction'] = df['y_direction'].abs()
        df['log_abs_y_direction'] = np.log(df['abs_y_direction'] + epsilon)
        df['rolling_mean_x'] = df['x_direction'].rolling(window=5, min_periods=1).mean()
        df['rolling_mean_y'] = df['y_direction'].rolling(window=5, min_periods=1).mean()
        df['ewma_x'] = df['x_direction'].ewm(span=5, adjust=False).mean()
        df['ewma_y'] = df['y_direction'].ewm(span=5, adjust=False).mean()
        df['delta_x'] = df['x_direction'].diff().fillna(0)
        df['delta_y'] = df['y_direction'].diff().fillna(0)
        print("[DEBUG] After feature engineering columns (batch):", list(df.columns))
        df.drop(['bearing_temperature_adj_for_log', 'abs_x_direction', 'abs_y_direction'], axis=1, inplace=True)
        print("[DEBUG] After dropping temp columns (batch):", list(df.columns))
        all_dataframes.append(df)
    combined_df = pd.concat(all_dataframes, keys=range(len(all_dataframes)))
    try:
        missing_in_combined_df = list(set(FINAL_FEATURE_COLS) - set(combined_df.columns))
        if missing_in_combined_df:
            print(f"[ERROR] Columns missing before final selection in batch: {missing_in_combined_df}. Available: {list(combined_df.columns)}")
            raise HTTPException(status_code=400, detail=f"Columns missing before final selection in batch: {missing_in_combined_df}. Available: {list(combined_df.columns)}")
        combined_df_features = combined_df[FINAL_FEATURE_COLS]
        print("[DEBUG] DataFrame columns before scaling (batch, final order):", list(combined_df_features.columns))
    except KeyError as e:
        missing_cols = list(set(FINAL_FEATURE_COLS) - set(combined_df.columns))
        present_cols = list(combined_df.columns)
        print(f"[ERROR] Column mismatch after batch feature engineering. Expected: {FINAL_FEATURE_COLS}. Got: {present_cols}. Missing: {missing_cols}. Original error: {e}")
        raise HTTPException(status_code=400, detail=f"Column mismatch after batch feature engineering. Expected: {FINAL_FEATURE_COLS}. Got: {present_cols}. Missing: {missing_cols}. Original error: {e}")
    if hasattr(feature_scaler, 'feature_names_in_'):
        print("[DEBUG] Scaler expected feature names (batch):", list(feature_scaler.feature_names_in_))
    else:
        print("[DEBUG] Scaler does not have feature_names_in_ attribute (batch).")
        print(f"[DEBUG] Scaler expected number of features (batch): {feature_scaler.n_features_in_ if hasattr(feature_scaler, 'n_features_in_') else 'N/A'}")

    # Separate features for scaling
    df_to_scale = combined_df_features[ENGINEERED_FEATURES_FOR_SCALING]
    df_raw_unscaled = combined_df_features[RAW_FEATURES_NOT_SCALED_BY_THIS_SCALER]
    
    print(f"[DEBUG] Batch df_to_scale columns: {list(df_to_scale.columns)}")
    print(f"[DEBUG] Batch df_raw_unscaled columns: {list(df_raw_unscaled.columns)}")

    # Vectorized scaling on the appropriate part of the DataFrame
    scaled_engineered_features_np = feature_scaler.transform(df_to_scale)
    
    # Convert scaled numpy array back to DataFrame, preserving index for proper concatenation
    scaled_engineered_features_df = pd.DataFrame(scaled_engineered_features_np, columns=ENGINEERED_FEATURES_FOR_SCALING, index=combined_df_features.index)

    # Concatenate scaled engineered features with unscaled raw features
    final_processed_df = pd.concat([scaled_engineered_features_df, df_raw_unscaled], axis=1)
    
    # Ensure the columns are in the final specified order
    final_processed_df = final_processed_df[FINAL_FEATURE_COLS]
    print("[DEBUG] Final batch processed DataFrame columns after selective scaling:", list(final_processed_df.columns))
    
    # Reshape back to (num_sequences, SEQUENCE_LENGTH, num_features)
    num_sequences = len(sequences_data)
    num_features = len(FINAL_FEATURE_COLS)
    return final_processed_df.values.reshape(num_sequences, SEQUENCE_LENGTH, num_features)

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.post("/predict", response_model=PredictionResponse)
async def predict_rul(request_data: PredictionRequest):
    if model is None or feature_scaler is None or rul_scaler is None:
        raise HTTPException(status_code=503, detail="Model or scalers not loaded. Service might be starting up.")

    try:
        # The request_data is already a list of SensorDataPoint objects due to Pydantic validation
        # It's guaranteed to have SEQUENCE_LENGTH items.
        processed_sequence = preprocess_data(request_data) # Shape: (SEQUENCE_LENGTH, num_features)
        
        # Reshape for the model: (1, SEQUENCE_LENGTH, num_features)
        model_input = np.expand_dims(processed_sequence, axis=0)
        
        # Make prediction
        scaled_prediction = model.predict(model_input) # Shape: (1, 1) or (1,)
        logger.debug(f"Raw scaled prediction: {scaled_prediction}")
        
        # Inverse transform the prediction (gives us revolutions)
        # RUL scaler expects a 2D array, e.g., [[value]]
        predicted_rul_revolutions = rul_scaler.inverse_transform(scaled_prediction.reshape(-1, 1))[0,0]
        logger.debug(f"Inverse transformed RUL (revolutions): {predicted_rul_revolutions}")
        
        # Convert from revolutions to hours using the training mapping:
        # 3,398,400 revolutions = 128 hours (from the run-to-failure dataset)
        MAX_REVOLUTIONS = 3398400.0
        MAX_HOURS = 128.0
        predicted_rul = (predicted_rul_revolutions / MAX_REVOLUTIONS) * MAX_HOURS
        logger.debug(f"Converted RUL (hours): {predicted_rul}")
        
        return PredictionResponse(predicted_rul=float(predicted_rul))

    except ValueError as ve:
        raise HTTPException(status_code=400, detail=f"Error in input data processing: {str(ve)}")
    except Exception as e:
        # Log the exception e for debugging
        print(f"Unexpected error during prediction: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error during prediction: {str(e)}")

@app.post("/predict_bulk", response_model=BulkPredictionResponse)
async def predict_rul_bulk(request_data: BulkPredictionRequest):
    """
    Process multiple sequences in a single vectorized operation for maximum performance.
    Each sequence should contain exactly 50 sensor data points.
    """
    if model is None or feature_scaler is None or rul_scaler is None:
        raise HTTPException(status_code=503, detail="Model or scalers not loaded. Service might be starting up.")

    start_time = time.time()
    failed_count = 0

    try:
        # Convert all sequences to a single batch for vectorized processing
        batch_sequences = []
        valid_indices = []
        
        for i, sequence in enumerate(request_data.sequences):
            try:
                # Process single sequence
                processed_sequence = preprocess_data(sequence)  # Shape: (SEQUENCE_LENGTH, num_features)
                batch_sequences.append(processed_sequence)
                valid_indices.append(i)
            except Exception as e:
                print(f"Error preprocessing sequence {i}: {e}")
                failed_count += 1
                # We'll handle failed sequences later
        
        # Vectorized prediction for all valid sequences at once
        predictions = []
        if batch_sequences:
            # Stack all sequences into a single batch: (batch_size, SEQUENCE_LENGTH, num_features)
            model_input = np.stack(batch_sequences, axis=0)
            
            print(f"Processing batch of {model_input.shape[0]} sequences with shape {model_input.shape}")
            
            # Single model prediction call for entire batch
            scaled_predictions = model.predict(model_input, verbose=0) # Shape: (batch_size, 1)
            
            # Vectorized inverse transform (gives us revolutions)
            predicted_ruls_revolutions = rul_scaler.inverse_transform(scaled_predictions.reshape(-1, 1)).flatten()
            
            # Convert from revolutions to hours using the training mapping:
            # 3,398,400 revolutions = 128 hours (from the run-to-failure dataset)
            MAX_REVOLUTIONS = 3398400.0
            MAX_HOURS = 128.0
            predicted_ruls = (predicted_ruls_revolutions / MAX_REVOLUTIONS) * MAX_HOURS
            
            # Create response objects
            valid_predictions = [PredictionResponse(predicted_rul=float(rul)) for rul in predicted_ruls]
        else:
            valid_predictions = []
        
        # Reconstruct results maintaining original order
        result_predictions = []
        valid_idx = 0
        
        for i in range(len(request_data.sequences)):
            if i in valid_indices:
                result_predictions.append(valid_predictions[valid_idx])
                valid_idx += 1
            else:
                result_predictions.append(PredictionResponse(predicted_rul=-1.0))

        processing_time = time.time() - start_time
        sequences_per_second = len(request_data.sequences) / processing_time if processing_time > 0 else 0
        
        print(f"Vectorized processing: {len(request_data.sequences)} sequences in {processing_time:.3f}s ({sequences_per_second:.1f} seq/s)")
        
        return BulkPredictionResponse(
            predictions=result_predictions,
            total_processed=len(request_data.sequences),
            failed_count=failed_count,
            processing_time_seconds=processing_time
        )

    except Exception as e:
        print(f"Unexpected error during vectorized bulk prediction: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error during bulk prediction: {str(e)}")

@app.post("/predict_bulk_fast", response_model=BulkPredictionResponse)
async def predict_rul_bulk_fast(request_data: BulkPredictionRequest):
    """
    Ultra-fast vectorized processing for maximum throughput.
    Processes all sequences in a single batch operation.
    """
    if model is None or feature_scaler is None or rul_scaler is None:
        raise HTTPException(status_code=503, detail="Model or scalers not loaded. Service might be starting up.")

    start_time = time.time()

    try:
        # Vectorized preprocessing for entire batch
        model_input = preprocess_data_batch(request_data.sequences)
        
        print(f"Fast processing batch of {model_input.shape[0]} sequences with shape {model_input.shape}")
        
        # Single vectorized model prediction
        scaled_predictions = model.predict(model_input, verbose=0)  # Shape: (batch_size, 1)
        
        # Vectorized inverse transform (gives us revolutions)
        predicted_ruls_revolutions = rul_scaler.inverse_transform(scaled_predictions.reshape(-1, 1)).flatten()
        
        # Convert from revolutions to hours using the training mapping:
        # 3,398,400 revolutions = 128 hours (from the run-to-failure dataset)
        MAX_REVOLUTIONS = 3398400.0
        MAX_HOURS = 128.0
        predicted_ruls = (predicted_ruls_revolutions / MAX_REVOLUTIONS) * MAX_HOURS
        
        # Debug: Print both revolutions and hours
        logger.debug(f"Predicted RULs (revolutions): min={predicted_ruls_revolutions.min():.1f}, max={predicted_ruls_revolutions.max():.1f}, mean={predicted_ruls_revolutions.mean():.1f}")
        logger.debug(f"Predicted RULs (hours): min={predicted_ruls.min():.1f}, max={predicted_ruls.max():.1f}, mean={predicted_ruls.mean():.1f}")
        logger.debug(f"First 5 RULs (hours): {predicted_ruls[:5]}")
        logger.debug(f"Last 5 RULs (hours): {predicted_ruls[-5:]}")
        
        # Create response objects
        predictions = [PredictionResponse(predicted_rul=float(rul)) for rul in predicted_ruls]

        processing_time = time.time() - start_time
        sequences_per_second = len(request_data.sequences) / processing_time if processing_time > 0 else 0
        
        print(f"Fast vectorized processing: {len(request_data.sequences)} sequences in {processing_time:.3f}s ({sequences_per_second:.1f} seq/s)")
        
        return BulkPredictionResponse(
            predictions=predictions,
            total_processed=len(request_data.sequences),
            failed_count=0,  # No individual sequence failures in vectorized approach
            processing_time_seconds=processing_time
        )

    except Exception as e:
        print(f"Error in fast bulk prediction: {e}")
        raise HTTPException(status_code=500, detail=f"Fast bulk prediction failed: {str(e)}")
