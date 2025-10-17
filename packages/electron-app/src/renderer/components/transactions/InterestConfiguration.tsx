import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  Stack,
  Alert,
  Divider,
  FormHelperText,
  CircularProgress,
} from '@mui/material';
import {
  InterestConfiguration as IInterestConfiguration,
  InterestPaymentType,
  InterestPaymentDestination,
} from '@cash-mgmt/shared';
import { Deposit } from '@cash-mgmt/shared';

interface InterestConfigurationProps {
  account: Deposit & Partial<IInterestConfiguration>;
  onSave: (config: IInterestConfiguration) => Promise<void>;
  allAccounts?: Deposit[];
}

const paymentTypes: { value: InterestPaymentType; label: string; description: string }[] = [
  { value: 'Monthly', label: 'Monthly', description: 'Interest paid on the same day each month' },
  { value: 'Quarterly', label: 'Quarterly', description: 'Interest paid every 3 months' },
  { value: 'Annually', label: 'Annually', description: 'Interest paid once per year' },
  { value: 'Fixed_Date', label: 'Fixed Date Each Year', description: 'Interest paid on specific day/month each year (e.g., 5th April)' },
  { value: 'At_Maturity', label: 'At End of Term/Notice', description: 'Single interest payment at the end of the term or notice period' },
];

const paymentDestinations: { value: InterestPaymentDestination; label: string; description: string }[] = [
  { value: 'Same_Account', label: 'Same Account', description: 'Interest credited directly to this savings account' },
  { value: 'Other_Account_Same_Bank', label: 'Another account at same bank', description: 'Interest transferred to another account at the same institution' },
  { value: 'Designated_Account', label: 'Designated current account', description: 'Interest transferred to a designated current account' },
];

const monthOptions = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

