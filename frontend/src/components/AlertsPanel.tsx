import React from 'react';
import { motion } from 'framer-motion';

interface AlertsPanelProps {
  predictions: Array<{ sequenceNumber: number; predictedRul: number }>;
  onDismissAlert?: (sequenceNumber: number) => void;
}

const AlertsPanel: React.FC<AlertsPanelProps> = ({ predictions, onDismissAlert }) => {
  const criticalPredictions = predictions.filter(p => p.predictedRul < 20000);
  const warningPredictions = predictions.filter(p => p.predictedRul >= 20000 && p.predictedRul < 60000);

  const alerts = [
    ...criticalPredictions.map(p => ({
      id: p.sequenceNumber,
      type: 'critical' as const,
      message: `Sequence ${p.sequenceNumber}: Critical RUL detected (${p.predictedRul.toFixed(0)} cycles)`,
      timestamp: new Date().toLocaleTimeString(),
      rul: p.predictedRul
    })),
    ...warningPredictions.map(p => ({
      id: p.sequenceNumber,
      type: 'warning' as const,
      message: `Sequence ${p.sequenceNumber}: Low RUL warning (${p.predictedRul.toFixed(0)} cycles)`,
      timestamp: new Date().toLocaleTimeString(),
      rul: p.predictedRul
    }))
  ].sort((a, b) => a.rul - b.rul); // Sort by RUL ascending (most critical first)

  if (alerts.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Live Alerts</h3>
        <div className="text-center py-8">
          <div className="text-green-500 text-4xl mb-2">✓</div>
          <p className="text-gray-600">No alerts - All predictions within normal range</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">
        Live Alerts ({alerts.length})
      </h3>
      
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {alerts.map((alert, index) => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
            className={`p-4 rounded-lg border-l-4 ${
              alert.type === 'critical'
                ? 'bg-red-50 border-red-500'
                : 'bg-yellow-50 border-yellow-500'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <span className={`text-xs font-medium px-2 py-1 rounded ${
                    alert.type === 'critical'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {alert.type.toUpperCase()}
                  </span>
                  <span className="text-xs text-gray-500">{alert.timestamp}</span>
                </div>
                <p className={`mt-1 text-sm ${
                  alert.type === 'critical' ? 'text-red-700' : 'text-yellow-700'
                }`}>
                  {alert.message}
                </p>
              </div>
              
              {onDismissAlert && (
                <button
                  onClick={() => onDismissAlert(alert.id)}
                  className="ml-4 text-gray-400 hover:text-gray-600 text-sm"
                >
                  ✕
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default AlertsPanel;
