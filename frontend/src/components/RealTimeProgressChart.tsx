import React, { useMemo } from 'react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine,
  Legend,
  Area,
  ComposedChart,
  Line
} from 'recharts';

interface RealTimeProgressChartProps {
  data: Array<{
    sequenceNumber: number;
    predictedRul: number;
    timestamp: string;
  }>;
  isProcessing: boolean;
}

const RealTimeProgressChart: React.FC<RealTimeProgressChartProps> = ({ data, isProcessing }) => {
  // Calculate trend and statistics
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    return data.map((item, index) => ({
      ...item,
      index: index + 1,
      trend: index > 0 ? data[index].predictedRul - data[index - 1].predictedRul : 0,
      movingAvg: index >= 4 ? 
        data.slice(Math.max(0, index - 4), index + 1)
          .reduce((sum, d) => sum + d.predictedRul, 0) / Math.min(5, index + 1) : 
        item.predictedRul,
    }));
  }, [data]);

  const stats = useMemo(() => {
    if (data.length === 0) return { min: 0, max: 0, avg: 0, latest: 0 };
    
    const values = data.map(d => d.predictedRul);
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((sum, val) => sum + val, 0) / values.length,
      latest: values[values.length - 1] || 0
    };
  }, [data]);

  // Custom tooltip with enhanced information
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0].payload;
    const value = payload[0].value;
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
        <p className="font-semibold text-gray-700">{`Sequence ${label}`}</p>
        <p className="text-gray-800">
          <span className="font-medium">RUL:</span> {value.toFixed(1)} cycles
        </p>
        {data.trend !== 0 && (
          <p className={`text-sm ${data.trend > 0 ? 'text-green-500' : 'text-red-500'}`}> 
            <span className="font-medium">Trend:</span> {data.trend > 0 ? '+' : ''}{data.trend.toFixed(1)} cycles
          </p>
        )}
        <p className="text-xs text-gray-500">
          {new Date(data.timestamp).toLocaleTimeString()}
        </p>
      </div>
    );
  };

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px] text-gray-500">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 opacity-20 text-blue-300">
            <svg fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 0l-2 2a1 1 0 101.414 1.414L8 10.414l1.293 1.293a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="text-lg font-medium text-gray-700">No predictions yet</p>
          <p className="text-sm text-gray-500">Start processing to see real-time RUL predictions</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      {/* Statistics Header */}
      <div className="grid grid-cols-4 gap-4 mb-6 text-center">
        <div className="bg-blue-50 rounded-lg p-3">
          <p className="text-xs font-medium text-blue-700 uppercase tracking-wider">Latest</p>
          <p className="text-lg font-bold text-blue-900">{stats.latest.toFixed(0)}</p>
          <p className="text-xs text-blue-600">cycles</p>
        </div>
        <div className="bg-green-50 rounded-lg p-3">
          <p className="text-xs font-medium text-green-700 uppercase tracking-wider">Average</p>
          <p className="text-lg font-bold text-green-900">{stats.avg.toFixed(0)}</p>
          <p className="text-xs text-green-600">cycles</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-3">
          <p className="text-xs font-medium text-purple-700 uppercase tracking-wider">Maximum</p>
          <p className="text-lg font-bold text-purple-900">{stats.max.toFixed(0)}</p>
          <p className="text-xs text-purple-600">cycles</p>
        </div>
        <div className="bg-yellow-50 rounded-lg p-3">
          <p className="text-xs font-medium text-yellow-700 uppercase tracking-wider">Minimum</p>
          <p className="text-lg font-bold text-yellow-900">{stats.min.toFixed(0)}</p>
          <p className="text-xs text-yellow-600">cycles</p>
        </div>
      </div>

      {/* Enhanced Chart */}
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" strokeOpacity={0.8} />
          <XAxis 
            dataKey="index"
            stroke="#9ca3af"
            fontSize={11}
            tick={{ fill: '#6b7280' }}
            axisLine={{ stroke: '#d1d5db', strokeWidth: 1 }}
            tickLine={{ stroke: '#d1d5db' }}
          />
          <YAxis 
            stroke="#9ca3af"
            fontSize={11}
            tick={{ fill: '#6b7280' }}
            axisLine={{ stroke: '#d1d5db', strokeWidth: 1 }}
            tickLine={{ stroke: '#d1d5db' }}
            domain={['dataMin - 1000', 'dataMax + 1000']}
          />
          {/* Critical thresholds */}
          <ReferenceLine 
            y={20000} 
            stroke="#f59e0b" // Amber color for critical
            strokeDasharray="5 5"
            strokeWidth={1.5}
            label={{ value: "Critical (20k)", position: "insideTopRight", style: { fill: '#f59e0b', fontSize: '10px', fontWeight: 'bold', background: 'rgba(255,255,255,0.7)', padding: '2px 4px', borderRadius: '2px'} }}
          />
          <ReferenceLine 
            y={60000} 
            stroke="#6366f1" // Indigo color for warning
            strokeDasharray="5 5" 
            strokeWidth={1.5}
            label={{ value: "Warning (60k)", position: "insideTopRight", style: { fill: '#6366f1', fontSize: '10px', fontWeight: 'bold', background: 'rgba(255,255,255,0.7)', padding: '2px 4px', borderRadius: '2px'} }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: '12px' }} />
          {/* Area under the curve for visual appeal */}
          <Area
            type="monotone"
            dataKey="predictedRul"
            stroke="none"
            fill="url(#rulGradient)" // Using a gradient fill
            fillOpacity={0.4}
          />
          {/* Main RUL line */}
          <Line 
            type="monotone" 
            dataKey="predictedRul" 
            stroke="url(#rulGradient)" // Using a gradient for the line stroke
            strokeWidth={2.5}
            dot={{ 
              fill: '#3b82f6', // Blue color for dots
              strokeWidth: 1, 
              stroke: '#ffffff',
              r: 3 
            }}
            activeDot={{ 
              r: 6, 
              stroke: '#2563eb', // Darker blue for active dot
              strokeWidth: 1,
              fill: '#ffffff'
            }}
            name="Predicted RUL"
          />
           {/* Moving average line */}
          <Line 
            type="monotone" 
            dataKey="movingAvg" 
            stroke="#10b981" // Emerald color for moving average
            strokeWidth={2}
            dot={false}
            activeDot={false}
            name="Moving Avg (5-seq)"
          />
          {/* Processing indicator */}
          {isProcessing && data.length > 0 && (
            <ReferenceLine 
              x={data.length} 
              stroke="#0ea5e9" // Sky color for processing indicator
              strokeWidth={2}
              strokeDasharray="8 4"
              label={{ 
                value: "Processing...", 
                position: "top",
                style: { fill: '#0ea5e9', fontSize: '10px', fontWeight: 'bold', background: 'rgba(255,255,255,0.7)', padding: '2px 4px', borderRadius: '2px' }
              }}
            />
          )}
          {/* Gradient definition */}
          <defs>
            <linearGradient id="rulGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0.5}/>
            </linearGradient>
          </defs>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default RealTimeProgressChart;
