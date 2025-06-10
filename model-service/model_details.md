# Model Artifacts & Details

This document outlines the essential artifacts and parameters for the CNN-LSTM model used in the Proactive Bearing Health Dashboard.

## Model File

*   **Name:** `best_cnnlstm_model_ultimate_pipeline.keras`
*   **Location:** `/model-service/app/`
*   **Type:** Keras (TensorFlow) Model

## Scalers

1.  **`feature_scaler`**:
    *   **Type:** `sklearn.preprocessing.MinMaxScaler`
    *   **Purpose:** Scales the input features to a range (typically 0-1) before feeding them to the model.
    *   **Saved File:** `feature_scaler.joblib` (or `.pkl`) - *User to provide and place in `/model-service/app/`*
    *   **Note:** This scaler must be fitted on the training data used to train the Keras model.

2.  **`rul_scaler`**:
    *   **Type:** `sklearn.preprocessing.MinMaxScaler`
    *   **Purpose:** Scales the target variable (RUL) during training. Used to inverse-transform the model's output back to the original RUL scale.
    *   **Saved File:** `rul_scaler.joblib` (or `.pkl`) - *User to provide and place in `/model-service/app/`*
    *   **Note:** This scaler must be fitted on the training RUL data.

## Model Parameters

*   **`sequence_length`**: 50
    *   **Description:** The number of time steps in each input sequence fed to the CNN-LSTM model.

*   **`feature_cols` (Final features used by the model):**
    ```python
    [
        'x_direction',
        'y_direction',
        'bearing tem',
        'env temp',
        'log_bearing tem',
        'abs_x_direction',
        'log_abs_x_direction',
        'abs_y_direction',
        'log_abs_y_direction'
    ]
    ```
    *   **Description:** The exact list of feature names, in the correct order, that the model expects after all preprocessing and feature engineering.
        *   `original_feature_cols`: `['x_direction', 'y_direction', 'bearing tem', 'env temp']`
        *   `engineered_features`: `['log_bearing tem', 'abs_x_direction', 'log_abs_x_direction', 'abs_y_direction', 'log_abs_y_direction']` (derived during preprocessing)

## Important Notes:

*   Ensure the `feature_scaler.joblib` and `rul_scaler.joblib` (or `.pkl` files) are saved from the *exact same training run* that produced the `best_cnnlstm_model_ultimate_pipeline.keras` model.
*   The order of columns in `feature_cols` is critical and must match the order of features the model was trained on.
*   The preprocessing steps in the inference service must exactly replicate the steps taken during model training (including outlier capping, feature engineering, and scaling).
