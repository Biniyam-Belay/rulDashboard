import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAssetById, useRulHistory, useSensorHistory } from '../lib/api';
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Line } from 'recharts';
import type { RulPrediction, SensorHistoryRecord } from '../lib/types';
import { motion } from 'framer-motion';
import FeatureImportanceDisplay from '../components/FeatureImportanceDisplay';

const AssetDetailPage: React.FC = () => {
  const { assetId } = useParams<{ assetId: string }>();
  const { data: asset, isLoading: assetLoading, error: assetError } = useAssetById(assetId);
  const { data: rulHistory, isLoading: rulHistoryLoading, error: rulHistoryError } = useRulHistory(assetId);
  const { data: sensorHistory, isLoading: sensorHistoryLoading, error: sensorHistoryError } = useSensorHistory(assetId);

  if (assetLoading || rulHistoryLoading || sensorHistoryLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="p-8 text-gray-600 text-lg">Loading asset details...</div>
      </div>
    );
  }

  if (assetError || !asset) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
        <div className="text-red-600 text-xl mb-4">Error loading asset data: {assetError?.message || 'Asset not found'}</div>
        <Link to="/" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const getStatusColor = (status: string | undefined | null): string => {
    if (!status) return 'text-gray-500';
    switch (status.toLowerCase()) {
      case 'operational':
        return 'text-green-600';
      case 'maintenance':
        return 'text-yellow-600';
      case 'offline':
        return 'text-red-600';
      default:
        return 'text-gray-500';
    }
  };

  const rulChartData = rulHistory?.map((p: RulPrediction) => {
    const rulValue = typeof p.predicted_rul === 'number' && !isNaN(p.predicted_rul) ? p.predicted_rul : null;
    return {
      timestamp: new Date(p.prediction_timestamp).toLocaleDateString(),
      RUL: rulValue,
    };
  }).sort((a: { timestamp: string; RUL: number | null }, b: { timestamp: string; RUL: number | null }) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) || [];

  const latestSensorReadings = sensorHistory && sensorHistory.length > 0
    ? sensorHistory[sensorHistory.length - 1].readings // Access .readings
    : null;

  const featureChartData = sensorHistory?.flatMap((record: SensorHistoryRecord) => {
    // Ensure readings is treated as a single object, not an array of objects
    const snapshot = record.readings; // Use record.readings directly
    if (!snapshot) return []; // Skip if no readings for this record

    return { // Return a single object for this record's snapshot
      timestamp: new Date(record.timestamp).toLocaleTimeString(), // Use record.timestamp
      ...Object.entries(snapshot).reduce((acc, [key, value]) => {
        if (typeof value === 'object' && value !== null) {
          // Stringify objects to prevent React child error in Tooltip
          acc[key] = JSON.stringify(value); 
        } else {
          const numValue = parseFloat(value as string);
          // For plotting, ensure it's a number or null. Other strings become null.
          acc[key] = isNaN(numValue) ? null : numValue;
        }
        return acc;
      }, {} as Record<string, number | string | null>)
    };
  }) || [];
  
  const featureKeys = featureChartData.length > 0 && featureChartData[0]
    ? Object.keys(featureChartData[0]).filter(key => key !== 'timestamp')
    : [];

  // Tooltip formatter function
  const tooltipFormatter = (value: string | number | null | undefined): React.ReactNode => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(2); // Adjust precision as needed
    }
    if (value === null || value === undefined || (typeof value === 'number' && isNaN(value))) {
      return 'N/A';
    }
    return String(value); // Fallback for other types, including stringified objects
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen bg-gray-50 py-8"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="mb-8">
          <Link to="/" className="text-blue-600 hover:text-blue-800 hover:underline mb-4 inline-block">
            &larr; Back to Dashboard
          </Link>
          <div className="bg-white shadow-md rounded-lg p-6">
            <div className="md:flex md:items-center md:justify-between">
              <div className="flex-1 min-w-0">
                <h1 className="text-3xl font-bold leading-tight text-gray-900 truncate">{asset.name}</h1>
                <p className="mt-1 text-sm text-gray-500">
                  ID: {asset.id} &bull; Type: {asset.asset_type} &bull; Location: {asset.location}
                </p>
              </div>
              <div className="mt-4 flex md:mt-0 md:ml-4">
                <span className={`px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full ${getStatusColor(asset.operational_status)} bg-opacity-20 ${getStatusColor(asset.operational_status).replace('text-', 'bg-')}`}>
                  {asset.operational_status || 'Unknown'}
                </span>
              </div>
            </div>
            <div className="mt-4 border-t border-gray-200 pt-4">
              <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
                <div className="sm:col-span-1">
                  <dt className="text-sm font-medium text-gray-500">Current Predicted RUL</dt>
                  <dd className="mt-1 text-2xl font-semibold text-blue-600">{asset.latest_rul?.toFixed(0) ?? 'N/A'} cycles</dd>
                </div>
                <div className="sm:col-span-1">
                  <dt className="text-sm font-medium text-gray-500">Serial Number</dt>
                  <dd className="mt-1 text-sm text-gray-900">{asset.serial_number || 'N/A'}</dd>
                </div>
                <div className="sm:col-span-1">
                  <dt className="text-sm font-medium text-gray-500">Installation Date</dt>
                  <dd className="mt-1 text-sm text-gray-900">{asset.installation_date ? new Date(asset.installation_date).toLocaleDateString() : 'N/A'}</dd>
                </div>
                <div className="sm:col-span-1">
                  <dt className="text-sm font-medium text-gray-500">Manufacturer</dt>
                  <dd className="mt-1 text-sm text-gray-900">{asset.manufacturer || 'N/A'}</dd>
                </div>
                <div className="sm:col-span-1">
                  <dt className="text-sm font-medium text-gray-500">Model</dt>
                  <dd className="mt-1 text-sm text-gray-900">{asset.model_number || 'N/A'}</dd>
                </div>
                 <div className="sm:col-span-1">
                  <dt className="text-sm font-medium text-gray-500">Last Prediction</dt>
                  <dd className="mt-1 text-sm text-gray-900">{asset.latest_prediction_timestamp ? new Date(asset.latest_prediction_timestamp).toLocaleString() : 'N/A'}</dd>
                </div>
              </dl>
            </div>
          </div>
        </header>

        {/* RUL Trend Plot */}
        <section aria-labelledby="rul-trend-title" className="my-8 bg-white shadow-md rounded-lg p-6">
          <h3 id="rul-trend-title" className="text-xl font-semibold text-gray-800 mb-4">RUL Trend</h3>
          {rulHistoryError && <p className="text-red-500">Error loading RUL history: {rulHistoryError.message}</p>}
          {rulHistory && rulHistory.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={rulChartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="timestamp" />
                <YAxis label={{ value: 'RUL (cycles)', angle: -90, position: 'insideLeft' }} />
                <Tooltip formatter={tooltipFormatter} />
                <Legend />
                <Line type="monotone" dataKey="RUL" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} connectNulls={true} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            !rulHistoryLoading && <p className="text-gray-500">No RUL history available.</p>
          )}
        </section>

        {/* Input Feature Trend Plots */}
        {sensorHistory && sensorHistory.length > 0 && featureKeys.length > 0 && (
          <section aria-labelledby="feature-trends-title" className="my-8">
            <h3 id="feature-trends-title" className="text-xl font-semibold text-gray-800 mb-4">Input Feature Trends (Individual)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {featureKeys.slice(0, 6).map(featureKey => ( // Show up to 6 individual plots
                <div key={featureKey} className="bg-white shadow-md rounded-lg p-6">
                  <h4 className="text-md font-semibold text-gray-700 mb-3">{featureKey}</h4>
                  {sensorHistoryError && <p className="text-red-500">Error loading sensor history: {sensorHistoryError.message}</p>}
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart 
                        data={sensorHistory.map((s: SensorHistoryRecord) => {
                            let val = null;
                            if (s.readings && typeof s.readings === 'object' && s.readings[featureKey] !== undefined) {
                                const numericVal = Number(s.readings[featureKey]);
                                if (!isNaN(numericVal)) {
                                    val = numericVal;
                                }
                            }
                            return {
                                timestamp: new Date(s.timestamp).toLocaleDateString(), // Consistent date formatting
                                value: val,
                            };
                        })}
                        margin={{ top: 5, right: 20, left: -20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="timestamp" />
                      <YAxis />
                      <Tooltip formatter={tooltipFormatter} />
                      <Line type="monotone" dataKey="value" stroke={`#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`} strokeWidth={2} dot={false} name={featureKey} connectNulls={true} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
            {featureKeys.length > 6 && <p className="mt-4 text-sm text-gray-600">Displaying trends for the first 6 features. See combined chart below for all features.</p>}
          </section>
        )}
        
        {(!sensorHistory || sensorHistory.length === 0) && !sensorHistoryLoading && !sensorHistoryError && (
            <section className="my-8 bg-white shadow-md rounded-lg p-6">
                 <h3 className="text-xl font-semibold text-gray-800 mb-4">Input Feature Trends</h3>
                <p className="text-gray-500">No sensor history available to display feature trends.</p>
            </section>
        )}

        {/* Feature Importance Display */}
        <section aria-labelledby="feature-importance-title" className="my-8">
          <FeatureImportanceDisplay assetId={assetId} />
        </section>

      </div>
    </motion.div>
  );
};

export default AssetDetailPage;
