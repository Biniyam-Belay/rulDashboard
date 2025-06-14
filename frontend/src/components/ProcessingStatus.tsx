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
      <h3 className="text-lg font-semibold text-[#333333] mb-4">Processing Status</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Progress Circle */}
        <div className="flex flex-col items-center">
          <div className="w-32 h-32 mb-4">
            <CircularProgressbar
              value={progressPercentage}
              text={`${Math.round(progressPercentage)}%`}
              styles={buildStyles({
                textColor: '#333333',
                pathColor: isProcessing ? '#D4FF6D' : '#E0D9FF',
                trailColor: '#F7F7F7',
              })}
            />
          </div>
          <div className="text-center">
            <p className="text-sm text-[#8A8A8A]">Overall Progress</p>
            <p className="text-lg font-semibold text-[#333333]">
              {currentSequence} / {totalSequences} sequences
            </p>
          </div>
        </div>

        {/* Statistics */}
        <div className="space-y-4">
          <div className="flex justify-between items-center p-3 bg-[#D4FF6D] rounded-lg">
            <span className="text-sm font-medium text-[#1E1E2D]">Successful</span>
            <span className="text-lg font-semibold text-[#1E1E2D]">{completedSequences}</span>
          </div>
          
          <div className="flex justify-between items-center p-3 bg-[#E0D9FF] rounded-lg">
            <span className="text-sm font-medium text-[#1E1E2D]">Errors</span>
            <span className="text-lg font-semibold text-[#1E1E2D]">{errorSequences}</span>
          </div>
          
          <div className="flex justify-between items-center p-3 bg-[#D4EFFF] rounded-lg">
            <span className="text-sm font-medium text-[#1E1E2D]">Success Rate</span>
            <span className="text-lg font-semibold text-[#1E1E2D]">{successRate.toFixed(1)}%</span>
          </div>
          
          <div className="flex justify-between items-center p-3 bg-[#F7F7F7] rounded-lg">
            <span className="text-sm font-medium text-[#8A8A8A]">Status</span>
            <span className={`text-sm font-semibold ${isProcessing ? 'text-[#D4FF6D]' : 'text-[#333333]'}`}>
              {isProcessing ? 'Processing...' : 'Complete'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProcessingStatus;
