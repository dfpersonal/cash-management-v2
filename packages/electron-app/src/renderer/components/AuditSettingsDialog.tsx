import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  FormControlLabel,
  FormLabel,
  FormGroup,
  Switch,
  Select,
  MenuItem,
  TextField,
  Typography,
  Box,
  Grid,
  Alert,
  Divider,
  Chip,
  Stack,
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Save as SaveIcon,
  Restore as RestoreIcon,
} from '@mui/icons-material';

interface AuditConfig {
  enabled: boolean;
  level: 'disabled' | 'key_fields' | 'full';
  include_events: boolean;
  retention_days: number;
  max_entries: number;
  auto_cleanup: boolean;
}

interface AuditSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (config: Partial<AuditConfig>) => void;
}

export const AuditSettingsDialog: React.FC<AuditSettingsDialogProps> = ({
  open,
  onClose,
  onSave
}) => {
  const [config, setConfig] = useState<AuditConfig>({
    enabled: true,
    level: 'key_fields',
    include_events: true,
    retention_days: 90,
    max_entries: 5000,
    auto_cleanup: true
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Load current configuration when dialog opens
  useEffect(() => {
    if (open) {
      loadConfiguration();
    }
  }, [open]);

  const loadConfiguration = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const currentConfig = await window.electronAPI.getConfiguration();
      
      // Extract audit-related configuration
      const auditConfig: AuditConfig = {
        enabled: currentConfig.audit_enabled ?? true,
        level: currentConfig.audit_level ?? 'key_fields',
        include_events: currentConfig.audit_include_events ?? true,
        retention_days: currentConfig.audit_retention_days ?? 90,
        max_entries: currentConfig.audit_max_entries ?? 5000,
        auto_cleanup: currentConfig.audit_auto_cleanup ?? true
      };
      
      setConfig(auditConfig);
      setHasChanges(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleConfigChange = (key: keyof AuditConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Convert config to the format expected by the backend
      const configUpdates = {
        audit_enabled: config.enabled,
        audit_level: config.level,
        audit_include_events: config.include_events,
        audit_retention_days: config.retention_days,
        audit_max_entries: config.max_entries,
        audit_auto_cleanup: config.auto_cleanup
      };
      
      await window.electronAPI.updateConfiguration(configUpdates);
      onSave(config);
      setHasChanges(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleResetToDefaults = () => {
    setConfig({
      enabled: true,
      level: 'key_fields',
      include_events: true,
      retention_days: 90,
      max_entries: 5000,
      auto_cleanup: true
    });
    setHasChanges(true);
  };

  const getLevelDescription = (level: string) => {
    switch (level) {
      case 'disabled':
        return 'No audit logging performed (not recommended)';
      case 'key_fields':
        return 'Log only critical fields like balance, rates, and status changes';
      case 'full':
        return 'Log all field changes for maximum audit trail (higher storage usage)';
      default:
        return '';
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <SettingsIcon />
        Audit System Configuration
      </DialogTitle>
      
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Box sx={{ mt: 2 }}>
          {/* Main Audit Settings */}
          <Typography variant="h6" gutterBottom fontWeight="bold">
            Main Settings
          </Typography>
          
          <Grid container spacing={3} mb={3}>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={config.enabled}
                    onChange={(e) => handleConfigChange('enabled', e.target.checked)}
                  />
                }
                label="Enable Audit Logging"
              />
              <Typography variant="caption" color="text.secondary" display="block">
                Master switch for all audit logging functionality
              </Typography>
            </Grid>

            <Grid item xs={12}>
              <FormControl fullWidth>
                <FormLabel>Audit Level</FormLabel>
                <Select
                  value={config.level}
                  onChange={(e) => handleConfigChange('level', e.target.value)}
                  disabled={!config.enabled}
                >
                  <MenuItem value="disabled">Disabled</MenuItem>
                  <MenuItem value="key_fields">Key Fields Only (Recommended)</MenuItem>
                  <MenuItem value="full">Full Logging</MenuItem>
                </Select>
                <Typography variant="caption" color="text.secondary">
                  {getLevelDescription(config.level)}
                </Typography>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={config.include_events}
                    onChange={(e) => handleConfigChange('include_events', e.target.checked)}
                    disabled={!config.enabled}
                  />
                }
                label="Include Calendar & Event Operations"
              />
              <Typography variant="caption" color="text.secondary" display="block">
                Log changes to rate changes, notice events, reminders, and report actions
              </Typography>
            </Grid>
          </Grid>

          <Divider sx={{ my: 3 }} />

          {/* Data Retention Settings */}
          <Typography variant="h6" gutterBottom fontWeight="bold">
            Data Retention & Cleanup
          </Typography>
          
          <Grid container spacing={3} mb={3}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label="Retention Days"
                value={config.retention_days}
                onChange={(e) => handleConfigChange('retention_days', parseInt(e.target.value) || 90)}
                disabled={!config.enabled || !config.auto_cleanup}
                helperText="How long to keep audit entries before auto-cleanup"
                inputProps={{ min: 7, max: 3650 }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label="Maximum Entries"
                value={config.max_entries}
                onChange={(e) => handleConfigChange('max_entries', parseInt(e.target.value) || 5000)}
                disabled={!config.enabled || !config.auto_cleanup}
                helperText="Maximum audit entries before triggering cleanup"
                inputProps={{ min: 1000, max: 100000 }}
              />
            </Grid>

            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={config.auto_cleanup}
                    onChange={(e) => handleConfigChange('auto_cleanup', e.target.checked)}
                    disabled={!config.enabled}
                  />
                }
                label="Automatic Cleanup"
              />
              <Typography variant="caption" color="text.secondary" display="block">
                Automatically remove old audit entries based on retention settings
              </Typography>
            </Grid>
          </Grid>

          <Divider sx={{ my: 3 }} />

          {/* Key Fields Information */}
          <Typography variant="h6" gutterBottom fontWeight="bold">
            Key Fields Tracked (Key Fields Mode)
          </Typography>
          
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                Deposits
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {['balance', 'aer', 'bank', 'is_active', 'term_ends', 'type', 'sub_type'].map(field => (
                  <Chip key={field} label={field} size="small" variant="outlined" />
                ))}
              </Stack>
            </Grid>

            <Grid item xs={12} sm={6}>
              <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                Pending Deposits
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {['balance', 'status', 'bank', 'expected_funding_date', 'source_account_id'].map(field => (
                  <Chip key={field} label={field} size="small" variant="outlined" />
                ))}
              </Stack>
            </Grid>

            <Grid item xs={12} sm={6}>
              <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                Rate Changes
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {['current_rate', 'new_rate', 'effective_date', 'status'].map(field => (
                  <Chip key={field} label={field} size="small" variant="outlined" />
                ))}
              </Stack>
            </Grid>

            <Grid item xs={12} sm={6}>
              <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                Notice Events & Reminders
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {['notice_given_date', 'funds_available_date', 'status', 'reminder_date', 'is_sent'].map(field => (
                  <Chip key={field} label={field} size="small" variant="outlined" />
                ))}
              </Stack>
            </Grid>
          </Grid>
        </Box>
      </DialogContent>
      
      <DialogActions sx={{ p: 3, gap: 1 }}>
        <Button
          startIcon={<RestoreIcon />}
          onClick={handleResetToDefaults}
          disabled={loading}
        >
          Reset to Defaults
        </Button>
        
        <Box sx={{ flex: 1 }} />
        
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={loading || !hasChanges}
        >
          {loading ? 'Saving...' : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};