"use client"

import type React from "react"
import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import {
  BarChart3, Bell, Settings, Search, Upload, Database, AlertTriangle, CheckCircle, PlayCircle, StopCircle, Clock, TrendingUp, ChevronDown, ChevronUp, Calculator, Download, Loader2
} from 'lucide-react'

import Papa from 'papaparse';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import RealTimeProgressChart from "./RealTimeProgressChart";
import { useAssetsWithLatestRul, predictRulForAssetBulkFast, predictRulForAssetBulk } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

  // Calculate KPIs based on fetched data with real-world RUL adjustments
  const totalAssets = assets?.length ?? 0;
  
  // Apply real-world adjustments to all RUL calculations
  const assetsWithAdjustedRul = assets?.map(asset => ({
    ...asset,
    adjusted_rul: asset.latest_rul ? calculateRealWorldRul(asset.latest_rul) : null
  })) ?? [];

  const criticalAssets = assetsWithAdjustedRul.filter(a => (a.adjusted_rul ?? Infinity) <= 100).length; // 100 hrs = ~4 days critical
  const warningAssets = assetsWithAdjustedRul.filter(a => (a.adjusted_rul ?? Infinity) > 100 && (a.adjusted_rul ?? 0) <= 500).length; // 100-500 hrs warning
  const healthyAssets = assetsWithAdjustedRul.filter(a => (a.adjusted_rul ?? 0) > 500).length; // >500 hrs healthy
  const avgRul = assetsWithAdjustedRul && totalAssets > 0 ? Math.round(assetsWithAdjustedRul.reduce((sum, a) => sum + (a.adjusted_rul ?? 0), 0) / totalAssets) : 0;

  // CSV Processing States
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedData, setParsedData] = useState<any[] | null>(null);
  const [headerRow, setHeaderRow] = useState<string[]>([]);
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
  const [currentSequence, setCurrentSequence] = useState(0);
  const [simulationAbortController, setSimulationAbortController] = useState<AbortController | null>(null);
  const [batchSize, setBatchSize] = useState(30);
  const [processingMode, setProcessingMode] = useState<'fast' | 'standard'>('fast');
  const [processingStartTime, setProcessingStartTime] = useState<number | null>(null);
  const [droppedRowCount, setDroppedRowCount] = useState<number>(0);
  const [skippedSequenceCount, setSkippedSequenceCount] = useState<number>(0);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [showValidationDetails, setShowValidationDetails] = useState<boolean>(false);

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
                      <Database className="h-4 w-4 text-blue-600" />
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
                            <AvatarFallback className={asset.adjusted_rul && asset.adjusted_rul <= 100 ? 'bg-red-100 text-red-700' : asset.adjusted_rul && asset.adjusted_rul <= 500 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}>
                              {asset.name ? asset.name.substring(0, 2).toUpperCase() : String(asset.id).substring(0,2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-grow min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate" title={asset.name || `Asset ${asset.id}`}>{asset.name || `Asset ${String(asset.id).substring(0,10)}...`}</p>
                            <p className="text-xs text-gray-500 truncate" title={`ID: ${asset.id}`}>ID: {String(asset.id).substring(0, 12)}...</p>
                          </div>
                          <div className="text-right flex-shrink-0 ml-2">
                            <p className={`text-sm font-semibold ${asset.adjusted_rul && asset.adjusted_rul <= 100 ? 'text-red-600' : asset.adjusted_rul && asset.adjusted_rul <= 500 ? 'text-yellow-600' : 'text-green-600'}`}>
                              {asset.adjusted_rul ? Math.round(asset.adjusted_rul).toLocaleString() : 'N/A'}
                            </p>
                            <p className="text-xs text-gray-400">RUL (hrs)</p>
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
                    All RUL values shown throughout the dashboard are adjusted using these factors.
                  </p>
                </div>
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
              </CardContent>
            </Card>

            {/* Enhanced Recent Activity / Asset List Card */}
            <Card className="bg-white rounded-xl shadow-sm border-0">
              <CardHeader>
                <CardTitle className="text-xl font-semibold">Asset Overview</CardTitle>
                <CardDescription>Details for all {totalAssets} assets with real-world adjusted RUL. Click to view more.</CardDescription>
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
                                         asset.adjusted_rul <= 100 ? 'bg-red-100 text-red-700' :
                                         asset.adjusted_rul <= 500 ? 'bg-yellow-100 text-yellow-700' :
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
                            <p className={`text-sm font-semibold ${asset.adjusted_rul === null || asset.adjusted_rul === undefined ? 'text-gray-500' :
                                             asset.adjusted_rul <= 100 ? 'text-red-600' :
                                             asset.adjusted_rul <= 500 ? 'text-yellow-600' :
                                             'text-green-600'}`}>
                              {asset.adjusted_rul !== null && asset.adjusted_rul !== undefined ? Math.round(asset.adjusted_rul).toLocaleString() : 'N/A'}
                            </p>
                            <p className="text-xs text-gray-400">RUL (hrs)</p>
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
                    <p className="text-lg font-bold text-gray-900">FleetRULNet</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-white rounded-xl shadow-sm border-0">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="h-8 w-8 rounded-lg bg-green-100 flex items-center justify-center">
                      <Database className="h-4 w-4 text-green-600" />
                    </div>
                    <span className="text-xs text-gray-400">2024-06-01</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500">Last Retrained</p>
                    <p className="text-lg font-bold text-gray-900">June 1, 2024</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-white rounded-xl shadow-sm border-0">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="h-8 w-8 rounded-lg bg-yellow-100 flex items-center justify-center">
                      <Upload className="h-4 w-4 text-yellow-600" />
                    </div>
                    <span className="text-xs text-gray-400">SensorNet v5</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500">Data Source</p>
                    <p className="text-lg font-bold text-gray-900">Edge Sensors</p>
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
