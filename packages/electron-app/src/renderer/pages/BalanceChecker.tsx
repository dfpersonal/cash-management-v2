import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Grid,
  Card,
  CardContent,
  Chip,
  Stack,
  Alert,
  CircularProgress,
  LinearProgress,
  Tabs,
  Tab,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  DataGrid,
  GridColDef,
  GridRowsProp,
  GridToolbar,
  GridFilterModel,
  GridSortModel,
  GridValueFormatter,
  useGridApiRef,
} from '@mui/x-data-grid';
import {
  Update as UpdateIcon,
  PlayArrow as StartIcon,
  Pause as PauseIcon,
  CheckCircle as CompleteIcon,
  CheckCircle,
  Schedule as ScheduleIcon,
  Warning as WarningIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Refresh as RefreshIcon,
  Save as SaveIcon,
  CalendarToday as CalendarIcon,
} from '@mui/icons-material';
import {
  AppState,
  DepositBalanceStatus,
  BalanceUpdateSessionProgress,
  BalanceUpdateFilters,
  BalanceUpdateStatus
} from '@cash-mgmt/shared';
import { PortfolioTypes';

interface BalanceCheckerProps {
  appState: AppState;
  onRefresh?: () => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`balance-tabpanel-${index}`}
      aria-labelledby={`balance-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

export const BalanceChecker: React.FC<BalanceCheckerProps> = ({ appState, onRefresh }) => {
  // State management
  const [allDeposits, setAllDeposits] = useState<DepositBalanceStatus[]>([]);  // Store all deposits unfiltered
  const [deposits, setDeposits] = useState<DepositBalanceStatus[]>([]);  // Currently displayed deposits (filtered)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [sessionProgress, setSessionProgress] = useState<BalanceUpdateSessionProgress | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [selectedDepositIndex, setSelectedDepositIndex] = useState<number>(-1);
  const [newBalance, setNewBalance] = useState<string>('');
  const [newAer, setNewAer] = useState<string>('');
  const [filters, setFilters] = useState<BalanceUpdateFilters>({ status: 'all' });
  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false);
  const [sessionSnapshot, setSessionSnapshot] = useState<{
    all: number;
    current: number;
    pending: number;
    overdue: number;
  } | null>(null);

  // Refs for keyboard navigation
  const balanceInputRef = useRef<HTMLInputElement>(null);
  const aerInputRef = useRef<HTMLInputElement>(null);
  const apiRef = useGridApiRef();
  const [sortedRowIds, setSortedRowIds] = useState<(string | number)[]>([]);
  const [sortModel, setSortModel] = useState<GridSortModel>([]);

  // Load deposits data
  const loadDeposits = useCallback(async (applyFilter = true) => {
    console.log('Balance Checker: Loading deposits');
    setLoading(true);
    setError(null);
    
    // Store current selection to potentially restore it
    const currentSelectedId = selectedDepositIndex >= 0 && deposits[selectedDepositIndex] 
      ? deposits[selectedDepositIndex].deposit.id 
      : null;
    
    try {
      console.log('Balance Checker: Calling getDepositsWithBalanceStatus...');
      // Always load ALL deposits for accurate counting
      const allDepositsData = await window.electronAPI.getDepositsWithBalanceStatus({ status: 'all' });
      console.log('Balance Checker: Received all deposits data:', allDepositsData.length, 'items');
      setAllDeposits(allDepositsData);
      
      // Apply client-side filtering for display if requested
      let dataToDisplay = allDepositsData;
      if (applyFilter && filters.status !== 'all') {
        dataToDisplay = allDepositsData.filter((d: DepositBalanceStatus) => d.update_status === filters.status);
      }
      
      // Apply sorting if we have a sort model
      if (sortModel.length > 0) {
        const { field, sort } = sortModel[0];
        const sortedData = [...dataToDisplay].sort((a, b) => {
          let aVal: any;
          let bVal: any;
          
          // Get values based on field
          switch(field) {
            case 'bank':
              aVal = a.deposit.bank || '';
              bVal = b.deposit.bank || '';
              break;
            case 'platform':
              aVal = a.deposit.platform || 'Direct';
              bVal = b.deposit.platform || 'Direct';
              break;
            case 'account_name':
              aVal = a.deposit.account_name || '';
              bVal = b.deposit.account_name || '';
              break;
            case 'balance':
              aVal = a.deposit.balance || 0;
              bVal = b.deposit.balance || 0;
              break;
            case 'days_until_due':
              aVal = a.days_until_due;
              bVal = b.days_until_due;
              break;
            case 'next_check':
              aVal = a.next_balance_check || '';
              bVal = b.next_balance_check || '';
              break;
            default:
              aVal = '';
              bVal = '';
          }
          
          // Compare primary values
          if (aVal < bVal) return sort === 'asc' ? -1 : 1;
          if (aVal > bVal) return sort === 'asc' ? 1 : -1;
          
          // If primary values are equal, apply stable secondary sort
          // Secondary sort by bank name
          const bankA = a.deposit.bank || '';
          const bankB = b.deposit.bank || '';
          if (bankA < bankB) return -1;
          if (bankA > bankB) return 1;
          
          // Tertiary sort by account name if banks are also the same
          const accountA = a.deposit.account_name || '';
          const accountB = b.deposit.account_name || '';
          if (accountA < accountB) return -1;
          if (accountA > accountB) return 1;
          
          // Finally, sort by ID for ultimate stability
          const idA = a.deposit.id || 0;
          const idB = b.deposit.id || 0;
          return idA - idB;
        });
        console.log('Balance Checker: Applied sorting by', field, sort);
        setDeposits(sortedData);
        // Update sorted row IDs to match our sorted data
        const sortedIds = sortedData.map((d: DepositBalanceStatus) => d.deposit.id).filter((id: number | undefined) => id !== undefined);
        setSortedRowIds(sortedIds);
        
        // Ensure selection stays valid
        if (currentSelectedId && currentSessionId) {
          const newIndex = sortedData.findIndex(d => d.deposit.id === currentSelectedId);
          if (newIndex >= 0) {
            console.log('Balance Checker: Maintaining selection at index', newIndex);
            setSelectedDepositIndex(newIndex);
          }
        }
      } else {
        console.log('Balance Checker: No sorting applied');
        setDeposits(dataToDisplay);
        // Update sorted row IDs to match unsorted data
        const ids = dataToDisplay.map((d: DepositBalanceStatus) => d.deposit.id).filter((id: number | undefined) => id !== undefined);
        setSortedRowIds(ids);
        
        // Ensure selection stays valid
        if (currentSelectedId && currentSessionId) {
          const newIndex = dataToDisplay.findIndex((d: DepositBalanceStatus) => d.deposit.id === currentSelectedId);
          if (newIndex >= 0) {
            console.log('Balance Checker: Maintaining selection at index', newIndex);
            setSelectedDepositIndex(newIndex);
          }
        }
      }
      
      // If we have a current session, load progress
      if (currentSessionId) {
        console.log('Balance Checker: Loading session progress for session:', currentSessionId);
        const progress = await window.electronAPI.getBalanceUpdateSessionProgress(currentSessionId);
        console.log('Balance Checker: Session progress:', progress);
        setSessionProgress(progress);
      }
      
      // Trigger sidebar badge refresh via parent component
      if (onRefresh) {
        onRefresh();
      }
    } catch (err) {
      console.error('Balance Checker: Error loading deposits:', err);
      setError(err instanceof Error ? err.message : 'Failed to load deposits');
    } finally {
      setLoading(false);
    }
  }, [currentSessionId, filters, sortModel, selectedDepositIndex, deposits]);

  // Load data on component mount only
  useEffect(() => {
    console.log('Balance Checker: Component mounted, calling loadDeposits');
    loadDeposits();
  }, []); // Remove loadDeposits dependency to prevent reloading on filter changes
  
  
  // Keep form fields in sync with selected deposit
  useEffect(() => {
    if (selectedDepositIndex >= 0 && selectedDepositIndex < deposits.length && currentSessionId) {
      const deposit = deposits[selectedDepositIndex];
      if (deposit) {
        console.log('Balance Checker: Syncing form fields for deposit', {
          index: selectedDepositIndex,
          bank: deposit.deposit.bank,
          account: deposit.deposit.account_name,
          balance: deposit.deposit.balance,
          aer: deposit.deposit.aer
        });
        setNewBalance(deposit.deposit.balance?.toString() || '');
        setNewAer(deposit.deposit.aer?.toString() || '');
        // Focus on balance input when deposit changes
        setTimeout(() => balanceInputRef.current?.focus(), 100);
      }
    }
  }, [selectedDepositIndex, deposits, currentSessionId]);
  
  // Apply client-side filtering when filters change
  useEffect(() => {
    if (allDeposits.length === 0) return; // Skip if no data loaded yet
    
    console.log('Balance Checker: Applying filter:', filters.status);
    if (filters.status === 'all') {
      setDeposits(allDeposits);
    } else {
      const filtered = allDeposits.filter(d => d.update_status === filters.status);
      setDeposits(filtered);
    }
  }, [filters, allDeposits]);

  // Handle tab change
  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    
    // Update filters based on tab
    const statusMap: Record<number, BalanceUpdateStatus | 'all'> = {
      0: 'all',
      1: 'pending', 
      2: 'current',
      3: 'overdue'
    };
    
    const newStatus = statusMap[newValue];
    setFilters(prev => ({ ...prev, status: newStatus }));
    
    // Apply client-side filtering immediately
    if (newStatus === 'all') {
      setDeposits(allDeposits);
    } else {
      const filtered = allDeposits.filter(d => d.update_status === newStatus);
      setDeposits(filtered);
    }
  };

  // Start new balance update session
  const handleStartSession = async () => {
    try {
      // Capture snapshot of current counts by status
      const snapshot = {
        all: allDeposits.length,
        current: allDeposits.filter(d => d.update_status === 'current').length,
        pending: allDeposits.filter(d => d.update_status === 'pending').length,
        overdue: allDeposits.filter(d => d.update_status === 'overdue').length,
      };
      setSessionSnapshot(snapshot);
      
      const sessionId = await window.electronAPI.createBalanceUpdateSession('manual');
      setCurrentSessionId(sessionId);
      
      // Load initial progress
      const progress = await window.electronAPI.getBalanceUpdateSessionProgress(sessionId);
      setSessionProgress(progress);
      
      // Select first deposit in sorted order
      if (deposits.length > 0) {
        let firstIndex = 0;
        // If we have sorted order, use it
        if (sortedRowIds.length > 0) {
          const firstId = sortedRowIds[0];
          const index = deposits.findIndex(d => d?.deposit?.id === firstId);
          if (index >= 0) {
            firstIndex = index;
          }
        }
        setSelectedDepositIndex(firstIndex);
        // Form fields will be updated by the sync useEffect
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session');
    }
  };

  // Update deposit balance and optionally AER
  const handleUpdateBalance = async () => {
    if (!currentSessionId || selectedDepositIndex < 0 || !newBalance) return;
    
    const deposit = deposits[selectedDepositIndex];
    const balanceValue = parseFloat(newBalance);
    
    if (isNaN(balanceValue)) {
      setError('Please enter a valid balance amount');
      return;
    }

    // Parse AER if provided
    let aerValue: number | undefined;
    if (newAer) {
      aerValue = parseFloat(newAer);
      if (isNaN(aerValue)) {
        setError('Please enter a valid AER percentage');
        return;
      }
    }

    try {
      // Store the current deposit ID before updating
      const currentDepositId = deposit.deposit.id!;
      
      console.log('Balance Checker: Updating deposit', {
        id: currentDepositId,
        bank: deposit.deposit.bank,
        account: deposit.deposit.account_name,
        newBalance: balanceValue,
        newAer: aerValue
      });
      
      await window.electronAPI.updateDepositBalanceInSession(
        currentSessionId,
        currentDepositId,
        balanceValue,
        true, // Reset schedule
        aerValue
      );
      
      // Reload data, maintaining current sort and selection
      await loadDeposits(true);
      
      // Clear the input fields after successful save
      setNewBalance('');
      setNewAer('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update balance');
    }
  };


  // Complete session
  const handleCompleteSession = async () => {
    if (!currentSessionId) return;
    
    try {
      await window.electronAPI.completeBalanceUpdateSession(currentSessionId);
      setCurrentSessionId(null);
      setSessionProgress(null);
      setSessionSnapshot(null);  // Clear the snapshot
      setSelectedDepositIndex(-1);
      setNewBalance('');
      setNewAer('');
      setConfirmCompleteOpen(false);
      await loadDeposits(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete session');
    }
  };

  // Generate balance check reminders
  const handleGenerateReminders = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);
      
      const result = await window.electronAPI.generateBalanceCheckReminders();
      
      if (result.errors.length > 0) {
        setError(`Generated ${result.created} reminders with ${result.errors.length} errors. First error: ${result.errors[0]}`);
      } else {
        setSuccess(`Successfully generated ${result.created} balance check reminders${result.skipped > 0 ? `, skipped ${result.skipped} existing` : ''}`);
        setTimeout(() => setSuccess(null), 5000); // Clear success message after 5 seconds
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate reminders');
    } finally {
      setLoading(false);
    }
  };

  // Initialize balance check schedules
  const handleInitializeSchedules = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);
      
      await window.electronAPI.initializeBalanceCheckSchedules();
      setSuccess('Balance check schedules initialized successfully');
      setTimeout(() => setSuccess(null), 5000);
      
      // Reload deposits to show updated schedules
      await loadDeposits(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize schedules');
    } finally {
      setLoading(false);
    }
  };

  // Keyboard event handler - only for Enter to save
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!currentSessionId || selectedDepositIndex < 0) return;
      
      if (event.key === 'Enter') {
        event.preventDefault();
        handleUpdateBalance();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSessionId, selectedDepositIndex, newBalance]);

  // Format currency
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP'
    }).format(value);
  };

  // Format percentage
  const formatPercentage = (value: number | undefined): string => {
    if (value === undefined || value === null) return 'N/A';
    return `${value.toFixed(2)}%`;
  };

  // Get status color
  const getStatusColor = (status: BalanceUpdateStatus) => {
    switch (status) {
      case 'current': return 'success';
      case 'pending': return 'warning';
      case 'overdue': return 'error';
      case 'updated': return 'info';
      default: return 'default';
    }
  };

  // Get status icon
  const getStatusIcon = (status: BalanceUpdateStatus) => {
    switch (status) {
      case 'current': return <CheckCircle />;
      case 'pending': return <ScheduleIcon />;
      case 'overdue': return <WarningIcon />;
      case 'updated': return <TrendingUpIcon />;
      default: return null;
    }
  };

  // DataGrid columns
  const columns: GridColDef[] = [
    {
      field: 'status',
      headerName: '',
      width: 50,
      renderCell: (params: any) => {
        const status = params.row?.update_status || 'current';
        const statusLabels: Record<string, string> = {
          current: 'Current',
          pending: 'Pending', 
          overdue: 'Overdue',
          updated: 'Updated'
        };
        return (
          <Tooltip title={statusLabels[status] || 'Unknown'}>
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              height: '100%',
              color: status === 'current' ? 'success.main' : 
                     status === 'pending' ? 'warning.main' :
                     status === 'overdue' ? 'error.main' : 'info.main'
            }}>
              {getStatusIcon(status)}
            </Box>
          </Tooltip>
        );
      }
    },
    {
      field: 'bank',
      headerName: 'Bank',
      width: 140,
      valueGetter: (value, row) => row?.deposit?.bank || 'N/A'
    },
    {
      field: 'platform',
      headerName: 'Platform',
      width: 130,
      valueGetter: (value, row) => {
        const platform = row?.deposit?.platform || 'Direct';
        // Normalize case - capitalize first letter
        return platform.charAt(0).toUpperCase() + platform.slice(1).toLowerCase();
      },
      renderCell: (params: any) => {
        const platform = params.value;
        // Color code platforms for easy identification
        const platformColors: Record<string, string> = {
          'Hargreaves lansdown': '#1976d2', // Blue
          'Aj bell': '#9c27b0', // Purple
          'Prosper': '#2e7d32', // Green
          'Direct': '#757575' // Gray
        };
        const color = platformColors[platform.toLowerCase()] || '#757575';
        
        return (
          <Chip
            label={platform}
            size="small"
            sx={{
              bgcolor: color + '20', // 20% opacity
              color: color,
              fontWeight: 500,
              border: `1px solid ${color}40` // 40% opacity border
            }}
          />
        );
      }
    },
    {
      field: 'account_name',
      headerName: 'Account',
      width: 170,
      valueGetter: (value, row) => row?.deposit?.account_name || 'N/A'
    },
    {
      field: 'balance',
      headerName: 'Balance',
      width: 110,
      valueGetter: (value, row) => row?.deposit?.balance || 0,
      valueFormatter: (value) => formatCurrency(value || 0)
    },
    {
      field: 'frequency',
      headerName: 'Frequency',
      width: 100,
      valueGetter: (value, row) => row?.balance_update_frequency || 'monthly'
    },
    {
      field: 'next_check',
      headerName: 'Next Check',
      width: 130,
      valueGetter: (value, row) => row?.next_balance_check,
      valueFormatter: (value) => {
        if (!value) return 'Not scheduled';
        return new Date(value).toLocaleDateString('en-GB');
      }
    },
    {
      field: 'days_until_due',
      headerName: 'Days Until Due',
      width: 120,
      renderCell: (params: any) => {
        const days = params.row?.days_until_due;
        if (days == null) return <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}><Typography variant="body2">N/A</Typography></Box>;
        if (days < 0) return <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}><Chip label="Overdue" color="error" size="small" /></Box>;
        if (days <= 7) return <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}><Chip label={`${days} days`} color="warning" size="small" /></Box>;
        return <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}><Typography variant="body2">{days} days</Typography></Box>;
      }
    }
  ];

  // Get tab badge count - always use allDeposits for accurate counting
  const getTabCount = (status: BalanceUpdateStatus | 'all') => {
    if (status === 'all') return allDeposits.length;
    return allDeposits.filter(d => d.update_status === status).length;
  };

  // Debug logging
  console.log('Balance Checker: Render - allDeposits:', allDeposits.length, 'displayed:', deposits.length, 'loading:', loading, 'error:', error);

  // Add error boundary protection
  if (error && !deposits.length && !loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 2 }}>
          <UpdateIcon sx={{ fontSize: 40 }} />
          Balance Checker
        </Typography>
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
        <Button variant="contained" onClick={() => loadDeposits(true)} sx={{ mt: 2 }}>
          Retry Loading Data
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box mb={4}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 2 }}>
          <UpdateIcon sx={{ fontSize: 40 }} />
          Balance Checker
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Systematically update deposit balances with progress tracking
        </Typography>
      </Box>

      {/* Progress Bar - Always Visible */}
      <Paper sx={{ p: 3, mb: 3, bgcolor: sessionProgress ? 'primary.50' : 'grey.50', border: '1px solid', borderColor: sessionProgress ? 'primary.200' : 'grey.200' }}>
        {sessionProgress ? (
          // Active Session Progress
          <>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6" fontWeight="bold">
                Balance Update Session In Progress
              </Typography>
              <Box display="flex" gap={1}>
                <Button
                  variant="outlined"
                  onClick={() => setConfirmCompleteOpen(true)}
                  startIcon={<CompleteIcon />}
                  color="success"
                >
                  Complete Session
                </Button>
              </Box>
            </Box>
            
            <Grid container spacing={3} mb={2}>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">Progress</Typography>
                <Typography variant="h5" fontWeight="bold">
                  {(() => {
                    // Use snapshot counts if available, otherwise fall back to live counts
                    let relevantCount: number;
                    if (sessionSnapshot) {
                      const statusMap = ['all', 'pending', 'current', 'overdue'];
                      relevantCount = sessionSnapshot[statusMap[tabValue] as keyof typeof sessionSnapshot];
                    } else {
                      // Fallback to live counts (shouldn't happen but defensive)
                      const relevantDeposits = tabValue === 0 ? allDeposits : 
                        allDeposits.filter(d => d.update_status === ['all', 'pending', 'current', 'overdue'][tabValue]);
                      relevantCount = relevantDeposits.length;
                    }
                    const updatedInCategory = Math.min(sessionProgress.session.updated_count, relevantCount);
                    return `${updatedInCategory} / ${relevantCount}`;
                  })()}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">Percentage</Typography>
                <Typography variant="h5" fontWeight="bold">
                  {(() => {
                    let relevantCount: number;
                    if (sessionSnapshot) {
                      const statusMap = ['all', 'pending', 'current', 'overdue'];
                      relevantCount = sessionSnapshot[statusMap[tabValue] as keyof typeof sessionSnapshot];
                    } else {
                      const relevantDeposits = tabValue === 0 ? allDeposits : 
                        allDeposits.filter(d => d.update_status === ['all', 'pending', 'current', 'overdue'][tabValue]);
                      relevantCount = relevantDeposits.length;
                    }
                    if (relevantCount === 0) return '0%';
                    const updatedInCategory = Math.min(sessionProgress.session.updated_count, relevantCount);
                    return `${Math.round((updatedInCategory / relevantCount) * 100)}%`;
                  })()}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">Remaining</Typography>
                <Typography variant="h5" fontWeight="bold">
                  {(() => {
                    let relevantCount: number;
                    if (sessionSnapshot) {
                      const statusMap = ['all', 'pending', 'current', 'overdue'];
                      relevantCount = sessionSnapshot[statusMap[tabValue] as keyof typeof sessionSnapshot];
                    } else {
                      const relevantDeposits = tabValue === 0 ? allDeposits : 
                        allDeposits.filter(d => d.update_status === ['all', 'pending', 'current', 'overdue'][tabValue]);
                      relevantCount = relevantDeposits.length;
                    }
                    const updatedInCategory = Math.min(sessionProgress.session.updated_count, relevantCount);
                    return relevantCount - updatedInCategory;
                  })()}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">Session Type</Typography>
                <Chip label={sessionProgress.session.session_type} color="primary" />
              </Grid>
            </Grid>
            
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Updating {['all accounts', 'pending accounts', 'current accounts', 'overdue accounts'][tabValue]}
            </Typography>
            
            <LinearProgress
              variant="determinate"
              value={(() => {
                let relevantCount: number;
                if (sessionSnapshot) {
                  const statusMap = ['all', 'pending', 'current', 'overdue'];
                  relevantCount = sessionSnapshot[statusMap[tabValue] as keyof typeof sessionSnapshot];
                } else {
                  const relevantDeposits = tabValue === 0 ? allDeposits : 
                    allDeposits.filter(d => d.update_status === ['all', 'pending', 'current', 'overdue'][tabValue]);
                  relevantCount = relevantDeposits.length;
                }
                if (relevantCount === 0) return 0;
                const updatedInCategory = Math.min(sessionProgress.session.updated_count, relevantCount);
                return (updatedInCategory / relevantCount) * 100;
              })()}
              sx={{ height: 8, borderRadius: 4 }}
            />
          </>
        ) : (
          // Portfolio Status Progress (No Active Session)
          <>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6" fontWeight="bold">
                {(() => {
                  const labels = [
                    'Portfolio Status',
                    'Pending Checks',
                    'Current Accounts',
                    'Overdue Accounts'
                  ];
                  return labels[tabValue];
                })()}
              </Typography>
            </Box>
            
            {tabValue === 0 ? (
              // ALL Tab - Show segmented portfolio health
              <>
                <Grid container spacing={3} mb={2}>
                  <Grid item xs={12} sm={4}>
                    <Typography variant="body2" color="text.secondary">Current</Typography>
                    <Typography variant="h5" fontWeight="bold" color="success.main">
                      {getTabCount('current')}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Typography variant="body2" color="text.secondary">Pending</Typography>
                    <Typography variant="h5" fontWeight="bold" color="warning.main">
                      {getTabCount('pending')}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Typography variant="body2" color="text.secondary">Overdue</Typography>
                    <Typography variant="h5" fontWeight="bold" color="error.main">
                      {getTabCount('overdue')}
                    </Typography>
                  </Grid>
                </Grid>
                
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Total: {allDeposits.length} accounts
                </Typography>
                
                {/* Segmented Progress Bar */}
                <Box sx={{ position: 'relative', height: 8, borderRadius: 4, bgcolor: 'grey.200', overflow: 'hidden' }}>
                  {allDeposits.length > 0 && (
                    <>
                      <Box sx={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        height: '100%',
                        width: `${(getTabCount('current') / allDeposits.length) * 100}%`,
                        bgcolor: 'success.main',
                      }} />
                      <Box sx={{
                        position: 'absolute',
                        left: `${(getTabCount('current') / allDeposits.length) * 100}%`,
                        top: 0,
                        height: '100%',
                        width: `${(getTabCount('pending') / allDeposits.length) * 100}%`,
                        bgcolor: 'warning.main',
                      }} />
                      <Box sx={{
                        position: 'absolute',
                        left: `${((getTabCount('current') + getTabCount('pending')) / allDeposits.length) * 100}%`,
                        top: 0,
                        height: '100%',
                        width: `${(getTabCount('overdue') / allDeposits.length) * 100}%`,
                        bgcolor: 'error.main',
                      }} />
                    </>
                  )}
                </Box>
              </>
            ) : (
              // Individual tab progress
              <>
                <Grid container spacing={3} mb={2}>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">
                      {tabValue === 1 ? 'Due This Week' : 
                       tabValue === 2 ? 'Checked This Month' : 
                       'Critical (>30 days)'}
                    </Typography>
                    <Typography variant="h5" fontWeight="bold">
                      {(() => {
                        const filtered = allDeposits.filter(d => d.update_status === ['all', 'pending', 'current', 'overdue'][tabValue]);
                        if (tabValue === 1) {
                          // Pending - show due this week
                          const dueThisWeek = filtered.filter(d => d.days_until_due != null && d.days_until_due <= 7 && d.days_until_due >= 0);
                          return `${dueThisWeek.length} / ${filtered.length}`;
                        } else if (tabValue === 2) {
                          // Current - show checked this month
                          const checkedThisMonth = filtered.filter(d => {
                            if (!d.deposit.last_updated) return false;
                            const lastUpdate = new Date(d.deposit.last_updated);
                            const thirtyDaysAgo = new Date();
                            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                            return lastUpdate >= thirtyDaysAgo;
                          });
                          return `${checkedThisMonth.length} / ${filtered.length}`;
                        } else {
                          // Overdue - show critical
                          const critical = filtered.filter(d => d.days_until_due != null && d.days_until_due < -30);
                          return `${critical.length} / ${filtered.length}`;
                        }
                      })()}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Percentage</Typography>
                    <Typography variant="h5" fontWeight="bold">
                      {(() => {
                        const filtered = allDeposits.filter(d => d.update_status === ['all', 'pending', 'current', 'overdue'][tabValue]);
                        if (filtered.length === 0) return '0%';
                        
                        let numerator = 0;
                        if (tabValue === 1) {
                          numerator = filtered.filter(d => d.days_until_due != null && d.days_until_due <= 7 && d.days_until_due >= 0).length;
                        } else if (tabValue === 2) {
                          numerator = filtered.filter(d => {
                            if (!d.deposit.last_updated) return false;
                            const lastUpdate = new Date(d.deposit.last_updated);
                            const thirtyDaysAgo = new Date();
                            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                            return lastUpdate >= thirtyDaysAgo;
                          }).length;
                        } else {
                          numerator = filtered.filter(d => d.days_until_due != null && d.days_until_due < -30).length;
                        }
                        
                        return `${Math.round((numerator / filtered.length) * 100)}%`;
                      })()}
                    </Typography>
                  </Grid>
                </Grid>
                
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  {tabValue === 1 ? `${getTabCount('pending')} pending accounts total` :
                   tabValue === 2 ? `${getTabCount('current')} current accounts total` :
                   `${getTabCount('overdue')} overdue accounts total`}
                </Typography>
                
                <LinearProgress
                  variant="determinate"
                  value={(() => {
                    const filtered = allDeposits.filter(d => d.update_status === ['all', 'pending', 'current', 'overdue'][tabValue]);
                    if (filtered.length === 0) return 0;
                    
                    let numerator = 0;
                    if (tabValue === 1) {
                      numerator = filtered.filter(d => d.days_until_due != null && d.days_until_due <= 7 && d.days_until_due >= 0).length;
                    } else if (tabValue === 2) {
                      numerator = filtered.filter(d => {
                        if (!d.deposit.last_updated) return false;
                        const lastUpdate = new Date(d.deposit.last_updated);
                        const thirtyDaysAgo = new Date();
                        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                        return lastUpdate >= thirtyDaysAgo;
                      }).length;
                    } else {
                      numerator = filtered.filter(d => d.days_until_due != null && d.days_until_due < -30).length;
                    }
                    
                    return (numerator / filtered.length) * 100;
                  })()}
                  sx={{ height: 8, borderRadius: 4 }}
                  color={tabValue === 2 ? 'success' : tabValue === 3 ? 'error' : 'primary'}
                />
              </>
            )}
          </>
        )}
      </Paper>

      {/* Quick Update Panel */}
      {currentSessionId && selectedDepositIndex >= 0 && selectedDepositIndex < deposits.length && (
        <Paper sx={{ p: 3, mb: 3, bgcolor: 'warning.50', border: '1px solid', borderColor: 'warning.200' }}>
          <Box mb={2}>
            <Typography variant="h6" fontWeight="bold">
              Quick Update: {deposits[selectedDepositIndex].deposit.bank} - {deposits[selectedDepositIndex].deposit.account_name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Platform: {(() => {
                const platform = deposits[selectedDepositIndex].deposit.platform || 'Direct';
                return platform.charAt(0).toUpperCase() + platform.slice(1).toLowerCase();
              })()}
            </Typography>
          </Box>
          
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} sm={3}>
              <Typography variant="body2" color="text.secondary">Current Balance</Typography>
              <Typography variant="h6">
                {formatCurrency(deposits[selectedDepositIndex].deposit.balance || 0)}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={3}>
              <Typography variant="body2" color="text.secondary">Current AER</Typography>
              <Typography variant="h6">
                {formatPercentage(deposits[selectedDepositIndex].deposit.aer)}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                ref={balanceInputRef}
                label="New Balance"
                type="number"
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
                fullWidth
                size="small"
                inputProps={{ step: 0.01 }}
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                ref={aerInputRef}
                label="New AER %"
                type="number"
                value={newAer}
                onChange={(e) => setNewAer(e.target.value)}
                fullWidth
                size="small"
                inputProps={{ step: 0.01 }}
                placeholder="3.50"
              />
            </Grid>
          </Grid>
          
          <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mt: 2 }}>
            <Stack direction="row" spacing={1}>
              <Tooltip title="Save (Enter)">
                <IconButton onClick={handleUpdateBalance} color="primary" size="small">
                  <SaveIcon />
                </IconButton>
              </Tooltip>
            </Stack>
            
            <Typography variant="caption" color="text.secondary">
              Click any row to edit that account. Press Enter to save changes.
            </Typography>
          </Box>
        </Paper>
      )}

      {/* Action Bar */}
      {!currentSessionId && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box display="flex" gap={2}>
              <Button
                variant="contained"
                startIcon={<StartIcon />}
                onClick={handleStartSession}
                disabled={loading || deposits.length === 0}
              >
                Start Update Session
              </Button>
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={() => loadDeposits(true)}
                disabled={loading}
              >
                Refresh
              </Button>
              <Button
                variant="outlined"
                startIcon={<CalendarIcon />}
                onClick={handleGenerateReminders}
                disabled={loading}
                color="secondary"
              >
                Generate Reminders
              </Button>
              <Button
                variant="outlined"
                startIcon={<ScheduleIcon />}
                onClick={handleInitializeSchedules}
                disabled={loading}
                color="info"
              >
                Initialize Schedules
              </Button>
            </Box>
            
            <Typography variant="body2" color="text.secondary">
              {allDeposits.length} deposits • {getTabCount('overdue')} overdue • {getTabCount('pending')} pending
            </Typography>
          </Box>
        </Paper>
      )}

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Success Display */}
      {success && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Status Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          variant="fullWidth"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label={`All (${getTabCount('all')})`} />
          <Tab label={`Pending (${getTabCount('pending')})`} />
          <Tab label={`Current (${getTabCount('current')})`} />
          <Tab label={`Overdue (${getTabCount('overdue')})`} />
        </Tabs>

        <TabPanel value={tabValue} index={tabValue}>
          {/* DataGrid */}
          <Box sx={{ height: 600 }}>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
                <CircularProgress />
              </Box>
            ) : (
              <DataGrid
                apiRef={apiRef}
                rows={deposits}
                columns={columns}
                getRowId={(row) => row?.deposit?.id || `temp-${Math.random()}`}
                sortModel={sortModel}
                onSortModelChange={(model) => {
                  setSortModel(model);
                }}
                onStateChange={() => {
                  // Update sorted row IDs whenever grid state changes
                  if (apiRef.current) {
                    const sortedIds = apiRef.current.getSortedRowIds();
                    setSortedRowIds(sortedIds);
                  }
                }}
              slots={{ toolbar: GridToolbar }}
              slotProps={{
                toolbar: {
                  showQuickFilter: true,
                  quickFilterProps: { debounceMs: 500 },
                },
              }}
              initialState={{
                pagination: {
                  paginationModel: {
                    pageSize: 25,
                  },
                },
              }}
              pageSizeOptions={[25, 50, 100]}
              loading={loading}
              getRowClassName={(params) => {
                if (currentSessionId && selectedDepositIndex >= 0 && deposits[selectedDepositIndex]) {
                  const selectedId = deposits[selectedDepositIndex].deposit.id;
                  return params.id === selectedId ? 'selected-row' : '';
                }
                return '';
              }}
              onRowClick={(params) => {
                if (currentSessionId && params.row) {
                  const index = deposits.findIndex(d => d?.deposit?.id === params.id);
                  if (index >= 0) {
                    setSelectedDepositIndex(index);
                  }
                }
              }}
              sx={{
                border: 0,
                '& .MuiDataGrid-row:hover': {
                  backgroundColor: 'action.hover',
                  cursor: currentSessionId ? 'pointer' : 'default',
                },
                '& .MuiDataGrid-row.selected-row': {
                  backgroundColor: 'rgba(25, 118, 210, 0.08)',
                  '&:hover': {
                    backgroundColor: 'rgba(25, 118, 210, 0.12)',
                  },
                },
                '& .MuiDataGrid-cell:focus': {
                  outline: 'none',
                },
                '& .MuiDataGrid-cell:focus-within': {
                  outline: 'none',
                },
                '& .MuiDataGrid-columnHeader:focus': {
                  outline: 'none',
                },
                '& .MuiDataGrid-columnHeader:focus-within': {
                  outline: 'none',
                },
              }}
            />
            )}
          </Box>
        </TabPanel>
      </Paper>

      {/* Complete Session Confirmation Dialog */}
      <Dialog open={confirmCompleteOpen} onClose={() => setConfirmCompleteOpen(false)}>
        <DialogTitle>Complete Balance Update Session?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to complete this session? This will finalize all balance updates made during this session.
          </Typography>
          {sessionProgress && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Progress: {sessionProgress.session.updated_count} of {sessionProgress.total_deposits} deposits updated
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmCompleteOpen(false)}>Cancel</Button>
          <Button onClick={handleCompleteSession} variant="contained" color="success">
            Complete Session
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};