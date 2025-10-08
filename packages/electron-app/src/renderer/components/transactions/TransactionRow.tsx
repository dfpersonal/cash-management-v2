import React, { useState } from 'react';
import {
  TableRow,
  TableCell,
  Checkbox,
  Chip,
  IconButton,
  Tooltip,
  TextField,
  Box,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  CheckCircle as ReconciledIcon,
  Warning as VarianceIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { Transaction, TransactionType } from '@cash-mgmt/shared';

interface TransactionRowProps {
  transaction: Transaction;
  onEdit?: (transaction: Transaction) => void;
  onDelete?: (transactionId: number) => void;
  onToggleReconciled?: (transactionId: number, reconciled: boolean) => void;
  onUpdateBankDate?: (transactionId: number, bankDate: string) => void;
  selected?: boolean;
  onSelect?: (transactionId: number, selected: boolean) => void;
}

export const TransactionRow: React.FC<TransactionRowProps> = ({
  transaction,
  onEdit,
  onDelete,
  onToggleReconciled,
  onUpdateBankDate,
  selected = false,
  onSelect,
}) => {
  const [editingBankDate, setEditingBankDate] = useState(false);
  const [tempBankDate, setTempBankDate] = useState(transaction.bank_date || '');

  // Format currency
  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined || value === 0) return '';
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
  const getTypeColor = (type: TransactionType): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
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

  // Calculate variance for interest transactions
  const getVariance = () => {
    if (transaction.transaction_type === 'interest' && transaction.estimated_amount !== undefined && transaction.estimated_amount !== null) {
      const actual = transaction.credit || 0;
      const variance = actual - transaction.estimated_amount;
      const percentVariance = (variance / transaction.estimated_amount) * 100;
      return { amount: variance, percent: percentVariance };
    }
    return null;
  };

  // Handle bank date edit
  const handleSaveBankDate = () => {
    if (onUpdateBankDate && tempBankDate !== transaction.bank_date && transaction.id !== undefined) {
      onUpdateBankDate(transaction.id, tempBankDate);
    }
    setEditingBankDate(false);
  };

  const handleCancelBankDate = () => {
    setTempBankDate(transaction.bank_date || '');
    setEditingBankDate(false);
  };

  const variance = getVariance();
  const showVarianceWarning = variance && Math.abs(variance.percent) > 5;

  return (
    <TableRow hover selected={selected}>
      {onSelect && (
        <TableCell padding="checkbox">
          <Checkbox
            checked={selected}
            onChange={(e) => transaction.id !== undefined && onSelect(transaction.id, e.target.checked)}
          />
        </TableCell>
      )}

      <TableCell>{formatDate(transaction.transaction_date || '')}</TableCell>

      <TableCell>
        {editingBankDate ? (
          <Box display="flex" alignItems="center">
            <TextField
              type="date"
              value={tempBankDate}
              onChange={(e) => setTempBankDate(e.target.value)}
              size="small"
              variant="standard"
            />
            <IconButton size="small" onClick={handleSaveBankDate}>
              <SaveIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={handleCancelBankDate}>
              <CancelIcon fontSize="small" />
            </IconButton>
          </Box>
        ) : (
          <Box
            display="flex"
            alignItems="center"
            onDoubleClick={() => {
              if (onUpdateBankDate) {
                setEditingBankDate(true);
              }
            }}
            sx={{ cursor: onUpdateBankDate ? 'pointer' : 'default' }}
          >
            {formatDate(transaction.bank_date || transaction.transaction_date || '')}
            {onUpdateBankDate && (
              <IconButton
                size="small"
                sx={{ ml: 1, opacity: 0.5, '&:hover': { opacity: 1 } }}
                onClick={() => setEditingBankDate(true)}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        )}
      </TableCell>

      <TableCell>
        <Chip
          label={transaction.transaction_type.replace('_', ' ')}
          size="small"
          color={getTypeColor(transaction.transaction_type)}
        />
      </TableCell>

      <TableCell align="right">{formatCurrency(transaction.debit || 0)}</TableCell>
      
      <TableCell align="right">
        {transaction.transaction_type === 'interest' && transaction.estimated_amount ? (
          <Tooltip
            title={
              <Box>
                <div>Actual: {formatCurrency(transaction.credit)}</div>
                <div>Estimated: {formatCurrency(transaction.estimated_amount)}</div>
                {variance && (
                  <div>
                    Variance: {formatCurrency(variance.amount)} ({variance.percent.toFixed(1)}%)
                  </div>
                )}
                {transaction.variance_notes && (
                  <div style={{ marginTop: 8 }}>{transaction.variance_notes}</div>
                )}
              </Box>
            }
          >
            <Box display="flex" alignItems="center">
              {formatCurrency(transaction.credit)}
              {showVarianceWarning && (
                <VarianceIcon color="warning" fontSize="small" sx={{ ml: 0.5 }} />
              )}
            </Box>
          </Tooltip>
        ) : (
          formatCurrency(transaction.credit)
        )}
      </TableCell>

      <TableCell align="right">{formatCurrency(transaction.balance_after)}</TableCell>

      <TableCell>{transaction.optional_notes}</TableCell>

      <TableCell align="center">
        {transaction.reconciled ? (
          <Tooltip title={`Reconciled on ${formatDate(transaction.reconciled_date || '')}`}>
            <ReconciledIcon color="success" fontSize="small" />
          </Tooltip>
        ) : (
          onToggleReconciled && (
            <Checkbox
              size="small"
              checked={false}
              onChange={() => transaction.id !== undefined && onToggleReconciled(transaction.id, true)}
            />
          )
        )}
      </TableCell>

      <TableCell align="right">
        <Box display="flex" justifyContent="flex-end">
          {onEdit && (
            <IconButton size="small" onClick={() => onEdit(transaction)}>
              <EditIcon fontSize="small" />
            </IconButton>
          )}
          {onDelete && !transaction.reconciled && (
            <IconButton
              size="small"
              onClick={() => transaction.id !== undefined && onDelete(transaction.id)}
              color="error"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      </TableCell>
    </TableRow>
  );
};