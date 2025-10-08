import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Chip,
  LinearProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  FormLabel,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Switch,
  TextField,
  IconButton,
  Collapse,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Paper,
  Tooltip,
} from '@mui/material';
import {
  PlayArrow as StartIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Storage as DataIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';
import { 
  Platform, 
  ScrapingProcess, 
  ScrapingOptions, 
  ScrapingResults,
  ProgressData, 
  OutputData, 
  CompletionData 
} from '@cash-mgmt/shared';
import { ScraperTypes';

// Enhanced results display for flexible file structure
const formatFilesList = (files: { [key: string]: string }) => {
  const fileEntries = Object.entries(files);
  if (fileEntries.length === 0) return 'No files created';
  
  return fileEntries.map(([type, path]) => {
    const filename = path.split('/').pop() || path;
    const displayType = type === 'main' ? '' : `${type}: `;
    return `${displayType}${filename}`;
  }).join(' | ');
};

// Open file location handler
const openFileLocation = async (filePath: string) => {
  try {
    await window.electronAPI.openPath(filePath);
  } catch (error) {
    console.error('Error opening file:', error);
  }
};

interface ScraperDashboardState {
  platforms: Platform[];
  processes: ScrapingProcess[];
  activeProcesses: ScrapingProcess[];
  loading: boolean;
  error: string | null;
  selectedPlatform: string | null;
  showAdvancedOptions: boolean;
  realtimeOutput: Map<string, string[]>;
  expandedLogs: Set<string>;
}

export const ScraperDashboard: React.FC = () => {
  const [state, setState] = useState<ScraperDashboardState>({
    platforms: [],
    processes: [],
    activeProcesses: [],
    loading: false,
    error: null,
    selectedPlatform: null,
    showAdvancedOptions: false,
    realtimeOutput: new Map(),
    expandedLogs: new Set(),
  });

  const [scraperOptions, setScraperOptions] = useState<ScrapingOptions>({
    visible: false,
    accountTypes: [],
    timeout: 300000, // 5 minutes default
  });

  useEffect(() => {
    loadPlatforms();
    loadProcesses();
    setupEventListeners();

    return () => {
      // Cleanup event listeners
      cleanupEventListeners();
    };
  }, []);

  // Load available platforms
  const loadPlatforms = async () => {
    try {
      const platforms = await window.electronAPI.getScraperPlatforms();
      setState(prev => ({ ...prev, platforms }));
    } catch (error) {
      console.error('Error loading platforms:', error);
      setState(prev => ({ 
        ...prev, 
        error: 'Failed to load scraper platforms' 
      }));
    }
  };

  // Load existing processes
  const loadProcesses = async () => {
    try {
      const processes = await window.electronAPI.getScraperStatus();
      const activeProcesses = await window.electronAPI.getActiveScrapers();
      setState(prev => ({ 
        ...prev, 
        processes: Array.isArray(processes) ? processes : [], 
        activeProcesses: Array.isArray(activeProcesses) ? activeProcesses : []
      }));
    } catch (error) {
      console.error('Error loading processes:', error);
    }
  };

  // Set up real-time event listeners
  const setupEventListeners = () => {
    // Progress listener
    const progressRemover = window.electronAPI.onScraperProgress((data: ProgressData) => {
      handleProgressUpdate(data);
    });

    // Output listener
    const outputRemover = window.electronAPI.onScraperOutput((data: OutputData) => {
      handleOutputUpdate(data);
    });

    // Completion listener
    const completionRemover = window.electronAPI.onScraperCompleted((data: CompletionData) => {
      handleCompletionUpdate(data);
    });

    // Store cleanup functions
    setState(prev => ({ 
      ...prev, 
      cleanupFunctions: [progressRemover, outputRemover, completionRemover] 
    }));
  };

  // Cleanup event listeners
  const cleanupEventListeners = () => {
    // Note: The actual cleanup is handled by the returned functions from event listeners
    // This is a placeholder for any additional cleanup needed
  };

  // Handle progress updates
  const handleProgressUpdate = (data: ProgressData) => {
    // Refresh processes to get updated status
    loadProcesses();
  };

  // Handle output updates
  const handleOutputUpdate = (data: OutputData) => {
    setState(prev => {
      const newOutput = new Map(prev.realtimeOutput);
      const existing = newOutput.get(data.processId) || [];
      newOutput.set(data.processId, [...existing, data.output]);
      return { ...prev, realtimeOutput: newOutput };
    });
  };

  // Handle completion updates
  const handleCompletionUpdate = (data: CompletionData) => {
    loadProcesses(); // Refresh process list
    setState(prev => ({ 
      ...prev, 
      error: data.success ? null : `Scraping failed: ${data.results?.errorMessage || 'Unknown error'}` 
    }));
  };

  // Start scraping for a platform
  const handleStartScraping = async (platform: string, options?: ScrapingOptions) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const result = await window.electronAPI.triggerScraper(platform, options);
      
      if (result.success) {
        loadProcesses(); // Refresh to show new process
      } else {
        setState(prev => ({ 
          ...prev, 
          error: result.error || 'Failed to start scraping' 
        }));
      }
    } catch (error) {
      console.error('Error starting scraper:', error);
      setState(prev => ({ 
        ...prev, 
        error: 'Failed to start scraping' 
      }));
    } finally {
      setState(prev => ({ ...prev, loading: false }));
    }
  };

  // Stop a running process
  const handleStopProcess = async (processId: string) => {
    try {
      const result = await window.electronAPI.killScraperProcess(processId);
      if (result) {
        loadProcesses(); // Refresh process list
      }
    } catch (error) {
      console.error('Error stopping process:', error);
      setState(prev => ({ 
        ...prev, 
        error: 'Failed to stop process' 
      }));
    }
  };

  // Run all scrapers
  const handleRunAll = async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      // Start all platforms sequentially to avoid overwhelming the system
      for (const platform of state.platforms) {
        if (!state.activeProcesses.some(p => p.platform === platform.id)) {
          await handleStartScraping(platform.id);
          // Small delay between platforms
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } catch (error) {
      console.error('Error running all scrapers:', error);
      setState(prev => ({ 
        ...prev, 
        error: 'Failed to start all scrapers' 
      }));
    } finally {
      setState(prev => ({ ...prev, loading: false }));
    }
  };

  // Show advanced options dialog
  const handleShowAdvancedOptions = (platform: string) => {
    setState(prev => ({ 
      ...prev, 
      selectedPlatform: platform, 
      showAdvancedOptions: true 
    }));
  };

  // Close advanced options dialog
  const handleCloseAdvancedOptions = () => {
    setState(prev => ({ 
      ...prev, 
      selectedPlatform: null, 
      showAdvancedOptions: false 
    }));
    setScraperOptions({
      visible: false,
      accountTypes: [],
      timeout: 300000,
    });
  };

  // Start scraping with advanced options
  const handleStartWithOptions = () => {
    if (state.selectedPlatform) {
      handleStartScraping(state.selectedPlatform, scraperOptions);
      handleCloseAdvancedOptions();
    }
  };

  // Toggle log expansion
  const toggleLogExpansion = (processId: string) => {
    setState(prev => {
      const newExpanded = new Set(prev.expandedLogs);
      if (newExpanded.has(processId)) {
        newExpanded.delete(processId);
      } else {
        newExpanded.add(processId);
      }
      return { ...prev, expandedLogs: newExpanded };
    });
  };

  // Get status icon for platform
  const getStatusIcon = (platform: Platform) => {
    const isRunning = state.activeProcesses.some(p => p.platform === platform.id);
    if (isRunning) {
      return <ScheduleIcon color="warning" />;
    }
    return <DataIcon color="action" />;
  };

  // Get status chip for process
  const getStatusChip = (process: ScrapingProcess) => {
    switch (process.status) {
      case 'running':
        return <Chip label="Running" color="warning" size="small" />;
      case 'completed':
        return <Chip label="Completed" color="success" size="small" />;
      case 'error':
        return <Chip label="Failed" color="error" size="small" />;
      default:
        return <Chip label="Idle" color="default" size="small" />;
    }
  };

  // Format duration
  const formatDuration = (process: ScrapingProcess): string => {
    if (!process.startTime) return 'Not started';
    
    const end = process.endTime || new Date();
    const duration = end.getTime() - process.startTime.getTime();
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    
    return `${minutes}m ${seconds}s`;
  };

  const selectedPlatformConfig = state.platforms.find(p => p.id === state.selectedPlatform);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Data Collection
      </Typography>
      
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Manage and monitor automated data collection from financial platforms
      </Typography>

      {state.error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setState(prev => ({ ...prev, error: null }))}>
          {state.error}
        </Alert>
      )}

      {/* Quick Actions */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Quick Actions
          </Typography>
          <Box display="flex" gap={2} flexWrap="wrap">
            <Button
              variant="contained"
              startIcon={<StartIcon />}
              onClick={handleRunAll}
              disabled={state.loading}
              size="large"
            >
              Run All Scrapers
            </Button>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={loadProcesses}
              disabled={state.loading}
            >
              Refresh Status
            </Button>
            <Button
              variant="outlined"
              startIcon={<DataIcon />}
              onClick={() => window.electronAPI.cleanupScraperProcesses()}
            >
              Cleanup Old Processes
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Platform Selection */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Individual Platform Control
          </Typography>
          <Grid container spacing={2}>
            {state.platforms.map((platform) => {
              const isRunning = state.activeProcesses.some(p => p.platform === platform.id);
              const activeProcess = state.activeProcesses.find(p => p.platform === platform.id);
              
              return (
                <Grid item xs={12} sm={6} md={3} key={platform.id}>
                  <Card variant="outlined" sx={{ height: '100%' }}>
                    <CardContent>
                      <Box display="flex" alignItems="center" gap={1} mb={1}>
                        {getStatusIcon(platform)}
                        <Typography variant="h6" fontSize="1rem">
                          {platform.name}
                        </Typography>
                      </Box>
                      
                      {isRunning && activeProcess && (
                        <Box mb={2}>
                          <LinearProgress />
                          <Typography variant="caption" color="text.secondary">
                            Running... ({formatDuration(activeProcess)})
                          </Typography>
                        </Box>
                      )}
                      
                      <Box display="flex" gap={1} flexDirection="column">
                        {!isRunning ? (
                          <>
                            <Button
                              variant="contained"
                              startIcon={<StartIcon />}
                              onClick={() => handleStartScraping(platform.id)}
                              disabled={state.loading}
                              size="small"
                              fullWidth
                            >
                              Start
                            </Button>
                            {platform.supportsModular && (
                              <Button
                                variant="outlined"
                                startIcon={<SettingsIcon />}
                                onClick={() => handleShowAdvancedOptions(platform.id)}
                                size="small"
                                fullWidth
                              >
                                Advanced
                              </Button>
                            )}
                          </>
                        ) : (
                          <Button
                            variant="outlined"
                            color="error"
                            startIcon={<StopIcon />}
                            onClick={() => activeProcess && handleStopProcess(activeProcess.id)}
                            size="small"
                            fullWidth
                          >
                            Stop
                          </Button>
                        )}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </CardContent>
      </Card>

      {/* Active Processes */}
      {state.activeProcesses.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Active Processes
            </Typography>
            <List>
              {state.activeProcesses.map((process) => (
                <ListItem key={process.id}>
                  <ListItemIcon>
                    <ScheduleIcon color="warning" />
                  </ListItemIcon>
                  <ListItemText
                    primary={`${process.platform} - ${process.command}`}
                    secondary={`Started: ${process.startTime?.toLocaleString()} | Duration: ${formatDuration(process)}`}
                  />
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    onClick={() => handleStopProcess(process.id)}
                  >
                    Stop
                  </Button>
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      )}

      {/* Recent Processes */}
      {state.processes.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Recent Operations
            </Typography>
            <List>
              {state.processes
                .sort((a, b) => {
                  const aTime = a.startTime || new Date(0);
                  const bTime = b.startTime || new Date(0);
                  return bTime.getTime() - aTime.getTime();
                })
                .slice(0, 10)
                .map((process) => (
                  <React.Fragment key={process.id}>
                    <ListItem>
                      <ListItemIcon>
                        {process.status === 'completed' && <SuccessIcon color="success" />}
                        {process.status === 'error' && <ErrorIcon color="error" />}
                        {process.status === 'running' && <ScheduleIcon color="warning" />}
                        {process.status === 'idle' && <InfoIcon color="action" />}
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box display="flex" alignItems="center" gap={1}>
                            <Typography variant="body1">
                              {process.platform}
                            </Typography>
                            {getStatusChip(process)}
                          </Box>
                        }
                        secondary={
                          <Box>
                            <Typography variant="body2">
                              Duration: {formatDuration(process)} | Status: {process.status}
                            </Typography>
                            
                            {/* Record count summary */}
                            {process.results?.recordCount && (
                              <Typography variant="body2" color="text.secondary">
                                Records: {process.results.recordCount}
                                {process.results.processedCount && 
                                  ` (${process.results.processedCount} processed)`
                                }
                              </Typography>
                            )}
                            
                            {/* File locations - flexible display */}
                            {process.results?.files && Object.keys(process.results.files).length > 0 && (
                              <Typography variant="body2" color="text.secondary" sx={{ 
                                fontFamily: 'monospace', 
                                fontSize: '0.75rem' 
                              }}>
                                Files: {formatFilesList(process.results.files)}
                              </Typography>
                            )}
                            
                            {/* Error message for failed processes */}
                            {process.status === 'error' && process.results?.errorMessage && (
                              <Typography variant="body2" color="error.main" sx={{ mt: 0.5 }}>
                                Error: {process.results.errorMessage.split('\n')[0]}
                              </Typography>
                            )}
                          </Box>
                        }
                      />
                      <Box display="flex" alignItems="center" gap={1}>
                        {process.status === 'running' && (
                          <Button
                            variant="outlined"
                            color="error"
                            size="small"
                            onClick={() => handleStopProcess(process.id)}
                          >
                            Stop
                          </Button>
                        )}
                        <IconButton
                          onClick={() => toggleLogExpansion(process.id)}
                          size="small"
                        >
                          {state.expandedLogs.has(process.id) ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
                      </Box>
                    </ListItem>
                    
                    <Collapse in={state.expandedLogs.has(process.id)}>
                      <Box sx={{ pl: 4, pr: 2, pb: 2 }}>
                        <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50', maxHeight: 300, overflow: 'auto' }}>
                          <Typography variant="subtitle2" gutterBottom>
                            Process Output:
                          </Typography>
                          <Box component="pre" sx={{ 
                            fontFamily: 'monospace', 
                            fontSize: '0.8rem',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            maxHeight: 300,
                            overflow: 'auto',
                            backgroundColor: 'grey.50',
                            padding: 1,
                            borderRadius: 1
                          }}>
                            {process.status === 'error' 
                              ? (process.output.join('\n') || 'No output available')
                              : (process.filteredOutput?.join('\n') || process.output.join('\n') || 'No output available')
                            }
                          </Box>

                          {/* File opening buttons - flexible for available files */}
                          {process.results?.files && Object.keys(process.results.files).length > 0 && (
                            <Box sx={{ mt: 1 }}>
                              {Object.entries(process.results.files).map(([type, filePath]) => (
                                <Button 
                                  key={type}
                                  size="small" 
                                  variant="outlined" 
                                  sx={{ mr: 1, mb: 1 }} 
                                  onClick={() => openFileLocation(filePath)}
                                >
                                  Open {type === 'main' ? 'Data' : type.charAt(0).toUpperCase() + type.slice(1)}
                                </Button>
                              ))}
                            </Box>
                          )}
                        </Paper>
                      </Box>
                    </Collapse>
                    
                    <Divider />
                  </React.Fragment>
                ))}
            </List>
          </CardContent>
        </Card>
      )}

      {/* Advanced Options Dialog */}
      <Dialog
        open={state.showAdvancedOptions}
        onClose={handleCloseAdvancedOptions}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Advanced Options - {selectedPlatformConfig?.name}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            
            {/* Visible Browser Mode */}
            <FormControl component="fieldset" sx={{ mb: 3 }}>
              <FormLabel component="legend">Browser Settings</FormLabel>
              <FormGroup>
                <FormControlLabel
                  control={
                    <Switch
                      checked={scraperOptions.visible || false}
                      onChange={(e) => setScraperOptions(prev => ({ 
                        ...prev, 
                        visible: e.target.checked 
                      }))}
                    />
                  }
                  label="Show browser window (visible mode)"
                />
              </FormGroup>
            </FormControl>

            {/* MoneyFacts Account Types */}
            {selectedPlatformConfig?.supportsModular && (
              <>
                <FormControl component="fieldset" sx={{ mb: 3 }}>
                  <FormLabel component="legend">Account Types (MoneyFacts)</FormLabel>
                  <FormGroup>
                    {selectedPlatformConfig.accountTypes?.map((type) => (
                      <FormControlLabel
                        key={type}
                        control={
                          <Checkbox
                            checked={scraperOptions.accountTypes?.includes(type) || false}
                            onChange={(e) => {
                              const currentTypes = scraperOptions.accountTypes || [];
                              if (e.target.checked) {
                                setScraperOptions(prev => ({
                                  ...prev,
                                  accountTypes: [...currentTypes, type]
                                }));
                              } else {
                                setScraperOptions(prev => ({
                                  ...prev,
                                  accountTypes: currentTypes.filter(t => t !== type)
                                }));
                              }
                            }}
                          />
                        }
                        label={type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      />
                    ))}
                  </FormGroup>
                </FormControl>
                
                {/* Sequential Processing Information */}
                <Alert severity="info" sx={{ mb: 3 }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                    Processing Modes:
                  </Typography>
                  <Typography variant="body2" component="div">
                    • <strong>No types selected:</strong> Sequential processing - each account type runs as a separate instance with full database commits between each
                    <br />
                    • <strong>Specific types selected:</strong> Single instance processing - selected types run together in one browser session
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic' }}>
                    Sequential mode provides better isolation, error recovery, and rate limit protection.
                  </Typography>
                </Alert>
              </>
            )}

            {/* Timeout Setting */}
            <TextField
              label="Timeout (seconds)"
              type="number"
              value={(scraperOptions.timeout || 300000) / 1000}
              onChange={(e) => setScraperOptions(prev => ({
                ...prev,
                timeout: parseInt(e.target.value) * 1000
              }))}
              inputProps={{ min: 30, max: 1800 }}
              fullWidth
              helperText="Maximum time to wait for scraping to complete (30-1800 seconds)"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAdvancedOptions}>
            Cancel
          </Button>
          <Button 
            onClick={handleStartWithOptions} 
            variant="contained"
            disabled={state.loading}
          >
            Start Scraping
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};