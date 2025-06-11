import './App.css'
import { BrowserRouter as Router, Routes, Route, useNavigate, Link as RouterLink } from 'react-router-dom';
import { useAssetsWithLatestRul } from './lib/api';
import type { AssetWithLatestRul } from './lib/types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import AssetDetailPage from './pages/AssetDetailPage';
import AlertsPage from './pages/AlertsPage';
import ModelDiagnosticsPage from './pages/ModelDiagnosticsPage'; // Import the new page
import DataImportPage from './pages/DataImportPage'; // Import the new page
import RulSparkline from './components/RulSparkline'; // Corrected: Default import
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Layout } from './components/Layout'; // Assuming you have a Layout component

// Type for sort configuration
type SortKey = keyof AssetWithLatestRul | null;
interface SortConfig {
  key: SortKey;
  direction: 'ascending' | 'descending';
}

// DashboardPage component
const DashboardPage = () => {
  const { data, isLoading, error } = useAssetsWithLatestRul();
  const navigate = useNavigate();
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'latest_rul', direction: 'ascending' });

  // KPI calculations
  const totalAssets = data?.length ?? 0;
  const criticalAssets = data?.filter(a => (a.latest_rul ?? Infinity) <= 20000).length ?? 0;
  const warningAssets = data?.filter(a => (a.latest_rul ?? Infinity) > 20000 && (a.latest_rul ?? 0) <= 60000).length ?? 0;
  const healthyAssets = data?.filter(a => (a.latest_rul ?? 0) > 60000).length ?? 0;

  // Prepare RUL distribution data for histogram
  const rulBins = [0, 20000, 40000, 60000, 80000, 100000, 120000, 140000, 160000];
  const histogram = rulBins.map((bin, i) => {
    const nextBin = rulBins[i + 1] ?? Infinity;
    const count = data?.filter(a => {
      const rul = a.latest_rul;
      return rul !== null && rul !== undefined && rul >= bin && rul < nextBin;
    }).length ?? 0;
    return {
      bin: `${bin / 1000}k${nextBin !== Infinity ? '-' + nextBin / 1000 + 'k' : '+'}`,
      count,
    };
  });

  const handleRowClick = (assetId: string | number) => {
    navigate(`/assets/${assetId}`);
  };

  const sortedData = useMemo(() => {
    if (!data) return [];
    const sortableItems = [...data]; // Create a new array to avoid mutating the original
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        const aValue = a[sortConfig.key!];
        const bValue = b[sortConfig.key!];

        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;

        // Handle date sorting specifically for 'latest_prediction_timestamp'
        if (sortConfig.key === 'latest_prediction_timestamp') {
          const dateA = new Date(aValue as string).getTime();
          const dateB = new Date(bValue as string).getTime();
          return sortConfig.direction === 'ascending' ? dateA - dateB : dateB - dateA;
        }

        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortConfig.direction === 'ascending' ? aValue - bValue : bValue - aValue;
        } else if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortConfig.direction === 'ascending' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        }
        
        return 0;
      });
    }
    return sortableItems;
  }, [data, sortConfig]);

  const requestSort = (key: SortKey) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key: SortKey) => {
    if (sortConfig.key === key) {
      return sortConfig.direction === 'ascending' ? ' ↑' : ' ↓';
    }
    return ''; // Return empty string or a neutral icon if preferred
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-gray-100 p-4 sm:p-6 lg:p-8"
    >
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <div className="flex justify-between items-center">
            <h1 className="text-4xl font-bold text-gray-800 tracking-tight">Proactive Bearing Health Dashboard</h1>
            <nav className="flex space-x-4">
              <RouterLink to="/alerts" className="text-blue-600 hover:text-blue-800 hover:underline transition-colors">
                View Alerts
              </RouterLink>
              <RouterLink to="/diagnostics" className="text-blue-600 hover:text-blue-800 hover:underline transition-colors">
                Model Diagnostics
              </RouterLink>
            </nav>
          </div>
        </header>

        {/* KPIs */}
        <section aria-labelledby="kpi-title">
          <h2 id="kpi-title" className="sr-only">Key Performance Indicators</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
            {/* Total Assets Card */}
            <div className="bg-white rounded-lg shadow-md p-5 flex flex-col justify-between">
              <div>
                <div className="text-sm font-medium text-gray-500">Total Assets</div>
                <div className="mt-1 text-3xl font-semibold text-gray-900">{totalAssets}</div>
              </div>
            </div>
            {/* Critical Assets Card */}
            <div className="bg-red-50 rounded-lg shadow-md p-5 flex flex-col justify-between">
              <div>
                <div className="text-sm font-medium text-red-700">Critical</div>
                <div className="mt-1 text-3xl font-semibold text-red-700">{criticalAssets}</div>
              </div>
            </div>
            {/* Warning Assets Card */}
            <div className="bg-yellow-50 rounded-lg shadow-md p-5 flex flex-col justify-between">
              <div>
                <div className="text-sm font-medium text-yellow-700">Warning</div>
                <div className="mt-1 text-3xl font-semibold text-yellow-700">{warningAssets}</div>
              </div>
            </div>
            {/* Healthy Assets Card */}
            <div className="bg-green-50 rounded-lg shadow-md p-5 flex flex-col justify-between">
              <div>
                <div className="text-sm font-medium text-green-700">Healthy</div>
                <div className="mt-1 text-3xl font-semibold text-green-700">{healthyAssets}</div>
              </div>
            </div>
          </div>
        </section>

        {/* RUL Distribution Plot */}
        <section aria-labelledby="rul-distribution-title" className="my-8 bg-white rounded-lg shadow-md p-5">
          <h3 id="rul-distribution-title" className="text-lg font-semibold text-gray-800 mb-4">RUL Distribution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={histogram} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="bin" label={{ value: 'RUL (k cycles)', position: 'insideBottom', offset: -5 }} />
              <YAxis allowDecimals={false} label={{ value: 'Assets', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Bar dataKey="count" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </section>

        {/* Asset Table */}
        <section aria-labelledby="asset-list-title">
          <h2 id="asset-list-title" className="text-xl font-semibold text-gray-800 mb-4">Assets Overview</h2>
          {isLoading && (
            <div className="bg-white rounded-lg shadow-md p-5 text-center text-gray-500">
              Loading asset data...
            </div>
          )}
          {error && (
            <div className="bg-red-50 rounded-lg shadow-md p-5 text-center text-red-700">
              Error loading assets: {error.message}
            </div>
          )}
          {data && (
            <div className="overflow-x-auto bg-white rounded-lg shadow-md">
              <table className="min-w-full border-collapse">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-200 select-none" onClick={() => requestSort('name')}>
                      Name{getSortIndicator('name')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-200 select-none" onClick={() => requestSort('asset_type')}>
                      Type{getSortIndicator('asset_type')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-200 select-none" onClick={() => requestSort('location')}>
                      Location{getSortIndicator('location')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-200 select-none" onClick={() => requestSort('operational_status')}>
                      Status{getSortIndicator('operational_status')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-200 select-none" onClick={() => requestSort('latest_rul')}>
                      Latest RUL{getSortIndicator('latest_rul')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-200 select-none" onClick={() => requestSort('latest_prediction_timestamp')}>
                      Last Prediction{getSortIndicator('latest_prediction_timestamp')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      RUL Trend
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sortedData.map((asset: AssetWithLatestRul) => (
                    <tr key={asset.id}
                      onClick={() => handleRowClick(asset.id)}
                      className={`cursor-pointer hover:bg-gray-100 transition-colors duration-150 ease-in-out ${ 
                        asset.latest_rul !== null && asset.latest_rul !== undefined && asset.latest_rul <= 20000
                          ? 'bg-red-50'
                          : asset.latest_rul !== null && asset.latest_rul !== undefined && asset.latest_rul <= 60000
                          ? 'bg-yellow-50'
                          : ''
                      }`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{asset.name}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{asset.asset_type}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{asset.location}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{asset.operational_status}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-700">{asset.latest_rul ?? 'N/A'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{asset.latest_prediction_timestamp ? new Date(asset.latest_prediction_timestamp).toLocaleString() : 'N/A'}</td>
                      <td className="px-4 py-3 w-32">
                        <RulSparkline assetId={asset.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </motion.div>
  );
};

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/assets/:assetId" element={<AssetDetailPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/diagnostics" element={<ModelDiagnosticsPage />} /> {/* Add route for diagnostics page */}
          <Route path="/import-data" element={<DataImportPage />} /> {/* Add route for DataImportPage */}
        </Routes>
      </Layout>
    </Router>
  )
}

export default App
