const express = require('express');
require('dotenv').config(); // Load environment variables
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json({ limit: '50mb' })); // Increased limit for bulk processing
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());
const port = 3001;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Asset Management Endpoints

// Create a new asset
app.post('/assets', async (req, res) => {
  const { name, asset_type, description, location, purchase_date, initial_cost, operational_status } = req.body;
  const { data, error } = await supabase
    .from('assets')
    .insert([{ name, asset_type, description, location, purchase_date, initial_cost, operational_status }])
    .select();

  if (error) {
    console.error('Error creating asset:', error);
    return res.status(400).json({ error: error.message });
  }
  res.status(201).json(data[0]);
});

// Get all assets
app.get('/assets', async (req, res) => {
  const { data, error } = await supabase
    .from('assets')
    .select('*');

  if (error) {
    console.error('Error fetching assets:', error);
    return res.status(400).json({ error: error.message });
  }
  res.status(200).json(data);
});

// Get a specific asset by ID
app.get('/assets/:id', async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error(`Error fetching asset ${id}:`, error);
    return res.status(400).json({ error: error.message });
  }
  if (!data) {
    return res.status(404).json({ error: 'Asset not found' });
  }
  res.status(200).json(data);
});

// Update an asset by ID
app.put('/assets/:id', async (req, res) => {
  const { id } = req.params;
  const { name, asset_type, description, location, purchase_date, initial_cost, operational_status } = req.body;

  // Construct object with only provided fields for update
  const updateFields = {};
  if (name !== undefined) updateFields.name = name;
  if (asset_type !== undefined) updateFields.asset_type = asset_type;
  if (description !== undefined) updateFields.description = description;
  if (location !== undefined) updateFields.location = location;
  if (purchase_date !== undefined) updateFields.purchase_date = purchase_date;
  if (initial_cost !== undefined) updateFields.initial_cost = initial_cost;
  if (operational_status !== undefined) updateFields.operational_status = operational_status;

  if (Object.keys(updateFields).length === 0) {
    return res.status(400).json({ error: 'No fields to update provided.' });
  }

  const { data, error } = await supabase
    .from('assets')
    .update(updateFields)
    .eq('id', id)
    .select();

  if (error) {
    console.error(`Error updating asset ${id}:`, error);
    return res.status(400).json({ error: error.message });
  }
  if (!data || data.length === 0) {
    return res.status(404).json({ error: 'Asset not found or no changes made' });
  }
  res.status(200).json(data[0]);
});

// Delete an asset by ID
app.delete('/assets/:id', async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase // data here will be null for a successful delete, or an empty array if not found
    .from('assets')
    .delete()
    .eq('id', id)
    .select(); // .select() is added to check if the row existed

  if (error) {
    console.error(`Error deleting asset ${id}:`, error);
    return res.status(400).json({ error: error.message });
  }

  // Supabase delete doesn't error if the row doesn't exist, it just returns an empty data array.
  // We need to check if anything was actually deleted.
  // If the select() call returns data, it means the item existed before deletion.
  // However, the actual response from a delete operation is often just a status code.
  // For a more robust check, one might query before deleting, or rely on the fact that no error means it's gone or was never there.
  // For simplicity, we'll assume no error means success.
  // A more accurate check would be to see if `data` (from select) had an item.
  // However, the `data` returned by Supabase on delete is the deleted records. If nothing is found, it's an empty array.
  // So, if data is null or data.length is 0 after a delete attempt without error, it means the asset was not found.

  // Let's refine the check for "not found"
  // The .select() after .delete() returns the records that were deleted.
  // If `data` is an empty array and no error, it means no record matched the ID.
  if (data && data.length === 0) {
     return res.status(404).json({ error: 'Asset not found' });
  }

  res.status(204).send(); // 204 No Content for successful deletion
});

