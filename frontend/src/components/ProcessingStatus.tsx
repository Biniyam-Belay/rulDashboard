import React from 'react';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';

interface ProcessingStatusProps {
  currentSequence: number;
  totalSequences: number;
  isProcessing: boolean;
  completedSequences: number;
  errorSequences: number;
}

const ProcessingStatus: React.FC<ProcessingStatusProps> = ({
  currentSequence,
  totalSequences,
  isProcessing,
  completedSequences,
  errorSequences
}) => {
  const progressPercentage = totalSequences > 0 ? (currentSequence / totalSequences) * 100 : 0;
  const successRate = currentSequence > 0 ? (completedSequences / currentSequence) * 100 : 0;

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Processing Status</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Progress Circle */}
        <div className="flex flex-col items-center">
          <div className="w-32 h-32 mb-4">
            <CircularProgressbar
              value={progressPercentage}
              text={`${Math.round(progressPercentage)}%`}
              styles={buildStyles({
                textColor: '#374151',
                pathColor: isProcessing ? '#2563eb' : '#10b981',
                trailColor: '#e5e7eb',
              })}
            />
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-600">Overall Progress</p>
            <p className="text-lg font-semibold text-gray-800">
              {currentSequence} / {totalSequences} sequences
            </p>
          </div>
        </div>

        {/* Statistics */}
        <div className="space-y-4">
          <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
            <span className="text-sm font-medium text-green-700">Successful</span>
            <span className="text-lg font-semibold text-green-700">{completedSequences}</span>
          </div>
          
          <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
            <span className="text-sm font-medium text-red-700">Errors</span>
            <span className="text-lg font-semibold text-red-700">{errorSequences}</span>
          </div>
          
          <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
            <span className="text-sm font-medium text-blue-700">Success Rate</span>
            <span className="text-lg font-semibold text-blue-700">{successRate.toFixed(1)}%</span>
          </div>
          
          <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
            <span className="text-sm font-medium text-gray-700">Status</span>
            <span className={`text-sm font-semibold ${isProcessing ? 'text-blue-600' : 'text-green-600'}`}>
              {isProcessing ? 'Processing...' : 'Complete'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProcessingStatus;
