/**
 * OptimizationDashboard Component - Main dashboard for FSCS and Rate Optimizer modules
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  ButtonGroup,
  Paper,
  Tabs,
  Tab,
  Divider,
  Alert,
  Skeleton,
  Fab,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Switch,
  Slider,
  Chip,
  IconButton,
} from '@mui/material';
import {
  Security as FSCSIcon,
  TrendingUp as OptimizerIcon,
  PlayArrow as RunIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
  History as HistoryIcon,
  Assessment as AnalyzeIcon,
  AccountBalance as DiversifyIcon,
  Download as ExportIcon,
} from '@mui/icons-material';

import { useOptimization } from '../../contexts/OptimizationContext';
import ProgressBar from './ProgressBar';
import ResultsDisplay from './ResultsDisplay';
import ActionItemsList from './ActionItemsList';
import OptimizationConflictDialog from './OptimizationConflictDialog';
import { OptimizationConflictService } from '../../services/optimizationConflictService';
import { OptimizationConflict } from '@cash-mgmt/shared';
import { PendingMoveTypes';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`optimization-tabpanel-${index}`}
      aria-labelledby={`optimization-tab-${index}`}
    >
      {value === index && <Box>{children}</Box>}
    </div>
  );
};

const OptimizationDashboard: React.FC = () => {
  const {
    // State
    fscsResult,
    fscsProgress,
    isFSCSRunning,
    fscsError,
    optimizerResult,
    optimizerProgress,
    isOptimizerRunning,
    optimizerError,
    actionItems,
    calendarEvents,
    lastUpdated,
    // Methods
    checkFSCSCompliance,
    generateFSCSDiversification,
    cancelFSCS,
    runRateOptimization,
    analyzePortfolio,
    cancelOptimizer,
    approveRecommendations,
    rejectRecommendation,
    updateActionItemStatus,
    refreshActionItems,
    refreshCalendarEvents,
    clearResults,
  } = useOptimization();

  const [activeTab, setActiveTab] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  // Conflict detection state
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [currentConflict, setCurrentConflict] = useState<OptimizationConflict | null>(null);
  const [pendingOptimizationType, setPendingOptimizationType] = useState<'fscs' | 'optimizer' | null>(null);
  const [isResolvingConflict, setIsResolvingConflict] = useState(false);
  const [fscsOptions, setFSCSOptions] = useState({
    includePending: false,
    warningThreshold: 90,
    diversify: false,
  });
  const [optimizerOptions, setOptimizerOptions] = useState({
    excludeShariaBanks: false,
    minBenefit: 100,
    minMoveAmount: 1000,
  });
  
  // FRN Products configuration state
  const [allowNoFRNProducts, setAllowNoFRNProducts] = useState<boolean>(false);
  const [isUpdatingConfig, setIsUpdatingConfig] = useState<boolean>(false);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const handleRunFSCS = async () => {
    await checkFSCSCompliance({
      ...fscsOptions,
      includeCalendarEvents: true,
      includeActionItems: true,
    });
  };

  // Check for conflicts before running optimization
  const checkAndHandleConflicts = async (optimizationType: 'fscs' | 'optimizer'): Promise<boolean> => {
    try {
      console.log('🔍 Checking for optimization conflicts...');
      const conflict = await OptimizationConflictService.checkForConflicts();
      
      if (conflict.hasConflicts) {
        console.log('⚠️ Conflicts detected, showing warning dialog');
        setCurrentConflict(conflict);
        setPendingOptimizationType(optimizationType);
        setConflictDialogOpen(true);
        return false; // Don't proceed with optimization
      } else {
        console.log('✅ No conflicts detected, safe to proceed');
        return true; // Safe to proceed
      }
    } catch (error) {
      console.error('❌ Error checking for conflicts:', error);
      // If we can't check conflicts, let user decide
      alert('⚠️ Unable to check for pending move conflicts. Please review your pending moves manually before continuing.');
      return false;
    }
  };

  const handleRunDiversification = async () => {
    const canProceed = await checkAndHandleConflicts('fscs');
    if (canProceed) {
      await executeOptimization('fscs');
    }
  };

  const handleRunOptimizer = async () => {
    const canProceed = await checkAndHandleConflicts('optimizer');
    if (canProceed) {
      await executeOptimization('optimizer');
    }
  };

  // Execute the actual optimization after conflicts are resolved
  const executeOptimization = async (type: 'fscs' | 'optimizer') => {
    if (type === 'fscs') {
      await generateFSCSDiversification({
        ...fscsOptions,
        includeCalendarEvents: true,
        includeActionItems: true,
        diversify: true,
      });
    } else {
      await runRateOptimization({
        ...optimizerOptions,
        includeCalendarEvents: true,
        includeActionItems: true,
      });
    }
  };

  // Handle conflict resolution
  const handleConflictContinue = async () => {
    if (!currentConflict || !pendingOptimizationType) return;
    
    setIsResolvingConflict(true);
    try {
      console.log('🔄 Resolving conflicts...');
      const result = await OptimizationConflictService.resolveConflicts(currentConflict);
      
      if (result.success) {
        console.log(`✅ Resolved ${result.deletedCount} conflicting pending moves`);
        
        // Close dialog and execute the pending optimization
        setConflictDialogOpen(false);
        await executeOptimization(pendingOptimizationType);
        
        // Refresh action items to reflect changes
        await refreshActionItems();
      } else {
        console.error('❌ Failed to resolve conflicts:', result.error);
        alert(`Failed to resolve conflicts: ${result.error}`);
      }
    } catch (error) {
      console.error('❌ Error resolving conflicts:', error);
      alert('Error resolving conflicts. Please try again.');
    } finally {
      setIsResolvingConflict(false);
      setCurrentConflict(null);
      setPendingOptimizationType(null);
    }
  };

  const handleConflictCancel = () => {
    setConflictDialogOpen(false);
    setCurrentConflict(null);
    setPendingOptimizationType(null);
  };

  const handleAnalyzePortfolio = async () => {
    await analyzePortfolio(optimizerOptions);
  };

  const handleExportResults = () => {
    const dataToExport = {
      fscsResult,
      optimizerResult,
      actionItems,
      calendarEvents,
      exportDate: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    
    // Use a ref or state-based approach instead of direct DOM manipulation
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = `optimization-results-${new Date().toISOString().split('T')[0]}.json`;
    downloadLink.style.display = 'none';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    
    // Clean up
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  // Fetch initial FRN configuration on mount
  useEffect(() => {
    const fetchFRNConfig = async () => {
      try {
        const result = await window.electronAPI.getConfigValue('allow_no_frn_products');
        if (result && result.value !== null) {
          setAllowNoFRNProducts(result.value);
        }
      } catch (error) {
        console.error('Failed to fetch FRN configuration:', error);
      }
    };
    fetchFRNConfig();
  }, []);

  // Handle FRN toggle switch change
  const handleFRNToggle = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.checked;
    setIsUpdatingConfig(true);
    
    try {
      // Update the configuration in database
      await window.electronAPI.updateConfiguration({
        allow_no_frn_products: newValue
      });
      
      setAllowNoFRNProducts(newValue);
      
      // Automatically rerun rate optimization with new setting
      await runRateOptimization({
        ...optimizerOptions,
        includeCalendarEvents: true,
        includeActionItems: true,
      });
    } catch (error) {
      console.error('Failed to update FRN configuration:', error);
    } finally {
      setIsUpdatingConfig(false);
    }
  };

  const isAnyProcessRunning = isFSCSRunning || isOptimizerRunning;
  const hasAnyResults = fscsResult || optimizerResult;
  const pendingActionItems = actionItems.filter(item => item.status === 'pending');
  const urgentActionItems = actionItems.filter(item => item.priority === 'urgent' && item.status === 'pending');

  return (
    <Box sx={{ p: 3 }}>
      <Grid container spacing={3}>
        {/* Header */}
        <Grid item xs={12}>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="h4" fontWeight="bold">
              Portfolio Optimization
            </Typography>
            <Box display="flex" gap={1}>
              {hasAnyResults && (
                <Button
                  variant="outlined"
                  startIcon={<ExportIcon />}
                  onClick={handleExportResults}
                >
                  Export Results
                </Button>
              )}
              <IconButton onClick={() => setSettingsOpen(true)}>
                <SettingsIcon />
              </IconButton>
            </Box>
          </Box>
        </Grid>

        {/* Quick Actions */}
        <Grid item xs={12} md={6}>
          <Card elevation={2}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <FSCSIcon sx={{ color: '#f44336' }} />
                <Typography variant="h6" fontWeight="bold">
                  FSCS Compliance
                </Typography>
                {fscsResult && (
                  <Chip
                    label={fscsResult.status}
                    size="small"
                    color={fscsResult.status === 'SUCCESS' ? 'success' : 'error'}
                  />
                )}
              </Box>
              
              {isFSCSRunning ? (
                <Box mb={2}>
                  <ProgressBar
                    percent={fscsProgress?.percent || 0}
                    message={fscsProgress?.message || 'Processing...'}
                    module="fscs-compliance"
                    onCancel={cancelFSCS}
                  />
                </Box>
              ) : (
                <ButtonGroup variant="contained" fullWidth>
                  <Button
                    startIcon={<RunIcon />}
                    onClick={handleRunFSCS}
                    disabled={isAnyProcessRunning}
                    sx={{ backgroundColor: '#f44336' }}
                  >
                    Check Compliance
                  </Button>
                  <Button
                    startIcon={<DiversifyIcon />}
                    onClick={handleRunDiversification}
                    disabled={isAnyProcessRunning}
                    sx={{ backgroundColor: '#d32f2f' }}
                  >
                    Diversify
                  </Button>
                </ButtonGroup>
              )}
              
              {fscsError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {fscsError}
                </Alert>
              )}
              
              {fscsResult && !isFSCSRunning && (
                <Box mt={2}>
                  <Typography variant="body2" color="text.secondary">
                    Last run: {new Date(fscsResult.timestamp).toLocaleString()}
                  </Typography>
                  <Typography variant="body2">
                    {fscsResult.summary.breachCount || 0} breaches found
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card elevation={2}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <OptimizerIcon sx={{ color: '#4caf50' }} />
                <Typography variant="h6" fontWeight="bold">
                  Rate Optimization
                </Typography>
                {optimizerResult && (
                  <Chip
                    label={optimizerResult.status}
                    size="small"
                    color="success"
                  />
                )}
              </Box>
              
              {/* FRN Products Toggle */}
              <Box sx={{ mb: 2, p: 1.5, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={allowNoFRNProducts}
                      onChange={handleFRNToggle}
                      disabled={isOptimizerRunning || isUpdatingConfig}
                      color="success"
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2" fontWeight="bold">
                        Include non-FRN products
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {allowNoFRNProducts 
                          ? "Including products without FSCS protection"
                          : "Only showing FRN-protected products"}
                      </Typography>
                    </Box>
                  }
                />
              </Box>
              
              {isOptimizerRunning ? (
                <Box mb={2}>
                  <ProgressBar
                    percent={optimizerProgress?.percent || 0}
                    message={optimizerProgress?.message || 'Processing...'}
                    module="rate-optimizer"
                    onCancel={cancelOptimizer}
                  />
                </Box>
              ) : (
                <ButtonGroup variant="contained" fullWidth>
                  <Button
                    startIcon={<RunIcon />}
                    onClick={handleRunOptimizer}
                    disabled={isAnyProcessRunning}
                    sx={{ backgroundColor: '#4caf50' }}
                  >
                    Optimize Rates
                  </Button>
                  <Button
                    startIcon={<AnalyzeIcon />}
                    onClick={handleAnalyzePortfolio}
                    disabled={isAnyProcessRunning}
                    sx={{ backgroundColor: '#388e3c' }}
                  >
                    Analyze Only
                  </Button>
                </ButtonGroup>
              )}
              
              {optimizerError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {optimizerError}
                </Alert>
              )}
              
              {optimizerResult && !isOptimizerRunning && (
                <Box mt={2}>
                  <Typography variant="body2" color="text.secondary">
                    Last run: {new Date(optimizerResult.timestamp).toLocaleString()}
                  </Typography>
                  <Typography variant="body2">
                    {optimizerResult.summary.recommendationCount || 0} opportunities worth £{optimizerResult.summary.totalBenefit || 0}/year
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Summary Stats */}
        <Grid item xs={12}>
          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}>
              <Paper elevation={1} sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h4" color="primary" fontWeight="bold">
                  {pendingActionItems.length}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Pending Actions
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Paper elevation={1} sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h4" color="error" fontWeight="bold">
                  {urgentActionItems.length}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Urgent Items
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Paper elevation={1} sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h4" color="success" fontWeight="bold">
                  {calendarEvents.length}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Calendar Events
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Paper elevation={1} sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h4" fontWeight="bold">
                  {(fscsResult?.recommendations.length || 0) + (optimizerResult?.recommendations.length || 0)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Total Recommendations
                </Typography>
              </Paper>
            </Grid>
          </Grid>
        </Grid>

        {/* Results Tabs */}
        <Grid item xs={12}>
          <Card elevation={2}>
            <Tabs value={activeTab} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tab label="Results" />
              <Tab label="Action Items" />
              <Tab label="History" />
            </Tabs>
            
            <TabPanel value={activeTab} index={0}>
              <Box p={2}>
                {fscsResult && (
                  <Box mb={2}>
                    <ResultsDisplay
                      result={fscsResult}
                      onExport={handleExportResults}
                    />
                  </Box>
                )}
                {optimizerResult && (
                  <ResultsDisplay
                    result={optimizerResult}
                    onExport={handleExportResults}
                  />
                )}
                {!fscsResult && !optimizerResult && (
                  <Alert severity="info">
                    No results yet. Run FSCS compliance check or rate optimization to see results.
                  </Alert>
                )}
              </Box>
            </TabPanel>
            
            <TabPanel value={activeTab} index={1}>
              <Box p={2}>
                <ActionItemsList
                  items={actionItems}
                  onUpdateStatus={updateActionItemStatus}
                  onApprove={approveRecommendations}
                  onReject={rejectRecommendation}
                  onRefresh={refreshActionItems}
                />
              </Box>
            </TabPanel>
            
            <TabPanel value={activeTab} index={2}>
              <Box p={2}>
                <Alert severity="info">
                  Run history will be implemented in the next phase
                </Alert>
              </Box>
            </TabPanel>
          </Card>
        </Grid>
      </Grid>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Optimization Settings</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Typography variant="h6" gutterBottom>
              FSCS Compliance Settings
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={fscsOptions.includePending}
                  onChange={(e) => setFSCSOptions({ ...fscsOptions, includePending: e.target.checked })}
                />
              }
              label="Include pending deposits"
            />
            <Box mt={2}>
              <Typography gutterBottom>
                Warning Threshold: {fscsOptions.warningThreshold}%
              </Typography>
              <Slider
                value={fscsOptions.warningThreshold}
                onChange={(e, value) => setFSCSOptions({ ...fscsOptions, warningThreshold: value as number })}
                min={50}
                max={100}
                step={5}
                marks
              />
            </Box>
            
            <Divider sx={{ my: 3 }} />
            
            <Typography variant="h6" gutterBottom>
              Rate Optimizer Settings
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={optimizerOptions.excludeShariaBanks}
                  onChange={(e) => setOptimizerOptions({ ...optimizerOptions, excludeShariaBanks: e.target.checked })}
                />
              }
              label="Exclude Sharia-compliant banks"
            />
            <Box mt={2}>
              <Typography gutterBottom>
                Minimum Annual Benefit: £{optimizerOptions.minBenefit}
              </Typography>
              <Slider
                value={optimizerOptions.minBenefit}
                onChange={(e, value) => setOptimizerOptions({ ...optimizerOptions, minBenefit: value as number })}
                min={0}
                max={1000}
                step={50}
                marks
              />
            </Box>
            <Box mt={2}>
              <Typography gutterBottom>
                Minimum Move Amount: £{optimizerOptions.minMoveAmount}
              </Typography>
              <Slider
                value={optimizerOptions.minMoveAmount}
                onChange={(e, value) => setOptimizerOptions({ ...optimizerOptions, minMoveAmount: value as number })}
                min={0}
                max={10000}
                step={500}
                marks
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Optimization Conflict Dialog */}
      {currentConflict && (
        <OptimizationConflictDialog
          open={conflictDialogOpen}
          conflict={currentConflict}
          onClose={() => setConflictDialogOpen(false)}
          onContinue={handleConflictContinue}
          onCancel={handleConflictCancel}
          isResolving={isResolvingConflict}
        />
      )}
    </Box>
  );
};

export default OptimizationDashboard;