const express = require('express');
require('dotenv').config(); // Load environment variables
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json()); // Middleware to parse JSON bodies
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
            return res.status(error.response.status).json({ error: error.response.data.detail || error.message });
        } else if (error.request) {
            // The request was made but no response was received
            console.error('Error request:', error.request);
            return res.status(500).json({ error: 'No response from model service.' });
        } else {
            // Something happened in setting up the request that triggered an Error
            return res.status(500).json({ error: 'Internal server error while predicting RUL.' });
        }
    }
});

// Endpoint to get all assets with their latest RUL
app.get('/assets_with_latest_rul', async (req, res) => {
    try {
        const { data, error } = await supabase.rpc('get_assets_with_latest_rul');

        if (error) {
            console.error('Supabase error fetching assets with latest RUL:', error);
            return res.status(500).json({ error: error.message });
        }

        res.json(data);
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
