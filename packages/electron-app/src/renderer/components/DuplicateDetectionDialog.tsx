import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Alert,
  Paper,
  Stack,
  Chip,
  Divider,
} from '@mui/material';
import {
  Warning as WarningIcon,
  AccountBalance as AccountIcon,
  CompareArrows as CompareIcon,
} from '@mui/icons-material';

interface ExistingAccount {
  id: number;
  bank: string;
  type: string;
  sub_type: string;
  balance: number;
  platform: string;
  is_isa: boolean;
  aer?: number;
  term_months?: number;
  notice_period_days?: number;
}

interface NewAccount {
  bank: string;
  type: string;
  sub_type: string;
  balance: number;
  platform: string;
  is_isa: boolean;
  aer?: number;
  term_months?: number;
  notice_period_days?: number;
}

interface DuplicateDetectionDialogProps {
  open: boolean;
  onClose: () => void;
  onAddToExisting: (existingAccountId: number) => void;
  onCreateNew: () => void;
  existingAccount: ExistingAccount;
  newAccount: NewAccount;
}

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatAccountDetails = (account: ExistingAccount | NewAccount): string => {
  let details = `${account.type} - ${account.sub_type}`;
  
  if (account.term_months) {
    details += ` (${account.term_months}m term)`;
  }
  
  if (account.notice_period_days) {
    details += ` (${account.notice_period_days}d notice)`;
  }
  
  if (account.is_isa) {
    details += ' - ISA';
  }
  
  return details;
};

export const DuplicateDetectionDialog: React.FC<DuplicateDetectionDialogProps> = ({
  open,
  onClose,
  onAddToExisting,
  onCreateNew,
  existingAccount,
  newAccount,
}) => {
  const handleAddToExisting = () => {
    onAddToExisting(existingAccount.id);
    onClose();
  };

  const handleCreateNew = () => {
    onCreateNew();
    onClose();
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: { borderRadius: 2 }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon color="warning" />
          <Typography variant="h6">Duplicate Account Detected</Typography>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pb: 2 }}>
        <Stack spacing={3}>
          
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body1" fontWeight="medium">
              You already have a very similar account in your portfolio.
            </Typography>
            <Typography variant="body2">
              Would you like to add funds to the existing account or create a separate new account?
            </Typography>
          </Alert>

          {/* Side-by-side comparison */}
          <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
            
            {/* Existing Account */}
            <Paper sx={{ flex: 1, p: 2, bgcolor: 'success.50', border: 1, borderColor: 'success.200' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <AccountIcon color="success" />
                <Typography variant="subtitle1" fontWeight="medium">
                  Existing Account
                </Typography>
              </Box>
              
              <Stack spacing={1}>
                <Typography variant="h6" color="success.main">
                  {existingAccount.bank}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatAccountDetails(existingAccount)}
                </Typography>
                <Typography variant="body1">
                  <strong>Current Balance:</strong> {formatCurrency(existingAccount.balance)}
                </Typography>
                {existingAccount.aer && (
                  <Typography variant="body2">
                    <strong>Rate:</strong> {existingAccount.aer}% AER
                  </Typography>
                )}
                <Chip 
                  label={`via ${existingAccount.platform}`}
                  size="small"
                  color="success"
                  variant="outlined"
                />
              </Stack>
            </Paper>

            {/* Comparison Arrow */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 2 }}>
              <CompareIcon color="action" sx={{ fontSize: 32 }} />
            </Box>

            {/* New Account */}
            <Paper sx={{ flex: 1, p: 2, bgcolor: 'info.50', border: 1, borderColor: 'info.200' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <AccountIcon color="info" />
                <Typography variant="subtitle1" fontWeight="medium">
                  New Account (Pending)
                </Typography>
              </Box>
              
              <Stack spacing={1}>
                <Typography variant="h6" color="info.main">
                  {newAccount.bank}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatAccountDetails(newAccount)}
                </Typography>
                <Typography variant="body1">
                  <strong>Amount:</strong> {formatCurrency(newAccount.balance)}
                </Typography>
                {newAccount.aer && (
                  <Typography variant="body2">
                    <strong>Rate:</strong> {newAccount.aer}% AER
                  </Typography>
                )}
                <Chip 
                  label={`via ${newAccount.platform}`}
                  size="small"
                  color="info"
                  variant="outlined"
                />
              </Stack>
            </Paper>
          </Box>

          <Divider />

          {/* Action Preview */}
          <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
            <Typography variant="subtitle1" fontWeight="medium" gutterBottom>
              If you choose to add to existing account:
            </Typography>
            <Typography variant="body2" color="text.secondary">
              • New balance: {formatCurrency(existingAccount.balance + newAccount.balance)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              • Rate: {newAccount.aer ? `${newAccount.aer}% AER` : 'Updated from pending move'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              • No new account created
            </Typography>
          </Paper>

        </Stack>
      </DialogContent>

      <DialogActions sx={{ p: 3, gap: 1 }}>
        <Button 
          onClick={onClose} 
          size="large"
        >
          Cancel
        </Button>
        <Button
          onClick={handleCreateNew}
          variant="outlined"
          size="large"
          color="info"
        >
          Create Separate Account
        </Button>
        <Button
          onClick={handleAddToExisting}
          variant="contained"
          size="large"
          color="success"
        >
          Add to Existing Account
        </Button>
      </DialogActions>
    </Dialog>
  );
};