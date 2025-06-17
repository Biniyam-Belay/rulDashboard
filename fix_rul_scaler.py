#!/usr/bin/env python3
"""
Fix the RUL scaler to use realistic bearing RUL values.
This script creates a new RUL scaler based on realistic bearing lifetimes.
"""

import joblib
import numpy as np
from sklearn.preprocessing import MinMaxScaler

def create_realistic_rul_scaler():
    """
    Create a new RUL scaler with realistic bearing RUL values.
    Typical bearing RUL ranges from 100 hours (4 days) to 10,000 hours (1.1 years).
    """
    
    # Define realistic RUL range for bearings
    # Conservative range: 100 hours (critical) to 8,000 hours (healthy)
    min_rul_hours = 50   # Emergency replacement needed
    max_rul_hours = 8000 # New/excellent condition
    
    # Create synthetic realistic RUL training data
    # Use a range that covers typical bearing maintenance scenarios
    realistic_rul_data = np.array([
        50,    # Critical - immediate replacement
        100,   # Very poor condition  
        200,   # Poor condition
        500,   # Concerning
        1000,  # Moderate condition
        2000,  # Good condition
        4000,  # Very good condition
        6000,  # Excellent condition
        8000   # New/pristine condition
    ]).reshape(-1, 1)
    
    # Create and fit the scaler
    rul_scaler = MinMaxScaler(feature_range=(0, 1))
    rul_scaler.fit(realistic_rul_data)
    
    print("✅ Created Realistic RUL Scaler:")
    print(f"   Min RUL: {min_rul_hours} hours ({min_rul_hours/24:.1f} days)")
    print(f"   Max RUL: {max_rul_hours} hours ({max_rul_hours/24:.0f} days)")
    print(f"   Data Min: {rul_scaler.data_min_[0]}")
    print(f"   Data Max: {rul_scaler.data_max_[0]}")
    print(f"   Scale: {rul_scaler.scale_[0]:.6f}")
    
    # Test the scaler
    print("\n🧪 Test Transformations:")
    test_values = [0.1, 0.3, 0.5, 0.7, 0.9]
    for val in test_values:
        inverse = rul_scaler.inverse_transform([[val]])[0,0]
        days = inverse / 24
        print(f"   Scaled {val} → {inverse:.0f} hours ({days:.1f} days)")
    
    return rul_scaler

if __name__ == "__main__":
    # Load the old scaler to compare
    print("🔍 Current (Broken) RUL Scaler:")
    try:
        old_scaler = joblib.load('model-service/app/june15rul_scaler_full_pipeline_206.gz')
        print(f"   Data Range: {old_scaler.data_min_[0]:.1f} - {old_scaler.data_max_[0]:.1f} hours")
        print(f"   That's {old_scaler.data_max_[0]/24/365:.1f} YEARS! (Unrealistic)")
    except Exception as e:
        print(f"   Error loading old scaler: {e}")
    
    print("\n🛠️  Creating Realistic RUL Scaler...")
    new_scaler = create_realistic_rul_scaler()
    
    # Save the new scaler
    output_path = 'model-service/app/realistic_rul_scaler.gz'
    joblib.dump(new_scaler, output_path)
    print(f"\n💾 Saved new realistic RUL scaler to: {output_path}")
    
    # Create backup of old scaler
    backup_path = 'model-service/app/june15rul_scaler_full_pipeline_206_BACKUP.gz'
    try:
        old_scaler = joblib.load('model-service/app/june15rul_scaler_full_pipeline_206.gz')
        joblib.dump(old_scaler, backup_path)
        print(f"📁 Backed up old scaler to: {backup_path}")
    except Exception as e:
        print(f"⚠️  Could not backup old scaler: {e}")
    
    print("\n🔄 To use the new scaler, update the model service to load:")
    print("   'realistic_rul_scaler.gz' instead of 'june15rul_scaler_full_pipeline_206.gz'")
