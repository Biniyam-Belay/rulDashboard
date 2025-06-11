import React from 'react';

interface FeatureImportanceDisplayProps {
  assetId: string | undefined;
  // In the future, this would take feature importance data as a prop
  // e.g., importanceData: Array<{ feature: string; importance: number }> | null;
}

const FeatureImportanceDisplay: React.FC<FeatureImportanceDisplayProps> = ({ assetId }) => {
  // Placeholder content
  // const { data: importanceData, isLoading, error } = useFeatureImportance(assetId); // Example hook

  // if (isLoading) return <p>Loading feature importance...</p>;
  // if (error) return <p className="text-red-500">Could not load feature importance.</p>;
  // if (!importanceData || importanceData.length === 0) return <p>No feature importance data available.</p>;

  return (
    <div className="bg-white shadow-md rounded-lg p-6">
      <h3 className="text-xl font-semibold text-gray-800 mb-4">Feature Importance (SHAP/LIME)</h3>
      <p className="text-gray-600">
        This section will display feature importance scores (e.g., from SHAP or LIME analysis)
        for the latest RUL prediction of this asset.
      </p>
      <p className="text-gray-600 mt-2">
        This feature requires integration with SHAP/LIME analysis in the model service backend.
      </p>
      {/* 
      Placeholder for actual display, e.g., a bar chart or a list:
      <div className="mt-4">
        {importanceData.map(item => (
          <div key={item.feature} className="flex justify-between py-1">
            <span className="text-sm text-gray-700">{item.feature}</span>
            <span className="text-sm font-medium text-blue-600">{item.importance.toFixed(3)}</span>
          </div>
        ))}
      </div>
      */}
    </div>
  );
};

export default FeatureImportanceDisplay;
