import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import Papa from 'papaparse';
import { predictRulForAsset } from '../lib/api';

const SEQUENCE_LENGTH = 50;

// Flexible mapping for CSV headers to the expected backend keys
// Keys are lowercase and stripped of spaces for matching, values are the backend model keys.
const headerMapping: { [key: string]: string } = {
  // x-direction variations
  'x_direction': 'x_direction',
  'xdirection': 'x_direction',
  'x direction': 'x_direction',
  'x-direction': 'x_direction',
  
  // y-direction variations
  'y_direction': 'y_direction',
  'ydirection': 'y_direction',
  'y direction': 'y_direction',
  'y-direction': 'y_direction',
  
  // bearing temperature variations
  'bearingtem': 'bearing_tem',
  'bearingtemp': 'bearing_tem',
  'bearing_tem': 'bearing_tem',
  'bearing_temp': 'bearing_tem',
  'bearing tem': 'bearing_tem',
  'bearing temp': 'bearing_tem',  // Explicit match for 'bearing tem'
  
  // environment temperature variations
  'envtemp': 'env_temp',
  'env_temp': 'env_temp',
  'env temp': 'env_temp',
  'environment temp': 'env_temp',
  'environmenttemp': 'env_temp'
};

interface SimulationResult {
  sequenceNumber: number;
  predictedRul?: number;
  error?: string;
}

