import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Alert,
  Grid,
  InputAdornment
} from '@mui/material';
import { format } from 'date-fns';
import { TransactionType } from '@cash-mgmt/shared';

interface StatementEntryProps {
  open: boolean;
  onClose: () => void;
  accountId: number;
  onSave: (transaction: StatementTransaction) => void;
  suggestedDate?: string;
  suggestedType?: TransactionType;
}

export interface StatementTransaction {
  bank_date: string;
  transaction_type: TransactionType;
  debit?: number;
  credit?: number;
  reference?: string;
  notes?: string;
}

export const StatementEntry: React.FC<StatementEntryProps> = ({
  open,
  onClose,
  accountId,
  onSave,
  suggestedDate,
  suggestedType
}) => {
  const [bankDate, setBankDate] = useState(suggestedDate || format(new Date(), 'yyyy-MM-dd'));
  const [transactionType, setTransactionType] = useState<TransactionType>(suggestedType || 'deposit');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const transactionTypes: { value: TransactionType; label: string; isDebit: boolean }[] = [
    { value: 'deposit', label: 'Deposit', isDebit: false },
    { value: 'withdrawal', label: 'Withdrawal', isDebit: true },
    { value: 'interest', label: 'Interest Payment', isDebit: false },
    { value: 'fee', label: 'Bank Fee', isDebit: true },
    { value: 'adjustment', label: 'Adjustment', isDebit: false }
  ];

  const isDebitTransaction = () => {
    const type = transactionTypes.find(t => t.value === transactionType);
    return type?.isDebit || false;
  };

  const handleSave = () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    const amountValue = parseFloat(amount);
    const transaction: StatementTransaction = {
      bank_date: bankDate,
      transaction_type: transactionType,
      reference: reference || undefined,
      notes: notes || undefined
    };

    if (isDebitTransaction()) {
      transaction.debit = amountValue;
    } else {
      transaction.credit = amountValue;
    }

    onSave(transaction);
    handleClose();
  };

  const handleClose = () => {
    setBankDate(format(new Date(), 'yyyy-MM-dd'));
    setTransactionType('deposit');
    setAmount('');
    setReference('');
    setNotes('');
    setError(null);
    onClose();
  };

  const getAmountLabel = () => {
    return isDebitTransaction() ? 'Amount Out' : 'Amount In';
  };

  const getAmountHelperText = () => {
    switch (transactionType) {
      case 'deposit':
        return 'Money added to the account';
      case 'withdrawal':
        return 'Money taken from the account';
      case 'interest':
        return 'Interest payment received';
      case 'fee':
        return 'Bank charges or fees';
      case 'adjustment':
        return 'Manual balance adjustment';
      default:
        return '';
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Add Missing Transaction</DialogTitle>
      
      <DialogContent>
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Add a transaction that appears on your bank statement but is missing from the system.
          </Typography>
          
          {error && (
            <Alert severity="error" sx={{ mt: 2, mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
          
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Bank Date"
                type="date"
                value={bankDate}
                onChange={(e) => setBankDate(e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
                helperText="Date shown on bank statement"
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Transaction Type</InputLabel>
                <Select
                  value={transactionType}
                  onChange={(e) => setTransactionType(e.target.value as TransactionType)}
                  label="Transaction Type"
                >
                  {transactionTypes.map((type) => (
                    <MenuItem key={type.value} value={type.value}>
                      {type.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                label={getAmountLabel()}
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                fullWidth
                required
                inputProps={{ step: 0.01, min: 0.01 }}
                InputProps={{
                  startAdornment: <InputAdornment position="start">£</InputAdornment>
                }}
                helperText={getAmountHelperText()}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                label="Reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                fullWidth
                helperText="Transaction reference from bank statement"
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                label="Notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                fullWidth
                multiline
                rows={2}
                helperText="Additional notes or context"
              />
            </Grid>
          </Grid>
          
          <Alert severity="info" sx={{ mt: 2 }}>
            This transaction will be added with today's date as the system date and marked as unreconciled.
            You can reconcile it after adding.
          </Alert>
        </Box>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button 
          variant="contained" 
          onClick={handleSave}
          disabled={!amount || parseFloat(amount) <= 0}
        >
          Add Transaction
        </Button>
      </DialogActions>
    </Dialog>
  );
};