// Endpoint to trigger RUL prediction and store results
app.post('/assets/:id/predict_rul', async (req, res) => {
    const { id } = req.params;
    const { sensor_data } = req.body; // Expecting an array of 50 sensor data points

    if (!sensor_data || !Array.isArray(sensor_data) || sensor_data.length !== 50) {
        return res.status(400).json({ error: 'Invalid sensor_data: Must be an array of 50 records.' });
    }

    try {
        // 1. Call the Model Service's /predict endpoint
        const modelServiceUrl = process.env.MODEL_SERVICE_URL || 'http://localhost:8001';
        
        // Enhanced logging - log first and last items
        console.log('Sending to model service - first item:', JSON.stringify(sensor_data[0]));
        console.log('Sending to model service - last item:', JSON.stringify(sensor_data[sensor_data.length - 1]));
        console.log('Number of items in sensor_data:', sensor_data.length);
        
        // Check all required fields in each item
        const missingFields = [];
        sensor_data.forEach((item, index) => {
            const requiredFields = ['x_direction', 'y_direction', 'bearing_tem', 'env_temp'];
            const missing = requiredFields.filter(field => item[field] === undefined);
            if (missing.length > 0) {
                missingFields.push({ index, missing });
            }
        });
        
        if (missingFields.length > 0) {
            console.error('Missing required fields in some items:', missingFields);
        }
        
        console.log('Calling model service at:', `${modelServiceUrl}/predict`);
        const response = await axios.post(`${modelServiceUrl}/predict`, sensor_data); // Send the array directly
        const predicted_rul = response.data.predicted_rul;

        // 2. Store the predicted RUL and the input sensor data snapshot in Supabase
        const { data: predictionData, error: predictionError } = await supabase
            .from('rul_predictions')
            .insert([
                { 
                    asset_id: id, 
                    predicted_rul: predicted_rul, 
                    prediction_timestamp: new Date(),
                    input_features_snapshot: sensor_data // Store the sensor data
                }
            ])
            .select()
            .single(); // Expecting a single record back

        if (predictionError) {
            console.error('Supabase error storing RUL prediction:', predictionError);
            return res.status(500).json({ error: predictionError.message });
        }

        // 3. Generate alerts based on the new RUL
        let alertToInsert = null;
        if (predicted_rul < 20000) {
            alertToInsert = {
                asset_id: id,
                severity: 'critical',
                message: `Asset RUL is critically low: ${predicted_rul}.`,
                rul_at_alert: predicted_rul,
                triggering_condition: 'RUL_THRESHOLD_CRITICAL'
            };
        } else if (predicted_rul < 60000) {
            alertToInsert = {
                asset_id: id,
                severity: 'warning',
                message: `Asset RUL is low: ${predicted_rul}.`,
                rul_at_alert: predicted_rul,
                triggering_condition: 'RUL_THRESHOLD_WARNING'
            };
        }

        if (alertToInsert) {
            const { error: alertError } = await supabase
                .from('alerts')
                .insert([alertToInsert]);
            
            if (alertError) {
                // Log the error but don't fail the entire operation,
                // as the RUL prediction itself was successful.
                console.error('Supabase error creating alert:', alertError);
            }
        }

        res.status(201).json({ message: 'RUL prediction successful and stored.', data: predictionData });

    } catch (error) {
        console.error('Error in /predict_rul endpoint:', error.message);
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            console.error('Error data:', error.response.data);
            console.error('Error status:', error.response.status);
            console.error('Error headers:', error.response.headers);
            
            // More detailed error message
            let detailedError = error.message;
            if (error.response.data) {
                if (typeof error.response.data === 'object') {
                    detailedError = JSON.stringify(error.response.data);
                } else if (typeof error.response.data === 'string') {
                    detailedError = error.response.data;
                } else if (error.response.data.detail) {
                    detailedError = error.response.data.detail;
                }
            }
            
            return res.status(error.response.status).json({ error: detailedError });
        } else if (error.request) {
            // The request was made but no response was received
            console.error('Error request:', error.request);
            return res.status(500).json({ error: 'No response from model service. Check if the model service is running.' });
        } else {
            // Something happened in setting up the request that triggered an Error
            console.error('Error details:', error);
            return res.status(500).json({ error: `Internal server error while predicting RUL: ${error.message}` });
        }
    }
});

