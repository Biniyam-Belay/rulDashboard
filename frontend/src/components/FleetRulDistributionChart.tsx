import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
  RadialBarChart,
  RadialBar
} from 'recharts';

interface FleetRulDistributionChartProps {
  assets: any[];
}

const FleetRulDistributionChart: React.FC<FleetRulDistributionChartProps> = ({ assets }) => {
  const rulBins = [
    { name: 'Critical', shortName: 'Critical (0-20k)', range: [0, 20000], color: '#dc2626', bgColor: '#fef2f2' },
    { name: 'Warning', shortName: 'Warning (20k-60k)', range: [20001, 60000], color: '#d97706', bgColor: '#fffbeb' },
    { name: 'Caution', shortName: 'Caution (60k-100k)', range: [60001, 100000], color: '#ca8a04', bgColor: '#fefce8' },
    { name: 'Healthy', shortName: 'Healthy (100k+)', range: [100001, Infinity], color: '#059669', bgColor: '#f0fdf4' },
  ];

  const { distributionData, totalAssets, avgRul, healthPercentage } = useMemo(() => {
    const total = assets?.length || 0;
    
    if (total === 0) {
      return {
        distributionData: [],
        totalAssets: 0,
        avgRul: 0,
        healthPercentage: 0
      };
    }

    const distribution = rulBins.map(bin => {
      const assetsInBin = assets.filter(asset => {
        const rul = asset.latest_rul ?? 0;
        return rul >= bin.range[0] && rul <= bin.range[1];
      });
      
      const count = assetsInBin.length;
      const percentage = (count / total) * 100;
      const avgRulInBin = count > 0 ? 
        assetsInBin.reduce((sum, a) => sum + (a.latest_rul || 0), 0) / count : 0;
      
      return {
        name: bin.name,
        fullName: bin.shortName,
        count: count,
        percentage: percentage,
        color: bin.color,
        bgColor: bin.bgColor,
        avgRul: avgRulInBin,
        assets: assetsInBin
      };
    });

    const totalRul = assets.reduce((sum, a) => sum + (a.latest_rul || 0), 0);
    const averageRul = totalRul / total;
    const healthyAssets = assets.filter(a => (a.latest_rul || 0) >= 100000).length;
    const healthPct = (healthyAssets / total) * 100;

    return {
      distributionData: distribution,
      totalAssets: total,
      avgRul: averageRul,
      healthPercentage: healthPct
    };
  }, [assets, rulBins]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0].payload;
    
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-4 min-w-[200px]">
        <p className="font-semibold text-gray-800 mb-2">{data.fullName}</p>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Assets:</span>
            <span className="font-medium text-gray-900">{data.count}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Percentage:</span>
            <span className="font-medium text-gray-900">{data.percentage.toFixed(1)}%</span>
          </div>
          {data.count > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Avg RUL:</span>
              <span className="font-medium text-gray-900">{data.avgRul.toFixed(0)} hrs</span>
            </div>
          )}
          {data.count > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Time Left:</span>
              <span className="font-medium text-gray-900">{(data.avgRul / 24).toFixed(1)} days</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (!assets || assets.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px] text-gray-500">
        <div className="text-center">
          <div className="text-4xl mb-4">📊</div>
          <p className="text-lg font-medium">No asset data for distribution</p>
          <p className="text-sm">Asset data is required to display the RUL distribution.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      {/* Health Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {distributionData.map((bin, index) => (
          <div key={index} className={`rounded-lg p-3 ${bin.bgColor} border border-opacity-20`} style={{ borderColor: bin.color }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: bin.color }}>
                {bin.name}
              </span>
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: bin.color }}></div>
            </div>
            <p className="text-xl font-bold text-gray-900">{bin.count}</p>
            <p className="text-xs text-gray-600">
              {bin.percentage.toFixed(1)}% of fleet
            </p>
            {bin.count > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                Avg: {(bin.avgRul / 24).toFixed(0)} days
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart */}
        <div className="bg-white rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Asset Count by Health Status</h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={distributionData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 11, fill: '#6b7280' }}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis 
                allowDecimals={false} 
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={{ stroke: '#d1d5db' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Number of Assets" radius={[4, 4, 0, 0]}>
                {distributionData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Radial Progress Chart */}
        <div className="bg-white rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Fleet Health Overview</h4>
          <ResponsiveContainer width="100%" height={250}>
            <RadialBarChart 
              cx="50%" 
              cy="50%" 
              innerRadius="30%" 
              outerRadius="80%" 
              barSize={20}
              data={distributionData.filter(d => d.count > 0)}
            >
              <RadialBar 
                label={{ position: 'insideStart', fill: '#fff', fontSize: 10 }}
                background 
                clockWise 
                dataKey="percentage" 
              >
                {distributionData.filter(d => d.count > 0).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </RadialBar>
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                iconSize={8}
                wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                formatter={(value, entry: any) => `${value} (${entry.payload?.count || 0})`}
              />
            </RadialBarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Fleet Statistics */}
      <div className="mt-6 bg-gradient-to-r from-gray-50 to-blue-50 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Fleet Statistics</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-gray-900">{totalAssets}</p>
            <p className="text-xs text-gray-600">Total Assets</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-blue-900">{(avgRul / 24).toFixed(0)}</p>
            <p className="text-xs text-gray-600">Avg Days Left</p>
          </div>
          <div>
            <p className={`text-2xl font-bold ${healthPercentage >= 70 ? 'text-green-700' : healthPercentage >= 40 ? 'text-yellow-700' : 'text-red-700'}`}>
              {healthPercentage.toFixed(0)}%
            </p>
            <p className="text-xs text-gray-600">Healthy Assets</p>
          </div>
          <div>
            <p className={`text-2xl font-bold ${
              distributionData[0]?.percentage <= 5 ? 'text-green-700' : 
              distributionData[0]?.percentage <= 15 ? 'text-yellow-700' : 'text-red-700'
            }`}>
              {distributionData[0]?.percentage.toFixed(0) || 0}%
            </p>
            <p className="text-xs text-gray-600">Critical Risk</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FleetRulDistributionChart;