export const InterestConfiguration: React.FC<InterestConfigurationProps> = ({
  account,
  onSave,
  allAccounts = [],
}) => {
  const [config, setConfig] = useState<IInterestConfiguration>({
    interest_payment_type: account.interest_payment_type || undefined,
    interest_next_payment_date: account.interest_next_payment_date || undefined,
    interest_fixed_payment_day: account.interest_fixed_payment_day || undefined,
    interest_fixed_payment_month: account.interest_fixed_payment_month || undefined,
    interest_payment_destination: account.interest_payment_destination || 'Same_Account',
    interest_payment_account_id: account.interest_payment_account_id || undefined,
    designated_account_id: account.designated_account_id || undefined,
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [estimatedInterest, setEstimatedInterest] = useState<number | null>(null);
  const [nextPaymentDate, setNextPaymentDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Get accounts for dropdowns
  const getSameBankAccounts = () => {
    return allAccounts.filter(
      (acc) => acc.bank === account.bank && acc.id !== account.id && acc.is_active
    );
  };

  const getCurrentAccounts = () => {
    return allAccounts.filter((acc) => acc.type === 'Current' && acc.is_active);
  };

  // Calculate estimated interest and next payment date
  useEffect(() => {
    const calculateEstimates = async () => {
      if (!config.interest_payment_type) return;

      setLoading(true);
      try {
        // Calculate estimated interest
        const estimated = await window.electronAPI.calculateEstimatedInterest({
          ...account,
          ...config,
        });
        setEstimatedInterest(estimated);

        // Calculate next payment date
        const nextDate = await window.electronAPI.calculateNextPaymentDate({
          ...account,
          ...config,
        });
        setNextPaymentDate(nextDate);
      } catch (err) {
        console.error('Failed to calculate estimates:', err);
      } finally {
        setLoading(false);
      }
    };

    calculateEstimates();
  }, [config.interest_payment_type, config.interest_next_payment_date, config.interest_fixed_payment_day, config.interest_fixed_payment_month]);

  // Handle configuration changes
  const handleChange = (field: keyof IInterestConfiguration, value: any) => {
    setConfig((prev) => ({
      ...prev,
      [field]: value || undefined,
    }));
    setSuccess(false);
  };

  // Validate configuration
  const validateConfig = (): boolean => {
    if (!config.interest_payment_type) {
      setError('Please select an interest payment type');
      return false;
    }

    if (config.interest_payment_type === 'Fixed_Date') {
      if (!config.interest_fixed_payment_day || !config.interest_fixed_payment_month) {
        setError('Please specify the fixed payment day and month');
        return false;
      }
    }

    if (config.interest_payment_type === 'Monthly' || config.interest_payment_type === 'Quarterly' || config.interest_payment_type === 'Annually') {
      if (!config.interest_next_payment_date) {
        setError('Please specify the next payment date');
        return false;
      }
    }

    if (config.interest_payment_destination === 'Other_Account_Same_Bank') {
      if (!config.interest_payment_account_id) {
        setError('Please select the destination account at the same bank');
        return false;
      }
    }

    if (config.interest_payment_destination === 'Designated_Account') {
      if (!config.designated_account_id) {
        setError('Please select the designated current account');
        return false;
      }
    }

    return true;
  };

  // Handle save
  const handleSave = async () => {
    setError(null);

    if (!validateConfig()) {
      return;
    }

    setSaving(true);
    try {
      await onSave(config);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save interest configuration');
    } finally {
      setSaving(false);
    }
  };

  // Format account option for display
  const formatAccountOption = (acc: Deposit) => {
    return `${acc.bank} - ${acc.account_name || acc.type} (${acc.aer}% AER)`;
  };

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Interest Payment Configuration
      </Typography>
      
      <Typography variant="body2" color="textSecondary" gutterBottom>
        Configure how and when interest is paid for this account
      </Typography>

      <Divider sx={{ my: 2 }} />

      <Stack spacing={3}>
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success">
            Interest configuration saved successfully
          </Alert>
        )}

        <FormControl fullWidth>
          <InputLabel>Payment Type</InputLabel>
          <Select
            value={config.interest_payment_type || ''}
            onChange={(e) => handleChange('interest_payment_type', e.target.value)}
            label="Payment Type"
          >
            {paymentTypes.map((type) => (
              <MenuItem key={type.value} value={type.value}>
                {type.label}
              </MenuItem>
            ))}
          </Select>
          <FormHelperText>
            {config.interest_payment_type && 
              paymentTypes.find(t => t.value === config.interest_payment_type)?.description}
          </FormHelperText>
        </FormControl>

        {/* Monthly/Quarterly/Annually - Show next payment date picker */}
        {(config.interest_payment_type === 'Monthly' || config.interest_payment_type === 'Quarterly' || config.interest_payment_type === 'Annually') && (
          <TextField
            label="Next Payment Date"
            type="date"
            value={config.interest_next_payment_date || ''}
            onChange={(e) => handleChange('interest_next_payment_date', e.target.value || undefined)}
            fullWidth
            InputLabelProps={{ shrink: true }}
            helperText="When is the next interest payment expected?"
          />
        )}

        {/* Fixed Date - Show day and month selectors */}
        {config.interest_payment_type === 'Fixed_Date' && (
          <Stack direction="row" spacing={2}>
            <TextField
              label="Day"
              type="number"
              value={config.interest_fixed_payment_day || ''}
              onChange={(e) => handleChange('interest_fixed_payment_day', e.target.value ? parseInt(e.target.value) : undefined)}
              inputProps={{ min: 1, max: 31 }}
              sx={{ width: 100 }}
              helperText="1-31"
            />
            
            <FormControl sx={{ flexGrow: 1 }}>
              <InputLabel>Month</InputLabel>
              <Select
                value={config.interest_fixed_payment_month || ''}
                onChange={(e) => handleChange('interest_fixed_payment_month', e.target.value)}
                label="Month"
              >
                {monthOptions.map((month) => (
                  <MenuItem key={month.value} value={month.value}>
                    {month.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        )}

        {/* At End of Term/Notice - Show maturity/notice end date info */}
        {config.interest_payment_type === 'At_Maturity' && account.term_ends && (
          <Alert severity="info">
            Interest will be paid when the term/notice period ends on {new Date(account.term_ends).toLocaleDateString('en-GB')}
          </Alert>
        )}

        <Divider />

        <FormControl fullWidth>
          <InputLabel>Payment Destination</InputLabel>
          <Select
            value={config.interest_payment_destination}
            onChange={(e) => handleChange('interest_payment_destination', e.target.value)}
            label="Payment Destination"
          >
            {paymentDestinations.map((dest) => (
              <MenuItem key={dest.value} value={dest.value}>
                {dest.label}
              </MenuItem>
            ))}
          </Select>
          <FormHelperText>
            {paymentDestinations.find(d => d.value === config.interest_payment_destination)?.description}
          </FormHelperText>
        </FormControl>

        {/* Other Account Same Bank - Show account selector */}
        {config.interest_payment_destination === 'Other_Account_Same_Bank' && (
          <FormControl fullWidth>
            <InputLabel>Destination Account</InputLabel>
            <Select
              value={config.interest_payment_account_id || ''}
              onChange={(e) => handleChange('interest_payment_account_id', e.target.value)}
              label="Destination Account"
            >
              {getSameBankAccounts().map((acc) => (
                <MenuItem key={acc.id} value={acc.id}>
                  {formatAccountOption(acc)}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>
              Select another account at {account.bank}
            </FormHelperText>
          </FormControl>
        )}

        {/* Designated Account - Show current account selector */}
        {config.interest_payment_destination === 'Designated_Account' && (
          <FormControl fullWidth>
            <InputLabel>Designated Current Account</InputLabel>
            <Select
              value={config.designated_account_id || ''}
              onChange={(e) => handleChange('designated_account_id', e.target.value)}
              label="Designated Current Account"
            >
              {getCurrentAccounts().map((acc) => (
                <MenuItem key={acc.id} value={acc.id}>
                  {formatAccountOption(acc)}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>
              Select a current account to receive interest payments
            </FormHelperText>
          </FormControl>
        )}

        {/* Show estimates */}
        {config.interest_payment_type && !loading && (
          <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
            <Stack spacing={1}>
              {estimatedInterest !== null && (
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="textSecondary">
                    Estimated Next Interest:
                  </Typography>
                  <Typography variant="body2">
                    {formatCurrency(estimatedInterest)}
                  </Typography>
                </Stack>
              )}
              
              {nextPaymentDate && (
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="textSecondary">
                    Next Payment Date:
                  </Typography>
                  <Typography variant="body2">
                    {new Date(nextPaymentDate).toLocaleDateString('en-GB')}
                  </Typography>
                </Stack>
              )}
              
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="textSecondary">
                  Current Balance:
                </Typography>
                <Typography variant="body2">
                  {formatCurrency(account.balance || 0)}
                </Typography>
              </Stack>
              
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="textSecondary">
                  Interest Rate:
                </Typography>
                <Typography variant="body2">
                  {account.aer}% AER
                </Typography>
              </Stack>
            </Stack>
          </Paper>
        )}

        {loading && (
          <Box display="flex" justifyContent="center">
            <CircularProgress size={30} />
          </Box>
        )}

        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || !config.interest_payment_type}
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </Stack>
    </Paper>
  );
};