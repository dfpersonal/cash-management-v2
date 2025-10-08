import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Box,
  Stack,
  Typography,
  Alert,
  FormControl,
  InputLabel,
  Select,
  InputAdornment,
} from '@mui/material';
import { Transaction, TransactionType, TransactionForm } from '@cash-mgmt/shared';
import { TransactionTypes';

interface TransactionEntryProps {
  open: boolean;
  onClose: () => void;
  onSave: (transaction: TransactionForm) => Promise<void>;
  transaction?: Transaction | null;
  accountId: number;
  currentBalance: number;
}

const transactionTypes: { value: TransactionType; label: string }[] = [
  { value: 'account_opened', label: 'Account Opened' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'withdrawal', label: 'Withdrawal' },
  { value: 'interest', label: 'Interest' },
  { value: 'fee', label: 'Fee' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'account_closed', label: 'Account Closed' },
];

export const TransactionEntry: React.FC<TransactionEntryProps> = ({
  open,
  onClose,
  onSave,
  transaction,
  accountId,
  currentBalance,
}) => {
  const [form, setForm] = useState<TransactionForm>({
    account_id: accountId,
    transaction_date: new Date(),
    bank_date: new Date(),
    transaction_type: 'deposit',
    amount: 0,
    is_debit: false,
    reference: '',
    optional_notes: '',
  });

  const [estimatedAmount, setEstimatedAmount] = useState<number | undefined>(undefined);
  const [varianceNotes, setVarianceNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balancePreview, setBalancePreview] = useState<number>(currentBalance);

  // Initialize form when dialog opens or transaction changes
  useEffect(() => {
    if (transaction) {
      const isDebit = transaction.debit !== null && transaction.debit !== undefined;
      const amount = isDebit ? transaction.debit : (transaction.credit || 0);
      
      setForm({
        account_id: transaction.account_id,
        transaction_date: new Date(transaction.transaction_date),
        bank_date: transaction.bank_date ? new Date(transaction.bank_date) : new Date(transaction.transaction_date),
        transaction_type: transaction.transaction_type,
        amount: amount || 0,
        is_debit: isDebit,
        reference: transaction.reference || '',
        optional_notes: transaction.optional_notes || '',
      });
      
      setEstimatedAmount(transaction.estimated_amount);
      setVarianceNotes(transaction.variance_notes || '');
    } else {
      setForm({
        account_id: accountId,
        transaction_date: new Date(),
        bank_date: new Date(),
        transaction_type: 'deposit',
        amount: 0,
        is_debit: false,
        reference: '',
        optional_notes: '',
      });
      setEstimatedAmount(undefined);
      setVarianceNotes('');
    }
  }, [transaction, accountId]);

  // Calculate balance preview
  useEffect(() => {
    let newBalance = currentBalance;
    if (form.is_debit) {
      newBalance -= form.amount;
    } else {
      newBalance += form.amount;
    }
    setBalancePreview(newBalance);
  }, [form.amount, form.is_debit, currentBalance]);

  // Handle form field changes
  const handleChange = (field: keyof TransactionForm, value: any) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));

    // Update is_debit based on transaction type
    if (field === 'transaction_type') {
      const isDebit = ['withdrawal', 'fee', 'account_closed'].includes(value);
      setForm((prev) => ({
        ...prev,
        is_debit: isDebit,
      }));
    }
  };

  // Validate form
  const validateForm = (): boolean => {
    if (!form.transaction_date) {
      setError('Transaction date is required');
      return false;
    }

    if (!form.bank_date) {
      setError('Bank date is required');
      return false;
    }

    if (!form.transaction_type) {
      setError('Transaction type is required');
      return false;
    }

    if (form.amount <= 0) {
      setError('Amount must be greater than 0');
      return false;
    }

    return true;
  };

  // Handle save - convert to the format expected by the backend
  const handleSave = async () => {
    setError(null);

    if (!validateForm()) {
      return;
    }

    setSaving(true);
    try {
      // Convert TransactionForm to the format the backend expects
      const transactionData: any = {
        account_id: form.account_id,
        transaction_date: form.transaction_date.toISOString().split('T')[0],
        bank_date: form.bank_date?.toISOString().split('T')[0],
        transaction_type: form.transaction_type,
        reference: form.reference,
        optional_notes: form.optional_notes,
      };

      // Only include debit or credit, not both (avoid undefined values)
      if (form.is_debit) {
        transactionData.debit = form.amount;
      } else {
        transactionData.credit = form.amount;
      }

      // Only include optional fields if they have values
      if (estimatedAmount) {
        transactionData.estimated_amount = estimatedAmount;
      }

      if (varianceNotes) {
        transactionData.variance_notes = varianceNotes;
      }
      
      await onSave(transactionData);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save transaction');
    } finally {
      setSaving(false);
    }
  };

  // Show estimated amount field for interest transactions
  const showEstimatedAmount = form.transaction_type === 'interest';

  // Format currency for display
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Format date for input field
  const formatDateForInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth data-testid="transaction-dialog">
      <DialogTitle>
        {transaction ? 'Edit Transaction' : 'Add Transaction'}
      </DialogTitle>
      
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 2 }}>
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <Stack direction="row" spacing={2}>
            <TextField
              label="Transaction Date"
              type="date"
              value={formatDateForInput(form.transaction_date)}
              onChange={(e) => handleChange('transaction_date', new Date(e.target.value))}
              fullWidth
              required
              InputLabelProps={{ shrink: true }}
              data-testid="transaction-date-input"
            />

            <TextField
              label="Bank Date"
              type="date"
              value={form.bank_date ? formatDateForInput(form.bank_date) : ''}
              onChange={(e) => handleChange('bank_date', e.target.value ? new Date(e.target.value) : undefined)}
              fullWidth
              required
              InputLabelProps={{ shrink: true }}
              helperText="Date shown on bank statement"
              data-testid="bank-date-input"
            />
          </Stack>

          <FormControl fullWidth required>
            <InputLabel>Transaction Type</InputLabel>
            <Select
              value={form.transaction_type}
              onChange={(e) => handleChange('transaction_type', e.target.value)}
              label="Transaction Type"
              data-testid="transaction-type-select"
            >
              {transactionTypes.map((type) => (
                <MenuItem key={type.value} value={type.value}>
                  {type.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label={form.is_debit ? "Amount (Out)" : "Amount (In)"}
            type="number"
            value={form.amount}
            onChange={(e) => handleChange('amount', parseFloat(e.target.value) || 0)}
            fullWidth
            required
            InputProps={{
              startAdornment: <InputAdornment position="start">£</InputAdornment>,
            }}
            inputProps={{ min: 0, step: 0.01 }}
            data-testid={form.is_debit ? "debit-input" : "credit-input"}
          />

          {showEstimatedAmount && (
            <Stack spacing={2}>
              <TextField
                label="Estimated Interest Amount"
                type="number"
                value={estimatedAmount || ''}
                onChange={(e) => setEstimatedAmount(e.target.value ? parseFloat(e.target.value) : undefined)}
                fullWidth
                InputProps={{
                  startAdornment: <InputAdornment position="start">£</InputAdornment>,
                }}
                inputProps={{ min: 0, step: 0.01 }}
                helperText="System-calculated expected interest"
              />
              
              {estimatedAmount && !form.is_debit && form.amount && estimatedAmount !== form.amount && (
                <>
                  <Alert severity="info">
                    Variance: {formatCurrency(form.amount - estimatedAmount)} 
                    ({((form.amount - estimatedAmount) / estimatedAmount * 100).toFixed(1)}%)
                  </Alert>
                  
                  <TextField
                    label="Variance Notes"
                    value={varianceNotes}
                    onChange={(e) => setVarianceNotes(e.target.value)}
                    fullWidth
                    multiline
                    rows={2}
                    placeholder="Explain the variance (e.g., rate change, calculation difference)"
                  />
                </>
              )}
            </Stack>
          )}

          <TextField
            label="Reference"
            value={form.reference}
            onChange={(e) => handleChange('reference', e.target.value)}
            fullWidth
            placeholder="Bank's transaction reference"
            data-testid="reference-input"
          />

          <TextField
            label="Notes"
            value={form.optional_notes}
            onChange={(e) => handleChange('optional_notes', e.target.value)}
            fullWidth
            multiline
            rows={3}
            placeholder="Additional context or notes"
            data-testid="notes-input"
          />

          <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="textSecondary">
                Current Balance:
              </Typography>
              <Typography variant="body2">
                {formatCurrency(currentBalance)}
              </Typography>
            </Stack>
            
            {form.amount > 0 && (
              <>
                <Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }}>
                  <Typography variant="body2" color="textSecondary">
                    Transaction:
                  </Typography>
                  <Typography variant="body2" color={form.is_debit ? 'error.main' : 'success.main'}>
                    {form.is_debit ? '-' : '+'}{formatCurrency(form.amount)}
                  </Typography>
                </Stack>
                
                <Stack direction="row" justifyContent="space-between" sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                  <Typography variant="body1" fontWeight="bold">
                    Balance After:
                  </Typography>
                  <Typography variant="body1" fontWeight="bold">
                    {formatCurrency(balancePreview)}
                  </Typography>
                </Stack>
              </>
            )}
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={saving} data-testid="cancel-transaction">
          Cancel
        </Button>
        <Button onClick={handleSave} variant="contained" disabled={saving} data-testid="save-transaction">
          {saving ? 'Saving...' : 'Save Transaction'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};