import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import Papa from 'papaparse';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  FileText, 
  Gauge, 
  LineChart, 
  PlayCircle, 
  Settings, 
  StopCircle, 
  TrendingUp, 
  Upload,
  Zap,
  Database,
  BarChart3,
  Shield,
  Users,
  Target
} from 'lucide-react';

import { useAssetsWithLatestRul, predictRulForAssetBulk, predictRulForAssetBulkFast } from '@/lib/api';
import type { AssetWithLatestRul } from '@/lib/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';

import RealTimeProgressChart from '@/components/RealTimeProgressChart';
import ProcessingStatus from '@/components/ProcessingStatus';
import RulDistributionChart from '@/components/RulDistributionChart';
import AlertsPanel from '@/components/AlertsPanel';
import RulSparkline from '@/components/RulSparkline';

// Type for sort configuration
type SortKey = keyof AssetWithLatestRul | null;
interface SortConfig {
  key: SortKey;
  direction: 'ascending' | 'descending';
}

const DashboardPage = () => {
  const { data, isLoading, error } = useAssetsWithLatestRul();
  const navigate = useNavigate();
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'latest_rul', direction: 'ascending' });

  // File upload and processing states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedData, setParsedData] = useState<any[] | null>(null);
  const [headerRow, setHeaderRow] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [assetIdForSim, setAssetIdForSim] = useState<string>('');
  const [simulationProgress, setSimulationProgress] = useState<string>('');
  const [simulationResults, setSimulationResults] = useState<Array<{
    sequenceNumber: number;
    predictedRul: number;
    timestamp: string;
    error?: string;
  }>>([]);
  const [currentSequence, setCurrentSequence] = useState(0);
  const [totalSequences, setTotalSequences] = useState(0);
  const [simulationAbortController, setSimulationAbortController] = useState<AbortController | null>(null);
  const [batchSize, setBatchSize] = useState(30);
  const [processingMode, setProcessingMode] = useState<'fast' | 'standard'>('fast');
  const [processingStartTime, setProcessingStartTime] = useState<number | null>(null);
  const [sequencesPerSecond, setSequencesPerSecond] = useState<number>(0);
  const [advancedMode, setAdvancedMode] = useState(false);

  const SEQUENCE_LENGTH = 50;

  // Header mapping for CSV processing
  const headerMapping: { [key: string]: string } = {
    'x_direction': 'x_direction',
    'xdirection': 'x_direction',
    'x direction': 'x_direction',
    'x-direction': 'x_direction',
    'y_direction': 'y_direction',
    'ydirection': 'y_direction',
    'y direction': 'y_direction',
    'y-direction': 'y_direction',
    'bearingtem': 'bearing_tem',
    'bearingtemp': 'bearing_tem',
    'bearing_tem': 'bearing_tem',
    'bearing_temp': 'bearing_tem',
    'bearing tem': 'bearing_tem',
    'bearing temp': 'bearing_tem',
    'envtemp': 'env_temp',
    'env_temp': 'env_temp',
    'env temp': 'env_temp',
    'environment temp': 'env_temp',
    'environmenttemp': 'env_temp'
  };

  // KPI calculations
  const totalAssets = data?.length ?? 0;
  const criticalAssets = data?.filter(a => (a.latest_rul ?? Infinity) <= 20000).length ?? 0;
  const warningAssets = data?.filter(a => (a.latest_rul ?? Infinity) > 20000 && (a.latest_rul ?? 0) <= 60000).length ?? 0;
  const healthyAssets = data?.filter(a => (a.latest_rul ?? 0) > 60000).length ?? 0;

  // Processing statistics
  const completedSequences = simulationResults.filter(r => r.predictedRul !== undefined).length;
  const errorSequences = simulationResults.filter(r => r.error !== undefined).length;
  const successfulPredictions = simulationResults.filter(r => r.predictedRul !== undefined && !r.error);

  // File handling functions - same as before...
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
      setParsedData(null);
      setUploadError(null);
      setHeaderRow([]);
      setSimulationResults([]);
      setCurrentSequence(0);
      setTotalSequences(0);
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

    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length) {
          setUploadError(`Error parsing CSV: ${results.errors[0].message}`);
          setParsedData(null);
        } else {
          setHeaderRow(results.meta.fields || []);
          setParsedData(results.data);
          const numSequences = Math.floor((results.data?.length || 0) / SEQUENCE_LENGTH);
          setTotalSequences(numSequences);
        }
        setIsParsing(false);
      },
      error: (err) => {
        setUploadError(`Failed to parse CSV: ${err.message}`);
        setIsParsing(false);
        setParsedData(null);
      }
    });
  };

  // Transform row function - same as before...
  const transformRow = (row: any, csvHeaders: string[]): any | null => {
    const transformed: any = {};
    const requiredBackendKeys = ['x_direction', 'y_direction', 'bearing_tem', 'env_temp'];

    for (const backendKey of requiredBackendKeys) {
      let valueSuccessfullySetForBackendKey = false;

      for (const patternFromHeaderMapping of Object.keys(headerMapping)) {
        if (headerMapping[patternFromHeaderMapping] === backendKey) {
          const normalizedPattern = patternFromHeaderMapping.toLowerCase().replace(/\s+/g, '');
          
          const actualCsvHeader = csvHeaders.find(h => {
            const normalizedHeader = h.toLowerCase().replace(/\s+/g, '');
            return normalizedHeader === normalizedPattern;
          });

          if (actualCsvHeader && row[actualCsvHeader] !== undefined && row[actualCsvHeader] !== null && row[actualCsvHeader] !== '') {
            const val = parseFloat(row[actualCsvHeader]);
            if (!isNaN(val)) {
              transformed[backendKey] = val;
              valueSuccessfullySetForBackendKey = true;
              break;
            }
          }
        }
      }

      if (valueSuccessfullySetForBackendKey) {
        continue;
      }

      if (row[backendKey] !== undefined && row[backendKey] !== null && row[backendKey] !== '') {
        const directVal = parseFloat(row[backendKey]);
        if (!isNaN(directVal)) {
          transformed[backendKey] = directVal;
          valueSuccessfullySetForBackendKey = true;
        }
      }

      if (!valueSuccessfullySetForBackendKey) {
        return null;
      }
    }

    return transformed;
  };

  // Processing logic - same as before but with enhanced UI feedback...
  const handleStartSimulation = async () => {
    if (!parsedData || parsedData.length < SEQUENCE_LENGTH) {
      setUploadError(`Not enough data to form a sequence. Need at least ${SEQUENCE_LENGTH} rows.`);
      return;
    }
    if (!assetIdForSim.trim()) {
      setUploadError('Please enter an Asset ID for the simulation.');
      return;
    }

    const abortController = new AbortController();
    setSimulationAbortController(abortController);

    setIsProcessing(true);
    setUploadError(null);
    setSimulationProgress('Starting simulation...');
    setSimulationResults([]);
    setCurrentSequence(0);
    setProcessingStartTime(Date.now());

    const numSequences = Math.floor(parsedData.length / SEQUENCE_LENGTH);
    setTotalSequences(numSequences);

    const BATCH_SIZE = batchSize;
    const batches = [];
    
    for (let i = 0; i < numSequences; i += BATCH_SIZE) {
      const batchEnd = Math.min(i + BATCH_SIZE, numSequences);
      batches.push({ start: i, end: batchEnd });
    }

    try {
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        if (abortController.signal.aborted) {
          throw new Error('Simulation stopped by user');
        }

        const batch = batches[batchIndex];
        setSimulationProgress(`Processing batch ${batchIndex + 1} of ${batches.length} (sequences ${batch.start + 1}-${batch.end})...`);

        const bulkSequences: any[][] = [];
        const sequenceMetadata: Array<{ sequenceNumber: number; originalIndex: number }> = [];

        for (let i = batch.start; i < batch.end; i++) {
          const sequenceStartIndex = i * SEQUENCE_LENGTH;
          const sequenceEndIndex = sequenceStartIndex + SEQUENCE_LENGTH;
          const rawSequence = parsedData.slice(sequenceStartIndex, sequenceEndIndex);

          const transformedRows = [];
          for (let j = 0; j < rawSequence.length; j++) {
            const row = rawSequence[j];
            const transformedRow = transformRow(row, headerRow);
            if (transformedRow === null) {
              continue;
            }
            transformedRows.push(transformedRow);
          }

          if (transformedRows.length !== SEQUENCE_LENGTH) {
            setSimulationResults(prev => [...prev, { 
              sequenceNumber: i + 1, 
              predictedRul: 0, 
              timestamp: new Date().toISOString(),
              error: `Sequence ${i + 1} is incomplete after transformation`
            }]);
            continue;
          }

          bulkSequences.push(transformedRows);
          sequenceMetadata.push({ sequenceNumber: i + 1, originalIndex: i });
        }

        if (bulkSequences.length > 0) {
          try {
            const bulkResponse = processingMode === 'fast' 
              ? await predictRulForAssetBulkFast(assetIdForSim, bulkSequences)
              : await predictRulForAssetBulk(assetIdForSim, bulkSequences);
              
            const { predictions, total_processed, failed_count, processing_time_seconds } = bulkResponse.data;

            const newResults = predictions.map((prediction: any, index: number) => {
              const metadata = sequenceMetadata[index];
              return {
                sequenceNumber: metadata.sequenceNumber,
                predictedRul: prediction.predicted_rul > 0 ? prediction.predicted_rul : 0,
                timestamp: new Date().toISOString(),
                error: prediction.predicted_rul < 0 ? 'Prediction failed' : undefined
              };
            });

            setSimulationResults(prev => [...prev, ...newResults]);
            setCurrentSequence(batch.end);

            if (processingStartTime) {
              const elapsedSeconds = (Date.now() - processingStartTime) / 1000;
              const rate = batch.end / elapsedSeconds;
              setSequencesPerSecond(Math.round(rate * 10) / 10);
            }

          } catch (error) {
            console.error('Bulk processing error:', error);
            const errorResults = sequenceMetadata.map(metadata => ({
              sequenceNumber: metadata.sequenceNumber,
              predictedRul: 0,
              timestamp: new Date().toISOString(),
              error: `Bulk processing failed: ${error.message || 'Unknown error'}`
            }));
            setSimulationResults(prev => [...prev, ...errorResults]);
          }
        }

        if (batchIndex < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      setSimulationProgress(`Simulation finished. Processed ${numSequences} sequences in ${batches.length} batches.`);
    } catch (err: any) {
      if (err.message === 'Simulation stopped by user') {
        setSimulationProgress('Simulation stopped by user.');
      } else {
        setUploadError(`Simulation failed: ${err.message}`);
        setSimulationProgress('Simulation failed.');
      }
    } finally {
      setIsProcessing(false);
      setSimulationAbortController(null);
    }
  };

  const stopSimulation = () => {
    if (simulationAbortController) {
      simulationAbortController.abort();
      setSimulationAbortController(null);
      setIsProcessing(false);
      setSimulationProgress('Simulation stopped by user.');
    }
  };

  const handleRowClick = (assetId: string | number) => {
    navigate(`/assets/${assetId}`);
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div className="space-y-1">
            <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Proactive Bearing Health Dashboard
            </h1>
            <p className="text-xl text-slate-600">Real-time AI-powered predictive maintenance</p>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="outline" asChild>
              <RouterLink to="/alerts" className="gap-2">
                <AlertTriangle className="h-4 w-4" />
                Alerts
              </RouterLink>
            </Button>
            <Button variant="outline" asChild>
              <RouterLink to="/diagnostics" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Diagnostics
              </RouterLink>
            </Button>
          </div>
        </motion.div>

        {/* KPI Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-blue-100">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-blue-800">Total Assets</CardTitle>
              <Database className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-900">{totalAssets}</div>
              <p className="text-xs text-blue-600">Monitored equipment</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-red-50 to-red-100">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-red-800">Critical</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-900">{criticalAssets}</div>
              <p className="text-xs text-red-600">Immediate attention required</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-50 to-amber-100">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-amber-800">Warning</CardTitle>
              <Clock className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-900">{warningAssets}</div>
              <p className="text-xs text-amber-600">Schedule maintenance soon</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-green-50 to-green-100">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-800">Healthy</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-900">{healthyAssets}</div>
              <p className="text-xs text-green-600">Operating normally</p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Main Content Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Tabs defaultValue="analysis" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3 bg-white shadow-md">
              <TabsTrigger value="analysis" className="gap-2">
                <Zap className="h-4 w-4" />
                Real-Time Analysis
              </TabsTrigger>
              <TabsTrigger value="assets" className="gap-2">
                <Users className="h-4 w-4" />
                Asset Overview
              </TabsTrigger>
              <TabsTrigger value="insights" className="gap-2">
                <TrendingUp className="h-4 w-4" />
                Insights
              </TabsTrigger>
            </TabsList>

            <TabsContent value="analysis" className="space-y-6">
              <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Activity className="h-5 w-5 text-blue-600" />
                        AI-Powered Data Processing
                      </CardTitle>
                      <CardDescription>
                        Upload sensor data for real-time RUL predictions using our advanced CNN-LSTM model
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="advanced-mode" className="text-sm">Advanced</Label>
                      <Switch
                        id="advanced-mode"
                        checked={advancedMode}
                        onCheckedChange={setAdvancedMode}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* File Upload Section */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="csv-upload" className="text-base font-medium">
                          Upload Sensor Data
                        </Label>
                        <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                          <Upload className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                          <input
                            type="file"
                            id="csv-upload"
                            accept=".csv"
                            onChange={handleFileChange}
                            className="hidden"
                          />
                          <Label htmlFor="csv-upload" className="cursor-pointer">
                            <span className="text-sm text-slate-600">
                              Click to upload or drag and drop
                            </span>
                            <br />
                            <span className="text-xs text-slate-400">CSV files only</span>
                          </Label>
                        </div>
                        {selectedFile && (
                          <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-md">
                            <FileText className="h-4 w-4 text-blue-600" />
                            <span className="text-sm text-blue-800">{selectedFile.name}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <Button 
                          onClick={handleParseCsv}
                          disabled={!selectedFile || isParsing}
                          className="flex-1"
                        >
                          {isParsing ? 'Parsing...' : 'Parse CSV'}
                        </Button>
                        
                        {parsedData && (
                          <Badge variant="secondary" className="bg-green-100 text-green-800 px-3 py-1">
                            ✓ {parsedData.length} rows ({totalSequences} sequences)
                          </Badge>
                        )}
                      </div>

                      {uploadError && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                          <p className="text-sm text-red-600">{uploadError}</p>
                        </div>
                      )}
                    </div>

                    {/* Configuration Panel */}
                    {parsedData && (
                      <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="space-y-4"
                      >
                        <div className="space-y-2">
                          <Label htmlFor="asset-id">Asset ID</Label>
                          <Input
                            id="asset-id"
                            value={assetIdForSim}
                            onChange={(e) => setAssetIdForSim(e.target.value)}
                            placeholder="Enter Asset ID (UUID format)"
                            disabled={isProcessing}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="processing-mode">Processing Mode</Label>
                          <Select value={processingMode} onValueChange={(value: 'fast' | 'standard') => setProcessingMode(value)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="fast">
                                <div className="flex items-center gap-2">
                                  <Zap className="h-4 w-4" />
                                  Ultra-Fast (Vectorized)
                                </div>
                              </SelectItem>
                              <SelectItem value="standard">
                                <div className="flex items-center gap-2">
                                  <Settings className="h-4 w-4" />
                                  Standard (Individual)
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {advancedMode && (
                          <div className="space-y-2">
                            <Label htmlFor="batch-size">Batch Size</Label>
                            <Select value={batchSize.toString()} onValueChange={(value) => setBatchSize(Number(value))}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="10">10 (Conservative)</SelectItem>
                                <SelectItem value="20">20 (Balanced)</SelectItem>
                                <SelectItem value="30">30 (Recommended)</SelectItem>
                                <SelectItem value="50">50 (Aggressive)</SelectItem>
                                <SelectItem value="100">100 (Maximum)</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-slate-500">
                              Estimated time: ~{Math.ceil(totalSequences / batchSize * 2)} seconds
                            </p>
                          </div>
                        )}

                        <div className="flex gap-2">
                          <Button
                            onClick={handleStartSimulation}
                            disabled={isProcessing || !assetIdForSim.trim()}
                            className="flex-1 gap-2"
                          >
                            {isProcessing ? (
                              <>
                                <Activity className="h-4 w-4 animate-spin" />
                                Processing...
                              </>
                            ) : (
                              <>
                                <PlayCircle className="h-4 w-4" />
                                Start Analysis
                              </>
                            )}
                          </Button>
                          
                          {isProcessing && (
                            <Button
                              onClick={stopSimulation}
                              variant="destructive"
                              size="icon"
                            >
                              <StopCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>

                        {simulationProgress && (
                          <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                            <p className="text-sm text-blue-700">{simulationProgress}</p>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>

                  {/* Data Preview */}
                  {parsedData && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-3"
                    >
                      <Separator />
                      <h4 className="font-medium text-slate-800">Data Preview</h4>
                      <div className="overflow-hidden rounded-lg border">
                        <div className="overflow-x-auto max-h-40">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50">
                              <tr>
                                {headerRow.slice(0, 6).map((header, index) => (
                                  <th key={index} className="px-3 py-2 text-left font-medium text-slate-600">
                                    {header}
                                  </th>
                                ))}
                                {headerRow.length > 6 && (
                                  <th className="px-3 py-2 text-left font-medium text-slate-600">...</th>
                                )}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {parsedData.slice(0, 5).map((row, rowIndex) => (
                                <tr key={rowIndex} className="hover:bg-slate-50">
                                  {headerRow.slice(0, 6).map((header, colIndex) => (
                                    <td key={colIndex} className="px-3 py-2 text-slate-700">
                                      {typeof row[header] === 'number' 
                                        ? Number(row[header]).toFixed(3)
                                        : row[header]
                                      }
                                    </td>
                                  ))}
                                  {headerRow.length > 6 && (
                                    <td className="px-3 py-2 text-slate-500">...</td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </CardContent>
              </Card>

              {/* Processing Results */}
              {simulationResults.length > 0 && (
                <AnimatePresence>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    {/* Enhanced KPIs */}
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                      <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-50 to-purple-100">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-purple-800">Avg RUL</p>
                              <p className="text-2xl font-bold text-purple-900">
                                {successfulPredictions.length > 0 
                                  ? (successfulPredictions.reduce((sum, p) => sum + p.predictedRul, 0) / successfulPredictions.length).toFixed(0)
                                  : '0'
                                }
                              </p>
                            </div>
                            <Target className="h-8 w-8 text-purple-600" />
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-0 shadow-lg bg-gradient-to-br from-indigo-50 to-indigo-100">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-indigo-800">Min RUL</p>
                              <p className="text-2xl font-bold text-indigo-900">
                                {successfulPredictions.length > 0 
                                  ? Math.min(...successfulPredictions.map(p => p.predictedRul)).toFixed(0)
                                  : '0'
                                }
                              </p>
                            </div>
                            <Shield className="h-8 w-8 text-indigo-600" />
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-0 shadow-lg bg-gradient-to-br from-cyan-50 to-cyan-100">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-cyan-800">Max RUL</p>
                              <p className="text-2xl font-bold text-cyan-900">
                                {successfulPredictions.length > 0 
                                  ? Math.max(...successfulPredictions.map(p => p.predictedRul)).toFixed(0)
                                  : '0'
                                }
                              </p>
                            </div>
                            <TrendingUp className="h-8 w-8 text-cyan-600" />
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-0 shadow-lg bg-gradient-to-br from-emerald-50 to-emerald-100">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-emerald-800">Progress</p>
                              <p className="text-2xl font-bold text-emerald-900">
                                {totalSequences > 0 
                                  ? ((completedSequences / totalSequences) * 100).toFixed(1)
                                  : '0'
                                }%
                              </p>
                            </div>
                            <Gauge className="h-8 w-8 text-emerald-600" />
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-0 shadow-lg bg-gradient-to-br from-orange-50 to-orange-100">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-orange-800">Speed</p>
                              <p className="text-2xl font-bold text-orange-900">
                                {sequencesPerSecond.toFixed(1)} seq/s
                              </p>
                            </div>
                            <Activity className="h-8 w-8 text-orange-600" />
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Enhanced Charts Section */}
                    <div className="space-y-6">
                      {/* Real-Time Progress Chart - Prominent Top Position */}
                      <Card className="border-0 shadow-2xl bg-gradient-to-br from-blue-50 via-white to-purple-50 backdrop-blur-sm">
                        <CardHeader className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-t-lg">
                          <CardTitle className="flex items-center justify-between text-xl">
                            <div className="flex items-center gap-3">
                              <LineChart className="h-6 w-6" />
                              Real-Time RUL Predictions
                            </div>
                            <Badge variant="secondary" className="bg-white/20 text-white">
                              Live
                            </Badge>
                          </CardTitle>
                          <CardDescription className="text-blue-100">
                            Monitor RUL predictions as they are generated in real-time
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="p-6">
                          <div className="h-96 lg:h-[500px]">
                            <RealTimeProgressChart
                              data={successfulPredictions}
                              isProcessing={isProcessing}
                            />
                          </div>
                        </CardContent>
                      </Card>

                      {/* Secondary Charts Row */}
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        {/* RUL Distribution Chart */}
                        {successfulPredictions.length > 0 && (
                          <Card className="border-0 shadow-xl bg-gradient-to-br from-purple-50 via-white to-pink-50 backdrop-blur-sm">
                            <CardHeader className="bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-t-lg">
                              <CardTitle className="flex items-center gap-3">
                                <BarChart3 className="h-5 w-5" />
                                RUL Distribution Analysis
                              </CardTitle>
                              <CardDescription className="text-purple-100">
                                Distribution of predicted remaining useful life values
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="p-6">
                              <div className="h-80 lg:h-96">
                                <RulDistributionChart predictions={successfulPredictions} />
                              </div>
                            </CardContent>
                          </Card>
                        )}

                        {/* Live Alerts Panel */}
                        <Card className="border-0 shadow-xl bg-gradient-to-br from-red-50 via-white to-orange-50 backdrop-blur-sm">
                          <CardHeader className="bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-t-lg">
                            <CardTitle className="flex items-center gap-3">
                              <AlertTriangle className="h-5 w-5" />
                              Critical Alerts
                            </CardTitle>
                            <CardDescription className="text-red-100">
                              Real-time alerts for critical RUL thresholds
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="p-6">
                            <AlertsPanel predictions={successfulPredictions} />
                          </CardContent>
                        </Card>
                      </div>

                      {/* Processing Status - Full Width at Bottom */}
                      <Card className="border-0 shadow-xl bg-gradient-to-br from-emerald-50 via-white to-teal-50 backdrop-blur-sm">
                        <CardHeader className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-t-lg">
                          <CardTitle className="flex items-center gap-3">
                            <Activity className="h-5 w-5" />
                            Processing Status & Performance
                          </CardTitle>
                          <CardDescription className="text-emerald-100">
                            Monitor the analysis progress and system performance
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="p-6">
                          <ProcessingStatus
                            currentSequence={currentSequence}
                            totalSequences={totalSequences}
                            isProcessing={isProcessing}
                            completedSequences={completedSequences}
                            errorSequences={errorSequences}
                            processingSpeed={sequencesPerSecond}
                          />
                        </CardContent>
                      </Card>
                    </div>
                  </motion.div>
                </AnimatePresence>
              )}
            </TabsContent>

            <TabsContent value="assets">
              {/* Assets table will go here - same as before but with enhanced styling */}
              <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-600" />
                    Asset Overview
                  </CardTitle>
                  <CardDescription>
                    Monitor all your equipment with real-time health status
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Activity className="h-8 w-8 animate-spin text-blue-600" />
                      <span className="ml-2 text-slate-600">Loading assets...</span>
                    </div>
                  ) : error ? (
                    <div className="text-center py-12">
                      <AlertTriangle className="h-12 w-12 mx-auto text-red-500 mb-4" />
                      <p className="text-red-600">Error loading assets: {error.message}</p>
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-lg border">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                                Name
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                                Type
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                                Location
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                                Status
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                                Latest RUL
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                                Trend
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {data?.map((asset: AssetWithLatestRul) => (
                              <tr 
                                key={asset.id}
                                onClick={() => handleRowClick(asset.id)}
                                className={`cursor-pointer hover:bg-slate-50 transition-colors ${
                                  asset.latest_rul !== null && asset.latest_rul !== undefined && asset.latest_rul <= 20000
                                    ? 'bg-red-50'
                                    : asset.latest_rul !== null && asset.latest_rul !== undefined && asset.latest_rul <= 60000
                                    ? 'bg-amber-50'
                                    : ''
                                }`}
                              >
                                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-slate-900">
                                  {asset.name}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                                  {asset.asset_type}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                                  {asset.location}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm">
                                  <Badge 
                                    variant={
                                      asset.latest_rul !== null && asset.latest_rul !== undefined && asset.latest_rul <= 20000
                                        ? "destructive"
                                        : asset.latest_rul !== null && asset.latest_rul !== undefined && asset.latest_rul <= 60000
                                        ? "default"
                                        : "secondary"
                                    }
                                  >
                                    {asset.operational_status}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-slate-700">
                                  {asset.latest_rul ?? 'N/A'}
                                </td>
                                <td className="px-4 py-3 w-32">
                                  <RulSparkline assetId={asset.id} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="insights">
              <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                    System Insights
                  </CardTitle>
                  <CardDescription>
                    Advanced analytics and trends from your predictive maintenance data
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Add insights charts and analytics here */}
                  <div className="text-center py-12">
                    <BarChart3 className="h-12 w-12 mx-auto text-slate-400 mb-4" />
                    <p className="text-slate-600">Advanced insights coming soon...</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </div>
  );
};

export default DashboardPage;
