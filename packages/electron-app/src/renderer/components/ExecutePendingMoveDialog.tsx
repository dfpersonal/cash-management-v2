import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Alert,
  Divider,
  Paper,
  Stack,
  Chip,
  CircularProgress,
} from '@mui/material';
import {
  PlayArrow as ExecuteIcon,
  AccountBalance as AccountIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  TrendingDown as TrendingDownIcon,
  TrendingUp as TrendingUpIcon,
} from '@mui/icons-material';

interface PendingMove {
  id: number;
  bank: string;
  balance: number;
  source_account_id: number | null;
  destination_account_id: number | null;
  status: string;
  platform?: string;
  type?: string;
  sub_type?: string;
  aer?: number;
  destination_bank?: string;
  destination_type?: string;
  destination_sub_type?: string;
  destination_balance?: number;
  destination_aer?: number;
  destination_account_name?: string;
}

interface SourceAccount {
  id: number;
  bank: string;
  account_name?: string;
  balance: number;
  type: string;
  sub_type: string;
  aer?: number;
  term_months?: number;
  notice_period_days?: number;
  sort_code?: string;
  account_number?: string;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  warning?: string;
}

interface ExecutePendingMoveDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  pendingMove: PendingMove | null;
}

// Generate meaningful account name when account_name is null
const generateAccountName = (account: SourceAccount): string => {
  if (account.account_name) {
    return account.account_name;
  }
  
  // Current accounts
  if (account.type === 'Current' || account.sub_type === 'n/a') {
    return 'Current Account';
  }
  
  // Savings accounts with terms
  if (account.sub_type === 'Term' && account.term_months) {
    if (account.term_months === 12) return 'Term Deposit (12m)';
    if (account.term_months === 24) return 'Term Deposit (24m)';
    if (account.term_months === 36) return 'Term Deposit (36m)';
    return `Term Deposit (${account.term_months}m)`;
  }
  
  // Notice accounts
  if (account.sub_type === 'Notice' && account.notice_period_days) {
    if (account.notice_period_days === 30) return 'Notice Account (30d)';
    if (account.notice_period_days === 60) return 'Notice Account (60d)';
    if (account.notice_period_days === 90) return 'Notice Account (90d)';
    return `Notice Account (${account.notice_period_days}d)`;
  }
  
  // Easy Access
  if (account.sub_type === 'Easy Access') {
    return 'Easy Access Saver';
  }
  
  // Fallback to sub_type or generic
  return account.sub_type || 'Savings Account';
};

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const validatePendingMoveExecution = (
  pendingMove: PendingMove,
  sourceAccount: SourceAccount | null
): ValidationResult => {
  // If no source account, this is a new funds addition
  if (!sourceAccount) {
    return { valid: true };
  }

  const afterBalance = sourceAccount.balance - pendingMove.balance;
  
  if (afterBalance < 0) {
    const overdraftAmount = Math.abs(afterBalance);
    
    if (sourceAccount.type === 'Savings') {
      return { 
        valid: false, 
        error: `Cannot overdraw savings account. Transfer amount (${formatCurrency(pendingMove.balance)}) exceeds available balance (${formatCurrency(sourceAccount.balance)}) by ${formatCurrency(overdraftAmount)}.` 
      };
    } else if (sourceAccount.type === 'Current') {
      return { 
        valid: true, 
        warning: `This transfer will create an overdraft of ${formatCurrency(overdraftAmount)}. Ensure you have overdraft facilities available.` 
      };
    }
  }
  
  return { valid: true };
};

