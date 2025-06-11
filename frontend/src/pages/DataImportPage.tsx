import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

const DataImportPage: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedData, setParsedData] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
      setParsedData(null);
      setError(null);
    }
  };

  const handleParseCsv = async () => {
    if (!selectedFile) {
      setError('Please select a CSV file first.');
      return;
    }
    // Placeholder for CSV parsing logic
    setIsParsing(true);
    setError(null);
    console.log('Parsing CSV file:', selectedFile.name);
    // Simulate parsing delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    // In a real scenario, you'd use a library like PapaParse here
    // For now, let's just show a success message
    setParsedData([{ message: 'CSV parsing will be implemented here.' }]);
    setIsParsing(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-gray-100 p-4 sm:p-6 lg:p-8"
    >
      <div className="max-w-4xl mx-auto bg-white shadow-xl rounded-lg p-6 md:p-8">
        <header className="mb-6 flex justify-between items-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Import Sensor Data</h1>
          <Link to="/" className="text-blue-600 hover:text-blue-800 transition-colors">
            &larr; Back to Dashboard
          </Link>
        </header>

        <section className="mb-6">
          <h2 className="text-xl font-semibold text-gray-700 mb-3">Upload CSV File</h2>
          <div className="mb-4">
            <label htmlFor="csv-upload" className="block text-sm font-medium text-gray-700 mb-1">
              Select CSV file
            </label>
            <input
              type="file"
              id="csv-upload"
              accept=".csv"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>
          {selectedFile && (
            <p className="text-sm text-gray-600 mb-3">Selected file: {selectedFile.name}</p>
          )}
          <button
            onClick={handleParseCsv}
            disabled={!selectedFile || isParsing}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
          >
            {isParsing ? 'Parsing...' : 'Parse CSV'}
          </button>
          {error && <p className="text-red-500 mt-2 text-sm">{error}</p>}
        </section>

        {parsedData && (
          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-700 mb-3">Parsed Data Preview (Placeholder)</h2>
            <div className="bg-gray-50 p-4 rounded-md max-h-96 overflow-auto">
              <pre className="text-sm">{JSON.stringify(parsedData, null, 2)}</pre>
            </div>
            {/* Further actions like "Start Simulation" or "Send to Backend" would go here */}
          </section>
        )}
      </div>
    </motion.div>
  );
};

export default DataImportPage;
