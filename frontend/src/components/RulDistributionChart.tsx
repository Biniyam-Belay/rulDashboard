import React, { useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell
} from 'recharts';

interface RulDistributionProps {
  predictions: Array<{ sequenceNumber: number; predictedRul: number }>;
}

const RulDistributionChart: React.FC<RulDistributionProps> = ({ predictions }) => {
  // Enhanced bins with better categorization for real-world hours
  const bins = [
    { range: '0-168h', min: 0, max: 168, color: '#dc2626', darkColor: '#991b1b', label: 'Critical', icon: '🔴' },
    { range: '168-720h', min: 168, max: 720, color: '#ea580c', darkColor: '#c2410c', label: 'Warning', icon: '🟠' },
    { range: '720-2160h', min: 720, max: 2160, color: '#ca8a04', darkColor: '#a16207', label: 'Caution', icon: '🟡' },
    { range: '2160-4320h', min: 2160, max: 4320, color: '#16a34a', darkColor: '#15803d', label: 'Good', icon: '🟢' },
    { range: '4320h+', min: 4320, max: Infinity, color: '#059669', darkColor: '#047857', label: 'Optimal', icon: '💚' }
  ];

  const { distributionData, totalCount, riskSummary } = useMemo(() => {
    const total = predictions.length;
    const data = bins.map(bin => {
      const count = predictions.filter(p => 
        p.predictedRul >= bin.min && p.predictedRul < bin.max
      ).length;
      
      const percentage = total > 0 ? (count / total) * 100 : 0;
      
      return {
        range: bin.range,
        count,
        percentage,
        color: bin.color,
        darkColor: bin.darkColor,
        label: bin.label,
        icon: bin.icon
      };
    });

    const summary = {
      critical: data[0].count + data[1].count, // 0-40k
      medium: data[2].count, // 40k-60k
      healthy: data[3].count + data[4].count, // 60k+
    };

    return {
      distributionData: data,
      totalCount: total,
      riskSummary: summary
    };
  }, [predictions]);

  // Custom tooltip for enhanced information
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    
    const data = payload[0].payload;
    
    return (
      <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-lg shadow-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{data.icon}</span>
          <p className="font-semibold text-gray-800">{data.label}</p>
        </div>
        <p className="text-sm text-gray-600">Range: {data.range} cycles</p>
        <p className="text-sm font-medium">Count: {data.count} predictions</p>
        <p className="text-sm font-medium">Percentage: {data.percentage.toFixed(1)}%</p>
      </div>
    );
  };

  if (predictions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px] text-gray-500">
        <div className="text-center">
          <div className="text-4xl mb-4">📊</div>
          <p className="text-lg font-medium">No distribution data</p>
          <p className="text-sm">Process some predictions to see the distribution</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      {/* Risk Summary Cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-gradient-to-r from-red-50 to-red-100 rounded-lg p-3 text-center">
          <div className="text-lg mb-1">🚨</div>
          <p className="text-xs font-medium text-red-800 uppercase tracking-wider">High Risk</p>
          <p className="text-lg font-bold text-red-900">{riskSummary.critical}</p>
          <p className="text-xs text-red-600">
            {totalCount > 0 ? ((riskSummary.critical / totalCount) * 100).toFixed(1) : 0}%
          </p>
        </div>
        
        <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-lg p-3 text-center">
          <div className="text-lg mb-1">⚠️</div>
          <p className="text-xs font-medium text-yellow-800 uppercase tracking-wider">Medium Risk</p>
          <p className="text-lg font-bold text-yellow-900">{riskSummary.medium}</p>
          <p className="text-xs text-yellow-600">
            {totalCount > 0 ? ((riskSummary.medium / totalCount) * 100).toFixed(1) : 0}%
          </p>
        </div>
        
        <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-3 text-center">
          <div className="text-lg mb-1">✅</div>
          <p className="text-xs font-medium text-green-800 uppercase tracking-wider">Healthy</p>
          <p className="text-lg font-bold text-green-900">{riskSummary.healthy}</p>
          <p className="text-xs text-green-600">
            {totalCount > 0 ? ((riskSummary.healthy / totalCount) * 100).toFixed(1) : 0}%
          </p>
        </div>
      </div>

      {/* Enhanced Bar Chart */}
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={distributionData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
          <defs>
            {distributionData.map((_, index) => (
              <linearGradient key={index} id={`gradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={distributionData[index].color} stopOpacity={0.9} />
                <stop offset="100%" stopColor={distributionData[index].darkColor} stopOpacity={0.7} />
              </linearGradient>
            ))}
          </defs>
          
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.6} />
          
          <XAxis 
            dataKey="range"
            stroke="#6b7280"
            fontSize={11}
            angle={-45}
            textAnchor="end"
            height={60}
            tick={{ fill: '#6b7280' }}
            axisLine={{ stroke: '#9ca3af', strokeWidth: 1 }}
            tickLine={{ stroke: '#9ca3af' }}
          />
          
          <YAxis 
            stroke="#6b7280"
            fontSize={12}
            label={{ 
              value: 'Prediction Count', 
              angle: -90, 
              position: 'insideLeft',
              style: { textAnchor: 'middle', fill: '#6b7280' }
            }}
          />
          
          <Tooltip content={<CustomTooltip />} />
          
          <Bar 
            dataKey="count" 
            radius={[4, 4, 0, 0]}
            stroke="#ffffff"
            strokeWidth={1}
          >
            {distributionData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={`url(#gradient-${index})`}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Enhanced Legend */}
      <div className="mt-4 flex flex-wrap gap-3 justify-center">
        {distributionData.map((bin) => (
          <div 
            key={bin.range} 
            className="flex items-center space-x-2 bg-gray-50 rounded-lg px-3 py-2"
          >
            <span className="text-sm">{bin.icon}</span>
            <div 
              className="w-3 h-3 rounded-full shadow-sm" 
              style={{ backgroundColor: bin.color }}
            ></div>
            <div className="text-xs">
              <span className="font-medium text-gray-700">{bin.label}</span>
              <span className="text-gray-500 ml-1">({bin.range})</span>
              {bin.count > 0 && (
                <span className="ml-1 text-gray-600 font-medium">
                  {bin.count}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RulDistributionChart;