// Bulk prediction endpoint for processing multiple sequences at once
app.post('/assets/:id/predict_rul_bulk', async (req, res) => {
    const { id } = req.params;
    const { sequences } = req.body; // Expecting an array of sequences, each containing 50 sensor data points

    if (!sequences || !Array.isArray(sequences) || sequences.length === 0) {
        return res.status(400).json({ error: 'Invalid sequences: Must be a non-empty array of sequences.' });
    }

    // Validate each sequence
    for (let i = 0; i < sequences.length; i++) {
        const sequence = sequences[i];
        if (!Array.isArray(sequence) || sequence.length !== 50) {
            return res.status(400).json({ 
                error: `Invalid sequence at index ${i}: Must be an array of exactly 50 sensor data points.` 
            });
        }
    }

    try {
        const modelServiceUrl = process.env.MODEL_SERVICE_URL || 'http://localhost:8001';
        
        console.log(`Processing bulk prediction for asset ${id} with ${sequences.length} sequences`);
        
        // Call the Model Service's bulk predict endpoint
        const response = await axios.post(`${modelServiceUrl}/predict_bulk`, {
            sequences: sequences
        });
        
        const { predictions, total_processed, failed_count, processing_time_seconds } = response.data;
        
        // Prepare bulk insert data for Supabase
        const predictionInserts = [];
        const alertInserts = [];
        
        for (let i = 0; i < predictions.length; i++) {
            const prediction = predictions[i];
            const predicted_rul = prediction.predicted_rul;
            
            // Skip failed predictions (marked as -1)
            if (predicted_rul < 0) {
                continue;
            }
            
            predictionInserts.push({
                asset_id: id,
                predicted_rul: predicted_rul,
                prediction_timestamp: new Date(),
                input_features_snapshot: sequences[i]
            });
            
            // Generate alerts for low RUL values
            if (predicted_rul < 20000) {
                alertInserts.push({
                    asset_id: id,
                    severity: 'critical',
                    message: `Asset RUL is critically low: ${predicted_rul}.`,
                    rul_at_alert: predicted_rul,
                    triggering_condition: 'RUL_THRESHOLD_CRITICAL'
                });
            } else if (predicted_rul < 60000) {
                alertInserts.push({
                    asset_id: id,
                    severity: 'warning',
                    message: `Asset RUL is low: ${predicted_rul}.`,
                    rul_at_alert: predicted_rul,
                    triggering_condition: 'RUL_THRESHOLD_WARNING'
                });
            }
        }
        
        // Bulk database operations
        let predictionData = [];
        if (predictionInserts.length > 0) {
            const { data, error: predictionError } = await supabase
                .from('rul_predictions')
                .insert(predictionInserts)
                .select();
                
            if (predictionError) {
                console.error('Supabase error storing bulk RUL predictions:', predictionError);
                return res.status(500).json({ error: predictionError.message });
            }
            predictionData = data;
        }
        
        // Bulk insert alerts if any
        if (alertInserts.length > 0) {
            const { error: alertError } = await supabase
                .from('alerts')
                .insert(alertInserts);
                
            if (alertError) {
                console.error('Supabase error creating bulk alerts:', alertError);
                // Don't fail the entire operation for alert errors
            }
        }
        
        res.status(201).json({ 
            message: 'Bulk RUL prediction successful and stored.',
            data: {
                predictions: predictions,
                total_processed: total_processed,
                failed_count: failed_count,
                processing_time_seconds: processing_time_seconds,
                stored_predictions: predictionData.length,
                generated_alerts: alertInserts.length
            }
        });

    } catch (error) {
        console.error('Error in bulk /predict_rul endpoint:', error.message);
        if (error.response) {
            console.error('Error data:', error.response.data);
            console.error('Error status:', error.response.status);
            
            let detailedError = error.message;
            if (error.response.data) {
                if (typeof error.response.data === 'object') {
                    detailedError = JSON.stringify(error.response.data);
                } else if (typeof error.response.data === 'string') {
                    detailedError = error.response.data;
                } else if (error.response.data.detail) {
                    detailedError = error.response.data.detail;
                }
            }
            
            return res.status(error.response.status).json({ error: detailedError });
        } else if (error.request) {
            console.error('Error request:', error.request);
            return res.status(500).json({ error: 'No response from model service. Check if the model service is running.' });
        } else {
            console.error('Error details:', error);
            return res.status(500).json({ error: `Internal server error while predicting RUL: ${error.message}` });
        }
    }
});

