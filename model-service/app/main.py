from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, conlist
from typing import List
import numpy as np
import pandas as pd
import joblib
from tensorflow.keras.models import load_model
import os

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
