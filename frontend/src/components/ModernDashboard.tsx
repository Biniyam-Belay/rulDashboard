"use client"

import type React from "react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  BarChart3, Bell, Settings, Search, Upload, Database, Shield, MoreHorizontal,
  Activity, AlertTriangle, CheckCircle, PlayCircle, StopCircle, Clock, TrendingUp,
  ChevronDown, ChevronUp // Added ChevronDown and ChevronUp
} from 'lucide-react'

// import { useAssetsWithLatestRul, predictRulForAssetBulk, predictRulForAssetBulkFast } from '@/lib/api'; // Removed this duplicate
import Papa from 'papaparse'; // Added PapaParse for CSV
import {
  Card,
  CardContent,
  CardDescription,
  // CardFooter, // Removed unused import
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
// import { Progress } from "@/components/ui/progress"; // Removed unused import
import { Button } from "@/components/ui/button";
import RealTimeProgressChart from "./RealTimeProgressChart"; // Corrected import to default
import { useAssetsWithLatestRul, predictRulForAssetBulkFast, predictRulForAssetBulk } from "@/lib/api"; // Consolidated API imports
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Badge } from "@/components/ui/badge"; // Added Badge import
import { Input } from "@/components/ui/input"; // Added Input import
import { Avatar, AvatarFallback } from "@/components/ui/avatar"; // Added Avatar imports
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Added Select imports

