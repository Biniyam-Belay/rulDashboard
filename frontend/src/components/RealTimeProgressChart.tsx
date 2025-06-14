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
      <div className="bg-white border border-[#F7F7F7] rounded-lg shadow-lg p-3">
        <p className="font-semibold text-[#333333]">{`Sequence ${label}`}</p>
        <p className="text-[#1E1E2D]">
          <span className="font-medium">RUL:</span> {value.toFixed(1)} cycles
        </p>
        {data.trend !== 0 && (
          <p className={`text-sm ${data.trend > 0 ? 'text-[#D4FF6D]' : 'text-[#E0D9FF]'}`}> 
            <span className="font-medium">Trend:</span> {data.trend > 0 ? '+' : ''}{data.trend.toFixed(1)} cycles
          </p>
        )}
        <p className="text-xs text-[#8A8A8A]">
          {new Date(data.timestamp).toLocaleTimeString()}
        </p>
      </div>
    );
  };

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px] text-[#8A8A8A]">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 opacity-20 text-[#E0D9FF]">
            <svg fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 0l-2 2a1 1 0 101.414 1.414L8 10.414l1.293 1.293a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="text-lg font-medium text-[#333333]">No predictions yet</p>
          <p className="text-sm text-[#8A8A8A]">Start processing to see real-time RUL predictions</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      {/* Statistics Header */}
      <div className="grid grid-cols-4 gap-4 mb-6 text-center">
        <div className="bg-[#D4EFFF] rounded-lg p-3">
          <p className="text-xs font-medium text-[#1E1E2D] uppercase tracking-wider">Latest</p>
          <p className="text-lg font-bold text-[#1E1E2D]">{stats.latest.toFixed(0)}</p>
          <p className="text-xs text-[#8A8A8A]">cycles</p>
        </div>
        <div className="bg-[#D4FF6D] rounded-lg p-3">
          <p className="text-xs font-medium text-[#1E1E2D] uppercase tracking-wider">Average</p>
          <p className="text-lg font-bold text-[#1E1E2D]">{stats.avg.toFixed(0)}</p>
          <p className="text-xs text-[#8A8A8A]">cycles</p>
        </div>
        <div className="bg-[#E0D9FF] rounded-lg p-3">
          <p className="text-xs font-medium text-[#1E1E2D] uppercase tracking-wider">Maximum</p>
          <p className="text-lg font-bold text-[#1E1E2D]">{stats.max.toFixed(0)}</p>
          <p className="text-xs text-[#8A8A8A]">cycles</p>
        </div>
        <div className="bg-[#FFF5CC] rounded-lg p-3">
          <p className="text-xs font-medium text-[#1E1E2D] uppercase tracking-wider">Minimum</p>
          <p className="text-lg font-bold text-[#1E1E2D]">{stats.min.toFixed(0)}</p>
          <p className="text-xs text-[#8A8A8A]">cycles</p>
        </div>
      </div>

      {/* Enhanced Chart */}
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
          <CartesianGrid strokeDasharray="2 2" stroke="#F7F7F7" strokeOpacity={1} />
          <XAxis 
            dataKey="index"
            stroke="#8A8A8A"
            fontSize={11}
            tick={{ fill: '#8A8A8A' }}
            axisLine={{ stroke: '#F7F7F7', strokeWidth: 1 }}
            tickLine={{ stroke: '#F7F7F7' }}
          />
          <YAxis 
            stroke="#8A8A8A"
            fontSize={11}
            tick={{ fill: '#8A8A8A' }}
            axisLine={{ stroke: '#F7F7F7', strokeWidth: 1 }}
            tickLine={{ stroke: '#F7F7F7' }}
            domain={['dataMin - 1000', 'dataMax + 1000']}
          />
          {/* Critical thresholds */}
          <ReferenceLine 
            y={20000} 
            stroke="#E0D9FF" 
            strokeDasharray="5 5"
            strokeWidth={2}
            label={{ value: "Critical (20k)", position: "top", style: { fill: '#E0D9FF', fontWeight: 'bold' } }}
          />
          <ReferenceLine 
            y={60000} 
            stroke="#FFF5CC" 
            strokeDasharray="5 5" 
            strokeWidth={2}
            label={{ value: "Warning (60k)", position: "top", style: { fill: '#FFF5CC', fontWeight: 'bold' } }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          {/* Area under the curve for visual appeal */}
          <Area
            type="monotone"
            dataKey="predictedRul"
            stroke="none"
            fill="#D4EFFF"
            fillOpacity={0.4}
          />
          {/* Main RUL line */}
          <Line 
            type="monotone" 
            dataKey="predictedRul" 
            stroke="#D4FF6D" 
            strokeWidth={3}
            dot={{ 
              fill: '#D4FF6D', 
              strokeWidth: 2, 
              stroke: '#FFFFFF',
              r: 4 
            }}
            activeDot={{ 
              r: 8, 
              stroke: '#D4FF6D',
              strokeWidth: 2,
              fill: '#FFFFFF'
            }}
            name="Predicted RUL"
          />
          {/* Processing indicator */}
          {isProcessing && data.length > 0 && (
            <ReferenceLine 
              x={data.length} 
              stroke="#D4FF6D" 
              strokeWidth={3}
              strokeDasharray="10 5"
              label={{ 
                value: "Processing...", 
                position: "top",
                style: { fill: '#D4FF6D', fontWeight: 'bold' }
              }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default RealTimeProgressChart;
