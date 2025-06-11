from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, conlist
from typing import List
import numpy as np
import pandas as pd
import joblib
from tensorflow.keras.models import load_model
import os
import time

app = FastAPI()

# Load model and scalers at startup
MODEL_DIR = os.path.dirname(__file__)
MODEL_PATH = os.path.join(MODEL_DIR, "best_cnnlstm_model_ultimate_pipeline.keras")
FEATURE_SCALER_PATH = os.path.join(MODEL_DIR, "feature_scaler.joblib")
RUL_SCALER_PATH = os.path.join(MODEL_DIR, "rul_scaler.joblib")

model = None
feature_scaler = None
rul_scaler = None

# Expected feature columns by the model, in order
# From model_details.md
# original_feature_cols: ['x_direction', 'y_direction', 'bearing tem', 'env temp']
# engineered_features: ['log_bearing tem', 'abs_x_direction', 'log_abs_x_direction', 'abs_y_direction', 'log_abs_y_direction']
FINAL_FEATURE_COLS = [
    'abs_x_direction', 
    'abs_y_direction', 
    'bearing tem', 
    'env temp', 
    'log_abs_x_direction', 
    'log_abs_y_direction', 
    'log_bearing tem', 
    'x_direction', 
    'y_direction'
]
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
    bearing_tem: float
    env_temp: float

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
    predictions: List[PredictionResponse]  # List of predictions
    total_processed: int
    failed_count: int
    processing_time_seconds: float

def preprocess_data(sequence_data: List[SensorDataPoint]) -> np.ndarray:
    """
    Preprocesses the raw sensor data sequence:
    1. Converts to DataFrame.
    2. Renames columns to match feature engineering/model expectations.
    3. Performs feature engineering.
    4. Orders columns as per FINAL_FEATURE_COLS.
    5. Scales features using the loaded feature_scaler.
    """
    df = pd.DataFrame([item.model_dump() for item in sequence_data])

    # Rename columns from Pydantic model (snake_case) to match expected names (with spaces)
    # This aligns with FINAL_FEATURE_COLS and feature engineering steps.
    df.rename(columns={
        'bearing_tem': 'bearing tem',
        'env_temp': 'env temp'
        # 'x_direction' and 'y_direction' are assumed to be consistent already
    }, inplace=True)

    # Feature Engineering
    # Ensure 'bearing tem' is positive for log, add small epsilon for safety if it can be zero or negative.
    # Assuming 'bearing tem' from sensor is always > 0 based on typical temperature readings.
    try:
        df['log_bearing tem'] = np.log(df['bearing tem'] + 1e-9) # Add epsilon for safety

        df['abs_x_direction'] = np.abs(df['x_direction'])
        df['log_abs_x_direction'] = np.log(df['abs_x_direction'] + 1e-9) # Add epsilon for safety

        df['abs_y_direction'] = np.abs(df['y_direction'])
        df['log_abs_y_direction'] = np.log(df['abs_y_direction'] + 1e-9) # Add epsilon for safety
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Missing column during feature engineering. Problem with key: {str(e)}. Current df columns: {list(df.columns)}")
    
    # Ensure all columns are present and in the correct order
    try:
        df = df[FINAL_FEATURE_COLS]
    except KeyError as e:
        missing_cols = list(set(FINAL_FEATURE_COLS) - set(df.columns))
        raise HTTPException(status_code=400, detail=f"Missing columns after feature engineering. Expected: {FINAL_FEATURE_COLS}. Got: {list(df.columns)}. Missing specifically: {missing_cols}. Original error: {e}")

    # --- DEBUGGING ---
    print("DataFrame columns before scaling:", list(df.columns))
    if hasattr(feature_scaler, 'feature_names_in_'):
        print("Scaler expected feature names:", list(feature_scaler.feature_names_in_))
    else:
        print("Scaler does not have feature_names_in_ attribute (older scikit-learn version or not fit on DataFrame).")
        print(f"Scaler expected number of features: {feature_scaler.n_features_in_ if hasattr(feature_scaler, 'n_features_in_') else 'N/A'}")
    # --- END DEBUGGING ---

    # Scale features
    scaled_features = feature_scaler.transform(df)
    return scaled_features

def preprocess_data_batch(sequences_data: List[List[SensorDataPoint]]) -> np.ndarray:
    """
    Vectorized preprocessing for multiple sequences at once.
    More efficient than processing sequences individually.
    
    Args:
        sequences_data: List of sequences, each containing SEQUENCE_LENGTH SensorDataPoint objects
    
    Returns:
        np.ndarray: Shape (num_sequences, SEQUENCE_LENGTH, num_features)
    """
    all_dataframes = []
    
    # Convert all sequences to DataFrames in batch
    for sequence_data in sequences_data:
        df = pd.DataFrame([item.model_dump() for item in sequence_data])
        
        # Rename columns
        df.rename(columns={
            'bearing_tem': 'bearing tem',
            'env_temp': 'env temp'
        }, inplace=True)
        
        all_dataframes.append(df)
    
    # Concatenate all dataframes for vectorized operations
    combined_df = pd.concat(all_dataframes, keys=range(len(all_dataframes)))
    
    # Vectorized feature engineering
    try:
        combined_df['log_bearing tem'] = np.log(combined_df['bearing tem'] + 1e-9)
        combined_df['abs_x_direction'] = np.abs(combined_df['x_direction'])
        combined_df['log_abs_x_direction'] = np.log(combined_df['abs_x_direction'] + 1e-9)
        combined_df['abs_y_direction'] = np.abs(combined_df['y_direction'])
        combined_df['log_abs_y_direction'] = np.log(combined_df['abs_y_direction'] + 1e-9)
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Missing column during batch feature engineering: {str(e)}")
    
    # Select and order columns
    try:
        combined_df = combined_df[FINAL_FEATURE_COLS]
    except KeyError as e:
        missing_cols = list(set(FINAL_FEATURE_COLS) - set(combined_df.columns))
        raise HTTPException(status_code=400, detail=f"Missing columns after batch feature engineering: {missing_cols}")
    
    # Vectorized scaling
    scaled_features = feature_scaler.transform(combined_df)
    
    # Reshape back to (num_sequences, SEQUENCE_LENGTH, num_features)
    num_sequences = len(sequences_data)
    return scaled_features.reshape(num_sequences, SEQUENCE_LENGTH, -1)

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
        
        # Inverse transform the prediction
        # RUL scaler expects a 2D array, e.g., [[value]]
        predicted_rul = rul_scaler.inverse_transform(scaled_prediction.reshape(-1, 1))[0,0]
        
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
            
            # Vectorized inverse transform
            predicted_ruls = rul_scaler.inverse_transform(scaled_predictions.reshape(-1, 1)).flatten()
            
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
        
        # Vectorized inverse transform
        predicted_ruls = rul_scaler.inverse_transform(scaled_predictions.reshape(-1, 1)).flatten()
        
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