const DashboardPage = () => {
  // Fetch real asset data
  const { data: assets, isLoading: assetsLoading, error: assetsError } = useAssetsWithLatestRul();

  const navigate = useNavigate();

  // Calculate KPIs based on fetched data
  const totalAssets = assets?.length ?? 0;
  const criticalAssets = assets?.filter(a => (a.latest_rul ?? Infinity) <= 20000).length ?? 0;
  const warningAssets = assets?.filter(a => (a.latest_rul ?? Infinity) > 20000 && (a.latest_rul ?? 0) <= 60000).length ?? 0;
  const healthyAssets = assets?.filter(a => (a.latest_rul ?? 0) > 60000).length ?? 0;
  const avgRul = assets && totalAssets > 0 ? Math.round(assets.reduce((sum, a) => sum + (a.latest_rul ?? 0), 0) / totalAssets) : 0;

  const fleetRulChartData = assets
    ?.slice(0, 5) // Take the first 5 assets for the chart
    .map(asset => ({
      name: `Asset ${String(asset.id).substring(0, 6)}...`, // Ensure asset.id is a string
      RUL: asset.latest_rul ?? 0, // Use latest_rul, defaulting to 0 if null
    })) || [];

  // CSV Processing States
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedData, setParsedData] = useState<any[] | null>(null);
  const [headerRow, setHeaderRow] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [assetIdForSim, setAssetIdForSim] = useState<string>(''); // For CSV processing context
  const [simulationProgressText, setSimulationProgressText] = useState<string>(''); // For text updates
  const [simulationResults, setSimulationResults] = useState<Array<{
    sequenceNumber: number;
    predictedRul: number;
    timestamp: string;
    error?: string;
  }>>([]);
  const [currentSequence, setCurrentSequence] = useState(0); // Will be used in simulation
  const [totalSequences, setTotalSequences] = useState(0);
  const [simulationAbortController, setSimulationAbortController] = useState<AbortController | null>(null); // Will be used
  const [batchSize, setBatchSize] = useState(30); // Restored setBatchSize
  const [processingMode, setProcessingMode] = useState<'fast' | 'standard'>('fast'); // Restored setProcessingMode
  const [processingStartTime, setProcessingStartTime] = useState<number | null>(null); // Will be used
  const [droppedRowCount, setDroppedRowCount] = useState<number>(0);
  const [skippedSequenceCount, setSkippedSequenceCount] = useState<number>(0);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [showValidationDetails, setShowValidationDetails] = useState<boolean>(false); // New state for collapsibility

  const SEQUENCE_LENGTH = 50;

  // Type definition for the result of transformRow
  type TransformRowResult = 
    | { success: true; data: { [key: string]: number } } 
    | { success: false; error: string };

  const headerMapping: { [key: string]: string } = { 
    'x_direction': 'x_direction',
    'y_direction': 'y_direction',
    'bearing_temperature': 'bearing_temperature',
    'env_temperature': 'env_temperature',
    'x': 'x_direction', // alias
    'y': 'y_direction', // alias
    'bearing_temp': 'bearing_temperature', // alias
    'env_temp': 'env_temperature', // alias
    'x direction': 'x_direction', // with space
    'y direction': 'y_direction', // with space
    'bearing temp': 'bearing_temperature', // with space
    'env temp': 'env_temperature', // with space
  };

  // Required keys for the backend model - kept for transformRow
  const requiredBackendKeys = ['x_direction', 'y_direction', 'bearing_temperature', 'env_temperature'];

  const transformRow = (
    row: any, 
    csvHeaders: string[], 
    originalCsvRowNumber: number // Added for detailed error messages
  ): TransformRowResult => {
    const transformed: any = {};
    const lowerCsvHeaders = csvHeaders.map(h => h.toLowerCase().trim());

    for (const backendKey of requiredBackendKeys) {
      let mappedCsvHeader: string | null = null;
      let headerIndex = -1;

      // 1. Try to find the CSV header using headerMapping
      for (const csvAlias in headerMapping) {
        if (headerMapping[csvAlias] === backendKey) {
          const tempIndex = lowerCsvHeaders.indexOf(csvAlias.toLowerCase());
          if (tempIndex !== -1) {
            headerIndex = tempIndex;
            mappedCsvHeader = csvHeaders[headerIndex];
            break;
          }
        }
      }

      // 2. If not found via mapping, try direct match for backendKey
      if (headerIndex === -1) {
        const directMatchIndex = lowerCsvHeaders.indexOf(backendKey.toLowerCase());
        if (directMatchIndex !== -1) {
          headerIndex = directMatchIndex;
          mappedCsvHeader = csvHeaders[headerIndex];
        }
      }

      // 3. If header is still not found for this backendKey
      if (headerIndex === -1 || !mappedCsvHeader) {
        const expectedMappings = Object.keys(headerMapping)
          .filter(k => headerMapping[k] === backendKey)
          .map(k => `'${k}'`)
          .join(' or ');
        const expectation = expectedMappings ? `${expectedMappings} or '${backendKey}'` : `'${backendKey}'`;
        return { 
          success: false, 
          error: `Row ${originalCsvRowNumber}: Required column for sensor reading '${backendKey}' (expected as ${expectation}) not found in CSV. Available CSV headers: [${csvHeaders.join(', ')}]` 
        };
      }

      // 4. Header found (mappedCsvHeader), now validate its value
      const valStr = row[mappedCsvHeader];

      if (valStr === undefined || valStr === null) {
        return { 
          success: false, 
          error: `Row ${originalCsvRowNumber}: Value for column '${mappedCsvHeader}' (for sensor '${backendKey}') is missing.` 
        };
      }

      const sValTrimmed = String(valStr).trim();
      if (sValTrimmed === '') {
        return { 
          success: false, 
          error: `Row ${originalCsvRowNumber}: Value for column '${mappedCsvHeader}' (for sensor '${backendKey}') is empty.` 
        };
      }

      const valNum = parseFloat(sValTrimmed);
      if (isNaN(valNum)) {
        return { 
          success: false, 
          error: `Row ${originalCsvRowNumber}: Value '${sValTrimmed}' in column '${mappedCsvHeader}' (for sensor '${backendKey}') is not a valid number.` 
        };
      }
      
      transformed[backendKey] = valNum;
    }
    return { success: true, data: transformed };
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
      setParsedData(null);
      setUploadError(null);
      setHeaderRow([]);
      setSimulationResults([]);
      setCurrentSequence(0);
      setTotalSequences(0);
      setSimulationProgressText('');
    }
  };

  // Renamed from handleStartProcessing to avoid conflict with the old mock function
  const handleStartSimulation = async () => { 
    if (!parsedData || parsedData.length === 0) { // Check for empty parsedData too
      setUploadError('No data to process. Please upload and parse a CSV file.');
      return;
    }
    // Basic Asset ID check, can be made more robust
    if (!assetIdForSim.trim()) {
      setUploadError('Please enter an Asset ID for the simulation.');
      return;
    }

    const abortController = new AbortController();
    setSimulationAbortController(abortController);

    setIsProcessing(true);
    // setUploadError(null); // Clear general errors when starting simulation, specific validation UI will handle data issues
    setSimulationResults([]);
    setCurrentSequence(0);
    setProcessingStartTime(Date.now());
    setDroppedRowCount(0); 
    setSkippedSequenceCount(0); 
    setValidationWarnings([]); 

    setSimulationProgressText('Validating CSV data...');

    const validTransformedDataForSequences: Array<{ [key: string]: number }> = [];
    const currentValidationWarnings: string[] = [];
    let currentDroppedRowCount = 0;

    for (let i = 0; i < parsedData.length; i++) {
      const currentRow = parsedData[i];
      const csvRowNumber = i + 2; // 1-based for file, +1 for header
      const transformOutcome = transformRow(currentRow, headerRow, csvRowNumber);

      if (transformOutcome.success) {
        validTransformedDataForSequences.push(transformOutcome.data);
      } else {
        currentDroppedRowCount++;
        if (transformOutcome.error) {
          currentValidationWarnings.push(transformOutcome.error);
        } else {
          currentValidationWarnings.push(`Row ${csvRowNumber}: Dropped for an unspecified reason.`);
        }
      }
    }

    setDroppedRowCount(currentDroppedRowCount);
    setValidationWarnings(currentValidationWarnings);

    const actualSequences: Array<Array<{ [key: string]: number }>> = [];
    for (let i = 0; (i + SEQUENCE_LENGTH) <= validTransformedDataForSequences.length; i += SEQUENCE_LENGTH) {
      actualSequences.push(validTransformedDataForSequences.slice(i, i + SEQUENCE_LENGTH));
    }
    
    const numPotentialSequencesFromRaw = Math.floor(parsedData.length / SEQUENCE_LENGTH);
    const numActualFormedSequences = actualSequences.length;
    
    setTotalSequences(numActualFormedSequences);
    // Make sure to use the state setter for skippedSequenceCount
    const currentSkippedSequenceCount = numPotentialSequencesFromRaw - numActualFormedSequences;
    setSkippedSequenceCount(currentSkippedSequenceCount);


    if (numActualFormedSequences === 0) {
      // Detailed validation UI will show droppedRowCount, skippedSequenceCount, validationWarnings.
      // No need for a redundant uploadError if these states are populated.
      setUploadError(null); 
      setIsProcessing(false);
      setSimulationProgressText('Simulation stopped: Not enough valid data to form sequences.');
      return;
    }
    
    setUploadError(null); // Clear any previous error if data is valid for processing.
    setSimulationProgressText(
      `Data validation complete. Dropped ${currentDroppedRowCount} row(s). ${numActualFormedSequences} sequences formed. ${currentSkippedSequenceCount} potential sequence(s) skipped. Starting processing...`
    );

    const BATCH_SIZE = batchSize; 
    const batches = [];
    for (let i = 0; i < numActualFormedSequences; i += BATCH_SIZE) {
      const batchEnd = Math.min(i + BATCH_SIZE, numActualFormedSequences);
      batches.push({ start: i, end: batchEnd });
    }

    try {
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        if (abortController.signal.aborted) {
          throw new Error('Simulation stopped by user');
        }

        const batch = batches[batchIndex];
        setSimulationProgressText(`Processing batch ${batchIndex + 1} of ${batches.length} (sequences ${batch.start + 1}-${batch.end} of ${numActualFormedSequences})...`);
        
        const sequencesForThisBatch = actualSequences.slice(batch.start, batch.end);
        
        const metadataForThisBatch: Array<{ sequenceNumber: number }> = [];
        for (let k = 0; k < sequencesForThisBatch.length; k++) {
            const overallSequenceIndex = batch.start + k;
            metadataForThisBatch.push({ sequenceNumber: overallSequenceIndex + 1 });
        }

        if (sequencesForThisBatch.length > 0) {
          try {
            const bulkResponse = processingMode === 'fast'
              ? await predictRulForAssetBulkFast(assetIdForSim, sequencesForThisBatch)
              : await predictRulForAssetBulk(assetIdForSim, sequencesForThisBatch);

            const { predictions } = bulkResponse.data; 

            const newResults = predictions.map((prediction: any, indexInBatch: number) => {
              const metadata = metadataForThisBatch[indexInBatch];
              return {
                sequenceNumber: metadata.sequenceNumber, 
                predictedRul: prediction.predicted_rul > 0 ? Math.round(prediction.predicted_rul) : 0,
                timestamp: new Date().toISOString(),
                error: prediction.error 
              };
            });

            setSimulationResults(prev => [...prev, ...newResults]);
            setCurrentSequence(prevCurrent => prevCurrent + sequencesForThisBatch.length);

            if (processingStartTime) {
              const elapsedSeconds = (Date.now() - processingStartTime) / 1000;
              // Use the updated currentSequence value for rate calculation
              const currentTotalProcessedSequences = currentSequence + sequencesForThisBatch.length; 
              if (elapsedSeconds > 0) {
                const rate = currentTotalProcessedSequences / elapsedSeconds;
                console.log(`Current processing rate: ${Math.round(rate * 10) / 10} sequences/sec`);
              }
            }

          } catch (error: any) {
            console.error('Bulk processing API error:', error);
            const errorMsg = error.response?.data?.detail || error.message || 'Unknown API error';
            const errorResults = metadataForThisBatch.map(metadata => ({
              sequenceNumber: metadata.sequenceNumber,
              predictedRul: 0,
              timestamp: new Date().toISOString(),
              error: `API Error for sequence ${metadata.sequenceNumber}: ${errorMsg}`
            }));
            setSimulationResults(prev => [...prev, ...errorResults]);
            setUploadError(`Bulk processing failed for batch ${batchIndex + 1}: ${errorMsg}`);
          }
        }
      }

      setSimulationProgressText(`Simulation finished. Processed ${currentSequence} of ${numActualFormedSequences} sequences.`);
    } catch (err: any) {
      if (err.message === 'Simulation stopped by user') {
        setSimulationProgressText('Simulation stopped by user.');
        setUploadError(null); // Clear error as it's a user action
      } else {
        setUploadError(`Simulation failed: ${err.message}`);
        setSimulationProgressText('Simulation failed.');
      }
    } finally {
      setIsProcessing(false);
      setSimulationAbortController(null);
      // Reset processing start time for next run if needed, or keep for overall stats
      // setProcessingStartTime(null);\ 
    }
  };

  const stopSimulation = () => {
    if (simulationAbortController) {
      simulationAbortController.abort();
      // setIsProcessing(false); // Already handled in finally block of handleStartSimulation
      // setSimulationProgressText('Simulation stopping...'); // User sees this from abort signal
    }
  };

  const handleParseCsv = async () => {
    if (!selectedFile) {
      setUploadError('Please select a CSV file first.');
      return;
    }
    setIsParsing(true);
    setUploadError(null);
    setParsedData(null);
    setHeaderRow([]);
    setSimulationProgressText('Parsing CSV...');

    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results: Papa.ParseResult<any>) => { // Added type for results
        if (results.errors.length) {
          setUploadError(`Error parsing CSV: ${results.errors.map((e: Papa.ParseError) => e.message).join(', ')}`); // Added type for e
          setParsedData(null);
          setSimulationProgressText('CSV parsing failed.');
        } else {
          const validFields = (results.meta.fields || []).filter(field => field && field.trim() !== ''); // Kept as is, field type inferred
          setHeaderRow(validFields);
          
          const cleanData = results.data.map((row: any) => {
            const cleanRow: any = {};
            for (const key in row) {
              if (key && key.trim() !== '') {
                cleanRow[key.trim()] = row[key];
              }
            }
            return cleanRow;
          });
          setParsedData(cleanData as any[]);
          const numSequences = Math.floor((cleanData?.length || 0) / SEQUENCE_LENGTH);
          setTotalSequences(numSequences);
          setSimulationProgressText(`CSV parsed. ${cleanData.length} rows, ${numSequences} sequences found.`);
        }
        setIsParsing(false);
      },
      error: (err: any) => {
        setUploadError(`Failed to parse CSV: ${err.message}`);
        setIsParsing(false);
        setParsedData(null);
        setSimulationProgressText('CSV parsing failed.');
      }
    });
  };

  if (assetsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F8F9FB]">
        <Activity className="h-16 w-16 animate-spin text-blue-500" />
        <span className="ml-4 text-xl text-gray-700">Loading dashboard data...</span>
      </div>
    );
  }

  if (assetsError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#F8F9FB] p-4">
        <AlertTriangle className="h-16 w-16 text-red-500" />
        <span className="mt-4 text-xl text-red-700">Error loading asset data</span>
        <p className="text-gray-600 mt-2">{(assetsError as Error)?.message || "Please try refreshing the page."}</p>
        <Button onClick={() => window.location.reload()} className="mt-4">Refresh</Button>
      </div>
    );
  }
  
  // Ensure assets is not null/undefined before using it for calculations or rendering
  if (!assets) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#F8F9FB] p-4">
        <AlertTriangle className="h-16 w-16 text-yellow-500" />
        <span className="mt-4 text-xl text-yellow-700">No asset data available</span>
        <p className="text-gray-600 mt-2">Could not retrieve asset information at this time.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FB]">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <BarChart3 className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">RUL Analytics</h1>
              <p className="text-sm text-gray-500">Predictive Maintenance Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="gap-2">
              <Search className="h-4 w-4" />
              Search
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <Bell className="h-4 w-4" />
              Alerts
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Main Balance Card - Inspired by the image */}
        <Card className="bg-white rounded-2xl shadow-sm border-0 overflow-hidden">
          <CardContent className="p-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <p className="text-sm text-gray-500 mb-1">Total Asset Health Score</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-gray-900">
                    {totalAssets > 0 ? ((healthyAssets * 100 + warningAssets * 60 + criticalAssets * 20) / totalAssets).toFixed(1) : "0.0"}
                  </span>
                  <span className="text-lg text-gray-500">/ 100</span>
                  {/* <Badge className="bg-green-100 text-green-700 border-0 ml-2">+2.4%</Badge> */} {/* Commented out as avgRul related element is removed */}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  Income
                </Button>
                <Button variant="outline" size="sm">
                  Expenses
                </Button>
              </div>
            </div>

            {/* Chart Area - Simplified for demo */}
            <div className="h-64 bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl flex items-center justify-center mb-6">
              <div className="text-center w-full px-4"> {/* Added w-full and px-4 for better chart fitting */}
                <p className="text-sm text-gray-500">Fleet RUL Overview (Top 5 Assets)</p>
                {/* <div className="text-2xl font-bold">$125,430</div> Removed placeholder financial data */}
                {/* <p className="text-xs text-muted-foreground">
                      +12% from last month
                </p> Removed placeholder financial data */}
                <div className="h-[180px]"> {/* Increased height for better visibility */}
                      <ResponsiveContainer width="100%" height="100%">
                        {/* ... existing commented out LineChart ... */}
                        <BarChart data={fleetRulChartData}> {/* Changed data source to fleetRulChartData */}
                          <XAxis dataKey="name" angle={-15} textAnchor="end" interval={0} tick={{ fontSize: 10 }} /> {/* Adjusted XAxis for readability */}
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: '12px' }} />
                          <Bar dataKey="RUL" fill="#8884d8" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
              </div>
            </div>

            {/* Quick Actions - Inspired by the image */}
            <div className="grid grid-cols-6 gap-4">
              {[
                { icon: Upload, label: "Upload", color: "bg-blue-100 text-blue-600" },
                { icon: Database, label: "Data", color: "bg-purple-100 text-purple-600" },
                { icon: BarChart3, label: "Analytics", color: "bg-green-100 text-green-600" },
                { icon: Shield, label: "Security", color: "bg-orange-100 text-orange-600" },
                { icon: Settings, label: "Settings", color: "bg-gray-100 text-gray-600" },
                { icon: MoreHorizontal, label: "More", color: "bg-indigo-100 text-indigo-600" },
              ].map((action, index) => (
                <Button key={index} variant="ghost" className="h-16 flex-col gap-2 hover:bg-gray-50">
                  <div className={`h-8 w-8 rounded-lg ${action.color} flex items-center justify-center`}>
                    <action.icon className="h-4 w-4" />
                  </div>
                  <span className="text-xs text-gray-600">{action.label}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - KPI Cards */}
          <div className="lg:col-span-2 space-y-6">
            {/* KPI Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-white rounded-xl shadow-sm border-0">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Database className="h-4 w-4 text-blue-600" />
                    </div>
                    {/* <Badge variant="secondary" className="text-xs"> 
                      +12% 
                    </Badge> */}
                  </div>
                  <div className="space-y-1">
                    <p className="text-2xl font-bold text-gray-900">{totalAssets}</p>
                    <p className="text-xs text-gray-500">Total Assets</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white rounded-xl shadow-sm border-0">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="h-8 w-8 rounded-lg bg-red-100 flex items-center justify-center">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                    </div>
                    <Badge variant="destructive" className="text-xs">
                      {totalAssets > 0 ? ((criticalAssets / totalAssets) * 100).toFixed(0) : 0}%
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-2xl font-bold text-gray-900">{criticalAssets}</p>
                    <p className="text-xs text-gray-500">Critical</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white rounded-xl shadow-sm border-0">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="h-8 w-8 rounded-lg bg-yellow-100 flex items-center justify-center">
                      <Clock className="h-4 w-4 text-yellow-600" />
                    </div>
                    <Badge className="bg-yellow-100 text-yellow-700 text-xs">
                      {totalAssets > 0 ? ((warningAssets / totalAssets) * 100).toFixed(0) : 0}%
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-2xl font-bold text-gray-900">{warningAssets}</p>
                    <p className="text-xs text-gray-500">Warning</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white rounded-xl shadow-sm border-0">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="h-8 w-8 rounded-lg bg-green-100 flex items-center justify-center">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    </div>
                    <Badge className="bg-green-100 text-green-700 text-xs">
                      {totalAssets > 0 ? ((healthyAssets / totalAssets) * 100).toFixed(0) : 0}%
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-2xl font-bold text-gray-900">{healthyAssets}</p>
                    <p className="text-xs text-gray-500">Healthy</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Processing Card - RUL Simulation */}
            <Card className="bg-white rounded-xl shadow-sm border-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-xl font-semibold flex items-center">
                  <Upload className="h-5 w-5 mr-2 text-blue-600" />
                  RUL Simulation via CSV Upload
                </CardTitle>
                <CardDescription>
                  Upload sensor data, specify an asset ID, and run RUL predictions.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* File Upload */}
                <div className="space-y-2">
                  <label htmlFor="csv-upload" className="text-sm font-medium text-gray-700">
                    Upload CSV File
                  </label>
                  <div className="flex items-center space-x-2">
                    <Input
                      id="csv-upload"
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      className="flex-grow"
                    />
                    <Button onClick={handleParseCsv} disabled={!selectedFile || isParsing} variant="outline">
                      {isParsing ? (
                        <Activity className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <CheckCircle className="h-4 w-4 mr-2" />
                      )}
                      Parse CSV
                    </Button>
                  </div>
                  {selectedFile && <p className="text-xs text-gray-500">Selected: {selectedFile.name}</p>}
                </div>

                {/* Asset ID Input - Placed here for better flow */}
                {parsedData && headerRow.length > 0 && (
                  <div className="space-y-2">
                    <label htmlFor="asset-id-sim" className="text-sm font-medium text-gray-700">
                      Asset ID for Simulation
                    </label>
                    <Input
                      id="asset-id-sim"
                      placeholder="Enter Asset ID (e.g., asset_123)"
                      value={assetIdForSim}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAssetIdForSim(e.target.value)}
                    />
                  </div>
                )}

                {/* Advanced Options */}
                {parsedData && headerRow.length > 0 && (
                    <div className="grid grid-cols-2 gap-4 pt-2">
                        <div>
                            <label htmlFor="processing-mode" className="text-sm font-medium text-gray-700 block mb-1">Processing Mode</label>
                            <Select value={processingMode} onValueChange={(value: 'fast' | 'standard') => setProcessingMode(value)}>
                                <SelectTrigger id="processing-mode">
                                    <SelectValue placeholder="Select mode" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="fast">Fast</SelectItem>
                                    <SelectItem value="standard">Standard</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label htmlFor="batch-size" className="text-sm font-medium text-gray-700 block mb-1">Batch Size</label>
                            <Input 
                                id="batch-size"
                                type="number" 
                                value={batchSize} 
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBatchSize(Math.max(1, parseInt(e.target.value, 10) || 1))} 
                                placeholder="e.g., 30"
                            />
                        </div>
                    </div>
                )}

                {/* Action Buttons */}
                {parsedData && headerRow.length > 0 && (
                  <div className="flex items-center space-x-2 pt-2">
                    <Button
                      onClick={handleStartSimulation}
                      disabled={isProcessing || !parsedData || !assetIdForSim.trim()}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {isProcessing ? (
                        <Activity className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <PlayCircle className="h-4 w-4 mr-2" />
                      )}
                      Start Simulation
                    </Button>
                    {isProcessing && (
                      <Button onClick={stopSimulation} variant="destructive">
                        <StopCircle className="h-4 w-4 mr-2" />
                        Stop
                      </Button>
                    )}
                  </div>
                )}

                {/* Simulation Progress Text */}
                {simulationProgressText && (
                  <p className="mt-2 text-sm text-gray-600">{simulationProgressText}</p>
                )}

                {/* General Upload Error Display */}
                {uploadError && (
                  <div className="mt-4 p-3 rounded-md bg-red-50 border border-red-300 text-red-700 text-sm flex items-start">
                    <AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0" />
                    <div>
                        <p className="font-semibold">Error</p>
                        <p>{uploadError}</p>
                    </div>
                  </div>
                )}
                
                {/* Validation Summary and Details */}
                {/* This section is displayed if there are no general upload errors AND there are validation issues */}
                {!uploadError && (validationWarnings.length > 0 || droppedRowCount > 0 || skippedSequenceCount > 0) && (
                  <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-md text-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <AlertTriangle className="h-5 w-5 text-orange-500 mr-2" />
                        <span className="font-semibold text-orange-700">Data Validation Notice</span>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setShowValidationDetails(!showValidationDetails)}
                        className="text-orange-600 hover:text-orange-700"
                      >
                        {showValidationDetails ? 'Hide Details' : 'Show Details'}
                        {showValidationDetails ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
                      </Button>
                    </div>
                    <p className="mt-1 text-orange-600">
                      {droppedRowCount > 0 && `${droppedRowCount} row(s) were dropped due to errors. `}
                      {skippedSequenceCount > 0 && `${skippedSequenceCount} sequence(s) could not be formed. `}
                      {validationWarnings.length > 0 && `Encountered ${validationWarnings.length} warning(s).`}
                    </p>
                    
                    {showValidationDetails && validationWarnings.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-orange-200">
                        <p className="text-xs text-orange-600 mb-1">
                          Displaying all {validationWarnings.length} warning(s):
                        </p>
                        <ul className="list-disc list-inside space-y-1 max-h-48 overflow-y-auto text-xs text-orange-500 bg-white p-2 rounded border border-orange-100">
                          {validationWarnings.map((warning, index) => (
                            <li key={index}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {!showValidationDetails && validationWarnings.length > 0 && (
                       <p className="mt-1 text-xs text-orange-500">
                         {validationWarnings.slice(0, 2).map((warning, index) => (
                            <span key={index} className="block truncate">{warning}</span>
                         ))}
                         {validationWarnings.length > 2 && `... and ${validationWarnings.length - 2} more. Click "Show Details" to see all.`}
                       </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Simulation Results Card - Displayed when simulationResults exist */}
            {simulationResults && simulationResults.length > 0 && (
              <Card className="bg-white rounded-xl shadow-sm border-0">
                <CardHeader>
                  <CardTitle className="text-xl font-semibold flex items-center">
                    <BarChart3 className="h-5 w-5 mr-2 text-green-600" />
                    Simulation Results
                  </CardTitle>
                  <CardDescription>
                    Predicted RUL values from the simulation. Displaying the latest {Math.min(50, simulationResults.length)} results.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[400px]"> 
                    <RealTimeProgressChart data={simulationResults.slice(-50)} isProcessing={isProcessing} />
                  </div>
                  {/* Add Export Full Data button here later */}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Quick Stats & Recent Activity */}
          <div className="space-y-6">
            <Card className="bg-gradient-to-br from-blue-500 to-purple-600 text-white rounded-xl shadow-lg border-0">
              <CardHeader>
                <CardTitle className="text-xl font-semibold">Quick Stats</CardTitle>
                <CardDescription className="text-blue-100">Fleet health at a glance</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-white/10 rounded-lg">
                  <div>
                    <p className="text-sm text-blue-200">Average RUL</p>
                    <p className="text-2xl font-bold">{avgRul.toLocaleString()}</p>
                  </div>
                  <TrendingUp className="h-6 w-6 text-blue-200" />
                </div>
                <div className="flex items-center justify-between p-3 bg-white/10 rounded-lg">
                  <div>
                    <p className="text-sm text-blue-200">Total Assets</p>
                    <p className="text-2xl font-bold">{totalAssets}</p>
                  </div>
                  <Database className="h-6 w-6 text-blue-200" />
                </div>
                {/* <div className="flex items-center justify-between p-3 bg-white/10 rounded-lg">
                  <div>
                    <p className="text-sm text-blue-200">New Alerts</p>
                    <p className="text-2xl font-bold">7</p> 
                  </div>
                  <Bell className="h-6 w-6 text-blue-200" />
                </div> */}
              </CardContent>
            </Card>

            <Card className="bg-white rounded-xl shadow-sm border-0">
              <CardHeader>
                <CardTitle className="text-xl font-semibold">Recent Activity</CardTitle>
                <CardDescription>Latest asset updates ({totalAssets} total)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {assets && assets.slice(0, 4).map((asset) => (
                    <div
                      key={asset.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/assets/${asset.id}`)} // Added navigation
                    >
                      <Avatar className="h-9 w-9">
                        {/* <AvatarImage src={asset.avatarUrl || undefined} alt={asset.name} /> */}
                        <AvatarFallback className="bg-gray-200 text-gray-600 text-xs">
                          {asset.name ? asset.name.substring(0, 2).toUpperCase() : String(asset.id).substring(0,2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-grow">
                        <p className="text-sm font-medium text-gray-800">{asset.name || `Asset ${String(asset.id).substring(0,6)}...`}</p>
                        <p className="text-xs text-gray-500">ID: {String(asset.id).substring(0, 8)}...</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-semibold ${asset.latest_rul && asset.latest_rul <= 20000 ? 'text-red-600' : asset.latest_rul && asset.latest_rul <= 60000 ? 'text-yellow-600' : 'text-green-600'}`}>
                          {asset.latest_rul ? asset.latest_rul.toLocaleString() : 'N/A'}
                        </p>
                        <p className="text-xs text-gray-400">RUL</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