// Ultra-fast bulk prediction endpoint for maximum throughput
app.post('/assets/:id/predict_rul_bulk_fast', async (req, res) => {
    const { id } = req.params;
    const { sequences } = req.body;

    if (!sequences || !Array.isArray(sequences) || sequences.length === 0) {
        return res.status(400).json({ error: 'Invalid sequences: Must be a non-empty array of sequences.' });
    }

    // Basic validation - skip detailed per-sequence validation for speed
    if (sequences.some(seq => !Array.isArray(seq) || seq.length !== 50)) {
        return res.status(400).json({ error: 'One or more sequences have incorrect length (expected 50 sensor data points).' });
    }

    try {
        const modelServiceUrl = process.env.MODEL_SERVICE_URL || 'http://localhost:8001';
        
        console.log(`Ultra-fast processing for asset ${id} with ${sequences.length} sequences`);
        
        // Call the fast bulk predict endpoint
        const response = await axios.post(`${modelServiceUrl}/predict_bulk_fast`, {
            sequences: sequences
        });
        
        const { predictions, total_processed, failed_count, processing_time_seconds } = response.data;
        
        console.log(`Fast bulk processing completed: ${total_processed} sequences in ${processing_time_seconds.toFixed(3)}s (${(total_processed/processing_time_seconds).toFixed(1)} seq/s)`);

        // Prepare bulk insert data for Supabase (optimized)
        const predictionInserts = predictions.map((prediction, index) => ({
            asset_id: id,
            predicted_rul: prediction.predicted_rul,
            prediction_timestamp: new Date(),
            input_features_snapshot: sequences[index]
        })).filter(p => p.predicted_rul > 0); // Filter out failed predictions

        // Generate alerts for low RUL values (vectorized)
        const alertInserts = predictionInserts
            .filter(p => p.predicted_rul < 60000)
            .map(p => ({
                asset_id: id,
                severity: p.predicted_rul < 20000 ? 'critical' : 'warning',
                message: `Asset RUL is ${p.predicted_rul < 20000 ? 'critically' : ''} low: ${p.predicted_rul}.`,
                rul_at_alert: p.predicted_rul,
                triggering_condition: p.predicted_rul < 20000 ? 'RUL_THRESHOLD_CRITICAL' : 'RUL_THRESHOLD_WARNING'
            }));
        
        // Bulk database operations
        let predictionData = [];
        if (predictionInserts.length > 0) {
            const { data, error: predictionError } = await supabase
                .from('rul_predictions')
                .insert(predictionInserts)
                .select();
                
            if (predictionError) {
                console.error('Supabase error storing fast bulk predictions:', predictionError);
                return res.status(500).json({ error: predictionError.message });
            }
            predictionData = data;
        }
        
        // Bulk insert alerts
        if (alertInserts.length > 0) {
            const { error: alertError } = await supabase
                .from('alerts')
                .insert(alertInserts);
                
            if (alertError) {
                console.error('Supabase error creating fast bulk alerts:', alertError);
            }
        }
        
        res.status(201).json({ 
            message: 'Ultra-fast bulk RUL prediction completed.',
            data: {
                predictions: predictions,
                total_processed: total_processed,
                failed_count: failed_count,
                processing_time_seconds: processing_time_seconds,
                throughput_sequences_per_second: (total_processed / processing_time_seconds).toFixed(1),
                stored_predictions: predictionData.length,
                generated_alerts: alertInserts.length
            }
        });

    } catch (error) {
        console.error('Error in fast bulk predict endpoint:', error.message);
        if (error.response) {
            let detailedError = error.message;
            if (error.response.data && error.response.data.detail) {
                detailedError = error.response.data.detail;
            }
            return res.status(error.response.status).json({ error: detailedError });
        }
        return res.status(500).json({ error: `Fast bulk prediction failed: ${error.message}` });
    }
});

