import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Switch,
  Grid,
  Alert,
  Snackbar,
  IconButton,
  Tooltip,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
  CircularProgress,
  FormHelperText,
  Link,
  Tabs,
  Tab,
  Menu,
} from '@mui/material';
import {
  DataGrid,
  GridColDef,
  GridRowsProp,
  GridActionsCellItem,
  GridRowId,
} from '@mui/x-data-grid';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  AccountBalance as AccountIcon,
  Schedule as ScheduleIcon,
  Security as SecurityIcon,
  Notes as NotesIcon,
  SwapHoriz as SwapIcon,
  PlayArrow as PlayArrowIcon,
  Visibility as VisibilityIcon,
  Check as CheckIcon,
  Cancel as CancelIcon,
  Help as HelpIcon,
  History as HistoryIcon,
  Receipt as TransactionsIcon,
  MoreVert as MoreVertIcon,
  Description as DocumentsIcon,
} from '@mui/icons-material';
import { Deposit } from '@cash-mgmt/shared';
import { PortfolioTypes';
import { Transaction, TransactionForm, InterestConfiguration } from '@cash-mgmt/shared';
import { TransactionTypes';
import { PendingMoveForm } from '../components/PendingMoveForm';
import { ExecutePendingMoveDialog } from '../components/ExecutePendingMoveDialog';
import { AuditViewer } from '../components/AuditViewer';
import { ViewModeProvider } from '../components/ViewModeContext';
import { SmartTextField } from '../components/SmartTextField';
import { SmartSelect } from '../components/SmartSelect';
import { SmartCheckbox } from '../components/SmartCheckbox';
import { TransactionList } from '../components/transactions/TransactionList';
import { TransactionEntry } from '../components/transactions/TransactionEntry';
import { InterestConfiguration as InterestConfigurationComponent } from '../components/transactions/InterestConfiguration';
import { ReconciliationWizard } from '../components/reconciliation/ReconciliationWizard';
import DocumentManager from '../components/documents/DocumentManager';

const defaultDeposit: Deposit = {
  bank: '',
  type: '',
  sub_type: '',
  is_isa: false,
  is_active: true,
  balance: 0,
  aer: 0,
  notice_period_days: 0,
  term_months: 0,
  liquidity_tier: '',
  can_withdraw_immediately: true,
};

const defaultPendingDeposit: any = {
  bank: '',
  type: '',
  sub_type: '',
  balance: 0,
  aer: 0,
  status: 'PENDING',
  expected_funding_date: '',
  source_account_id: null,
  is_active: true,
  is_isa: false,
  liquidity_tier: 'easy_access',
  frn: '',
  earliest_withdrawal_date: '',
  platform: 'Direct',
  term_months: undefined,
  notice_period_days: undefined,
};

// Liquidity tier options will be loaded from database

const interestFrequencyOptions = [
  { value: 'Monthly', label: 'Monthly' },
  { value: 'Quarterly', label: 'Quarterly' },
  { value: 'Annually', label: 'Annually' },
  { value: 'Maturity', label: 'At Maturity' },
];

export const PortfolioManagement: React.FC = () => {
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [executingMoves, setExecutingMoves] = useState<Set<number>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDeposit, setEditingDeposit] = useState<Deposit | null>(null);
  const [viewMode, setViewMode] = useState<'edit' | 'view' | 'create'>('create');
  const [viewingRecord, setViewingRecord] = useState<any | null>(null);
  const [formData, setFormData] = useState<Deposit>(defaultDeposit);
  const [editingPendingMove, setEditingPendingMove] = useState<any | null>(null);
  const [pendingMoveData, setPendingMoveData] = useState<any>(defaultPendingDeposit);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);
  const [showPending, setShowPending] = useState(false); // Toggle for current vs pending deposits
  const [liquidityTiers, setLiquidityTiers] = useState<any[]>([]);
  const [tiersLoaded, setTiersLoaded] = useState(false);
  const [platforms, setPlatforms] = useState<any[]>([]);
  const [platformsLoaded, setPlatformsLoaded] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });
  const [executeDialogOpen, setExecuteDialogOpen] = useState(false);
  const [pendingMoveToExecute, setPendingMoveToExecute] = useState<any>(null);
  
  // Audit viewer state
  const [auditViewerOpen, setAuditViewerOpen] = useState(false);
  const [auditTableName, setAuditTableName] = useState<string>('');
  const [auditRecordId, setAuditRecordId] = useState<number>(0);
  
  // FRN info dialog state
  const [frnInfoOpen, setFrnInfoOpen] = useState(false);
  
  // Transaction management state
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false);
  const [selectedAccountForTransactions, setSelectedAccountForTransactions] = useState<Deposit | null>(null);
  const [transactionEntryOpen, setTransactionEntryOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [selectedTransactionTab, setSelectedTransactionTab] = useState(0);
  const [transactionRefreshTrigger, setTransactionRefreshTrigger] = useState(0);
  const [reconciliationDialogOpen, setReconciliationDialogOpen] = useState(false);
  const [selectedAccountForReconciliation, setSelectedAccountForReconciliation] = useState<Deposit | null>(null);
  const [reconciliationRefreshTrigger, setReconciliationRefreshTrigger] = useState(0);

  // Document management state
  const [documentCounts, setDocumentCounts] = useState<Record<number, number>>({});
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  const [selectedAccountForDocuments, setSelectedAccountForDocuments] = useState<Deposit | null>(null);
  const [documentRefreshTrigger, setDocumentRefreshTrigger] = useState(0);

  // Dropdown menu state
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedMenuRow, setSelectedMenuRow] = useState<any>(null);

  const columns: GridColDef[] = showPending ? [
    // Pending deposits columns in specified order
    { 
      field: 'source_bank', 
      headerName: 'Source Account', 
      width: 130,
      minWidth: 130,
      flex: 0,
      valueGetter: (value, row) => {
        // Check if this is an external deposit
        if (!row.source_account_id) {
          // Try to get funding source from metadata
          if (row.metadata) {
            try {
              const metadata = JSON.parse(row.metadata);
              if (metadata.funding_source) {
                return `External: ${metadata.funding_source}`;
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
          return 'External Deposit';
        }
        return row.source_bank || '-';
      },
      renderCell: (params) => {
        const isExternal = !params.row.source_account_id;
        return (
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center',
            color: isExternal ? 'success.main' : 'inherit',
            fontWeight: isExternal ? 500 : 400
          }}>
            {params.value}
          </Box>
        );
      }
    },
    { 
      field: 'source_type', 
      headerName: 'Type', 
      width: 100,
      minWidth: 100,
      flex: 0,
      valueGetter: (value, row) => {
        // For external deposits, show a clear label
        if (!row.source_account_id) {
          return 'New Money';
        }
        // Use source account type hierarchy
        if (row.source_sub_type && row.source_sub_type !== 'n/a') {
          return row.source_sub_type;
        }
        return row.source_type || 'Current';
      },
      renderCell: (params) => {
        const isExternal = !params.row.source_account_id;
        if (isExternal) {
          return (
            <Chip 
              label={params.value}
              size="small"
              color="success"
              variant="outlined"
            />
          );
        }
        return params.value;
      }
    },
    { 
      field: 'balance', 
      headerName: 'Amount', 
      width: 120,
      minWidth: 120,
      flex: 0,
      type: 'number',
      valueFormatter: (value) => {
        if (!value || value === 0) return '-';
        return `£${Math.round(Number(value)).toLocaleString()}`;
      }
    },
    { 
      field: 'bank', 
      headerName: 'Destination Bank', 
      width: 150,
      minWidth: 150,
      flex: 0
    },
    {
      field: 'platform',
      headerName: 'Platform',
      width: 100,
      minWidth: 100,
      flex: 0,
      valueFormatter: (value) => value || 'Direct'
    },
    {
      field: 'frn',
      headerName: 'FRN',
      width: 100,
      minWidth: 100,
      flex: 0,
      valueFormatter: (value: any) => value || 'TBD'
    },
    {
      field: 'liquidity_tier',
      headerName: 'Liquidity Tier',
      width: 130,
      minWidth: 130,
      flex: 0,
      valueFormatter: (value: any) => {
        if (!value) return '-';
        const tierLabels: Record<string, string> = {
          'easy_access': 'Easy Access',
          'notice_30': 'Notice 30',
          'notice_90': 'Notice 90',
          'fixed_12m': 'Term 12m',
          'fixed_24m': 'Term 24m',
          'fixed_36m': 'Term 36m',
          'fixed_60m': 'Term 60m'
        };
        return tierLabels[value] || value;
      }
    },
    { 
      field: 'aer', 
      headerName: 'AER %', 
      width: 80,
      minWidth: 80,
      flex: 0,
      type: 'number',
      valueFormatter: (value) => 
        value ? `${Number(value).toFixed(2)}%` : '0%'
    },
    { 
      field: 'expected_funding_date', 
      headerName: 'Expected Date', 
      width: 130,
      minWidth: 130,
      flex: 0,
      valueFormatter: (value) => {
        if (value) {
          return new Date(value).toLocaleDateString('en-GB');
        }
        return '-';
      }
    },
    { 
      field: 'status', 
      headerName: 'Status', 
      width: 100,
      minWidth: 100,
      flex: 0,
      renderCell: (params) => {
        const status = params.value || 'PENDING';
        const color = status === 'FUNDED' ? 'success' : status === 'CANCELLED' ? 'error' : 'warning';
        return <Chip label={status} size="small" color={color} />;
      }
    },
    {
      field: 'actions',
      type: 'actions',
      headerName: 'Actions',
      width: 60,
      minWidth: 60,
      flex: 0,
      getActions: (params) => [
        <IconButton
          size="small"
          onClick={(e) => handleMenuOpen(e, params.row)}
          data-testid={`account-${params.row.id}-menu`}
        >
          <MoreVertIcon />
        </IconButton>
      ],
    }
  ] : [
    // Current deposits columns (unchanged)
    { field: 'id', headerName: 'ID', width: 70, minWidth: 70, flex: 0 },
    { 
      field: 'bank', 
      headerName: 'Bank', 
      width: 150,
      minWidth: 150,
      flex: 0
    },
    { 
      field: 'sub_type', 
      headerName: 'Type', 
      width: 120,
      minWidth: 120,
      flex: 0,
      valueGetter: (value, row) => {
        if (row.type === 'Current') {
          return 'Current';
        }
        return row.sub_type;
      }
    },
    { 
      field: 'balance', 
      headerName: 'Amount', 
      width: 120,
      minWidth: 120,
      flex: 0,
      type: 'number',
      valueFormatter: (value) => {
        if (!value || value === 0) return '-';
        return `£${Math.round(Number(value)).toLocaleString()}`;
      }
    },
    { 
      field: 'aer', 
      headerName: 'AER %', 
      width: 100,
      minWidth: 100,
      flex: 0,
      type: 'number',
      valueFormatter: (value) => 
        value ? `${Number(value).toFixed(2)}%` : '0%'
    },
    { 
      field: 'notice_period_days', 
      headerName: 'Notice Days', 
      width: 120,
      minWidth: 120,
      flex: 0,
      type: 'number',
      valueFormatter: (value) => value || '-'
    },
    { 
      field: 'term_months', 
      headerName: 'Term (m)', 
      width: 90,
      minWidth: 90,
      flex: 0,
      valueFormatter: (value) => value || '-'
    },
    { 
      field: 'is_isa', 
      headerName: 'ISA', 
      width: 80,
      minWidth: 80,
      flex: 0,
      renderCell: (params) => 
        params.value ? <Chip label="ISA" size="small" color="primary" /> : null
    },
    { 
      field: 'is_active', 
      headerName: 'Active', 
      width: 80,
      minWidth: 80,
      flex: 0,
      renderCell: (params) => 
        params.value ? 
          <Chip label="Active" size="small" color="success" /> : 
          <Chip label="Inactive" size="small" color="default" />
    },
    {
      field: 'platform',
      headerName: 'Platform',
      width: 120,
      minWidth: 120,
      flex: 0,
      valueFormatter: (value) => value || 'Direct'
    },
    {
      field: 'term_ends',
      headerName: 'Maturity',
      width: 120,
      minWidth: 120,
      flex: 0,
      valueFormatter: (value: any) => value || '-'
    },
    {
      field: 'document_count',
      headerName: 'Docs',
      width: 60,
      minWidth: 60,
      flex: 0,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params) => {
        const count = documentCounts[params.row.id] || 0;
        return count > 0 ? (
          <Chip
            label={count}
            size="small"
            color="primary"
            variant="outlined"
            sx={{ minWidth: '32px' }}
          />
        ) : null;
      }
    },
    {
      field: 'actions',
      type: 'actions',
      headerName: 'Actions',
      width: 60,
      minWidth: 60,
      flex: 0,
      getActions: (params) => [
        <IconButton
          size="small"
          onClick={(e) => handleMenuOpen(e, params.row)}
          data-testid={`account-${params.row.id}-menu`}
        >
          <MoreVertIcon />
        </IconButton>
      ],
    }
  ];

  useEffect(() => {
    loadDeposits();
    loadLiquidityTiers();
    loadPlatforms();
  }, []);

  useEffect(() => {
    loadDeposits();
  }, [showPending]);

  const loadLiquidityTiers = async () => {
    try {
      const tiers = await window.electronAPI.getLiquidityTiers();
      setLiquidityTiers(tiers || []);
      setTiersLoaded(true);
    } catch (error) {
      console.error('Error loading liquidity tiers:', error);
      setTiersLoaded(true); // Still set to true to avoid infinite loading
    }
  };

  const loadPlatforms = async () => {
    try {
      const platformList = await window.electronAPI.getPlatformsForDropdown();
      setPlatforms(platformList || []);
      setPlatformsLoaded(true);
    } catch (error) {
      console.error('Error loading platforms:', error);
      setPlatformsLoaded(true); // Still set to true to avoid infinite loading
    }
  };

  const loadDeposits = async () => {
    try {
      setLoading(true);
      const result = showPending
        ? await window.electronAPI.getAllPendingDeposits()
        : await window.electronAPI.getAllDeposits();
      setDeposits(result || []);

      // Load document counts for current deposits only
      if (!showPending) {
        try {
          const countsResult = await window.electronAPI.documents.getCounts();
          if (countsResult.success) {
            setDocumentCounts(countsResult.data || {});
          }
        } catch (error) {
          console.error('Error loading document counts:', error);
          // Don't show error for document counts - non-critical
        }
      } else {
        setDocumentCounts({}); // Clear counts for pending view
      }
    } catch (error) {
      console.error(`Error loading ${showPending ? 'pending ' : ''}deposits:`, error);
      showSnackbar(`Error loading ${showPending ? 'pending ' : ''}deposits`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    
    // Use correct data source based on mode
    const dataToValidate = showPending ? pendingMoveData : formData;

    // FRN validation (for deposits)
    if (!showPending) {
      if (!dataToValidate.frn || dataToValidate.frn.trim() === '') {
        errors.frn = 'FRN is required (enter "NO_FRN" if not applicable)';
      } else {
        const trimmedFRN = dataToValidate.frn.trim().toUpperCase();
        if (trimmedFRN === 'NO_FRN' || trimmedFRN === 'NONE') {
          // Valid special value - no error
        } else if (!/^\d{6,7}$/.test(dataToValidate.frn.trim())) {
          errors.frn = 'FRN must be 6-7 digits or "NO_FRN"';
        }
      }
    }

    // Bank name validation
    if (!dataToValidate.bank?.trim()) {
      errors.bank = 'Bank name is required';
    }

    // Account type validation (for deposits)
    if (!showPending) {
      if (!dataToValidate.type || dataToValidate.type.trim() === '') {
        errors.type = 'Account type is required';
      }

      // Sub-type validation
      if (!dataToValidate.sub_type || dataToValidate.sub_type.trim() === '') {
        errors.sub_type = 'Account sub-type is required';
      }
    }

    // Balance validation
    const balanceNumber = Number(dataToValidate.balance);
    if (dataToValidate.balance === null || dataToValidate.balance === undefined || dataToValidate.balance === 0 || String(dataToValidate.balance) === '' || isNaN(balanceNumber) || balanceNumber <= 0) {
      errors.balance = 'Balance must be greater than 0';
    } else if (balanceNumber > 10000000) { // £10M limit
      errors.balance = 'Balance cannot exceed £10,000,000';
    }

    // AER validation
    if (dataToValidate.aer !== undefined && dataToValidate.aer !== null) {
      if (dataToValidate.aer < 0) {
        errors.aer = 'AER cannot be negative';
      } else if (dataToValidate.aer > 20) {
        errors.aer = 'AER seems unusually high (>20%)';
      }
    }

    // Platform validation (for deposits)
    if (!showPending) {
      if (!dataToValidate.platform || dataToValidate.platform.trim() === '') {
        errors.platform = 'Platform is required';
      }
    }

    // Conditional validation for Term deposits
    if (dataToValidate.sub_type === 'Term') {
      if (!dataToValidate.term_months || dataToValidate.term_months <= 0) {
        errors.term_months = 'Term length is required for term deposits';
      } else if (dataToValidate.term_months > 120) { // 10 years max
        errors.term_months = 'Term length cannot exceed 120 months';
      }
    } else if (dataToValidate.term_months && dataToValidate.term_months < 0) {
      errors.term_months = 'Term cannot be negative';
    }

    // Conditional validation for Notice accounts
    if (dataToValidate.sub_type === 'Notice') {
      if (!dataToValidate.notice_period_days || dataToValidate.notice_period_days <= 0) {
        errors.notice_period_days = 'Notice period is required for notice accounts';
      } else if (dataToValidate.notice_period_days > 365) { // 1 year max
        errors.notice_period_days = 'Notice period cannot exceed 365 days';
      }
    } else if (dataToValidate.notice_period_days && dataToValidate.notice_period_days < 0) {
      errors.notice_period_days = 'Notice period cannot be negative';
    }

    // Date validation
    if (dataToValidate.deposit_date && dataToValidate.term_ends) {
      const depositDate = new Date(dataToValidate.deposit_date);
      const termEnds = new Date(dataToValidate.term_ends);
      if (termEnds <= depositDate) {
        errors.term_ends = 'Term end date must be after deposit date';
      }
    }

    if (dataToValidate.earliest_withdrawal_date && dataToValidate.deposit_date) {
      const depositDate = new Date(dataToValidate.deposit_date);
      const withdrawalDate = new Date(dataToValidate.earliest_withdrawal_date);
      if (withdrawalDate < depositDate) {
        errors.earliest_withdrawal_date = 'Earliest withdrawal date cannot be before deposit date';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAdd = () => {
    setViewMode('create');
    if (showPending) {
      setEditingPendingMove(null);
      setPendingMoveData({ ...defaultPendingDeposit });
    } else {
      setEditingDeposit(null);
      setFormData({ ...defaultDeposit });
    }
    setValidationErrors({});
    setHasAttemptedSave(false); // Reset save attempt flag for new records
    setDialogOpen(true);
  };

  const handleEdit = (item: any) => {
    setViewMode('edit');
    if (showPending) {
      setEditingPendingMove(item);
      setPendingMoveData({ ...item });
    } else {
      setEditingDeposit(item);
      setFormData({ ...item });
    }
    setValidationErrors({});
    setDialogOpen(true);
  };

  const handleView = (record: any) => {
    setViewMode('view');
    setViewingRecord(record);
    if (showPending) {
      setEditingPendingMove(record);
      setPendingMoveData({ ...record });
    } else {
      setFormData({ ...record });
    }
    setDialogOpen(true);
  };
  
  const handleOpenTransactions = (deposit: Deposit) => {
    setSelectedAccountForTransactions(deposit);
    setSelectedTransactionTab(0); // Reset to Transactions tab
    setTransactionRefreshTrigger(prev => prev + 1); // Force refresh on dialog open
    setTransactionDialogOpen(true);
  };
  
  const handleOpenReconciliation = (deposit: Deposit) => {
    setSelectedAccountForReconciliation(deposit);
    setReconciliationRefreshTrigger(prev => prev + 1); // Force refresh when opening
    setReconciliationDialogOpen(true);
  };

  const handleOpenDocuments = (deposit: Deposit) => {
    setSelectedAccountForDocuments(deposit);
    setDocumentRefreshTrigger(prev => prev + 1); // Force refresh when opening
    setDocumentDialogOpen(true);
  };

  const handleDocumentDialogClose = () => {
    setDocumentDialogOpen(false);
    setSelectedAccountForDocuments(null);
    // Refresh document counts after closing dialog
    refreshDocumentCounts();
  };

  const refreshDocumentCounts = async () => {
    if (!showPending) {
      try {
        const countsResult = await window.electronAPI.documents.getCounts();
        if (countsResult.success) {
          setDocumentCounts(countsResult.data || {});
        }
      } catch (error) {
        console.error('Error refreshing document counts:', error);
      }
    }
  };

  // Dropdown menu handlers
  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, row: any) => {
    setAnchorEl(event.currentTarget);
    setSelectedMenuRow(row);
  };
  
  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedMenuRow(null);
  };
  
  const handleSaveTransaction = async (transaction: TransactionForm) => {
    try {
      console.log('🚀 Frontend: Calling createTransaction with:', transaction);

      let result;
      if (editingTransaction && editingTransaction.id !== undefined) {
        result = await window.electronAPI.updateTransaction(editingTransaction.id, transaction);
      } else {
        result = await window.electronAPI.createTransaction(transaction);
      }

      console.log('📋 Frontend: Transaction API result:', result);

      // Check if the operation was successful
      if (result && result.success === false) {
        throw new Error(result.error || 'Transaction save failed');
      }

      setTransactionEntryOpen(false);
      setEditingTransaction(null);
      console.log('✅ Frontend: Transaction saved successfully');
    } catch (err: any) {
      console.error('❌ Frontend: Transaction save failed:', err);
      throw new Error(err.message || 'Failed to save transaction');
    }
  };
  
  const handleSaveInterestConfig = async (config: InterestConfiguration) => {
    if (!selectedAccountForTransactions || selectedAccountForTransactions.id === undefined) return;
    
    try {
      await window.electronAPI.updateInterestConfiguration(selectedAccountForTransactions.id, config);
      
      // Refresh deposit data
      loadDeposits();
    } catch (err: any) {
      throw new Error(err.message || 'Failed to save interest configuration');
    }
  };

  const handleDelete = async (id: GridRowId) => {
    const itemType = showPending ? 'pending move' : 'deposit';
    if (window.confirm(`Are you sure you want to delete this ${itemType}? This action cannot be undone.`)) {
      try {
        if (showPending) {
          await window.electronAPI.deletePendingDeposit(Number(id));
        } else {
          await window.electronAPI.deleteDeposit(Number(id));
        }
        await loadDeposits();
        showSnackbar(`${itemType.charAt(0).toUpperCase() + itemType.slice(1)} deleted successfully`, 'success');
      } catch (error) {
        console.error(`Error deleting ${itemType}:`, error);
        showSnackbar(`Error deleting ${itemType}`, 'error');
      }
    }
  };

  const handleExecuteMove = (pendingMove: any) => {
    setPendingMoveToExecute(pendingMove);
    setExecuteDialogOpen(true);
  };

  const handleViewAuditTrail = (record: any) => {
    const tableName = showPending ? 'my_pending_deposits' : 'my_deposits';
    setAuditTableName(tableName);
    setAuditRecordId(record.id);
    setAuditViewerOpen(true);
  };

  const handleConfirmExecute = async () => {
    if (!pendingMoveToExecute) return;
    
    const moveId = Number(pendingMoveToExecute.id);
    
    try {
      // Add to executing set
      setExecutingMoves(prev => new Set(prev).add(moveId));
      
      // Close dialog first
      setExecuteDialogOpen(false);
      
      // Show immediate feedback
      showSnackbar('Executing pending move...', 'success');
      
      await window.electronAPI.executePendingMove(moveId);
      
      // Auto-refresh data
      await loadDeposits();
      
      // Show success with enhanced message
      const bankName = pendingMoveToExecute.bank;
      const amount = pendingMoveToExecute.balance?.toLocaleString();
      showSnackbar(
        `✓ Successfully moved £${amount} to ${bankName}. Portfolio updated and move marked as funded.`, 
        'success'
      );
    } catch (error: any) {
      console.error('Error executing pending move:', error);
      const errorMsg = error.message || 'Unknown error occurred';
      showSnackbar(`❌ Failed to execute move: ${errorMsg}`, 'error');
    } finally {
      // Always remove from executing set
      setExecutingMoves(prev => {
        const newSet = new Set(prev);
        newSet.delete(moveId);
        return newSet;
      });
      setPendingMoveToExecute(null);
    }
  };

  const handleCloseExecuteDialog = () => {
    setExecuteDialogOpen(false);
    setPendingMoveToExecute(null);
  };

  const handleSave = async () => {
    // Mark that user has attempted to save
    setHasAttemptedSave(true);
    
    if (!validateForm()) {
      showSnackbar('Please fix validation errors before saving', 'error');
      return;
    }

    try {
      const itemType = showPending ? 'pending move' : 'deposit';
      if (editingDeposit) {
        if (showPending) {
          await window.electronAPI.updatePendingDeposit(formData);
        } else {
          await window.electronAPI.updateDeposit(formData);
        }
        showSnackbar(`${itemType.charAt(0).toUpperCase() + itemType.slice(1)} updated successfully`, 'success');
      } else {
        if (showPending) {
          await window.electronAPI.createPendingDeposit(formData);
        } else {
          await window.electronAPI.createDeposit(formData);
        }
        showSnackbar(`${itemType.charAt(0).toUpperCase() + itemType.slice(1)} created successfully`, 'success');
      }
      setDialogOpen(false);
      await loadDeposits();
    } catch (error) {
      console.error(`Error saving ${showPending ? 'pending move' : 'deposit'}:`, error);
      showSnackbar(`Error saving ${showPending ? 'pending move' : 'deposit'}`, 'error');
    }
  };

  const handleInputChange = (field: string, value: any) => {
    if (showPending) {
      setPendingMoveData((prev: any) => ({
        ...prev,
        [field]: value
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }
    
    // Clear validation error for this field when user starts typing
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handlePendingMoveFieldChange = (field: string, value: any) => {
    // Handle special case for validation errors
    if (field === 'validation') {
      setValidationErrors(value);
      return;
    }
    
    setPendingMoveData((prev: any) => ({
      ...prev,
      [field]: value
    }));
    
    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handlePendingMoveSave = async (pendingMove: any) => {
    if (!validateForm()) {
      showSnackbar('Please fix validation errors before saving', 'error');
      return;
    }

    try {
      if (editingPendingMove) {
        // Add debug logging for update
        console.log('[DEBUG: PortfolioManagement] Before IPC updatePendingDeposit:', {
          balance: pendingMove.balance,
          type: typeof pendingMove.balance,
          isInteger: Number.isInteger(pendingMove.balance),
          preciseValue: pendingMove.balance?.toPrecision(20)
        });
        await window.electronAPI.updatePendingDeposit(pendingMove);
        showSnackbar('Pending move updated successfully', 'success');
      } else {
        // Add debug logging for create
        console.log('[DEBUG: PortfolioManagement] Before IPC createPendingDeposit:', {
          balance: pendingMove.balance,
          type: typeof pendingMove.balance,
          isInteger: Number.isInteger(pendingMove.balance),
          preciseValue: pendingMove.balance?.toPrecision(20)
        });
        await window.electronAPI.createPendingDeposit(pendingMove);
        showSnackbar('Pending move created successfully', 'success');
      }
      setDialogOpen(false);
      await loadDeposits();
    } catch (error) {
      console.error('Error saving pending move:', error);
      showSnackbar('Error saving pending move', 'error');
    }
  };

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  return (
    <Box data-testid="portfolio-page">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Portfolio Management
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* Current/Pending Toggle */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SwapIcon color={showPending ? 'primary' : 'disabled'} />
            <FormControlLabel
              control={
                <Switch
                  checked={showPending}
                  onChange={(e) => setShowPending(e.target.checked)}
                  color="primary"
                />
              }
              label={showPending ? 'Pending Holdings' : 'Current Holdings'}
            />
          </Box>
          
          <Typography variant="body2" color="text.secondary">
            {deposits.length} {showPending ? 'pending moves' : 'deposits'} • £{deposits.reduce((sum, d: any) => {
              const amount = d.balance || 0;
              return sum + amount;
            }, 0).toLocaleString()} total
          </Typography>
          
          <Tooltip title="Refresh Data">
            <IconButton
              onClick={loadDeposits}
              disabled={loading}
              data-testid="refresh-portfolio"
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAdd}
            data-testid="add-account-button"
          >
            {showPending ? 'Add Pending Move' : 'Add Deposit'}
          </Button>
        </Box>
      </Box>

      <div style={{ height: 700, width: '100%' }}>
        <DataGrid
          rows={deposits}
          columns={columns}
          loading={loading}
          checkboxSelection
          disableRowSelectionOnClick
          data-testid="account-grid"
          disableVirtualization={process.env.NODE_ENV === 'test'}
          pageSizeOptions={[25, 50, 100]}
          initialState={{
            pagination: {
              paginationModel: { pageSize: 25 },
            },
          }}
          sx={{
            '& .MuiDataGrid-cell': {
              borderBottom: '1px solid rgba(224, 224, 224, 1)',
            },
          }}
          columnHeaderHeight={56}
          rowHeight={52}
        />
      </div>

      {/* Conditional Dialog Rendering */}
      {showPending ? (
        <PendingMoveForm
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSave={handlePendingMoveSave}
          editingMove={editingPendingMove}
          validationErrors={validationErrors}
          onFieldChange={handlePendingMoveFieldChange}
          viewMode={viewMode}
        />
      ) : (
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AccountIcon />
            {viewMode === 'view' ? 'View Deposit' : (editingDeposit ? 'Edit Deposit' : 'Add New Deposit')}
          </Box>
        </DialogTitle>
        <DialogContent>
          <ViewModeProvider viewMode={viewMode}>
            <Box sx={{ mt: 2, minHeight: '600px' }}>
            
            {/* Validation Summary */}
            {hasAttemptedSave && Object.keys(validationErrors).length > 0 && !showPending && (
              <Box 
                sx={{ 
                  mb: 3, 
                  p: 2, 
                  bgcolor: 'error.light', 
                  color: 'error.contrastText',
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: 'error.main'
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                  Please fix the following issues before saving:
                </Typography>
                <Box component="ul" sx={{ m: 0, pl: 2 }}>
                  {Object.entries(validationErrors).map(([field, message]) => (
                    <Typography component="li" key={field} variant="body2">
                      {message}
                    </Typography>
                  ))}
                </Box>
              </Box>
            )}
            {/* Basic Information Section */}
            <Accordion defaultExpanded sx={{ 
              '& .MuiAccordionDetails-root': {
                paddingTop: 2,
                paddingBottom: 2
              }
            }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AccountIcon fontSize="small" />
                  <Typography variant="h6">Basic Information</Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={3}>
                  <Grid item xs={12} md={6}>
                    <SmartTextField
                      label="Bank"
                      value={formData.bank}
                      onChange={(e) => handleInputChange('bank', e.target.value)}
                      fullWidth
                      required
                      error={!!validationErrors.bank}
                      helperText={validationErrors.bank}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <SmartSelect
                      label="Type"
                      fullWidth
                      required
                      error={!!validationErrors.type}
                      selectProps={{
                        value: formData.type || '',
                        onChange: (e) => handleInputChange('type', e.target.value),
                      }}
                    >
                      <MenuItem value="Current">Current</MenuItem>
                      <MenuItem value="Savings">Savings</MenuItem>
                    </SmartSelect>
                    {validationErrors.type && (
                      <FormHelperText error>{validationErrors.type}</FormHelperText>
                    )}
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <SmartSelect
                      label="Sub Type"
                      fullWidth
                      required
                      error={!!validationErrors.sub_type}
                      selectProps={{
                        value: formData.sub_type || '',
                        onChange: (e) => handleInputChange('sub_type', e.target.value),
                      }}
                    >
                      <MenuItem value="Easy Access">Easy Access</MenuItem>
                      <MenuItem value="Notice">Notice</MenuItem>
                      <MenuItem value="Term">Term</MenuItem>
                      <MenuItem value="n/a">n/a</MenuItem>
                    </SmartSelect>
                    {validationErrors.sub_type && (
                      <FormHelperText error>{validationErrors.sub_type}</FormHelperText>
                    )}
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <SmartSelect
                      label="Liquidity Tier"
                      fullWidth
                      selectProps={{
                        value: formData.liquidity_tier || '',
                        onChange: (e) => handleInputChange('liquidity_tier', e.target.value),
                      }}
                    >
                      {tiersLoaded && liquidityTiers.map(tier => (
                        <MenuItem key={tier.liquidity_tier} value={tier.liquidity_tier}>
                          {tier.tier_short_name}
                        </MenuItem>
                      ))}
                    </SmartSelect>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <SmartTextField
                      label="Balance"
                      type="number"
                      value={formData.balance || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Allow empty string or valid numbers
                        if (value === '' || !isNaN(Number(value))) {
                          handleInputChange('balance', value === '' ? 0 : Number(value));
                        }
                      }}
                      fullWidth
                      required
                      InputProps={{ startAdornment: '£' }}
                      error={!!validationErrors.balance}
                      helperText={validationErrors.balance}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <SmartTextField
                      label="AER %"
                      type="number"
                      value={formData.aer || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Allow empty string or valid numbers
                        if (value === '' || !isNaN(Number(value))) {
                          handleInputChange('aer', value === '' ? 0 : Number(value));
                        }
                      }}
                      fullWidth
                      inputProps={{ step: 0.01, min: 0 }}
                      error={!!validationErrors.aer}
                      helperText={validationErrors.aer}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <SmartCheckbox
                      label="ISA Account"
                      checkboxProps={{
                        checked: formData.is_isa,
                        onChange: (e) => handleInputChange('is_isa', e.target.checked),
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <SmartCheckbox
                      label="Active Account"
                      checkboxProps={{
                        checked: formData.is_active,
                        onChange: (e) => handleInputChange('is_active', e.target.checked),
                      }}
                    />
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>

            {/* Account Details Section */}
            <Accordion sx={{ 
              '& .MuiAccordionDetails-root': {
                paddingTop: 2,
                paddingBottom: 2
              }
            }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SecurityIcon fontSize="small" />
                  <Typography variant="h6">Account Details</Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={3}>
                  <Grid item xs={12} md={6}>
                    <SmartSelect
                      label="Platform"
                      fullWidth
                      required
                      error={!!validationErrors.platform}
                      selectProps={{
                        value: formData.platform || '',
                        onChange: (e) => handleInputChange('platform', e.target.value),
                      }}
                    >
                      {platforms.map((platform) => (
                        <MenuItem key={platform.platform_variant} value={platform.platform_variant}>
                          {platform.display_name}
                        </MenuItem>
                      ))}
                    </SmartSelect>
                    {validationErrors.platform && (
                      <FormHelperText error>{validationErrors.platform}</FormHelperText>
                    )}
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Box sx={{ position: 'relative' }}>
                      <SmartTextField
                        label="FRN"
                        value={formData.frn || ''}
                        onChange={(e) => handleInputChange('frn', e.target.value)}
                        fullWidth
                        required
                        error={!!validationErrors.frn}
                        helperText={validationErrors.frn || "Financial Services Register Number (6-7 digits) or enter 'NO_FRN' if not applicable"}
                        InputProps={{
                          endAdornment: (
                            <IconButton
                              size="small"
                              onClick={() => setFrnInfoOpen(true)}
                              sx={{ padding: '4px' }}
                              aria-label="FRN information"
                            >
                              <HelpIcon sx={{ fontSize: 20 }} />
                            </IconButton>
                          )
                        }}
                      />
                    </Box>
                  </Grid>
                  {!showPending && (
                    <Grid item xs={12} md={6}>
                      <SmartTextField
                        label="Account Name"
                        value={formData.account_name || ''}
                        onChange={(e) => handleInputChange('account_name', e.target.value)}
                        fullWidth
                      />
                    </Grid>
                  )}
                  {!showPending && (
                    <>
                      <Grid item xs={12} md={6}>
                        <SmartTextField
                          label="Sort Code"
                          value={formData.sort_code || ''}
                          onChange={(e) => handleInputChange('sort_code', e.target.value)}
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <SmartTextField
                          label="Account Number"
                          value={formData.account_number || ''}
                          onChange={(e) => handleInputChange('account_number', e.target.value)}
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <SmartTextField
                          label="Reference"
                          value={formData.reference || ''}
                          onChange={(e) => handleInputChange('reference', e.target.value)}
                          fullWidth
                          InputLabelProps={{ shrink: true }}
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <SmartTextField
                          label="Designated Account"
                          value={formData.designated_account || ''}
                          onChange={(e) => handleInputChange('designated_account', e.target.value)}
                          fullWidth
                        />
                      </Grid>
                    </>
                  )}
                </Grid>
              </AccordionDetails>
            </Accordion>

            {/* Terms & Conditions Section - only show for current deposits */}
            {!showPending && (
              <Accordion sx={{ 
                '& .MuiAccordionDetails-root': {
                  paddingTop: 2,
                  paddingBottom: 2
                }
              }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ScheduleIcon fontSize="small" />
                  <Typography variant="h6">Terms & Conditions</Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={3}>
                  <Grid item xs={12} md={6}>
                    <SmartTextField
                      label="Notice Period (Text)"
                      value={formData.notice_period || ''}
                      onChange={(e) => handleInputChange('notice_period', e.target.value)}
                      fullWidth
                      helperText="e.g., '95 days', 'Instant access', etc."
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <SmartTextField
                      label="Notice Period (Days)"
                      type="number"
                      value={formData.notice_period_days || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Allow empty string or valid numbers
                        if (value === '' || !isNaN(Number(value))) {
                          handleInputChange('notice_period_days', value === '' ? null : Number(value));
                        }
                      }}
                      fullWidth
                      inputProps={{ min: 0 }}
                      error={!!validationErrors.notice_period_days}
                      helperText={validationErrors.notice_period_days || "Numeric value for calculations"}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <SmartTextField
                      label="Term (Text)"
                      value={formData.term || ''}
                      onChange={(e) => handleInputChange('term', e.target.value)}
                      fullWidth
                      helperText="e.g., '2 years', '18 months', etc."
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <SmartTextField
                      label="Term (Months)"
                      type="number"
                      value={formData.term_months || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Allow empty string or valid numbers
                        if (value === '' || !isNaN(Number(value))) {
                          handleInputChange('term_months', value === '' ? null : Number(value));
                        }
                      }}
                      fullWidth
                      inputProps={{ min: 0 }}
                      error={!!validationErrors.term_months}
                      helperText={validationErrors.term_months || "Numeric value for calculations"}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <SmartTextField
                      label="Deposit Date"
                      type="date"
                      value={formData.deposit_date || ''}
                      onChange={(e) => handleInputChange('deposit_date', e.target.value)}
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <SmartTextField
                      label="Term Ends"
                      type="date"
                      value={formData.term_ends || ''}
                      onChange={(e) => handleInputChange('term_ends', e.target.value)}
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                      error={!!validationErrors.term_ends}
                      helperText={validationErrors.term_ends}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <SmartTextField
                      label="Earliest Withdrawal Date"
                      type="date"
                      value={formData.earliest_withdrawal_date || ''}
                      onChange={(e) => handleInputChange('earliest_withdrawal_date', e.target.value)}
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                      error={!!validationErrors.earliest_withdrawal_date}
                      helperText={validationErrors.earliest_withdrawal_date}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <SmartSelect
                      label="Payment Frequency"
                      fullWidth
                      selectProps={{
                        value: formData.interest_payment_frequency || '',
                        onChange: (e) => handleInputChange('interest_payment_frequency', e.target.value),
                        displayEmpty: true,
                      }}
                    >
                      {interestFrequencyOptions.map(option => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </SmartSelect>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <SmartTextField
                      label="Minimum Deposit"
                      type="number"
                      value={formData.min_deposit || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Allow empty string or valid numbers
                        if (value === '' || !isNaN(Number(value))) {
                          handleInputChange('min_deposit', value === '' ? null : Number(value));
                        }
                      }}
                      fullWidth
                      InputProps={{ startAdornment: '£' }}
                      inputProps={{ min: 0 }}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <SmartTextField
                      label="Maximum Deposit"
                      type="number"
                      value={formData.max_deposit || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Allow empty string or valid numbers
                        if (value === '' || !isNaN(Number(value))) {
                          handleInputChange('max_deposit', value === '' ? null : Number(value));
                        }
                      }}
                      fullWidth
                      InputProps={{ startAdornment: '£' }}
                      inputProps={{ min: 0 }}
                    />
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
            )}

            {/* Notes Section - only show for main deposits */}
            {!showPending && (
              <Accordion sx={{ 
                '& .MuiAccordionDetails-root': {
                  paddingTop: 2,
                  paddingBottom: 2
                }
              }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <NotesIcon fontSize="small" />
                    <Typography variant="h6">Notes</Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <SmartTextField
                        label="Notes"
                        value={formData.notes || ''}
                        onChange={(e) => handleInputChange('notes', e.target.value)}
                        fullWidth
                        multiline
                        rows={4}
                        placeholder="Additional notes about this deposit..."
                        helperText="Optional notes for reference"
                      />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            )}

            {/* Pending Move Details Section - only show for pending deposits */}
            {showPending && (
              <Accordion sx={{ 
                '& .MuiAccordionDetails-root': {
                  paddingTop: 2,
                  paddingBottom: 2
                }
              }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <SwapIcon fontSize="small" />
                    <Typography variant="h6">Pending Move Details</Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={3}>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Expected Funding Date"
                        type="date"
                        value={(formData as any).expected_funding_date || ''}
                        onChange={(e) => handleInputChange('expected_funding_date', e.target.value)}
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                        helperText="When this deposit is expected to be funded"
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Earliest Withdrawal Date"
                        type="date"
                        value={(formData as any).earliest_withdrawal_date || ''}
                        onChange={(e) => handleInputChange('earliest_withdrawal_date', e.target.value)}
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                        helperText="When funds can first be withdrawn"
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <SmartSelect
                        label="Status"
                        fullWidth
                        selectProps={{
                          value: (formData as any).status || 'PENDING',
                          onChange: (e) => handleInputChange('status', e.target.value)
                        }}
                      >
                        <MenuItem value="PENDING">Pending</MenuItem>
                        <MenuItem value="APPROVED">Approved</MenuItem>
                        <MenuItem value="FUNDED">Funded</MenuItem>
                        <MenuItem value="CANCELLED">Cancelled</MenuItem>
                      </SmartSelect>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <SmartTextField
                        label="Source Account ID"
                        type="number"
                        value={(formData as any).source_account_id || ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Allow empty string or valid numbers
                          if (value === '' || !isNaN(Number(value))) {
                            handleInputChange('source_account_id', value === '' ? null : Number(value));
                          }
                        }}
                        fullWidth
                        placeholder="Account ID from current holdings"
                        inputProps={{ min: 1 }}
                        helperText="ID of the source account (from current holdings)"
                      />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            )}

            </Box>
          </ViewModeProvider>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setDialogOpen(false)} size="large">
            {viewMode === 'view' ? 'Close' : 'Cancel'}
          </Button>
          {viewMode !== 'view' && (
            <Button 
              onClick={handleSave} 
              variant="contained" 
              size="large"
              disabled={Object.keys(validationErrors).length > 0}
            >
              {editingDeposit ? 'Update Deposit' : 'Create Deposit'}
            </Button>
          )}
        </DialogActions>
        </Dialog>
      )}

      {/* Execute Pending Move Dialog */}
      <ExecutePendingMoveDialog
        open={executeDialogOpen}
        onClose={handleCloseExecuteDialog}
        onConfirm={handleConfirmExecute}
        pendingMove={pendingMoveToExecute}
      />

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={snackbar.message.includes('Successfully moved') ? 8000 : 6000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>

      {/* Audit Viewer */}
      <AuditViewer
        open={auditViewerOpen}
        onClose={() => setAuditViewerOpen(false)}
        initialFilters={{
          tableName: auditTableName,
          recordId: auditRecordId
        }}
        title={`Audit Trail - ${showPending ? 'Pending Deposit' : 'Deposit'} #${auditRecordId}`}
      />

      {/* FRN Info Dialog */}
      <Dialog
        open={frnInfoOpen}
        onClose={() => setFrnInfoOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          FRN (Financial Services Register Number)
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            • Unique identifier for UK regulated financial institutions
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            • You must validate the FRN yourself at
          </Typography>
          <Box sx={{ ml: 2.5, mb: 2 }}>
            <Link 
              href="https://www.fscs.org.uk/check/check-your-money-is-protected/" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              https://www.fscs.org.uk/check/check-your-money-is-protected/
            </Link>
          </Box>
          <Typography variant="body1" sx={{ mb: 1.5 }}>
            • Enter "NO_FRN" for:
          </Typography>
          <Box sx={{ ml: 2.5 }}>
            <Typography variant="body1" sx={{ mb: 1 }}>
              - Investment platform cash accounts (e.g., HL, AJ Bell)
            </Typography>
            <Typography variant="body1" sx={{ mb: 1 }}>
              - Banks without UK licenses
            </Typography>
            <Typography variant="body1" sx={{ mb: 0 }}>
              - Credit unions or other non-FSCS protected accounts
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFrnInfoOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Transaction Management Dialog */}
      <Dialog
        open={transactionDialogOpen}
        onClose={() => setTransactionDialogOpen(false)}
        maxWidth={selectedTransactionTab === 0 ? "lg" : "sm"}
        fullWidth
        data-testid="transaction-dialog"
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">
              {selectedAccountForTransactions?.bank} - {selectedAccountForTransactions?.account_name || selectedAccountForTransactions?.type}
            </Typography>
            <IconButton onClick={() => setTransactionDialogOpen(false)}>
              <CancelIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        
        <DialogContent>
          {selectedAccountForTransactions && (
            <Box sx={{ mt: 2 }}>
              <Tabs value={selectedTransactionTab} onChange={(_, newValue) => setSelectedTransactionTab(newValue)}>
                <Tab label="Transactions" />
                <Tab label="Interest Schedule" />
              </Tabs>
              
              <Box sx={{ mt: 2 }}>
                {selectedTransactionTab === 0 && selectedAccountForTransactions.id !== undefined && (
                  <TransactionList
                    accountId={selectedAccountForTransactions.id}
                    accountName={selectedAccountForTransactions.account_name || selectedAccountForTransactions.type}
                    bankName={selectedAccountForTransactions.bank}
                    refreshTrigger={transactionRefreshTrigger}
                    onAddTransaction={() => {
                      setEditingTransaction(null);
                      setTransactionEntryOpen(true);
                    }}
                    onEditTransaction={(transaction) => {
                      setEditingTransaction(transaction);
                      setTransactionEntryOpen(true);
                    }}
                  />
                )}
                {selectedTransactionTab === 1 && selectedAccountForTransactions.id !== undefined && (
                  <InterestConfigurationComponent
                    account={selectedAccountForTransactions as any}
                    onSave={handleSaveInterestConfig}
                    allAccounts={deposits}
                  />
                )}
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* Transaction Entry Dialog */}
      {selectedAccountForTransactions && selectedAccountForTransactions.id !== undefined && (
        <TransactionEntry
          open={transactionEntryOpen}
          onClose={() => {
            setTransactionEntryOpen(false);
            setEditingTransaction(null);
          }}
          onSave={handleSaveTransaction}
          transaction={editingTransaction}
          accountId={selectedAccountForTransactions.id}
          currentBalance={selectedAccountForTransactions.balance || 0}
        />
      )}
      
      {/* Dropdown Action Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        {/* For pending deposits, show execute if applicable */}
        {showPending && selectedMenuRow && selectedMenuRow.status && 
         selectedMenuRow.status !== 'FUNDED' && selectedMenuRow.status !== 'CANCELLED' && (
          <>
            <MenuItem onClick={() => {
              handleExecuteMove(selectedMenuRow);
              handleMenuClose();
            }}>
              <PlayArrowIcon sx={{ mr: 1 }} />
              Execute Move
            </MenuItem>
            <Divider />
          </>
        )}

        {/* Common actions */}
        <MenuItem onClick={() => {
          handleView(selectedMenuRow);
          handleMenuClose();
        }}>
          <VisibilityIcon sx={{ mr: 1 }} />
          View Details
        </MenuItem>
        
        <MenuItem onClick={() => {
          handleEdit(selectedMenuRow);
          handleMenuClose();
        }}>
          <EditIcon sx={{ mr: 1 }} />
          Edit
        </MenuItem>
        
        <MenuItem onClick={() => {
          handleViewAuditTrail(selectedMenuRow);
          handleMenuClose();
        }}>
          <HistoryIcon sx={{ mr: 1 }} />
          Audit Trail
        </MenuItem>
        
        {/* For active deposits, show transactions and reconciliation */}
        {!showPending && (
          <>
            <Divider />
            <MenuItem
              onClick={() => {
                handleOpenTransactions(selectedMenuRow);
                handleMenuClose();
              }}
              data-testid="view-transactions-menu-item"
            >
              <TransactionsIcon sx={{ mr: 1 }} />
              Transactions
            </MenuItem>
            <MenuItem
              onClick={() => {
                handleOpenReconciliation(selectedMenuRow);
                handleMenuClose();
              }}
              data-testid="reconcile-menu-item"
            >
              <CheckIcon sx={{ mr: 1 }} />
              Reconcile
            </MenuItem>
            <MenuItem onClick={() => {
              handleOpenDocuments(selectedMenuRow);
              handleMenuClose();
            }}>
              <DocumentsIcon sx={{ mr: 1 }} />
              Documents {documentCounts[selectedMenuRow?.id] > 0 && `(${documentCounts[selectedMenuRow.id]})`}
            </MenuItem>
          </>
        )}
        
        <Divider />
        
        {/* Destructive action */}
        <MenuItem 
          onClick={() => {
            if (selectedMenuRow) {
              handleDelete(selectedMenuRow.id);
              handleMenuClose();
            }
          }}
          sx={{ color: 'error.main' }}
        >
          <DeleteIcon sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>
      
      {/* Reconciliation Wizard */}
      {selectedAccountForReconciliation && (
        <ReconciliationWizard
          open={reconciliationDialogOpen}
          onClose={() => {
            setReconciliationDialogOpen(false);
            setSelectedAccountForReconciliation(null);
          }}
          account={selectedAccountForReconciliation}
          refreshTrigger={reconciliationRefreshTrigger}
          onComplete={() => {
            loadDeposits(); // Refresh the deposits list
          }}
        />
      )}

      {/* Document Manager */}
      {selectedAccountForDocuments && (
        <DocumentManager
          account={{
            id: selectedAccountForDocuments.id!,
            bank: selectedAccountForDocuments.bank,
            account_name: selectedAccountForDocuments.account_name,
            account_type: selectedAccountForDocuments.type,
            sub_type: selectedAccountForDocuments.sub_type
          }}
          open={documentDialogOpen}
          onClose={handleDocumentDialogClose}
          refreshTrigger={documentRefreshTrigger}
        />
      )}
    </Box>
  );
};