export const ExecutePendingMoveDialog: React.FC<ExecutePendingMoveDialogProps> = ({
  open,
  onClose,
  onConfirm,
  pendingMove
}) => {
  const [sourceAccount, setSourceAccount] = useState<SourceAccount | null>(null);
  const [destinationAccount, setDestinationAccount] = useState<SourceAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [validation, setValidation] = useState<ValidationResult>({ valid: true });

  useEffect(() => {
    if (open && pendingMove) {
      if (pendingMove.source_account_id) {
        loadSourceAccount();
      } else {
        setSourceAccount(null);
      }
      
      if (pendingMove.destination_account_id) {
        loadDestinationAccount();
      } else {
        setDestinationAccount(null);
      }
      
      if (!pendingMove.source_account_id) {
        setValidation({ valid: true });
      }
    }
  }, [open, pendingMove]);

  const loadSourceAccount = async () => {
    if (!pendingMove?.source_account_id) return;
    
    try {
      setLoadingAccount(true);
      const accounts = await window.electronAPI.getAllAccounts();
      const account = accounts.find((acc: SourceAccount) => acc.id === pendingMove.source_account_id);
      setSourceAccount(account || null);
      
      if (account && pendingMove) {
        const validationResult = validatePendingMoveExecution(pendingMove, account);
        setValidation(validationResult);
      }
    } catch (error) {
      console.error('Error loading source account:', error);
      setSourceAccount(null);
      setValidation({ valid: false, error: 'Failed to load source account details' });
    } finally {
      setLoadingAccount(false);
    }
  };

  const loadDestinationAccount = async () => {
    if (!pendingMove?.destination_account_id) return;
    
    try {
      setLoadingAccount(true);
      
      // Check if destination account data is already included in pendingMove from the enhanced query
      if (pendingMove.destination_bank && pendingMove.destination_aer !== undefined) {
        // Use the data from the enhanced query
        const destinationAccountData = {
          id: pendingMove.destination_account_id,
          bank: pendingMove.destination_bank!,
          type: pendingMove.destination_type!,
          sub_type: pendingMove.destination_sub_type!,
          balance: pendingMove.destination_balance!,
          aer: pendingMove.destination_aer,
          account_name: pendingMove.destination_account_name
        };
        setDestinationAccount(destinationAccountData);
      } else {
        // Fallback to loading from getAllAccounts if data not available
        const accounts = await window.electronAPI.getAllAccounts();
        const account = accounts.find((acc: SourceAccount) => acc.id === pendingMove.destination_account_id);
        setDestinationAccount(account || null);
      }
    } catch (error) {
      console.error('Error loading destination account:', error);
      setDestinationAccount(null);
    } finally {
      setLoadingAccount(false);
    }
  };

  const handleConfirm = async () => {
    if (!validation.valid) return;
    
    try {
      setLoading(true);
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  if (!pendingMove) return null;

  const afterBalance = sourceAccount ? sourceAccount.balance - pendingMove.balance : 0;
  const hasSourceAccount = !!sourceAccount;

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="sm" 
      fullWidth
      PaperProps={{
        sx: { borderRadius: 2 }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ExecuteIcon color="primary" />
          <Typography variant="h6">Execute Pending Move</Typography>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pb: 2 }}>
        <Stack spacing={3}>
          
          {/* Transfer Details */}
          <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
            <Typography variant="subtitle1" fontWeight="medium" gutterBottom>
              Transfer Details
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Amount:
              </Typography>
              <Typography variant="h6" fontWeight="medium" color="primary">
                {formatCurrency(pendingMove.balance)}
              </Typography>
            </Box>
            
            <Box sx={{ mb: 1 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Destination:
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AccountIcon fontSize="small" color="primary" />
                <Box>
                  <Typography variant="body1" fontWeight="medium">
                    {destinationAccount ? (
                      `${destinationAccount.bank} - ${generateAccountName(destinationAccount)} (Add to Existing)`
                    ) : (
                      `${pendingMove.bank} - New ${pendingMove.sub_type || 'Account'}`
                    )}
                  </Typography>
                  {pendingMove.platform && (
                    <Typography variant="body2" color="text.secondary">
                      via {pendingMove.platform}
                    </Typography>
                  )}
                  {destinationAccount && (
                    <Typography variant="body2" color="text.secondary">
                      Current Balance: {formatCurrency(destinationAccount.balance)} → {formatCurrency(destinationAccount.balance + pendingMove.balance)}
                    </Typography>
                  )}
                </Box>
              </Box>
            </Box>

            {(destinationAccount?.aer !== undefined || pendingMove.aer !== undefined) && (
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Rate: {(destinationAccount?.aer !== undefined ? destinationAccount.aer : pendingMove.aer || 0).toFixed(2)}% AER
                </Typography>
              </Box>
            )}
          </Paper>

          {/* Source Account Impact */}
          {loadingAccount ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
              <CircularProgress size={20} />
              <Typography variant="body2">Loading account details...</Typography>
            </Box>
          ) : hasSourceAccount ? (
            <Paper sx={{ p: 2, bgcolor: validation.valid ? 'success.50' : 'error.50' }}>
              <Typography variant="subtitle1" fontWeight="medium" gutterBottom>
                Source Account Impact
              </Typography>
              
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <AccountIcon fontSize="small" />
                <Box>
                  <Typography variant="body1" fontWeight="medium">
                    {sourceAccount!.bank} - {generateAccountName(sourceAccount!)}
                  </Typography>
                  {sourceAccount!.sort_code && sourceAccount!.account_number && (
                    <Typography variant="body2" color="text.secondary">
                      {sourceAccount!.sort_code} - {sourceAccount!.account_number}
                    </Typography>
                  )}
                </Box>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    Current Balance:
                  </Typography>
                  <Typography variant="body1" fontWeight="medium">
                    {formatCurrency(sourceAccount!.balance)}
                  </Typography>
                </Box>
                
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {afterBalance >= 0 ? (
                    <TrendingDownIcon fontSize="small" color="success" />
                  ) : (
                    <TrendingDownIcon fontSize="small" color="error" />
                  )}
                  <Typography variant="body2" color="text.secondary">
                    After Transfer:
                  </Typography>
                  <Typography 
                    variant="body1" 
                    fontWeight="medium"
                    color={afterBalance >= 0 ? 'success.main' : 'error.main'}
                  >
                    {formatCurrency(afterBalance)}
                  </Typography>
                  {afterBalance >= 0 ? (
                    <CheckIcon fontSize="small" color="success" />
                  ) : (
                    <ErrorIcon fontSize="small" color="error" />
                  )}
                </Box>
              </Box>

              <Chip 
                size="small"
                label={`${sourceAccount!.type} Account`}
                color={sourceAccount!.type === 'Current' ? 'info' : 'default'}
              />
            </Paper>
          ) : (
            <Paper sx={{ p: 2, bgcolor: 'info.50' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TrendingUpIcon color="info" />
                <Typography variant="body1">
                  This will add new funds to your portfolio (no source account transfer)
                </Typography>
              </Box>
            </Paper>
          )}

          {/* Validation Messages */}
          {validation.error && (
            <Alert severity="error" icon={<ErrorIcon />}>
              <Typography variant="body2" fontWeight="medium">
                Cannot Execute Transfer
              </Typography>
              <Typography variant="body2">
                {validation.error}
              </Typography>
            </Alert>
          )}

          {validation.warning && (
            <Alert severity="warning" icon={<WarningIcon />}>
              <Typography variant="body2" fontWeight="medium">
                Overdraft Warning
              </Typography>
              <Typography variant="body2">
                {validation.warning}
              </Typography>
            </Alert>
          )}

          {/* Action Summary */}
          <Paper sx={{ p: 2, border: 1, borderColor: 'divider' }}>
            <Typography variant="subtitle1" fontWeight="medium" gutterBottom>
              This action will:
            </Typography>
            <Stack spacing={0.5}>
              <Typography variant="body2">
                {destinationAccount ? (
                  `• Add ${formatCurrency(pendingMove.balance)} to existing ${generateAccountName(destinationAccount)} at ${destinationAccount.bank}`
                ) : (
                  `• Create new ${pendingMove.sub_type || 'account'} at ${pendingMove.bank}`
                )}
              </Typography>
              {hasSourceAccount && (
                <Typography variant="body2">
                  • Reduce {sourceAccount!.bank} balance by {formatCurrency(pendingMove.balance)}
                </Typography>
              )}
              {!hasSourceAccount && (
                <Typography variant="body2">
                  • Add {formatCurrency(pendingMove.balance)} in new funds to portfolio
                </Typography>
              )}
              <Typography variant="body2">
                • Mark pending move as FUNDED
              </Typography>
            </Stack>
          </Paper>

          {/* Warning Footer */}
          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2">
              <strong>Important:</strong> This action cannot be undone. Please verify all details before proceeding.
            </Typography>
          </Alert>

        </Stack>
      </DialogContent>

      <DialogActions sx={{ p: 3, gap: 1 }}>
        <Button 
          onClick={onClose} 
          size="large"
          disabled={loading}
        >
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          size="large"
          disabled={!validation.valid || loading || loadingAccount}
          startIcon={loading ? <CircularProgress size={16} /> : <ExecuteIcon />}
        >
          {loading ? 'Executing...' : 'Execute Move'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};