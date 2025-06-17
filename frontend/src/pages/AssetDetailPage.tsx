import React, { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useAssetById, useRulHistory, useSensorHistory } from '../lib/api';
import type { SensorHistoryRecord, AssetWithLatestRul, RulPrediction } from '../lib/types';
import RealTimeProgressChart from '../components/RealTimeProgressChart';
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Line } from 'recharts';

const AssetDetailPage: React.FC = () => {
  const { assetId } = useParams<{ assetId: string }>();
  const { data: asset, isLoading: assetLoading, error: assetError } = useAssetById(assetId) as { data: AssetWithLatestRul | undefined, isLoading: boolean, error: Error | null };
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
        <a href="/" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
          Back to Dashboard
        </a>
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

  // Transform RulPrediction[] to the structure expected by RealTimeProgressChart
  const transformedRulData = useMemo(() => {
    if (!rulHistory) return [];
    return rulHistory.map((p: RulPrediction, index: number) => ({
      sequenceNumber: index, // Or a more meaningful sequence if available
      predictedRul: p.predicted_rul,
      timestamp: p.prediction_timestamp,
    }));
  }, [rulHistory]);

  const featureChartData = sensorHistory?.flatMap((record: SensorHistoryRecord) => {
    const snapshot = record.readings;
    if (!snapshot) return [];
    return {
      timestamp: new Date(record.timestamp).toLocaleTimeString(),
      ...Object.entries(snapshot).reduce((acc, [key, value]) => {
        if (typeof value === 'object' && value !== null) {
          acc[key] = JSON.stringify(value);
        } else {
          const numValue = parseFloat(value as string);
          acc[key] = isNaN(numValue) ? null : numValue;
        }
        return acc;
      }, {} as Record<string, number | string | null>)
    };
  }) || [];
  
  const featureKeys = featureChartData.length > 0 && featureChartData[0]
    ? Object.keys(featureChartData[0]).filter(key => key !== 'timestamp')
    : [];

  // Corrected Tooltip formatter function signature for recharts
  const tooltipFormatter = (value: any, _name: any, _entry: any, _index: any): React.ReactNode => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(2);
    }
    if (value === null || value === undefined || (typeof value === 'number' && isNaN(value))) {
      return 'N/A';
    }
    return String(value);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="mb-8">
          <a href="/" className="text-blue-600 hover:text-blue-800 hover:underline mb-4 inline-block">
            &larr; Back to Dashboard
          </a>
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
                  {/* Ensure asset.latest_rul is accessed safely */}
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
                  {/* Ensure asset.latest_prediction_timestamp is accessed safely */}
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
          {transformedRulData.length > 0 ? (
            <RealTimeProgressChart data={transformedRulData} isProcessing={rulHistoryLoading} displayBatchSize={50} />
          ) : (
            !rulHistoryLoading && <p className="text-gray-500">No RUL history available.</p>
          )}
        </section>

        {/* Input Feature Trend Plots */}
        {sensorHistory && sensorHistory.length > 0 && featureKeys.length > 0 && (
          <section aria-labelledby="feature-trends-title" className="my-8">
            <h3 id="feature-trends-title" className="text-xl font-semibold text-gray-800 mb-4">Input Feature Trends (Individual)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {featureKeys.slice(0, 6).map(featureKey => ( 
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
                                timestamp: new Date(s.timestamp).toLocaleDateString(),
                                value: val,
                            };
                        })}
                        margin={{ top: 5, right: 20, left: -20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="timestamp" />
                      <YAxis />
                      <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #ccc' }} itemStyle={{ color: '#333' }} formatter={tooltipFormatter} />
                      <Legend />
                      <Line type="monotone" dataKey="value" stroke="#8884d8" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 5 }} connectNulls={true} name={featureKey} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default AssetDetailPage;
