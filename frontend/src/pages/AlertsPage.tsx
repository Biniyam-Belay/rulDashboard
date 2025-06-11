import React, { useState } from 'react';
import { useAlerts, useAcknowledgeAlert } from '../lib/api';
import type { Alert } from '../lib/types';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

const AlertsPage = () => {
  const [filter, setFilter] = useState<'all' | 'acknowledged' | 'unacknowledged'>('unacknowledged');
  
  const queryFilter = {
    acknowledged: filter === 'acknowledged' ? true : (filter === 'unacknowledged' ? false : undefined)
  };

  const { data: alerts, isLoading, error, refetch } = useAlerts(queryFilter);
  const acknowledgeMutation = useAcknowledgeAlert();

  const handleAcknowledge = async (alertId: string) => {
    try {
      await acknowledgeMutation.mutateAsync(alertId);
      // Refetch or rely on onSuccess invalidation in the hook
    } catch (err) {
      console.error("Failed to acknowledge alert:", err);
      // Optionally show an error message to the user
    }
  };

  const getSeverityClass = (severity: Alert['severity']) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800';
      case 'info':
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8"
    >
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-800">Alert Center</h1>
          <Link to="/" className="text-blue-600 hover:text-blue-800 transition-colors">
            &larr; Back to Dashboard
          </Link>
        </header>

        <div className="mb-6 flex items-center space-x-4">
          <label htmlFor="filter" className="text-sm font-medium text-gray-700">Filter alerts:</label>
          <select
            id="filter"
            name="filter"
            className="mt-1 block w-auto pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value as 'all' | 'acknowledged' | 'unacknowledged')}
          >
            <option value="unacknowledged">Unacknowledged</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="all">All Alerts</option>
          </select>
        </div>

        {isLoading && (
          <div className="bg-white rounded-lg shadow-md p-5 text-center text-gray-500">
            Loading alerts...
          </div>
        )}
        {error && (
          <div className="bg-red-50 rounded-lg shadow-md p-5 text-center text-red-700">
            Error loading alerts: {error.message}
          </div>
        )}
        {!isLoading && !error && alerts && alerts.length === 0 && (
          <div className="bg-white rounded-lg shadow-md p-5 text-center text-gray-500">
            No alerts found for the selected filter.
          </div>
        )}
        {!isLoading && !error && alerts && alerts.length > 0 && (
          <div className="overflow-x-auto bg-white rounded-lg shadow-md">
            <table className="min-w-full border-collapse">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Asset</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Severity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Message</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">RUL at Alert</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Timestamp</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {alerts.map((alert) => (
                  <tr key={alert.id} className={`${alert.acknowledged ? 'bg-gray-50' : getSeverityClass(alert.severity).split(' ')[0].replace('bg-', 'bg-opacity-20 hover:bg-opacity-30') } transition-colors`}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                      {alert.assets ? (
                        <Link to={`/assets/${alert.asset_id}`} className="text-blue-600 hover:underline">
                          {alert.assets.name} ({alert.assets.asset_type})
                        </Link>
                      ) : (
                        'N/A'
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getSeverityClass(alert.severity)}`}>
                        {alert.severity.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{alert.message}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-500">{alert.rul_at_alert ?? 'N/A'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{new Date(alert.timestamp).toLocaleString()}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      {alert.acknowledged ? (
                        <span className="text-green-600">Acknowledged</span>
                      ) : (
                        <span className="text-yellow-600">Unacknowledged</span>
                      )}
                      {alert.acknowledged && alert.acknowledged_at && (
                        <div className="text-xs text-gray-400">
                          {new Date(alert.acknowledged_at).toLocaleString()}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      {!alert.acknowledged && (
                        <button
                          onClick={() => handleAcknowledge(alert.id)}
                          disabled={acknowledgeMutation.isPending}
                          className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                        >
                          {acknowledgeMutation.isPending && acknowledgeMutation.variables === alert.id ? 'Working...' : 'Acknowledge'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default AlertsPage;