// Endpoint to get all assets with their latest RUL
app.get('/assets_with_latest_rul', async (req, res) => {
    try {
        // First, get all assets
        const { data: assets, error: assetsError } = await supabase
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
            .order('created_at', { ascending: false });

        if (assetsError) {
            console.error('Error fetching assets:', assetsError);
            return res.status(500).json({ error: 'Failed to fetch assets' });
        }

        if (!assets || assets.length === 0) {
            return res.json([]);
        }

        const assetIds = assets.map(asset => asset.id);

        // Get the latest RUL prediction for each asset by querying the new view
        // Ensure the view 'latest_asset_ruls' exists in your Supabase database
        // CREATE OR REPLACE VIEW latest_asset_ruls AS
        // SELECT DISTINCT ON (asset_id)
        //     asset_id,
        //     predicted_rul AS latest_rul,
        //     prediction_timestamp AS latest_rul_timestamp
        // FROM
        //     rul_predictions
        // ORDER BY
        //     asset_id, prediction_timestamp DESC;
        const { data: latestRulsData, error: rulsError } = await supabase
            .from('latest_asset_ruls') // Query the 'latest_asset_ruls' view
            .select('asset_id, latest_rul, latest_rul_timestamp')
            .in('asset_id', assetIds);

        if (rulsError) {
            console.error('Error fetching RUL predictions from view latest_asset_ruls:', rulsError);
            // Fallback or error response: Return assets without RUL data
            const assetsWithoutRul = assets.map(asset => ({
                ...asset,
                latest_rul: null,
                latest_rul_timestamp: null,
            }));
            return res.json(assetsWithoutRul);
        }

        const latestRulMap = new Map();
        if (latestRulsData) {
            for (const r of latestRulsData) {
                latestRulMap.set(r.asset_id, {
                    rul: r.latest_rul,
                    timestamp: r.latest_rul_timestamp,
                });
            }
        }

        const assetsWithLatestRul = assets.map(asset => {
            const latestRulEntry = latestRulMap.get(asset.id);
            return {
                ...asset,
                latest_rul: latestRulEntry?.rul ?? null,
                latest_rul_timestamp: latestRulEntry?.timestamp ?? null,
            };
        });

        res.json(assetsWithLatestRul);
    } catch (error) {
        console.error('Error in /assets_with_latest_rul endpoint:', error.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Endpoint to get historical RUL trend for a specific asset
app.get('/assets/:id/rul_history', async (req, res) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase
            .from('rul_predictions')
            .select('prediction_timestamp, predicted_rul')
            .eq('asset_id', id)
            .order('prediction_timestamp', { ascending: true });

        if (error) {
            console.error('Supabase error fetching RUL history:', error);
            return res.status(500).json({ error: error.message });
        }

        res.json(data);
    } catch (error) {
        console.error('Error in /assets/:id/rul_history endpoint:', error.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Endpoint to get historical input feature trends for a specific asset
app.get('/assets/:id/sensor_history', async (req, res) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase
            .from('rul_predictions')
            .select('prediction_timestamp, input_features_snapshot')
            .eq('asset_id', id)
            .order('prediction_timestamp', { ascending: true });

        if (error) {
            console.error('Supabase error fetching sensor history:', error);
            return res.status(500).json({ error: error.message });
        }

        res.json(data);
    } catch (error) {
        console.error('Error in /assets/:id/sensor_history endpoint:', error.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Alert Endpoints

// Get all alerts (optionally filter by asset_id, acknowledged status)
app.get('/alerts', async (req, res) => {
    const { asset_id, acknowledged } = req.query;
    let query = supabase.from('alerts').select(`
        *,
        assets (
            name,
            asset_type,
            location
        )
    `);

    if (asset_id) {
        query = query.eq('asset_id', asset_id);
    }
    if (acknowledged !== undefined) {
        query = query.eq('acknowledged', acknowledged === 'true');
    }
    query = query.order('timestamp', { ascending: false });


    const { data, error } = await query;

    if (error) {
        console.error('Error fetching alerts:', error);
        return res.status(500).json({ error: error.message });
    }
    res.status(200).json(data);
});

// Acknowledge an alert
app.put('/alerts/:id/acknowledge', async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase
        .from('alerts')
        .update({ acknowledged: true, acknowledged_at: new Date() })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error(`Error acknowledging alert ${id}:`, error);
        return res.status(400).json({ error: error.message });
    }
    if (!data) {
        return res.status(404).json({ error: 'Alert not found' });
    }
    res.status(200).json(data);
});


app.listen(port, () => {
  console.log(`Main API listening at http://localhost:${port}`);
});
