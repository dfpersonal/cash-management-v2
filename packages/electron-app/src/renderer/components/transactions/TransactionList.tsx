import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  TextField,
  MenuItem,
  Stack,
} from '@mui/material';
import {
  DataGrid,
  GridColDef,
  GridRowsProp,
  GridRenderCellParams,
} from '@mui/x-data-grid';
import {
  Add as AddIcon,
  AccountBalance as ReconcileIcon,
  Refresh as RefreshIcon,
  CheckCircle as ReconciledIcon,
  Warning as VarianceIcon,
} from '@mui/icons-material';
import { Transaction, TransactionFilters, TransactionType } from '@cash-mgmt/shared';

interface TransactionListProps {
  accountId: number;
  accountName: string;
  bankName: string;
  refreshTrigger?: number;
  onAddTransaction?: () => void;
  onStartReconciliation?: () => void;
  onEditTransaction?: (transaction: Transaction) => void;
}

export const TransactionList: React.FC<TransactionListProps> = ({
  accountId,
  accountName,
  bankName,
  refreshTrigger,
  onAddTransaction,
  onStartReconciliation,
  onEditTransaction,
}) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<TransactionFilters>({
    reconciled: undefined,
    transaction_type: undefined,
    start_date: undefined,
    end_date: undefined,
  });
  const [lastReconciled, setLastReconciled] = useState<string | null>(null);
  const [totalBalance, setTotalBalance] = useState<number>(0);

  // Load transactions
  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await window.electronAPI.getAccountTransactions(accountId, filters);
      const data = response.transactions || [];
      setTransactions(data);
      
      // Calculate total balance from last transaction
      if (data.length > 0) {
        const lastTransaction = data[data.length - 1];
        setTotalBalance(lastTransaction.balance_after || 0);
      }

      // Get reconciliation history to show last reconciled date
      const reconciliationHistory = await window.electronAPI.getReconciliationHistory(accountId, 1);
      if (reconciliationHistory && reconciliationHistory.length > 0) {
        setLastReconciled(reconciliationHistory[0].statement_date);
      }
    } catch (err) {
      console.error('Failed to load transactions:', err);
      setError('Failed to load transactions.');
    } finally {
      setLoading(false);
    }
  }, [accountId, filters]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions, refreshTrigger]);

  // Format currency
  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '';
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toLocaleDateString('en-GB');
    } catch {
      return dateString;
    }
  };

  // Get transaction type color
  const getTypeColor = (type: TransactionType) => {
    switch (type) {
      case 'interest':
        return 'success';
      case 'deposit':
        return 'primary';
      case 'withdrawal':
        return 'warning';
      case 'fee':
        return 'error';
      case 'adjustment':
        return 'default';
      case 'account_opened':
        return 'info';
      case 'account_closed':
        return 'secondary';
      default:
        return 'default';
    }
  };

  // DataGrid columns
  const columns: GridColDef[] = [
    {
      field: 'transaction_date',
      headerName: 'Date',
      width: 100,
      valueFormatter: (value) => formatDate(value),
    },
    {
      field: 'bank_date',
      headerName: 'Bank Date',
      width: 100,
      valueFormatter: (value) => formatDate(value),
      editable: true,
    },
    {
      field: 'transaction_type',
      headerName: 'Type',
      width: 120,
      renderCell: (params: GridRenderCellParams) => (
        <Chip
          label={params.value}
          size="small"
          color={getTypeColor(params.value as TransactionType)}
        />
      ),
    },
    {
      field: 'debit',
      headerName: 'Debit',
      width: 100,
      align: 'right',
      valueFormatter: (value) => formatCurrency(value),
    },
    {
      field: 'credit',
      headerName: 'Credit',
      width: 100,
      align: 'right',
      valueFormatter: (value) => formatCurrency(value),
    },
    {
      field: 'balance_after',
      headerName: 'Balance',
      width: 120,
      align: 'right',
      valueFormatter: (value) => formatCurrency(value),
    },
    {
      field: 'optional_notes',
      headerName: 'Notes',
      flex: 1,
      minWidth: 200,
    },
    {
      field: 'reconciled',
      headerName: '✓',
      width: 50,
      align: 'center',
      renderCell: (params: GridRenderCellParams) => {
        if (params.value) {
          return (
            <Tooltip title="Reconciled">
              <ReconciledIcon color="success" fontSize="small" />
            </Tooltip>
          );
        }
        return null;
      },
    },
    {
      field: 'variance',
      headerName: '',
      width: 50,
      align: 'center',
      renderCell: (params: GridRenderCellParams) => {
        const transaction = params.row as Transaction;
        if (transaction.transaction_type === 'interest' && transaction.estimated_amount) {
          const actual = transaction.credit || 0;
          const variance = actual - transaction.estimated_amount;
          const percentVariance = (variance / transaction.estimated_amount) * 100;
          
          if (Math.abs(percentVariance) > 5) {
            return (
              <Tooltip title={`Variance: ${formatCurrency(variance)} (${percentVariance.toFixed(1)}%)`}>
                <VarianceIcon color="warning" fontSize="small" />
              </Tooltip>
            );
          }
        }
        return null;
      },
    },
  ];

  // Convert transactions to DataGrid rows
  const rows: GridRowsProp = transactions.map((transaction) => ({
    ...transaction,
    id: transaction.id,
  }));

  // Handle filter changes
  const handleFilterChange = (field: keyof TransactionFilters, value: any) => {
    setFilters((prev) => ({
      ...prev,
      [field]: value || undefined,
    }));
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="400px" data-testid="transaction-loading">
        <CircularProgress size={60} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 3 }}>
        {error}
      </Alert>
    );
  }

  return (
    <Box data-testid="transaction-list">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Box>
            <Typography variant="h6">
              {bankName} - {accountName}
            </Typography>
            {lastReconciled && (
              <Typography variant="body2" color="textSecondary">
                Last Reconciled: {formatDate(lastReconciled)} ✓
              </Typography>
            )}
          </Box>
          
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={onAddTransaction}
              size="small"
              data-testid="add-transaction"
            >
              Add Transaction
            </Button>
            <Button
              variant="outlined"
              startIcon={<ReconcileIcon />}
              onClick={onStartReconciliation}
              size="small"
              data-testid="reconcile-button"
            >
              Reconcile
            </Button>
            <IconButton onClick={loadTransactions} size="small">
              <RefreshIcon />
            </IconButton>
          </Stack>
        </Stack>

        <Stack direction="row" spacing={2} mb={2}>
          <TextField
            select
            label="Type"
            size="small"
            value={filters.transaction_type || ''}
            onChange={(e) => handleFilterChange('transaction_type', e.target.value)}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="account_opened">Account Opened</MenuItem>
            <MenuItem value="deposit">Deposit</MenuItem>
            <MenuItem value="withdrawal">Withdrawal</MenuItem>
            <MenuItem value="interest">Interest</MenuItem>
            <MenuItem value="fee">Fee</MenuItem>
            <MenuItem value="adjustment">Adjustment</MenuItem>
            <MenuItem value="account_closed">Account Closed</MenuItem>
          </TextField>

          <TextField
            select
            label="Status"
            size="small"
            value={filters.reconciled === undefined ? '' : filters.reconciled.toString()}
            onChange={(e) => handleFilterChange('reconciled', e.target.value === '' ? undefined : e.target.value === 'true')}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="true">Reconciled</MenuItem>
            <MenuItem value="false">Unreconciled</MenuItem>
          </TextField>

          <TextField
            type="date"
            label="From Date"
            size="small"
            value={filters.start_date || ''}
            onChange={(e) => handleFilterChange('start_date', e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 150 }}
          />

          <TextField
            type="date"
            label="To Date"
            size="small"
            value={filters.end_date || ''}
            onChange={(e) => handleFilterChange('end_date', e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 150 }}
          />
        </Stack>

        <DataGrid
          rows={rows}
          columns={columns}
          initialState={{
            pagination: {
              paginationModel: {
                pageSize: 25,
              },
            },
          }}
          pageSizeOptions={[25, 50, 100]}
          autoHeight
          disableRowSelectionOnClick
          data-testid="transaction-grid"
          onCellEditStop={(params: any) => {
            if (params.field === 'bank_date' && params.value !== params.row.bank_date) {
              window.electronAPI.updateTransaction(params.id as number, {
                bank_date: params.value,
              }).catch((err) => {
                console.error('Failed to update transaction:', err);
                setError('Failed to update transaction.');
              });
            }
          }}
          onRowDoubleClick={(params) => {
            if (onEditTransaction) {
              onEditTransaction(params.row as Transaction);
            }
          }}
          sx={{
            '& .MuiDataGrid-cell': {
              fontSize: '0.875rem',
            },
            '& .MuiDataGrid-columnHeaders': {
              backgroundColor: 'background.default',
              fontWeight: 600,
            },
          }}
        />

        {totalBalance > 0 && (
          <Box mt={2} display="flex" justifyContent="flex-end">
            <Typography variant="h6">
              Current Balance: {formatCurrency(totalBalance)}
            </Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
};