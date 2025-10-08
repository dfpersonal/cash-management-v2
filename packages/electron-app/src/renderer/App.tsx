import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box, Alert, Snackbar } from '@mui/material';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { PortfolioManagement } from './pages/PortfolioManagement';
import { Configuration } from './pages/Configuration';
import { Calendar } from './pages/Calendar';
import { BalanceChecker } from './pages/BalanceChecker';
import { Audit } from './pages/Audit';
import { DataCollection } from './pages/DataCollection';
import { OptimizationDashboard } from './pages/OptimizationDashboard';
import { FRNManagement } from './pages/FRNManagement';
import { OptimizationProvider } from './contexts/OptimizationContext';
import { AppState } from '@cash-mgmt/shared';

export const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>({
    isLoading: false,
    error: null,
    lastRefresh: null,
    selectedView: 'dashboard',
  });

  const [snackbarOpen, setSnackbarOpen] = useState(false);

  // Initialize app and check for database connection
  useEffect(() => {
    const initializeApp = async () => {
      setAppState(prev => ({ ...prev, isLoading: true }));
      
      try {
        // Test database connection by fetching portfolio summary
        await window.electronAPI.getPortfolioSummary();
        setAppState(prev => ({ 
          ...prev, 
          isLoading: false, 
          lastRefresh: new Date(),
          error: null 
        }));
      } catch (error) {
        console.error('Failed to initialize app:', error);
        setAppState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: 'Failed to connect to database. Please check your configuration.' 
        }));
      }
    };

    initializeApp();
  }, []);

  // Listen for menu events from main process
  useEffect(() => {
    const handleGenerateReport = () => {
      console.log('Generate report requested');
      // TODO: Implement report generation
    };

    const handleRefreshData = () => {
      setAppState(prev => ({ ...prev, lastRefresh: new Date() }));
    };

    const handleNavigateTo = (path: string) => {
      window.location.hash = path;
    };

    const handleOpenPreferences = () => {
      window.location.hash = '/configuration';
    };

    const handleShowAbout = () => {
      alert(`Cash Management Desktop v${process.env.npm_package_version || '1.0.0'}\n\nProfessional Cash Portfolio Management System`);
    };

    // Note: In a real implementation, you'd set up IPC listeners here
    // For now, we'll just log that the handlers are set up
    console.log('Menu event handlers initialized');

    return () => {
      // Cleanup listeners
    };
  }, []);

  const handleCloseSnackbar = () => {
    setSnackbarOpen(false);
  };

  const handleClearError = () => {
    setAppState(prev => ({ ...prev, error: null }));
  };

  const refreshData = async () => {
    setAppState(prev => ({ ...prev, isLoading: true }));
    
    try {
      // Trigger a data refresh
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate refresh
      setAppState(prev => ({ 
        ...prev, 
        isLoading: false, 
        lastRefresh: new Date(),
        error: null 
      }));
    } catch (error) {
      console.error('Failed to refresh data:', error);
      setAppState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: 'Failed to refresh data. Please try again.' 
      }));
    }
  };

  return (
    <OptimizationProvider>
      <Box
        sx={{ display: 'flex', height: '100vh', overflowY: 'hidden' }}
        data-testid="app-ready"
      >
        <Layout
          appState={appState}
          onRefresh={refreshData}
          onClearError={handleClearError}
        >
          <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route 
            path="/dashboard" 
            element={<Dashboard appState={appState} />} 
          />
          <Route 
            path="/management" 
            element={<PortfolioManagement />} 
          />
          <Route 
            path="/configuration" 
            element={<Configuration appState={appState} />} 
          />
          <Route 
            path="/calendar" 
            element={<Calendar />} 
          />
          <Route 
            path="/balance-checker" 
            element={<BalanceChecker appState={appState} onRefresh={refreshData} />} 
          />
          <Route 
            path="/audit" 
            element={<Audit appState={appState} />} 
          />
          <Route 
            path="/data-collection" 
            element={<DataCollection />} 
          />
          <Route 
            path="/frn-management" 
            element={<FRNManagement />} 
          />
          <Route 
            path="/optimization" 
            element={<OptimizationDashboard />} 
          />
        </Routes>
      </Layout>

      {/* Error Snackbar */}
      <Snackbar
        open={!!appState.error}
        autoHideDuration={6000}
        onClose={handleClearError}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={handleClearError} 
          severity="error" 
          sx={{ width: '100%' }}
        >
          {appState.error}
        </Alert>
      </Snackbar>
    </Box>
    </OptimizationProvider>
  );
};