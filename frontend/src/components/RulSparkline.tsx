import React from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import { useRulHistory } from '../lib/api';
import type { RulPrediction } from '../lib/types';

interface RulSparklineProps {
  assetId: string | number;
}

const RulSparkline: React.FC<RulSparklineProps> = ({ assetId }) => {
  // Ensure assetId is a string for the hook
  const { data: rulHistory, isLoading, error } = useRulHistory(String(assetId));

  if (isLoading) {
    return <div className="text-xs text-[#8A8A8A]">Loading...</div>;
  }

  if (error || !rulHistory || rulHistory.length === 0) {
    return <div className="text-xs text-[#E0D9FF]">{error ? 'Error' : 'No data'}</div>;
  }

  // Sort data by timestamp ascending for the line chart
  const sortedHistory: RulPrediction[] = [...rulHistory].sort(
    (a, b) => new Date(a.prediction_timestamp).getTime() - new Date(b.prediction_timestamp).getTime()
  );

  // Optionally, take only the last N points for the sparkline if history is too long
  // const displayHistory = sortedHistory.slice(-20); // Example: last 20 points

  const chartData = sortedHistory.map(p => ({
    timestamp: new Date(p.prediction_timestamp).getTime(), // Recharts usually prefers numbers for axes
    rul: p.predicted_rul,
  }));

  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={chartData}>
        <Tooltip
          contentStyle={{ fontSize: '10px', padding: '2px 4px' }}
          labelFormatter={(label) => new Date(label).toLocaleDateString()}
          formatter={(value: number) => [value.toFixed(0), 'RUL']}
        />
        <Line
          type="monotone"
          dataKey="rul"
          stroke="#D4FF6D"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default RulSparkline;
