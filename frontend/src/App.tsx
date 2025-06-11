import './App.css'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AssetDetailPage from './pages/AssetDetailPage';
import AlertsPage from './pages/AlertsPage';
import ModelDiagnosticsPage from './pages/ModelDiagnosticsPage';
import DataImportPage from './pages/DataImportPage';
import { Layout } from './components/Layout';
import ModernDashboard from './components/ModernDashboard';

// DashboardPage component using ModernDashboard
const DashboardPage = () => {
  return <ModernDashboard />;
};

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/assets/:assetId" element={<AssetDetailPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/diagnostics" element={<ModelDiagnosticsPage />} /> {/* Add route for diagnostics page */}
          <Route path="/import-data" element={<DataImportPage />} /> {/* Add route for DataImportPage */}
        </Routes>
      </Layout>
    </Router>
  )
}

export default App