const DataImportPage: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedData, setParsedData] = useState<any[] | null>(null);
  const [headerRow, setHeaderRow] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [assetIdForSim, setAssetIdForSim] = useState<string>('');
  const [simulationProgress, setSimulationProgress] = useState<string>('');
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [simulationResults, setSimulationResults] = useState<SimulationResult[]>([]); // To store results
  const [simulationAbortController, setSimulationAbortController] = useState<AbortController | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
      setParsedData(null);
      setError(null);
      setHeaderRow([]);
      setSimulationResults([]); // Reset results
      setSimulationError(null);
      setSimulationProgress('');
    }
  };

  const handleParseCsv = async () => {
    if (!selectedFile) {
      setError('Please select a CSV file first.');
      return;
    }
    setIsParsing(true);
    setError(null);
    setParsedData(null);
    setHeaderRow([]);

    Papa.parse(selectedFile, {
      header: true, // Assumes first row is header
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length) {
          setError(`Error parsing CSV: ${results.errors[0].message}`);
          setParsedData(null);
        } else {
          setHeaderRow(results.meta.fields || []);
          setParsedData(results.data);
        }
        setIsParsing(false);
      },
      error: (err) => {
        setError(`Failed to parse CSV: ${err.message}`);
        setIsParsing(false);
        setParsedData(null);
      }
    });
  };

  const transformRow = (row: any, csvHeaders: string[]): any | null => {
    console.log('Processing row:', row);
    console.log('Available headers:', csvHeaders);
    
    const transformed: any = {};
    const requiredBackendKeys = ['x_direction', 'y_direction', 'bearing_tem', 'env_temp'];

    for (const backendKey of requiredBackendKeys) { // e.g. backendKey = 'bearing_tem'
      let valueSuccessfullySetForBackendKey = false;

      // Attempt 1: Iterate through all patterns in headerMapping that could provide this backendKey
      // The keys of headerMapping are the patterns (e.g., 'bearingtem', 'bearing_temp')
      // The values of headerMapping are the target backend keys (e.g., 'bearing_tem')
      for (const patternFromHeaderMapping of Object.keys(headerMapping)) {
        if (headerMapping[patternFromHeaderMapping] === backendKey) { // If this pattern maps to the backendKey we need
          // Check if this pattern (e.g., 'bearingtem') exists in the actual csvHeaders (normalized)
          const normalizedPattern = patternFromHeaderMapping.toLowerCase().replace(/\s+/g, '');
          
          // Find the matching header (case-insensitive, space-insensitive)
          const actualCsvHeader = csvHeaders.find(h => {
            const normalizedHeader = h.toLowerCase().replace(/\s+/g, '');
            return normalizedHeader === normalizedPattern;
          });

          console.log(`Looking for ${patternFromHeaderMapping} (normalized to ${normalizedPattern}), found header: ${actualCsvHeader}`);

          if (actualCsvHeader && row[actualCsvHeader] !== undefined && row[actualCsvHeader] !== null && row[actualCsvHeader] !== '') {
            const val = parseFloat(row[actualCsvHeader]);
            if (!isNaN(val)) {
              transformed[backendKey] = val;
              valueSuccessfullySetForBackendKey = true;
              console.log(`✅ Set ${backendKey} to ${val} from header ${actualCsvHeader}`);
              break; // Value found for current backendKey using this pattern, stop checking other patterns for THIS backendKey
            } else {
              console.warn(`Could not parse value '${row[actualCsvHeader]}' as float for actual CSV header '${actualCsvHeader}' (matched by pattern '${patternFromHeaderMapping}' for target key '${backendKey}')`);
            }
          }
        }
      } // End loop over patterns in headerMapping

      if (valueSuccessfullySetForBackendKey) {
        continue; // Value for this backendKey was set, move to the next backendKey in the outer loop
      }

      // Attempt 2: Fallback - try direct match if CSV header was already the backendKey (e.g. CSV has 'bearing_tem')
      // This is useful if 'bearing_tem' itself is a CSV header but not listed as a *key* (pattern) in headerMapping,
      // or if it was a key but the value was unparsable/missing from the mapped column.
      if (row[backendKey] !== undefined && row[backendKey] !== null && row[backendKey] !== '') {
          const directVal = parseFloat(row[backendKey]);
          if (!isNaN(directVal)) {
              transformed[backendKey] = directVal;
              valueSuccessfullySetForBackendKey = true;
              console.log(`✅ Set ${backendKey} to ${directVal} from direct header match`);
          } else {
             console.warn(`Fallback for '${backendKey}': direct value '${row[backendKey]}' from CSV is not a valid float.`);
          }
      }

      // Check if, after all attempts, this backendKey was populated
      if (!valueSuccessfullySetForBackendKey) {
        console.error(`Required key '${backendKey}' could not be found or transformed from row:`, JSON.stringify(row), `using CSV headers:`, csvHeaders.join(', '));
        return null; // This row is invalid, cannot form a complete transformed object
      }
    } // End loop over requiredBackendKeys

    console.log('Transformed row:', transformed);
    return transformed; // If all requiredBackendKeys were successfully populated
  };

  const stopSimulation = () => {
    if (simulationAbortController) {
      simulationAbortController.abort();
      setSimulationAbortController(null);
      setIsSimulating(false);
      setSimulationProgress('Simulation stopped by user.');
    }
  };

  const handleStartSimulation = async () => {
    if (!parsedData || parsedData.length < SEQUENCE_LENGTH) {
      setError(`Not enough data to form a sequence. Need at least ${SEQUENCE_LENGTH} rows.`);
      return;
    }
    if (!assetIdForSim.trim()) {
      setError('Please enter an Asset ID for the simulation.');
      return;
    }

    // Create new abort controller for this simulation
    const abortController = new AbortController();
    setSimulationAbortController(abortController);

    setIsSimulating(true);
    setError(null);
    setSimulationError(null);
    setSimulationProgress('Starting simulation...');
    setSimulationResults([]);
    const currentSimulationResults: SimulationResult[] = [];

    const numSequences = Math.floor(parsedData.length / SEQUENCE_LENGTH);

    try {
      for (let i = 0; i < numSequences; i++) {
        // Check if simulation was aborted
        if (abortController.signal.aborted) {
          throw new Error('Simulation stopped by user');
        }

        const sequenceStartIndex = i * SEQUENCE_LENGTH;
        const sequenceEndIndex = sequenceStartIndex + SEQUENCE_LENGTH;
        const rawSequence = parsedData.slice(sequenceStartIndex, sequenceEndIndex);
        
        setSimulationProgress(`Processing sequence ${i + 1} of ${numSequences}...`);

        // Transform each row in the sequence
        const transformedRows = [];
        for (let j = 0; j < rawSequence.length; j++) {
          const row = rawSequence[j];
          const transformedRow = transformRow(row, headerRow);
          if (transformedRow === null) {
            console.error(`Could not transform row ${j} in sequence ${i + 1}`);
            continue;
          }
          transformedRows.push(transformedRow);
        }

        // Check if we have enough transformed rows
        if (transformedRows.length !== SEQUENCE_LENGTH) {
          const errorMsg = `Sequence ${i + 1} is incomplete after transformation (expected ${SEQUENCE_LENGTH}, got ${transformedRows.length}). Check CSV data and headers.`;
          console.error(errorMsg);
          setSimulationError(errorMsg);
          currentSimulationResults.push({ sequenceNumber: i + 1, error: errorMsg });
          setSimulationResults([...currentSimulationResults]);
          continue;
        }

        try {
          console.log(`Sending sequence ${i + 1} with ${transformedRows.length} rows`);
          console.log('First row:', transformedRows[0]);
          
          const predictionResponse = await predictRulForAsset(assetIdForSim, transformedRows);
          console.log(`Prediction for sequence ${i + 1}:`, predictionResponse);
          currentSimulationResults.push({ 
            sequenceNumber: i + 1, 
            predictedRul: predictionResponse.predicted_rul 
          });
          setSimulationResults([...currentSimulationResults]);

          if (i < numSequences - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (err: any) {
          console.error(`Error simulating sequence ${i + 1}:`, err);
          const errorMsg = `Sequence ${i + 1}: ${err.message || 'Failed to get prediction.'}`;
          setSimulationError(errorMsg);
          currentSimulationResults.push({ sequenceNumber: i + 1, error: errorMsg });
          setSimulationResults([...currentSimulationResults]);
        }
      }
      setSimulationProgress(`Simulation finished. Processed ${numSequences} sequences.`);
    } catch (err: any) {
      if (err.message === 'Simulation stopped by user') {
        setSimulationProgress('Simulation stopped by user.');
      } else {
        setSimulationError(`Simulation failed: ${err.message}`);
        setSimulationProgress('Simulation failed.');
      }
    } finally {
      setIsSimulating(false);
      setSimulationAbortController(null);
    }
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
          <h2 className="text-xl font-semibold text-gray-700 mb-3">1. Upload CSV File</h2>
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

        {parsedData && parsedData.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-700 mb-3">2. Configure Simulation</h2>
            <div className="mb-4">
              <label htmlFor="asset-id-sim" className="block text-sm font-medium text-gray-700 mb-1">
                Asset ID for Simulation
              </label>
              <input
                type="text"
                id="asset-id-sim"
                value={assetIdForSim}
                onChange={(e) => setAssetIdForSim(e.target.value)}
                placeholder="Enter Asset ID (e.g., a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11)"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                disabled={isSimulating}
              />
            </div>

            <h3 className="text-lg font-semibold text-gray-700 mb-2 mt-6">Parsed Data Preview (First 10 Rows)</h3>
            <div className="bg-gray-50 p-4 rounded-md max-h-96 overflow-auto mb-4">
              {parsedData.length > 0 ? (
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      {headerRow.map((header, index) => (
                        <th key={index} scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {parsedData.slice(0, 10).map((row, rowIndex) => ( // Show first 10 rows
                      <tr key={rowIndex}>
                        {headerRow.map((header, colIndex) => (
                          <td key={colIndex} className="px-3 py-2 whitespace-nowrap">
                            {row[header]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>No data rows found in CSV.</p>
              )}
            </div>
            {parsedData.length > 10 && (
              <p className="text-xs text-gray-500 mb-4">Showing first 10 rows of {parsedData.length} total rows.</p>
            )}
            <div className="flex gap-4 items-center">
              <button
                onClick={handleStartSimulation}
                disabled={isSimulating || !parsedData || parsedData.length < SEQUENCE_LENGTH || !assetIdForSim.trim()}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 transition-colors"
              >
                {isSimulating ? 'Simulating...' : `Start Simulation (${Math.floor((parsedData?.length || 0) / SEQUENCE_LENGTH)} sequences)`}
              </button>
              {isSimulating && (
                <button
                  onClick={stopSimulation}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                >
                  Stop Simulation
                </button>
              )}
            </div>

            {simulationProgress && <p className="text-blue-600 mt-2 text-sm">{simulationProgress}</p>}
            {simulationError && <p className="text-red-500 mt-2 text-sm">Last Error: {simulationError}</p>}

            {simulationResults.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-gray-700 mb-2">Simulation Results</h3>
                <div className="bg-gray-50 p-4 rounded-md max-h-96 overflow-auto">
                  <ul className="divide-y divide-gray-200">
                    {simulationResults.map((result) => (
                      <li key={result.sequenceNumber} className="py-2">
                        <span className="font-medium">Sequence {result.sequenceNumber}:</span>
                        {result.predictedRul !== undefined && (
                          <span className="ml-2 text-green-700">Predicted RUL: {result.predictedRul.toFixed(2)}</span>
                        )}
                        {result.error && (
                          <span className="ml-2 text-red-700">Error: {result.error}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </motion.div>
  );
};

export default DataImportPage;
