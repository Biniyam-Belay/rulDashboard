"use client"


import { useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  BarChart3, Bell, Settings, Search, AlertTriangle, CheckCircle, Clock, TrendingUp, Calculator, Loader2, Upload, Play, Square, Download, ChevronDown, ChevronUp
} from 'lucide-react'
import Papa from 'papaparse'
import { predictRulForAsset, predictRulForAssetBulk, predictRulForAssetBulkFast } from "@/lib/api"


import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { useAssetsWithLatestRul } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import RealTimeProgressChart from "./RealTimeProgressChart";


const DashboardPage = () => {
  // Fetch real asset data
  const { data: assets, isLoading: assetsLoading, error: assetsError } = useAssetsWithLatestRul();

  const navigate = useNavigate();

  // Real-World RUL Adjustment States - Always available for user control
  const [pRealWorld, setPRealWorld] = useState<number>(0.75); // Default from Scenario 1 (kN)
  const [rpmReal, setRpmReal] = useState<number>(3000); // Default from Scenario 1 (RPM)
  const [combinedKStar, setCombinedKStar] = useState<number>(0.95); // Default from Scenario 1
  const [operatingHoursPerDay, setOperatingHoursPerDay] = useState<number>(16); // Default

  // Real-world RUL adjustment function - uses user-controlled parameters
  const calculateRealWorldRul = (baselineRulHours: number): number => {
    // Constants for Real World Adjustment Calculation
    const P_ALT = 7.115; // Baseline Load (kN) for RUL_ALT calculation
    const RPM_ALT = 1775; // Baseline Speed (RPM) for RUL_ALT calculation
    const FATIGUE_EXPONENT_p = 3; // Fatigue life exponent

    // Calculate factors using user-controlled parameters
    const loadLifeFactor_val = pRealWorld > 0 ? Math.pow(P_ALT / pRealWorld, FATIGUE_EXPONENT_p) : 0;
    const speedFactor_val = rpmReal > 0 ? RPM_ALT / rpmReal : 0;
    
    const rulRealHours = baselineRulHours * loadLifeFactor_val * speedFactor_val * combinedKStar;
    return rulRealHours;
  };

  // Smart RUL formatting function - displays in most appropriate time unit
  const formatRulDisplay = (rulHours: number | null | undefined): { value: string; unit: string; fullText: string } => {
    if (rulHours === null || rulHours === undefined || rulHours <= 0) {
      return { value: 'N/A', unit: '', fullText: 'N/A' };
    }

    // Convert to different time units
    const hours = rulHours;
    const days = hours / operatingHoursPerDay;
    const weeks = days / 7;
    const months = days / 30.44; // Average days per month
    const years = days / 365.25; // Account for leap years

    // Choose the most appropriate unit based on value ranges
    if (hours < 48) {
      // Less than 2 days: show in hours
      return {
        value: Math.round(hours).toLocaleString(),
        unit: hours === 1 ? 'hr' : 'hrs',
        fullText: `${Math.round(hours).toLocaleString()} ${hours === 1 ? 'hour' : 'hours'}`
      };
    } else if (days < 14) {
      // Less than 2 weeks: show in days
      return {
        value: days.toFixed(1),
        unit: Math.round(days) === 1 ? 'day' : 'days',
        fullText: `${days.toFixed(1)} ${Math.round(days) === 1 ? 'day' : 'days'}`
      };
    } else if (weeks < 8) {
      // Less than 2 months: show in weeks
      return {
        value: weeks.toFixed(1),
        unit: Math.round(weeks) === 1 ? 'wk' : 'wks',
        fullText: `${weeks.toFixed(1)} ${Math.round(weeks) === 1 ? 'week' : 'weeks'}`
      };
    } else if (months < 24) {
      // Less than 2 years: show in months
      return {
        value: months.toFixed(1),
        unit: Math.round(months) === 1 ? 'mo' : 'mos',
        fullText: `${months.toFixed(1)} ${Math.round(months) === 1 ? 'month' : 'months'}`
      };
    } else {
      // 2+ years: show in years
      return {
        value: years.toFixed(1),
        unit: Math.round(years) === 1 ? 'yr' : 'yrs',
        fullText: `${years.toFixed(1)} ${Math.round(years) === 1 ? 'year' : 'years'}`
      };
    }
  };

  // Calculate KPIs based on fetched data with real-world RUL adjustments
  const totalAssets = assets?.length ?? 0;
  
  // Apply real-world adjustments to all RUL calculations
  const assetsWithAdjustedRul = assets?.map(asset => ({
    ...asset,
    adjusted_rul: asset.latest_rul ? calculateRealWorldRul(asset.latest_rul) : null
  })) ?? [];

  const criticalAssets = assetsWithAdjustedRul.filter(a => (a.adjusted_rul ?? Infinity) <= 168).length; // 168 hrs = ~7 days critical
  const warningAssets = assetsWithAdjustedRul.filter(a => (a.adjusted_rul ?? Infinity) > 168 && (a.adjusted_rul ?? 0) <= 720).length; // 168-720 hrs = 7-30 days warning  
  const healthyAssets = assetsWithAdjustedRul.filter(a => (a.adjusted_rul ?? 0) > 720).length; // >720 hrs = >30 days healthy
  const avgRul = assetsWithAdjustedRul && totalAssets > 0 ? Math.round(assetsWithAdjustedRul.reduce((sum, a) => sum + (a.adjusted_rul ?? 0), 0) / totalAssets) : 0;

  // CSV Processing States
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedData, setParsedData] = useState<any[] | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [assetIdForSim, setAssetIdForSim] = useState<string>('');
  const [simulationProgressText, setSimulationProgressText] = useState<string>('');
  const [simulationResults, setSimulationResults] = useState<Array<{
    sequenceNumber: number;
    predictedRul: number;
    timestamp: string;
    error?: string;
  }>>([]);
  const [simulationAbortController, setSimulationAbortController] = useState<AbortController | null>(null);
  const [processingMode, setProcessingMode] = useState<'fast' | 'standard'>('fast');
  const [processingStartTime, setProcessingStartTime] = useState<number | null>(null);
  const [droppedRowCount, setDroppedRowCount] = useState<number>(0);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [batchSize, setBatchSize] = useState(30);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [showValidationDetails, setShowValidationDetails] = useState<boolean>(false);
  const [showRealTimeChart, setShowRealTimeChart] = useState<boolean>(true);

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
    'x': 'x_direction',
    'y': 'y_direction',
    'bearing_temp': 'bearing_temperature',
    'env_temp': 'env_temperature',
    'x direction': 'x_direction',
    'y direction': 'y_direction',
    'bearing temp': 'bearing_temperature',
    'env temp': 'env_temperature',
  };

  const requiredBackendKeys = ['x_direction', 'y_direction', 'bearing_temperature', 'env_temperature'];

  const transformRow = (
    row: any, 
    csvHeaders: string[], 
    originalCsvRowNumber: number
  ): TransformRowResult => {
    const transformed: any = {};
    const lowerCsvHeaders = csvHeaders.map(h => h.toLowerCase().trim());

    for (const backendKey of requiredBackendKeys) {
      let mappedCsvHeader: string | null = null;
      let headerIndex = -1;

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

      if (headerIndex === -1) {
        const directMatchIndex = lowerCsvHeaders.indexOf(backendKey.toLowerCase());
        if (directMatchIndex !== -1) {
          headerIndex = directMatchIndex;
          mappedCsvHeader = csvHeaders[headerIndex];
        }
      }

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

  // Export simulation results as CSV
  const handleExportSimulationData = () => {
    if (!simulationResults || simulationResults.length === 0) return;
    const csvRows = [
      'Sequence Number,Predicted RUL (hrs),Timestamp,Error',
      ...simulationResults.map(r =>
        `${r.sequenceNumber},${r.predictedRul},${r.timestamp},${r.error ? '"' + r.error.replace(/"/g, '""') + '"' : ''}`
      )
    ];
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'simulation_results.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // CSV file handling
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setParsedData(null);
      setUploadError(null);
      setSimulationResults([]);
    }
  };

  // Parse CSV file with comprehensive error handling
  const handleParseCsv = async () => {
    if (!selectedFile) {
      setUploadError('Please select a CSV file first.');
      return;
    }

    setIsParsing(true);
    setUploadError(null);
    setParsedData(null);
    setSimulationProgressText('Parsing CSV...');

    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results: Papa.ParseResult<any>) => {
        if (results.errors.length) {
          setUploadError(`Error parsing CSV: ${results.errors.map((e: Papa.ParseError) => e.message).join(', ')}`);
          setParsedData(null);
          setSimulationProgressText('CSV parsing failed.');
        } else {
          // Filter out empty column headers
          const validFields = (results.meta.fields || []).filter(field => field && field.trim() !== '');
          
          // Clean data by removing empty columns
          const cleanData = results.data.map((row: any) => {
            const cleanRow: any = {};
            for (const key in row) {
              if (key && key.trim() !== '') {
                cleanRow[key.trim()] = row[key];
              }
            }
            return cleanRow;
          });

          // Validate and transform data
          const transformedData: any[] = [];
          const warnings: string[] = [];
          let droppedRows = 0;

          cleanData.forEach((row: any, index: number) => {
            const csvRowNumber = index + 2; // 1-based for file, +1 for header
            const transformOutcome = transformRow(row, validFields, csvRowNumber);
            if (transformOutcome.success) {
              transformedData.push(transformOutcome.data);
            } else {
              droppedRows++;
              if (transformOutcome.error) {
                warnings.push(transformOutcome.error);
              } else {
                warnings.push(`Row ${csvRowNumber}: Dropped for an unspecified reason.`);
              }
            }
          });

          setDroppedRowCount(droppedRows);
          setValidationWarnings(warnings);

          if (transformedData.length === 0) {
            setUploadError('No valid data rows after transformation. Check column headers and data format.');
            setSimulationProgressText('CSV parsing failed - no valid data.');
            setParsedData(null);
          } else {
            setParsedData(transformedData);
            const numSequences = Math.floor(transformedData.length / SEQUENCE_LENGTH);
            setSimulationProgressText(`CSV parsed successfully. ${transformedData.length} rows, ${numSequences} sequences available.`);
            
            if (transformedData.length < SEQUENCE_LENGTH) {
              setUploadError(`Not enough valid data rows. Need at least ${SEQUENCE_LENGTH} rows, but only got ${transformedData.length}.`);
            }
          }
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

  // Start RUL simulation with bulk processing
  const handleStartSimulation = async () => {
    if (!parsedData || parsedData.length < SEQUENCE_LENGTH) {
      setUploadError(`Not enough data to form a sequence. Need at least ${SEQUENCE_LENGTH} rows.`);
      return;
    }
    if (!assetIdForSim.trim()) {
      setUploadError('Please enter an Asset ID for the simulation.');
      return;
    }

    // Create new abort controller for this simulation
    const abortController = new AbortController();
    setSimulationAbortController(abortController);

    setIsProcessing(true);
    setUploadError(null);
    setSimulationProgressText('Starting simulation...');
    setSimulationResults([]);
    setProcessingStartTime(Date.now());

    const totalSequences = Math.floor(parsedData.length / SEQUENCE_LENGTH);
    const batches = [];
    let totalProcessedCount = 0;
    let totalErrorCount = 0;
    
    // Create batches for processing
    for (let i = 0; i < totalSequences; i += batchSize) {
      const batchEnd = Math.min(i + batchSize, totalSequences);
      batches.push({ start: i, end: batchEnd });
    }

    try {
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        if (abortController.signal.aborted) {
          setSimulationProgressText('Simulation stopped by user');
          break;
        }

        const batch = batches[batchIndex];
        setSimulationProgressText(`Processing batch ${batchIndex + 1} of ${batches.length} (sequences ${batch.start + 1}-${batch.end})...`);

        // Prepare sequences for this batch
        const sequencesForThisBatch: any[][] = [];
        const metadataForThisBatch: Array<{ sequenceNumber: number }> = [];
        
        for (let seqIndex = batch.start; seqIndex < batch.end; seqIndex++) {
          const sequenceStartIndex = seqIndex * SEQUENCE_LENGTH;
          const sequenceData = parsedData.slice(sequenceStartIndex, sequenceStartIndex + SEQUENCE_LENGTH);
          
          if (sequenceData.length === SEQUENCE_LENGTH) {
            sequencesForThisBatch.push(sequenceData);
            metadataForThisBatch.push({ sequenceNumber: seqIndex + 1 });
          }
        }

        if (sequencesForThisBatch.length > 0) {
          try {
            // Use bulk processing API
            const bulkResponse = processingMode === 'fast'
              ? await predictRulForAssetBulkFast(assetIdForSim, sequencesForThisBatch)
              : await predictRulForAssetBulk(assetIdForSim, sequencesForThisBatch);

            const { predictions } = bulkResponse.data;

            const newResults = predictions.map((prediction: any, indexInBatch: number) => {
              const metadata = metadataForThisBatch[indexInBatch];
              const rawRul = prediction.predicted_rul;
              const adjustedRul = rawRul > 0 ? calculateRealWorldRul(rawRul) : 0;
              const hasError = prediction.error || rawRul <= 0;
              
              totalProcessedCount++;
              if (hasError) {
                totalErrorCount++;
              }
              
              return {
                sequenceNumber: metadata.sequenceNumber,
                predictedRul: adjustedRul, // Apply real-world adjustment
                timestamp: new Date().toISOString(),
                error: prediction.error || (rawRul <= 0 ? 'Invalid prediction result' : undefined)
              };
            });

            setSimulationResults(prev => [...prev, ...newResults]);
            
            // Force a small delay to allow chart to update
            await new Promise(resolve => setTimeout(resolve, 50));
          } catch (error: any) {
            console.error('Bulk processing API error:', error);
            const errorMsg = error.response?.data?.detail || error.message || 'Unknown API error';
            
            // Create error results for this batch
            const errorResults = metadataForThisBatch.map(metadata => {
              totalProcessedCount++;
              totalErrorCount++;
              return {
                sequenceNumber: metadata.sequenceNumber,
                predictedRul: 0,
                timestamp: new Date().toISOString(),
                error: `API Error: ${errorMsg}`
              };
            });
            
            setSimulationResults(prev => [...prev, ...errorResults]);
          }
        }

        // Add small delay between batches for UI responsiveness
        if (batchIndex < batches.length - 1 && processingMode === 'standard') {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const endTime = Date.now();
      const duration = processingStartTime ? (endTime - processingStartTime) / 1000 : 0;
      
      setSimulationProgressText(
        `Simulation completed! Processed ${totalProcessedCount} sequences in ${duration.toFixed(1)}s. ${totalErrorCount > 0 ? `${totalErrorCount} errors encountered.` : 'All successful!'}`
      );
    } catch (err: any) {
      if (err.message === 'Simulation stopped by user') {
        setSimulationProgressText('Simulation stopped by user.');
      } else {
        setUploadError(`Simulation failed: ${err.message}`);
        setSimulationProgressText('Simulation failed.');
      }
    } finally {
      setIsProcessing(false);
      setSimulationAbortController(null);
    }
  };

  // Stop simulation
  const handleStopSimulation = () => {
    if (simulationAbortController) {
      simulationAbortController.abort();
      setSimulationAbortController(null);
      setIsProcessing(false);
      setSimulationProgressText('Simulation stopped by user.');
    }
  };

  if (assetsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F8F9FB]">
        <Loader2 className="h-16 w-16 animate-spin text-blue-500" />
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - KPI Cards */}
          <div className="lg:col-span-2 space-y-6">
            {/* KPI Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-white rounded-xl shadow-sm border-0">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                      <BarChart3 className="h-4 w-4 text-blue-600" />
                    </div>
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

            {/* Maintenance Priority List Card */}
            <Card className="bg-white rounded-xl shadow-sm border-0">
              <CardHeader>
                <CardTitle className="text-xl font-semibold flex items-center">
                  <AlertTriangle className="h-5 w-5 mr-2 text-red-600" />
                  Maintenance Priority List
                </CardTitle>
                <CardDescription>
                  Top 5 assets with the lowest Remaining Useful Life (RUL) - adjusted for real-world conditions.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-gray-100">
                  {assetsWithAdjustedRul && assetsWithAdjustedRul.length > 0 ? (
                    assetsWithAdjustedRul
                      .filter(a => a.adjusted_rul !== null && a.adjusted_rul !== undefined)
                      .sort((a, b) => (a.adjusted_rul ?? Infinity) - (b.adjusted_rul ?? Infinity))
                      .slice(0, 5)
                      .map((asset, idx) => (
                        <div key={asset.id} className="flex items-center gap-3 py-2 cursor-pointer hover:bg-gray-50 rounded-lg px-2"
                             onClick={() => navigate(`/assets/${asset.id}`)}>
                          <span className="text-lg font-bold text-gray-400 w-6 text-center">{idx + 1}</span>
                          <Avatar className="h-8 w-8 flex-shrink-0">
                            <AvatarFallback className={asset.adjusted_rul && asset.adjusted_rul <= 168 ? 'bg-red-100 text-red-700' : asset.adjusted_rul && asset.adjusted_rul <= 720 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}>
                              {asset.name ? asset.name.substring(0, 2).toUpperCase() : String(asset.id).substring(0,2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-grow min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate" title={asset.name || `Asset ${asset.id}`}>{asset.name || `Asset ${String(asset.id).substring(0,10)}...`}</p>
                            <p className="text-xs text-gray-500 truncate" title={`ID: ${asset.id}`}>ID: {String(asset.id).substring(0, 12)}...</p>
                          </div>
                          <div className="text-right flex-shrink-0 ml-2">
                            {(() => {
                              const rulDisplay = formatRulDisplay(asset.adjusted_rul);
                              return (
                                <>
                                  <p className={`text-sm font-semibold ${asset.adjusted_rul && asset.adjusted_rul <= 168 ? 'text-red-600' : asset.adjusted_rul && asset.adjusted_rul <= 720 ? 'text-yellow-600' : 'text-green-600'}`}>
                                    {rulDisplay.value}
                                  </p>
                                  <p className="text-xs text-gray-400">RUL ({rulDisplay.unit})</p>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      ))
                  ) : (
                    <p className="text-sm text-gray-500 py-4 text-center">No assets found.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Real-World RUL Adjustment Card - Always Visible */}
            <Card className="bg-white rounded-xl shadow-sm border-0">
              <CardHeader>
                <CardTitle className="text-xl font-semibold flex items-center">
                  <Calculator className="h-5 w-5 mr-2 text-purple-600" />
                  Real-World RUL Adjustment Controls
                </CardTitle>
                <CardDescription>
                  Adjust all RUL calculations based on real-world operating conditions. These settings affect all RUL values shown throughout the dashboard.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="p-real-world" className="text-sm font-medium text-gray-700 block mb-1">
                      Real-World Load (P_real, kN)
                    </label>
                    <Input
                      id="p-real-world"
                      type="number"
                      value={pRealWorld}
                      onChange={(e) => setPRealWorld(parseFloat(e.target.value) || 0)}
                      placeholder="e.g., 0.75"
                      min="0.01"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label htmlFor="rpm-real" className="text-sm font-medium text-gray-700 block mb-1">
                      Real-World Speed (RPM_real)
                    </label>
                    <Input
                      id="rpm-real"
                      type="number"
                      value={rpmReal}
                      onChange={(e) => setRpmReal(parseInt(e.target.value, 10) || 0)}
                      placeholder="e.g., 3000"
                      min="1"
                    />
                  </div>
                  <div>
                    <label htmlFor="combined-k-star" className="text-sm font-medium text-gray-700 block mb-1">
                      Combined K* Factor
                    </label>
                    <Input
                      id="combined-k-star"
                      type="number"
                      value={combinedKStar}
                      onChange={(e) => setCombinedKStar(parseFloat(e.target.value) || 0)}
                      placeholder="e.g., 0.95"
                      min="0.01"
                      max="10"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label htmlFor="operating-hours" className="text-sm font-medium text-gray-700 block mb-1">
                      Operating Hours/Day
                    </label>
                    <Input
                      id="operating-hours"
                      type="number"
                      value={operatingHoursPerDay}
                      onChange={(e) => {
                        let val = parseInt(e.target.value, 10) || 0;
                        if (val > 24) val = 24;
                        setOperatingHoursPerDay(val);
                      }}
                      placeholder="e.g., 16"
                      min="1"
                      max="24"
                    />
                  </div>
                </div>
                
                {/* Real-time calculation summary */}
                <div className="mt-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
                  <h4 className="text-md font-semibold text-gray-800 mb-3">Current Adjustment Factors:</h4>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <p className="text-gray-600">Load Life Factor (L_F):</p>
                    <p className="font-medium text-gray-700">{pRealWorld > 0 ? Math.pow(7.115 / pRealWorld, 3).toFixed(3) : 'N/A'}</p>
                    
                    <p className="text-gray-600">Speed Factor (S_F):</p>
                    <p className="font-medium text-gray-700">{rpmReal > 0 ? (1775 / rpmReal).toFixed(3) : 'N/A'}</p>
                    
                    <p className="text-gray-600">Combined K* Factor:</p>
                    <p className="font-medium text-gray-700">{combinedKStar.toFixed(2)}</p>
                    
                    <p className="text-gray-600">Overall Multiplier:</p>
                    <p className="font-medium text-purple-700">
                      {(pRealWorld > 0 && rpmReal > 0) ? 
                        (Math.pow(7.115 / pRealWorld, 3) * (1775 / rpmReal) * combinedKStar).toFixed(3) : 
                        'N/A'}x
                    </p>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    All RUL values shown throughout the dashboard are adjusted using these factors and displayed in the most appropriate time unit.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* CSV Upload and Simulation Card */}
            <Card className="bg-white rounded-xl shadow-sm border-0">
              <CardHeader>
                <CardTitle className="text-xl font-semibold flex items-center">
                  <Upload className="h-5 w-5 mr-2 text-green-600" />
                  CSV Data Upload & RUL Simulation
                </CardTitle>
                <CardDescription>
                  Upload sensor data CSV files and run RUL predictions. Results will use the real-world adjustment factors above.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* File Upload Section */}
                <div className="space-y-3">
                  <div>
                    <label htmlFor="csv-file" className="text-sm font-medium text-gray-700 block mb-1">
                      Select CSV File
                    </label>
                    <input
                      id="csv-file"
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                    />
                  </div>
                  {selectedFile && (
                    <p className="text-sm text-gray-600">Selected: {selectedFile.name}</p>
                  )}
                  
                  <div className="flex gap-2">
                    <Button
                      onClick={handleParseCsv}
                      disabled={!selectedFile || isParsing}
                      className="gap-2"
                      variant="outline"
                    >
                      {isParsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {isParsing ? 'Parsing...' : 'Parse CSV'}
                    </Button>
                    
                    {/* Advanced Mode Toggle */}
                    <div className="flex items-center gap-2 ml-auto">
                      <Switch
                        id="advanced-mode"
                        checked={advancedMode}
                        onCheckedChange={setAdvancedMode}
                      />
                      <Label htmlFor="advanced-mode" className="text-sm">Advanced Mode</Label>
                    </div>
                  </div>

                  {/* Advanced Options */}
                  {advancedMode && parsedData && (
                    <div className="space-y-3 p-3 bg-gray-50 rounded border">
                      <h4 className="text-sm font-semibold text-gray-700">Processing Options</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="processing-mode" className="text-xs text-gray-600">Processing Mode</Label>
                          <Select value={processingMode} onValueChange={(value: 'fast' | 'standard') => setProcessingMode(value)}>
                            <SelectTrigger id="processing-mode" className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="fast">Fast</SelectItem>
                              <SelectItem value="standard">Standard</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="batch-size" className="text-xs text-gray-600">Batch Size</Label>
                          <Input
                            id="batch-size"
                            type="number"
                            value={batchSize}
                            onChange={(e) => setBatchSize(Math.max(1, parseInt(e.target.value, 10) || 1))}
                            className="h-8"
                            min="1"
                            max="100"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-4 pt-2">
                        <div className="flex items-center gap-2">
                          <Switch
                            id="real-time-chart"
                            checked={showRealTimeChart}
                            onCheckedChange={setShowRealTimeChart}
                          />
                          <Label htmlFor="real-time-chart" className="text-xs text-gray-600">Show Real-time Chart</Label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Error Display */}
                  {uploadError && (
                    <div className="text-red-600 text-sm p-3 bg-red-50 rounded border border-red-200">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold">Error</p>
                          <p>{uploadError}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Validation Warnings */}
                  {!uploadError && (validationWarnings.length > 0 || droppedRowCount > 0) && (
                    <div className="text-orange-600 text-sm p-3 bg-orange-50 rounded border border-orange-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="font-semibold">Data Validation Notice</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowValidationDetails(!showValidationDetails)}
                          className="text-orange-600 hover:text-orange-700 p-0 h-auto"
                        >
                          {showValidationDetails ? 'Hide Details' : 'Show Details'}
                          {showValidationDetails ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
                        </Button>
                      </div>
                      <p className="mt-1">
                        {droppedRowCount > 0 && `${droppedRowCount} row(s) were dropped due to errors. `}
                        {validationWarnings.length > 0 && `Encountered ${validationWarnings.length} warning(s).`}
                      </p>
                      
                      {showValidationDetails && validationWarnings.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-orange-200">
                          <p className="text-xs mb-1">All validation warnings:</p>
                          <ul className="list-disc list-inside space-y-1 max-h-32 overflow-y-auto text-xs bg-white p-2 rounded border">
                            {validationWarnings.map((warning, index) => (
                              <li key={index}>{warning}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Simulation Section */}
                {parsedData && parsedData.length > 0 && (
                  <div className="space-y-3 border-t pt-4">
                    <div>
                      <label htmlFor="asset-id" className="text-sm font-medium text-gray-700 block mb-1">
                        Asset ID for Simulation
                      </label>
                      <Input
                        id="asset-id"
                        type="text"
                        value={assetIdForSim}
                        onChange={(e) => setAssetIdForSim(e.target.value)}
                        placeholder="Enter Asset ID (e.g., a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11)"
                        disabled={isProcessing}
                      />
                    </div>

                    <div className="text-sm text-gray-600 p-3 bg-blue-50 rounded border border-blue-200">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p><strong>Data loaded:</strong> {parsedData.length} rows</p>
                          <p><strong>Sequences available:</strong> {Math.floor(parsedData.length / SEQUENCE_LENGTH)}</p>
                        </div>
                        <div>
                          <p><strong>Required columns:</strong> ✓ Found</p>
                          <p><strong>Processing mode:</strong> {processingMode}</p>
                          {advancedMode && <p><strong>Batch size:</strong> {batchSize}</p>}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={handleStartSimulation}
                        disabled={isProcessing || !parsedData || parsedData.length < SEQUENCE_LENGTH || !assetIdForSim.trim()}
                        className="gap-2"
                      >
                        {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        {isProcessing ? 'Running...' : `Start Simulation (${Math.floor((parsedData?.length || 0) / SEQUENCE_LENGTH)} sequences)`}
                      </Button>
                      {isProcessing && (
                        <Button
                          onClick={handleStopSimulation}
                          variant="destructive"
                          className="gap-2"
                        >
                          <Square className="h-4 w-4" />
                          Stop
                        </Button>
                      )}
                      {simulationResults.length > 0 && (
                        <Button
                          onClick={handleExportSimulationData}
                          variant="outline"
                          className="gap-2"
                        >
                          <Download className="h-4 w-4" />
                          Export Results
                        </Button>
                      )}
                    </div>

                    {simulationProgressText && (
                      <div className="text-blue-600 text-sm p-3 bg-blue-50 rounded border border-blue-200">
                        <div className="flex items-center gap-2">
                          {isProcessing && <Loader2 className="h-4 w-4 animate-spin" />}
                          {simulationProgressText}
                        </div>
                      </div>
                    )}

                    {simulationResults.length > 0 && (
                      <div className="space-y-4">
                        {/* Real-Time Statistics */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium text-blue-700">Processed</p>
                                  <p className="text-2xl font-bold text-blue-900">
                                    {simulationResults.length}
                                  </p>
                                </div>
                                <CheckCircle className="h-8 w-8 text-blue-600" />
                              </div>
                            </CardContent>
                          </Card>

                          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium text-green-700">Avg RUL</p>
                                  <p className="text-2xl font-bold text-green-900">
                                    {(() => {
                                      const validResults = simulationResults.filter(r => !r.error && r.predictedRul > 0);
                                      if (validResults.length === 0) return '0';
                                      const avg = validResults.reduce((sum, r) => sum + r.predictedRul, 0) / validResults.length;
                                      const avgDisplay = formatRulDisplay(avg);
                                      return avgDisplay.value;
                                    })()}
                                  </p>
                                  <p className="text-xs text-green-600">
                                    {(() => {
                                      const validResults = simulationResults.filter(r => !r.error && r.predictedRul > 0);
                                      if (validResults.length === 0) return '';
                                      const avg = validResults.reduce((sum, r) => sum + r.predictedRul, 0) / validResults.length;
                                      const avgDisplay = formatRulDisplay(avg);
                                      return avgDisplay.unit;
                                    })()}
                                  </p>
                                </div>
                                <TrendingUp className="h-8 w-8 text-green-600" />
                              </div>
                            </CardContent>
                          </Card>

                          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium text-purple-700">Min RUL</p>
                                  <p className="text-2xl font-bold text-purple-900">
                                    {(() => {
                                      const validResults = simulationResults.filter(r => !r.error && r.predictedRul > 0);
                                      if (validResults.length === 0) return '0';
                                      const min = Math.min(...validResults.map(r => r.predictedRul));
                                      const minDisplay = formatRulDisplay(min);
                                      return minDisplay.value;
                                    })()}
                                  </p>
                                  <p className="text-xs text-purple-600">
                                    {(() => {
                                      const validResults = simulationResults.filter(r => !r.error && r.predictedRul > 0);
                                      if (validResults.length === 0) return '';
                                      const min = Math.min(...validResults.map(r => r.predictedRul));
                                      const minDisplay = formatRulDisplay(min);
                                      return minDisplay.unit;
                                    })()}
                                  </p>
                                </div>
                                <AlertTriangle className="h-8 w-8 text-purple-600" />
                              </div>
                            </CardContent>
                          </Card>

                          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium text-orange-700">Errors</p>
                                  <p className="text-2xl font-bold text-orange-900">
                                    {simulationResults.filter(r => r.error).length}
                                  </p>
                                  <p className="text-xs text-orange-600">
                                    {simulationResults.length > 0 ? 
                                      `${((simulationResults.filter(r => r.error).length / simulationResults.length) * 100).toFixed(1)}%` : 
                                      '0%'
                                    }
                                  </p>
                                </div>
                                <AlertTriangle className="h-8 w-8 text-orange-600" />
                              </div>
                            </CardContent>
                          </Card>
                        </div>

                        {/* Real-Time Chart */}
                        {showRealTimeChart && (
                          <Card className="bg-white rounded-xl shadow-sm border-0">
                            <CardHeader>
                              <CardTitle className="text-lg font-semibold flex items-center">
                                <TrendingUp className="h-5 w-5 mr-2 text-blue-600" />
                                Real-Time RUL Predictions
                                {isProcessing && (
                                  <span className="ml-2 flex items-center text-sm text-blue-600">
                                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                    Live
                                  </span>
                                )}
                              </CardTitle>
                              <CardDescription>
                                Time series visualization of RUL predictions as they are generated (showing last 50 points)
                              </CardDescription>
                            </CardHeader>
                            <CardContent>
                              <div className="h-80 w-full">
                                <RealTimeProgressChart 
                                  data={simulationResults.filter(r => !r.error)} 
                                  isProcessing={isProcessing}
                                  displayBatchSize={50} // Show last 50 points for performance
                                />
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
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
                    {(() => {
                      const avgRulDisplay = formatRulDisplay(avgRul);
                      return (
                        <div>
                          <p className="text-2xl font-bold">
                            {avgRulDisplay.value}
                            <span className="text-lg text-blue-200 ml-1">{avgRulDisplay.unit}</span>
                          </p>
                          <p className="text-xs text-blue-300 mt-1">
                            ({avgRul.toLocaleString()} hrs)
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                  <TrendingUp className="h-6 w-6 text-blue-200" />
                </div>
                <div className="flex items-center justify-between p-3 bg-white/10 rounded-lg">
                  <div>
                    <p className="text-sm text-blue-200">Total Assets</p>
                    <p className="text-2xl font-bold">{totalAssets}</p>
                  </div>
                  <BarChart3 className="h-6 w-6 text-blue-200" />
                </div>
              </CardContent>
            </Card>

            {/* Enhanced Recent Activity / Asset List Card */}
            <Card className="bg-white rounded-xl shadow-sm border-0">
              <CardHeader>
                <CardTitle className="text-xl font-semibold">Asset Overview</CardTitle>
                <CardDescription>Details for all {totalAssets} assets with real-world adjusted RUL. Time units automatically adapt for readability. Click to view more.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 max-h-[400px] overflow-y-auto pr-2">
                  {assetsWithAdjustedRul && assetsWithAdjustedRul.length > 0 ? (
                    assetsWithAdjustedRul
                      .sort((a, b) => (a.adjusted_rul ?? Infinity) - (b.adjusted_rul ?? Infinity))
                      .map((asset) => (
                        <div
                          key={asset.id}
                          className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                          onClick={() => navigate(`/assets/${asset.id}`)}
                        >
                          <Avatar className="h-9 w-9 flex-shrink-0">
                            <AvatarFallback 
                              className={asset.adjusted_rul === null || asset.adjusted_rul === undefined ? 'bg-gray-300 text-gray-700' :
                                         asset.adjusted_rul <= 168 ? 'bg-red-100 text-red-700' :
                                         asset.adjusted_rul <= 720 ? 'bg-yellow-100 text-yellow-700' :
                                         'bg-green-100 text-green-700'}
                            >
                              {asset.name ? asset.name.substring(0, 2).toUpperCase() : String(asset.id).substring(0,2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-grow min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate" title={asset.name || `Asset ${asset.id}`}>
                              {asset.name || `Asset ${String(asset.id).substring(0,10)}...`}
                            </p>
                            <p className="text-xs text-gray-500 truncate" title={`ID: ${asset.id}`}>ID: {String(asset.id).substring(0, 12)}...</p>
                          </div>
                          <div className="text-right flex-shrink-0 ml-2">
                            {(() => {
                              const rulDisplay = formatRulDisplay(asset.adjusted_rul);
                              return (
                                <>
                                  <p className={`text-sm font-semibold ${asset.adjusted_rul === null || asset.adjusted_rul === undefined ? 'text-gray-500' :
                                                   asset.adjusted_rul <= 168 ? 'text-red-600' :
                                                   asset.adjusted_rul <= 720 ? 'text-yellow-600' :
                                                   'text-green-600'}`}>
                                    {rulDisplay.value}
                                  </p>
                                  <p className="text-xs text-gray-400">RUL ({rulDisplay.unit})</p>
                                  {asset.adjusted_rul !== null && asset.adjusted_rul !== undefined && (
                                    <p className="text-xs text-gray-300 mt-0.5">
                                      {asset.adjusted_rul.toFixed(1)}h raw
                                    </p>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      ))
                  ) : (
                    <p className="text-sm text-gray-500 py-4 text-center">No assets found.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Important Details Cards (vertical stack) */}
            <div className="flex flex-col gap-4 mt-6">
              <Card className="bg-white rounded-xl shadow-sm border-0">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                      <BarChart3 className="h-4 w-4 text-indigo-600" />
                    </div>
                    <span className="text-xs text-gray-400">v1.2.3</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500">Model Version</p>
                    <p className="text-lg font-bold text-gray-900">V0.1</p>
                  </div>
                </CardContent>
              </Card>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
