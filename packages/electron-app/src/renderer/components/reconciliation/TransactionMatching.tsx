import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Checkbox,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
  Divider,
  Grid
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Add as AddIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { Transaction } from '@cash-mgmt/shared';
import { TransactionTypes';
import { StatementEntry, StatementTransaction } from './StatementEntry';

interface TransactionMatchingProps {
  accountId: number;
  sessionId: number;
  statementBalance: number;
  onTransactionsReconciled?: (transactionIds: number[]) => void;
  onTransactionAdded?: () => void;
}

export const TransactionMatching: React.FC<TransactionMatchingProps> = ({
  accountId,
  sessionId,
  statementBalance,
  onTransactionsReconciled,
  onTransactionAdded
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreconciledTransactions, setUnreconciledTransactions] = useState<Transaction[]>([]);
  const [selectedTransactions, setSelectedTransactions] = useState<Set<number>>(new Set());
  const [calculatedBalance, setCalculatedBalance] = useState(0);
  const [discrepancy, setDiscrepancy] = useState(0);
  const [showAddTransaction, setShowAddTransaction] = useState(false);

  useEffect(() => {
    loadUnreconciledTransactions();
  }, [accountId]);

  useEffect(() => {
    calculateBalance();
  }, [selectedTransactions, unreconciledTransactions]);

  const loadUnreconciledTransactions = async () => {
    setLoading(true);
    setError(null);
    try {
      const transactions = await window.electronAPI.getUnreconciledTransactions(accountId);
      setUnreconciledTransactions(transactions);
      
      // Auto-select all transactions initially
      const allIds = new Set<number>(transactions.filter((t: any) => t.id !== undefined).map((t: any) => t.id as number));
      setSelectedTransactions(allIds);
    } catch (err) {
      setError('Failed to load unreconciled transactions');
      console.error('Error loading transactions:', err);
    } finally {
      setLoading(false);
    }
  };

  const calculateBalance = () => {
    let balance = 0;
    unreconciledTransactions.forEach(transaction => {
      if (transaction.id !== undefined && selectedTransactions.has(transaction.id)) {
        if (transaction.credit) {
          balance += transaction.credit;
        }
        if (transaction.debit) {
          balance -= transaction.debit;
        }
      }
    });
    setCalculatedBalance(balance);
    setDiscrepancy(statementBalance - balance);
  };

  const handleToggleTransaction = (transactionId: number) => {
    const newSelected = new Set(selectedTransactions);
    if (newSelected.has(transactionId)) {
      newSelected.delete(transactionId);
    } else {
      newSelected.add(transactionId);
    }
    setSelectedTransactions(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedTransactions.size === unreconciledTransactions.length) {
      setSelectedTransactions(new Set());
    } else {
      const allIds = new Set(unreconciledTransactions.filter(t => t.id !== undefined).map(t => t.id as number));
      setSelectedTransactions(allIds);
    }
  };

  const handleMarkReconciled = async () => {
    if (selectedTransactions.size === 0) {
      setError('Please select at least one transaction to reconcile');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const transactionIds = Array.from(selectedTransactions);
      
      await window.electronAPI.reconcileTransactions(sessionId, transactionIds);
      
      if (onTransactionsReconciled) {
        onTransactionsReconciled(transactionIds);
      }
      
      // Reload transactions
      await loadUnreconciledTransactions();
    } catch (err) {
      setError('Failed to mark transactions as reconciled');
      console.error('Error marking reconciled:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTransaction = async (transaction: StatementTransaction) => {
    setLoading(true);
    setError(null);
    try {
      await window.electronAPI.createTransaction({
        account_id: accountId,
        transaction_date: format(new Date(), 'yyyy-MM-dd'),
        bank_date: transaction.bank_date,
        transaction_type: transaction.transaction_type,
        debit: transaction.debit,
        credit: transaction.credit,
        reference: transaction.reference,
        optional_notes: transaction.notes,
        source: 'manual'
      });
      
      if (onTransactionAdded) {
        onTransactionAdded();
      }
      
      // Reload transactions
      await loadUnreconciledTransactions();
      setShowAddTransaction(false);
    } catch (err) {
      setError('Failed to add transaction');
      console.error('Error adding transaction:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP'
    }).format(amount);
  };

  const formatDate = (date: string | Date): string => {
    if (!date) return '';
    return format(new Date(date), 'dd/MM/yyyy');
  };

  const getTransactionTypeColor = (type: string) => {
    switch (type) {
      case 'deposit':
        return 'success';
      case 'withdrawal':
        return 'error';
      case 'interest':
        return 'info';
      case 'fee':
        return 'warning';
      case 'adjustment':
        return 'default';
      default:
        return 'default';
    }
  };

  if (loading && unreconciledTransactions.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Summary Section */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Reconciliation Summary
        </Typography>
        
        <Grid container spacing={2}>
          <Grid item xs={12} md={3}>
            <Typography variant="body2" color="text.secondary">
              Statement Balance
            </Typography>
            <Typography variant="h6">
              {formatCurrency(statementBalance)}
            </Typography>
          </Grid>
          
          <Grid item xs={12} md={3}>
            <Typography variant="body2" color="text.secondary">
              Selected Total
            </Typography>
            <Typography variant="h6">
              {formatCurrency(calculatedBalance)}
            </Typography>
          </Grid>
          
          <Grid item xs={12} md={3}>
            <Typography variant="body2" color="text.secondary">
              Discrepancy
            </Typography>
            <Typography 
              variant="h6"
              color={Math.abs(discrepancy) < 0.01 ? 'success.main' : 'error.main'}
            >
              {formatCurrency(Math.abs(discrepancy))}
            </Typography>
          </Grid>
          
          <Grid item xs={12} md={3}>
            <Typography variant="body2" color="text.secondary">
              Status
            </Typography>
            <Chip
              icon={Math.abs(discrepancy) < 0.01 ? <CheckCircleIcon /> : <WarningIcon />}
              label={Math.abs(discrepancy) < 0.01 ? 'Balanced' : 'Unbalanced'}
              color={Math.abs(discrepancy) < 0.01 ? 'success' : 'warning'}
              size="small"
            />
          </Grid>
        </Grid>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Transactions Table */}
      <Paper sx={{ mb: 2 }}>
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">
            Unreconciled Transactions ({unreconciledTransactions.length})
          </Typography>
          <Box>
            <Button
              startIcon={<AddIcon />}
              onClick={() => setShowAddTransaction(true)}
              sx={{ mr: 1 }}
            >
              Add Missing
            </Button>
            <Button
              variant="contained"
              onClick={handleMarkReconciled}
              disabled={selectedTransactions.size === 0 || loading}
            >
              Mark as Reconciled ({selectedTransactions.size})
            </Button>
          </Box>
        </Box>
        
        <Divider />
        
        {unreconciledTransactions.length > 0 ? (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      indeterminate={
                        selectedTransactions.size > 0 && 
                        selectedTransactions.size < unreconciledTransactions.length
                      }
                      checked={selectedTransactions.size === unreconciledTransactions.length}
                      onChange={handleSelectAll}
                    />
                  </TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Bank Date</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Debit</TableCell>
                  <TableCell align="right">Credit</TableCell>
                  <TableCell align="right">Balance</TableCell>
                  <TableCell>Reference</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {unreconciledTransactions.map((transaction) => (
                  <TableRow 
                    key={transaction.id}
                    selected={transaction.id !== undefined && selectedTransactions.has(transaction.id)}
                    hover
                  >
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={transaction.id !== undefined && selectedTransactions.has(transaction.id)}
                        onChange={() => transaction.id !== undefined && handleToggleTransaction(transaction.id)}
                      />
                    </TableCell>
                    <TableCell>{formatDate(transaction.transaction_date)}</TableCell>
                    <TableCell>
                      {transaction.bank_date ? formatDate(transaction.bank_date) : '-'}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={transaction.transaction_type}
                        size="small"
                        color={getTransactionTypeColor(transaction.transaction_type) as any}
                      />
                    </TableCell>
                    <TableCell align="right">
                      {transaction.debit ? formatCurrency(transaction.debit) : '-'}
                    </TableCell>
                    <TableCell align="right">
                      {transaction.credit ? formatCurrency(transaction.credit) : '-'}
                    </TableCell>
                    <TableCell align="right">
                      {transaction.balance_after ? formatCurrency(transaction.balance_after) : '-'}
                    </TableCell>
                    <TableCell>
                      <Tooltip title={transaction.optional_notes || transaction.reference || ''}>
                        <span>
                          {transaction.reference ? 
                            (transaction.reference.length > 20 ? 
                              `${transaction.reference.substring(0, 20)}...` : 
                              transaction.reference) : 
                            '-'}
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <InfoIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="body1" color="text.secondary">
              No unreconciled transactions found
            </Typography>
            <Button
              startIcon={<AddIcon />}
              onClick={() => setShowAddTransaction(true)}
              sx={{ mt: 2 }}
            >
              Add Transaction
            </Button>
          </Box>
        )}
      </Paper>

      {/* Help Text */}
      {Math.abs(discrepancy) > 0.01 && (
        <Alert severity="info">
          <Typography variant="body2" gutterBottom>
            <strong>Tips for resolving discrepancies:</strong>
          </Typography>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>Check if any transactions are missing - use "Add Missing" to add them</li>
            <li>Verify the dates match your statement</li>
            <li>Look for duplicate transactions</li>
            <li>Check if interest has been paid but not recorded</li>
            <li>Verify the statement balance is entered correctly</li>
          </ul>
        </Alert>
      )}

      {/* Add Transaction Dialog */}
      <StatementEntry
        open={showAddTransaction}
        onClose={() => setShowAddTransaction(false)}
        accountId={accountId}
        onSave={handleAddTransaction}
      />
    </Box>
  );
};