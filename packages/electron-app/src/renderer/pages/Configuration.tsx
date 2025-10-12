import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Grid,
  Alert,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  Switch,
  Select,
  MenuItem,
  Chip,
  Stack,
} from '@mui/material';
import {
  History as HistoryIcon,
  Update as UpdateIcon,
} from '@mui/icons-material';
import { Configuration as ConfigurationType, AppState } from '@cash-mgmt/shared';
import { ScraperConfigSettings } from '../components/configuration/ScraperConfigSettings';
import { FRNNormalizationSettings } from '../components/configuration/FRNNormalizationSettings';

interface ConfigurationProps {
  appState: AppState;
}

export const Configuration: React.FC<ConfigurationProps> = ({ appState }) => {
  const [config, setConfig] = useState<ConfigurationType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const loadConfiguration = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await window.electronAPI.getConfiguration();
        setConfig(data);
      } catch (err) {
        console.error('Failed to load configuration:', err);
        setError('Failed to load configuration data.');
      } finally {
        setLoading(false);
      }
    };

    loadConfiguration();
  }, [appState.lastRefresh]);

  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await window.electronAPI.updateConfiguration(config);
      setSuccess('Configuration saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to save configuration:', err);
      setError('Failed to save configuration. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleAllocationChange = (tier: keyof ConfigurationType['allocationTargets'], value: string) => {
    if (!config) return;
    
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0 || numValue > 100) return;

    setConfig({
      ...config,
      allocationTargets: {
        ...config.allocationTargets,
        [tier]: numValue,
      },
    });
  };

  const handleRiskToleranceChange = (key: keyof ConfigurationType['riskTolerances'], value: string) => {
    if (!config) return;
    
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) return;

    setConfig({
      ...config,
      riskTolerances: {
        ...config.riskTolerances,
        [key]: numValue,
      },
    });
  };

  const handleReportSettingChange = (key: keyof ConfigurationType['reportSettings'], value: any) => {
    if (!config) return;

    setConfig({
      ...config,
      reportSettings: {
        ...config.reportSettings,
        [key]: value,
      },
    });
  };

  const handleAuditSettingChange = (key: string, value: any) => {
    if (!config) return;

    setConfig({
      ...config,
      [key]: value,
    });
  };

  const getLevelDescription = (level: string) => {
    switch (level) {
      case 'disabled':
        return 'No audit logging performed (not recommended)';
      case 'key_fields':
        return 'Log only critical fields like balance, rates, and status changes (recommended)';
      case 'full':
        return 'Log all field changes for maximum audit trail (higher storage usage)';
      default:
        return '';
    }
  };

  const validateTotalAllocation = () => {
    if (!config) return false;
    
    const total = Object.values(config.allocationTargets).reduce((sum, val) => sum + val, 0);
    return Math.abs(total - 100) < 0.01; // Allow for floating point precision
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="400px">
        <CircularProgress size={60} />
      </Box>
    );
  }

  if (error && !config) {
    return (
      <Alert severity="error" sx={{ mb: 3 }}>
        {error}
      </Alert>
    );
  }

  if (!config) {
    return (
      <Alert severity="warning" sx={{ mb: 3 }}>
        No configuration data available.
      </Alert>
    );
  }

  const allocationTotal = Object.values(config.allocationTargets).reduce((sum, val) => sum + val, 0);
  const allocationValid = validateTotalAllocation();

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Configuration
      </Typography>
      
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      
      {success && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Strategic Allocation Targets */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Strategic Allocation Targets
              </Typography>
              
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="textSecondary">
                  Define target percentages for each liquidity tier. Total must equal 100%.
                </Typography>
                <Typography 
                  variant="body2" 
                  color={allocationValid ? 'success.main' : 'error.main'}
                  sx={{ mt: 1 }}
                >
                  Current Total: {allocationTotal.toFixed(1)}%
                </Typography>
              </Box>

              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Emergency Liquidity (%)"
                    type="number"
                    value={config.allocationTargets.emergency}
                    onChange={(e) => handleAllocationChange('emergency', e.target.value)}
                    inputProps={{ min: 0, max: 100, step: 0.1 }}
                    helperText="Immediate access funds for emergencies"
                  />
                </Grid>
                
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Short-term Liquidity (%)"
                    type="number"
                    value={config.allocationTargets.shortTerm}
                    onChange={(e) => handleAllocationChange('shortTerm', e.target.value)}
                    inputProps={{ min: 0, max: 100, step: 0.1 }}
                    helperText="Access within 30 days"
                  />
                </Grid>
                
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Medium-term Optimization (%)"
                    type="number"
                    value={config.allocationTargets.mediumTerm}
                    onChange={(e) => handleAllocationChange('mediumTerm', e.target.value)}
                    inputProps={{ min: 0, max: 100, step: 0.1 }}
                    helperText="Notice accounts and short-term fixed"
                  />
                </Grid>
                
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Long-term Growth (%)"
                    type="number"
                    value={config.allocationTargets.longTerm}
                    onChange={(e) => handleAllocationChange('longTerm', e.target.value)}
                    inputProps={{ min: 0, max: 100, step: 0.1 }}
                    helperText="Fixed-term deposits 12+ months"
                  />
                </Grid>
                
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Strategic Reserve (%)"
                    type="number"
                    value={config.allocationTargets.strategic}
                    onChange={(e) => handleAllocationChange('strategic', e.target.value)}
                    inputProps={{ min: 0, max: 100, step: 0.1 }}
                    helperText="Long-term strategic positions"
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Risk Tolerance Settings */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Risk Tolerance Settings
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="FSCS Limit (£)"
                    type="number"
                    value={config.riskTolerances.fscsLimit}
                    onChange={(e) => handleRiskToleranceChange('fscsLimit', e.target.value)}
                    inputProps={{ min: 0, step: 1000 }}
                    helperText="Maximum exposure per institution"
                  />
                </Grid>
                
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Concentration Threshold (%)"
                    type="number"
                    value={config.riskTolerances.concentrationThreshold}
                    onChange={(e) => handleRiskToleranceChange('concentrationThreshold', e.target.value)}
                    inputProps={{ min: 0, max: 100, step: 0.1 }}
                    helperText="Maximum percentage in single institution"
                  />
                </Grid>
                
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Minimum Liquidity (%)"
                    type="number"
                    value={config.riskTolerances.minimumLiquidity}
                    onChange={(e) => handleRiskToleranceChange('minimumLiquidity', e.target.value)}
                    inputProps={{ min: 0, max: 100, step: 0.1 }}
                    helperText="Minimum immediately accessible funds"
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Report Settings */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Report Settings
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Maturity Horizon (days)"
                    type="number"
                    value={config.reportSettings.maturityHorizon}
                    onChange={(e) => handleReportSettingChange('maturityHorizon', parseInt(e.target.value))}
                    inputProps={{ min: 1, max: 365 }}
                    helperText="Default planning horizon for maturity calendar"
                  />
                </Grid>
                
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Optimization Threshold (£)"
                    type="number"
                    value={config.reportSettings.optimizationThreshold}
                    onChange={(e) => handleReportSettingChange('optimizationThreshold', parseFloat(e.target.value))}
                    inputProps={{ min: 0, step: 10 }}
                    helperText="Minimum annual benefit to show recommendations"
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Audit System Configuration */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <HistoryIcon />
                Audit System Configuration
              </Typography>
              
              <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
                Configure audit logging for tracking changes to your portfolio data.
              </Typography>

              <Grid container spacing={3}>
                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={config.audit_enabled ?? true}
                        onChange={(e) => handleAuditSettingChange('audit_enabled', e.target.checked)}
                      />
                    }
                    label="Enable Audit Logging"
                  />
                  <Typography variant="caption" color="text.secondary" display="block">
                    Master switch for all audit logging functionality
                  </Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <FormLabel>Audit Level</FormLabel>
                    <Select
                      value={config.audit_level ?? 'key_fields'}
                      onChange={(e) => handleAuditSettingChange('audit_level', e.target.value)}
                      disabled={!(config.audit_enabled ?? true)}
                    >
                      <MenuItem value="disabled">Disabled</MenuItem>
                      <MenuItem value="key_fields">Key Fields Only (Recommended)</MenuItem>
                      <MenuItem value="full">Full Logging</MenuItem>
                    </Select>
                    <Typography variant="caption" color="text.secondary">
                      {getLevelDescription(config.audit_level ?? 'key_fields')}
                    </Typography>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={config.audit_include_events ?? true}
                        onChange={(e) => handleAuditSettingChange('audit_include_events', e.target.checked)}
                        disabled={!(config.audit_enabled ?? true)}
                      />
                    }
                    label="Include Calendar & Event Operations"
                  />
                  <Typography variant="caption" color="text.secondary" display="block">
                    Log changes to rate changes, notice events, reminders, and report actions
                  </Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={config.audit_auto_cleanup ?? true}
                        onChange={(e) => handleAuditSettingChange('audit_auto_cleanup', e.target.checked)}
                        disabled={!(config.audit_enabled ?? true)}
                      />
                    }
                    label="Automatic Cleanup"
                  />
                  <Typography variant="caption" color="text.secondary" display="block">
                    Automatically remove old audit entries based on retention settings
                  </Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Retention Days"
                    value={config.audit_retention_days ?? 90}
                    onChange={(e) => handleAuditSettingChange('audit_retention_days', parseInt(e.target.value) || 90)}
                    disabled={!(config.audit_enabled ?? true) || !(config.audit_auto_cleanup ?? true)}
                    helperText="How long to keep audit entries before auto-cleanup"
                    inputProps={{ min: 7, max: 3650 }}
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Maximum Entries"
                    value={config.audit_max_entries ?? 5000}
                    onChange={(e) => handleAuditSettingChange('audit_max_entries', parseInt(e.target.value) || 5000)}
                    disabled={!(config.audit_enabled ?? true) || !(config.audit_auto_cleanup ?? true)}
                    helperText="Maximum audit entries before triggering cleanup"
                    inputProps={{ min: 1000, max: 100000 }}
                  />
                </Grid>

                {/* Key Fields Information */}
                <Grid item xs={12}>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                    Key Fields Tracked (Key Fields Mode)
                  </Typography>
                  
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6} md={3}>
                      <Typography variant="body2" fontWeight="bold" gutterBottom>
                        Deposits
                      </Typography>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        {['balance', 'aer', 'bank', 'is_active', 'term_ends'].map(field => (
                          <Chip key={field} label={field} size="small" variant="outlined" />
                        ))}
                      </Stack>
                    </Grid>

                    <Grid item xs={12} sm={6} md={3}>
                      <Typography variant="body2" fontWeight="bold" gutterBottom>
                        Pending Deposits
                      </Typography>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        {['balance', 'status', 'bank', 'expected_funding_date'].map(field => (
                          <Chip key={field} label={field} size="small" variant="outlined" />
                        ))}
                      </Stack>
                    </Grid>

                    <Grid item xs={12} sm={6} md={3}>
                      <Typography variant="body2" fontWeight="bold" gutterBottom>
                        Rate Changes
                      </Typography>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        {['current_rate', 'new_rate', 'effective_date', 'status'].map(field => (
                          <Chip key={field} label={field} size="small" variant="outlined" />
                        ))}
                      </Stack>
                    </Grid>

                    <Grid item xs={12} sm={6} md={3}>
                      <Typography variant="body2" fontWeight="bold" gutterBottom>
                        Events & Reminders
                      </Typography>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        {['status', 'reminder_date', 'funds_available_date'].map(field => (
                          <Chip key={field} label={field} size="small" variant="outlined" />
                        ))}
                      </Stack>
                    </Grid>
                  </Grid>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Data Collection Settings */}
        <Grid item xs={12}>
          <ScraperConfigSettings />
        </Grid>

        {/* Balance Checking Configuration */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <UpdateIcon />
                Balance Checking Configuration
              </Typography>
              
              <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
                Configure automatic balance checking schedules and reminder settings.
              </Typography>

              <Grid container spacing={3}>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <FormLabel>Default Update Frequency</FormLabel>
                    <Select
                      value={config.balance_check_frequency ?? 'monthly'}
                      onChange={(e) => handleAuditSettingChange('balance_check_frequency', e.target.value)}
                    >
                      <MenuItem value="weekly">Weekly</MenuItem>
                      <MenuItem value="bi-weekly">Bi-weekly</MenuItem>
                      <MenuItem value="monthly">Monthly (Recommended)</MenuItem>
                      <MenuItem value="quarterly">Quarterly</MenuItem>
                    </Select>
                    <Typography variant="caption" color="text.secondary">
                      How often to schedule balance checks for new deposits
                    </Typography>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Reminder Days Before Due"
                    value={config.balance_check_reminder_days ?? 3}
                    onChange={(e) => handleAuditSettingChange('balance_check_reminder_days', parseInt(e.target.value) || 3)}
                    helperText="Days before due date to generate calendar reminders"
                    inputProps={{ min: 0, max: 14 }}
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={config.balance_check_reset_on_manual ?? true}
                        onChange={(e) => handleAuditSettingChange('balance_check_reset_on_manual', e.target.checked)}
                      />
                    }
                    label="Reset Schedule on Manual Updates"
                  />
                  <Typography variant="caption" color="text.secondary" display="block">
                    Reset reminder schedule when balance is updated manually
                  </Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={config.balance_check_auto_calendar ?? true}
                        onChange={(e) => handleAuditSettingChange('balance_check_auto_calendar', e.target.checked)}
                      />
                    }
                    label="Auto-Generate Calendar Events"
                  />
                  <Typography variant="caption" color="text.secondary" display="block">
                    Automatically create calendar reminders for balance checks
                  </Typography>
                </Grid>

                {/* Frequency Information */}
                <Grid item xs={12}>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                    Update Frequency Options
                  </Typography>
                  
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6} md={3}>
                      <Typography variant="body2" fontWeight="bold" gutterBottom>
                        Weekly
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Every 7 days - Best for high-activity accounts or volatile rates
                      </Typography>
                    </Grid>

                    <Grid item xs={12} sm={6} md={3}>
                      <Typography variant="body2" fontWeight="bold" gutterBottom>
                        Bi-weekly
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Every 14 days - Good balance between accuracy and effort
                      </Typography>
                    </Grid>

                    <Grid item xs={12} sm={6} md={3}>
                      <Typography variant="body2" fontWeight="bold" gutterBottom>
                        Monthly
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Every month - Recommended for most deposit accounts
                      </Typography>
                    </Grid>

                    <Grid item xs={12} sm={6} md={3}>
                      <Typography variant="body2" fontWeight="bold" gutterBottom>
                        Quarterly
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Every 3 months - Suitable for stable, long-term deposits
                      </Typography>
                    </Grid>
                  </Grid>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* FRN Name Normalization Configuration */}
        <Grid item xs={12}>
          <FRNNormalizationSettings />
        </Grid>
      </Grid>

      <Divider sx={{ my: 3 }} />

      <Box display="flex" justifyContent="flex-end" gap={2}>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || !allocationValid}
          startIcon={saving ? <CircularProgress size={20} /> : null}
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </Box>

      {!allocationValid && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          Strategic allocation targets must sum to exactly 100% before saving.
        </Alert>
      )}
    </Box>
  );
};