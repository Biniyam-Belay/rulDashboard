import React, { useMemo } from 'react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine,
  Legend,
  ComposedChart,
  Line,
  Area,
} from 'recharts';

interface RealTimeProgressChartProps {
  data: Array<{
    sequenceNumber: number;
    predictedRul: number;
    timestamp: string;
  }>;
  isProcessing: boolean;
  displayBatchSize?: number; // Added new optional prop
}

const RealTimeProgressChart: React.FC<RealTimeProgressChartProps> = ({ data, isProcessing, displayBatchSize }) => {
  // Enhanced chart data with degradation analysis
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    let processedData = [...data].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    // If displayBatchSize is provided and positive, take only the last N items
    if (displayBatchSize && displayBatchSize > 0 && processedData.length > displayBatchSize) {
      processedData = processedData.slice(-displayBatchSize);
    }
    
    return processedData.map((item, index, arr) => {
      const prevItem = index > 0 ? arr[index - 1] : null;
      const trend = prevItem ? item.predictedRul - prevItem.predictedRul : 0;
      
      // Define significant event thresholds for real-world hours
      const SIGNIFICANT_DROP_THRESHOLD = -50; // 50 hour drop is significant
      const SIGNIFICANT_PEAK_THRESHOLD = 50;  // 50 hour increase is significant
      let significantEvent: 'peak' | 'drop' | null = null;
      if (trend < SIGNIFICANT_DROP_THRESHOLD) {
        significantEvent = 'drop';
      } else if (trend > SIGNIFICANT_PEAK_THRESHOLD) {
        significantEvent = 'peak';
      }

      const windowSize = Math.min(5, index + 1);
      const window = processedData.slice(Math.max(0, index - windowSize + 1), index + 1);
      const movingAvg = window.reduce((sum, d) => sum + d.predictedRul, 0) / window.length;
      
      const slopeWindowSize = Math.min(10, index + 1);
      let degradationRate = 0;
      if (index >= slopeWindowSize - 1) {
        const slopeWindow = processedData.slice(index - slopeWindowSize + 1, index + 1);
        const firstVal = slopeWindow[0].predictedRul;
        const lastVal = slopeWindow[slopeWindow.length - 1].predictedRul;
        degradationRate = (lastVal - firstVal) / slopeWindowSize;
      }
      
      let healthStatus = 'healthy';
      if (item.predictedRul <= 168) {
        healthStatus = 'critical';
      } else if (item.predictedRul <= 720) {
        healthStatus = 'warning';
      } else if (degradationRate < -10) { // 10 hours/sequence degradation is concerning
        healthStatus = 'declining';
      }
      
      return {
        ...item, // Includes original sequenceNumber, predictedRul, timestamp
        // index: index + 1, // Replaced by using sequenceNumber directly for XAxis
        trend,
        movingAvg,
        degradationRate,
        healthStatus,
        daysRemaining: item.predictedRul / 24,
        confidence: index >= 4 ? Math.max(0.3, 1 - Math.abs(trend) / (item.predictedRul * 0.1)) : 0.5,
        significantEvent, // Added significantEvent
      };
    });
  }, [data, displayBatchSize]);

  const yDomain = useMemo(() => {
    if (!chartData || chartData.length === 0) {
      return { min: 'auto' as const, max: 'auto' as const };
    }

    const rulValues = chartData.map(d => d.predictedRul);
    let minRul = Math.min(...rulValues);
    let maxRul = Math.max(...rulValues);

    if (minRul === maxRul) {
      const paddingAmount = 1000;
      minRul -= paddingAmount;
      maxRul += paddingAmount;
    } else {
      const range = maxRul - minRul;
      const padding = Math.max(range * 0.05, 500);
      minRul -= padding;
      maxRul += padding;
    }
    
    minRul = Math.max(0, minRul);

    return { min: Math.floor(minRul), max: Math.ceil(maxRul) };
  }, [chartData]);

  const stats = useMemo(() => {
    if (data.length === 0) return { min: 0, max: 0, avg: 0, latest: 0, totalDegradation: 0, avgDegradationRate: 0 };
    
    const values = data.map(d => d.predictedRul);
    const latest = values[values.length - 1] || 0;
    const first = values[0] || latest;
    const totalDegradation = first - latest;
    const avgDegradationRate = data.length > 1 ? totalDegradation / (data.length - 1) : 0;
    
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((sum, val) => sum + val, 0) / values.length,
      latest,
      totalDegradation,
      avgDegradationRate
    };
  }, [data]);

  // Enhanced tooltip with degradation insights
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const tooltipData = payload[0].payload; // Renamed to avoid conflict with props.data
    const rulValue = payload.find((p: any) => p.dataKey === 'predictedRul')?.value;
    
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-4 min-w-[200px]">
        <p className="font-semibold text-gray-800 mb-2">{`Sequence ${label}`}</p> {/* label is sequenceNumber */}
        
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">RUL:</span>
            <span className="font-medium text-gray-900">{rulValue?.toFixed(0)} hours</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-600">Days Left:</span>
            <span className="font-medium text-gray-900">{tooltipData.daysRemaining?.toFixed(1)} days</span>
          </div>
          
          {tooltipData.trend !== 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Change:</span>
              <span className={`font-medium ${tooltipData.trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {tooltipData.trend > 0 ? '+' : ''}{tooltipData.trend.toFixed(0)} hrs
              </span>
            </div>
          )}
          
          {Math.abs(tooltipData.degradationRate) > 1 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Degradation:</span>
              <span className={`font-medium ${tooltipData.degradationRate < -1 ? 'text-red-600' : 'text-yellow-600'}`}>
                {tooltipData.degradationRate.toFixed(0)} hrs/seq
              </span>
            </div>
          )}
          
          <div className="flex justify-between">
            <span className="text-gray-600">Status:</span>
            <span className={`font-medium capitalize ${
              tooltipData.healthStatus === 'critical' ? 'text-red-600' :
              tooltipData.healthStatus === 'warning' ? 'text-yellow-600' :
              tooltipData.healthStatus === 'declining' ? 'text-orange-600' : 'text-green-600'
            }`}>
              {tooltipData.healthStatus}
            </span>
          </div>
        </div>
        
        <div className="text-xs text-gray-500 mt-2 pt-2 border-t">
          {new Date(tooltipData.timestamp).toLocaleString()}
        </div>
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
      {/* Reimagined Statistics Header */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-center">
        <div className="bg-indigo-50 rounded-xl p-4">
          <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wider">Current RUL</p>
          <p className="text-2xl font-bold text-indigo-900 mt-1">{stats.latest.toFixed(0)}</p>
          <p className="text-xs text-indigo-500">{(stats.latest/24).toFixed(1)} days</p>
        </div>
        
        <div className="bg-pink-50 rounded-xl p-4">
          <p className="text-sm font-semibold text-pink-600 uppercase tracking-wider">Total Loss</p>
          <p className="text-2xl font-bold text-pink-900 mt-1">{Math.abs(stats.totalDegradation).toFixed(0)}</p>
          <p className="text-xs text-pink-500">hours degraded</p>
        </div>
        
        <div className="bg-teal-50 rounded-xl p-4">
          <p className="text-sm font-semibold text-teal-600 uppercase tracking-wider">Range</p>
          <p className="text-2xl font-bold text-teal-900 mt-1">{(stats.max - stats.min).toFixed(0)}</p>
          <p className="text-xs text-teal-500">hours span</p>
        </div>
        
        <div className={`rounded-xl p-4 ${
          Math.abs(stats.avgDegradationRate) > 5 ? 'bg-red-100' : 
          Math.abs(stats.avgDegradationRate) > 1 ? 'bg-amber-100' : 'bg-green-100'
        }`}>
          <p className={`text-sm font-semibold uppercase tracking-wider ${
            Math.abs(stats.avgDegradationRate) > 5 ? 'text-red-600' : 
            Math.abs(stats.avgDegradationRate) > 1 ? 'text-amber-600' : 'text-green-600'
          }`}>Avg Rate</p>
          <p className={`text-2xl font-bold mt-1 ${
            Math.abs(stats.avgDegradationRate) > 5 ? 'text-red-900' : 
            Math.abs(stats.avgDegradationRate) > 1 ? 'text-amber-900' : 'text-green-900'
          }`}>{stats.avgDegradationRate.toFixed(0)}</p>
          <p className={`text-xs ${
            Math.abs(stats.avgDegradationRate) > 5 ? 'text-red-500' : 
            Math.abs(stats.avgDegradationRate) > 1 ? 'text-amber-500' : 'text-green-500'
          }`}>hrs/sequence</p>
        </div>
      </div>

      {/* Reimagined Chart */}
      <div style={{ width: '100%', height: '380px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 20, right: 40, left: 20, bottom: 80 }}>
            <defs>
              <linearGradient id="rulGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.7}/>
                <stop offset="95%" stopColor="#c7d2fe" stopOpacity={0.1}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="sequenceNumber"
              type="number"
              domain={['dataMin', 'dataMax']}
              allowDuplicatedCategory={false}
              stroke="#6b7280"
              fontSize={12}
              tick={{ fill: '#6b7280' }}
              axisLine={{ stroke: '#d1d5db' }}
              tickLine={{ stroke: '#d1d5db' }}
              label={{ value: 'Sequence Number', position: 'insideBottom', offset: -25, style: { fontSize: '14px', fill: '#374151', fontWeight: '600' } }}
            />
            <YAxis 
              stroke="#6b7280"
              fontSize={12}
              tick={{ fill: '#6b7280' }}
              axisLine={{ stroke: '#d1d5db' }}
              tickLine={{ stroke: '#d1d5db' }}
              domain={[yDomain.min, yDomain.max]}
              allowDataOverflow={false}
              label={{ value: 'Predicted RUL (hrs)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: '14px', fill: '#374151', fontWeight: '600' } }}
              tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value.toFixed(0)}
            />
            <ReferenceLine y={168} stroke="#ef4444" strokeDasharray="6 3" strokeWidth={1.5}
              label={{ value: "CRITICAL", position: "insideTopRight", style: { fill: '#ef4444', fontSize: '10px', fontWeight: 'bold', backgroundColor: 'rgba(255,255,255,0.8)', padding: '2px 4px', borderRadius: '2px' } }}
            />
            <ReferenceLine y={720} stroke="#f97316" strokeDasharray="6 3" strokeWidth={1.5}
              label={{ value: "WARNING", position: "insideTopRight", style: { fill: '#f97316', fontSize: '10px', fontWeight: 'bold', backgroundColor: 'rgba(255,255,255,0.8)', padding: '2px 4px', borderRadius: '2px' } }}
            />
            <Tooltip content={<CustomTooltip />} wrapperStyle={{ outline: 'none', border: '1px solid #e5e7eb', borderRadius: '0.5rem', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)' }} cursor={{ stroke: '#4f46e5', strokeWidth: 1, strokeDasharray: '3 3' }} />
            <Legend 
              iconType="line" 
              wrapperStyle={{ 
                fontSize: '13px', 
                paddingTop: 35,
                paddingBottom: 0,
                display: 'flex',
                justifyContent: 'left',
                gap: '20px'
              }} 
              verticalAlign="bottom" 
              height={40}
              layout="horizontal"
            />
            <Area
              type="monotone"
              dataKey="predictedRul"
              name="Predicted RUL"
              stroke="#4f46e5"
              strokeWidth={2.5}
              fill="url(#rulGradient)"
              fillOpacity={1}
              activeDot={{ r: 7, strokeWidth: 2, fill: '#fff' }}
              isAnimationActive={true}
            />
            <Line 
              type="monotone" 
              dataKey="movingAvg" 
              name="5-Point Moving Average"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              strokeDasharray="4 4"
              isAnimationActive={true}
            />
            {isProcessing && chartData.length > 0 && chartData[chartData.length - 1]?.sequenceNumber != null && (
              <ReferenceLine 
                x={chartData[chartData.length - 1].sequenceNumber}
                stroke="#2563eb"
                strokeWidth={2}
                strokeDasharray="8 4"
                label={{ value: "LIVE", position: "top", style: { fill: '#fff', backgroundColor: '#2563eb', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' } }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default RealTimeProgressChart;
