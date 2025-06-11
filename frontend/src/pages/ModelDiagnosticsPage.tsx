import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts';
import {
  useModelPerformanceHistory,
  useActualVsPredictedRul,
  useDataDriftReport,
} from '../lib/api';

// Helper to format tooltip values, similar to AssetDetailPage
const tooltipFormatter = (value: string | number | null | undefined, name: string) => {
  if (value === null || value === undefined || (typeof value === 'number' && isNaN(value))) {
    return ['N/A', name];
  }
  if (typeof value === 'number') {
    return [value.toFixed(3), name];
  }
  return [String(value), name];
};

const ModelDiagnosticsPage: React.FC = () => {
  const { data: performanceHistory, isLoading: isLoadingPerformance, error: errorPerformance } = useModelPerformanceHistory();
  const { data: actualVsPredicted, isLoading: isLoadingAvP, error: errorAvP } = useActualVsPredictedRul();
  const { data: dataDrift, isLoading: isLoadingDrift, error: errorDrift } = useDataDriftReport();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8"
    >
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-800">Model Performance & Diagnostics</h1>
          <Link to="/" className="text-blue-600 hover:text-blue-800 transition-colors">
            &larr; Back to Dashboard
          </Link>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Historical Performance Metrics Section */}
          <div className="bg-white shadow-md rounded-lg p-6">
            <h3 className="text-xl font-semibold text-gray-700 mb-4">Historical Performance Metrics</h3>
            {isLoadingPerformance && <p className="text-gray-500">Loading performance metrics...</p>}
            {errorPerformance && <p className="text-red-500">Error loading performance metrics: {errorPerformance.message}</p>}
            {performanceHistory && performanceHistory.length > 0 && (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={performanceHistory}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="timestamp" tickFormatter={(ts) => new Date(ts).toLocaleDateString()} />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip formatter={tooltipFormatter} />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="rSquared" name="R²" stroke="#8884d8" activeDot={{ r: 8 }} />
                  <Line yAxisId="right" type="monotone" dataKey="mae" name="MAE" stroke="#82ca9d" />
                  <Line yAxisId="right" type="monotone" dataKey="rmse" name="RMSE" stroke="#ffc658" />
                </LineChart>
              </ResponsiveContainer>
            )}
            {performanceHistory && performanceHistory.length === 0 && (
              <p className="text-gray-500">No performance history data available.</p>
            )}
          </div>

          {/* Actual vs. Predicted RUL Section */}
          <div className="bg-white shadow-md rounded-lg p-6">
            <h3 className="text-xl font-semibold text-gray-700 mb-4">Actual vs. Predicted RUL (Past Failures)</h3>
            {isLoadingAvP && <p className="text-gray-500">Loading RUL comparison...</p>}
            {errorAvP && <p className="text-red-500">Error loading RUL comparison: {errorAvP.message}</p>}
            {actualVsPredicted && actualVsPredicted.length > 0 && (
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid />
                  <XAxis type="number" dataKey="actualRul" name="Actual RUL" unit=" cycles" />
                  <YAxis type="number" dataKey="predictedRul" name="Predicted RUL" unit=" cycles" />
                  <ZAxis range={[100, 100]} /> {/* Fixed size for scatter points */}
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={tooltipFormatter} />
                  <Legend />
                  <Scatter name="RUL Comparison" data={actualVsPredicted} fill="#8884d8" />
                </ScatterChart>
              </ResponsiveContainer>
            )}
            {actualVsPredicted && actualVsPredicted.length === 0 && (
                <p className="text-gray-500">No actual vs. predicted RUL data available.</p>
            )}
          </div>
        </div>

        {/* Data Drift Monitoring Section */}
        <div className="bg-white shadow-md rounded-lg p-6">
          <h3 className="text-xl font-semibold text-gray-700 mb-4">Data Drift Monitoring</h3>
          {isLoadingDrift && <p className="text-gray-500">Loading data drift report...</p>}
          {errorDrift && <p className="text-red-500">Error loading data drift report: {errorDrift.message}</p>}
          {dataDrift && (
            <>
              <p className="text-gray-600 mb-2">Overall Drift Score: <span className="font-semibold">{dataDrift.overallDriftScore.toFixed(4)}</span></p>
              <p className="text-gray-600 mb-4">Number of Drifting Features: <span className="font-semibold">{dataDrift.numberOfDriftingFeatures}</span></p>
              
              <h4 className="text-lg font-semibold text-gray-700 mt-4 mb-2">Feature Drift Details:</h4>
              {dataDrift.featureMetrics && dataDrift.featureMetrics.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Feature</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Drift Score</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Has Drifted</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {dataDrift.featureMetrics.map((metric) => (
                        <tr key={metric.featureName}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{metric.featureName}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{metric.driftScore.toFixed(4)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{metric.hasDrifted ? 'Yes' : 'No'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500">No feature drift details available.</p>
              )}
            </>
          )}
          {!dataDrift && !isLoadingDrift && !errorDrift && (
             <p className="text-gray-500">No data drift report available.</p>
          )}
        </div>

      </div>
    </motion.div>
  );
};

export default ModelDiagnosticsPage;
