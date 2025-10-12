import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Chip,
  Box,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  IconButton,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';

interface FRNNormalizationConfig {
  prefixes: string[];
  suffixes: string[];
  abbreviations: Record<string, string>;
}

export const FRNNormalizationSettings: React.FC = () => {
  const [config, setConfig] = useState<FRNNormalizationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // State for adding items
  const [newPrefix, setNewPrefix] = useState('');
  const [newSuffix, setNewSuffix] = useState('');
  const [abbrDialogOpen, setAbbrDialogOpen] = useState(false);
  const [newAbbr, setNewAbbr] = useState({ key: '', value: '' });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await window.electronAPI.getFRNNormalizationConfig();
      setConfig(data);
    } catch (err) {
      setError('Failed to load FRN normalization configuration');
      console.error('Load config error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      await window.electronAPI.updateFRNNormalizationConfig(config);

      setSuccess('Configuration saved and FRN lookup cache rebuilt successfully!');
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError('Failed to save configuration');
      console.error('Save config error:', err);
    } finally {
      setSaving(false);
    }
  };

  const addPrefix = () => {
    if (newPrefix.trim() && config && !config.prefixes.includes(newPrefix.trim().toUpperCase())) {
      setConfig({
        ...config,
        prefixes: [...config.prefixes, newPrefix.trim().toUpperCase()]
      });
      setNewPrefix('');
    }
  };

  const removePrefix = (prefix: string) => {
    if (config) {
      setConfig({
        ...config,
        prefixes: config.prefixes.filter(p => p !== prefix)
      });
    }
  };

  const addSuffix = () => {
    if (newSuffix.trim() && config && !config.suffixes.includes(newSuffix.trim().toUpperCase())) {
      setConfig({
        ...config,
        suffixes: [...config.suffixes, newSuffix.trim().toUpperCase()]
      });
      setNewSuffix('');
    }
  };

  const removeSuffix = (suffix: string) => {
    if (config) {
      setConfig({
        ...config,
        suffixes: config.suffixes.filter(s => s !== suffix)
      });
    }
  };

  const addAbbreviation = () => {
    if (newAbbr.key.trim() && newAbbr.value.trim() && config) {
      const key = newAbbr.key.trim().toUpperCase();
      const value = newAbbr.value.trim().toUpperCase();

      setConfig({
        ...config,
        abbreviations: { ...config.abbreviations, [key]: value }
      });
      setNewAbbr({ key: '', value: '' });
      setAbbrDialogOpen(false);
    }
  };

  const removeAbbreviation = (key: string) => {
    if (config) {
      const { [key]: _, ...rest } = config.abbreviations;
      setConfig({ ...config, abbreviations: rest });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="center" alignItems="center" py={4}>
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (!config) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error">Failed to load FRN normalization configuration</Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SettingsIcon />
          FRN Bank Name Normalization Rules
        </Typography>

        <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
          Configure how bank names are normalized for FRN matching. The lookup cache rebuilds automatically when you save changes.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        )}

        <Grid container spacing={3}>
          {/* Prefixes */}
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              Prefixes to Remove
            </Typography>
            <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 2 }}>
              These terms will be stripped from the start of bank names (e.g., "THE")
            </Typography>

            <Box display="flex" gap={1} mb={2}>
              <TextField
                size="small"
                fullWidth
                placeholder="e.g., THE"
                value={newPrefix}
                onChange={(e) => setNewPrefix(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addPrefix();
                  }
                }}
              />
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={addPrefix}
                disabled={!newPrefix.trim()}
              >
                Add
              </Button>
            </Box>

            <Box display="flex" flexWrap="wrap" gap={1}>
              {config.prefixes.length === 0 ? (
                <Typography variant="body2" color="textSecondary" fontStyle="italic">
                  No prefixes configured
                </Typography>
              ) : (
                config.prefixes.map((prefix) => (
                  <Chip
                    key={prefix}
                    label={prefix}
                    onDelete={() => removePrefix(prefix)}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                ))
              )}
            </Box>
          </Grid>

          {/* Suffixes */}
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              Suffixes to Remove
            </Typography>
            <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 2 }}>
              These terms will be stripped from the end of bank names (e.g., "LIMITED", "PLC")
            </Typography>

            <Box display="flex" gap={1} mb={2}>
              <TextField
                size="small"
                fullWidth
                placeholder="e.g., LIMITED, PLC"
                value={newSuffix}
                onChange={(e) => setNewSuffix(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addSuffix();
                  }
                }}
              />
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={addSuffix}
                disabled={!newSuffix.trim()}
              >
                Add
              </Button>
            </Box>

            <Box display="flex" flexWrap="wrap" gap={1}>
              {config.suffixes.length === 0 ? (
                <Typography variant="body2" color="textSecondary" fontStyle="italic">
                  No suffixes configured
                </Typography>
              ) : (
                config.suffixes.map((suffix) => (
                  <Chip
                    key={suffix}
                    label={suffix}
                    onDelete={() => removeSuffix(suffix)}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                ))
              )}
            </Box>
          </Grid>

          {/* Abbreviations */}
          <Grid item xs={12}>
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              Abbreviation Expansions
            </Typography>
            <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 2 }}>
              Abbreviations will be replaced with their full forms during normalization (e.g., "CO" → "COMPANY")
            </Typography>

            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setAbbrDialogOpen(true)}
              sx={{ mb: 2 }}
            >
              Add Abbreviation
            </Button>

            {Object.keys(config.abbreviations).length === 0 ? (
              <Typography variant="body2" color="textSecondary" fontStyle="italic">
                No abbreviations configured
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Abbreviation</strong></TableCell>
                    <TableCell><strong>Expands To</strong></TableCell>
                    <TableCell align="right"><strong>Actions</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.entries(config.abbreviations).map(([key, value]) => (
                    <TableRow key={key}>
                      <TableCell><strong>{key}</strong></TableCell>
                      <TableCell>{value}</TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          onClick={() => removeAbbreviation(key)}
                          color="error"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Grid>
        </Grid>

        <Box display="flex" justifyContent="flex-end" mt={3}>
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving & Rebuilding Cache...' : 'Save Configuration'}
          </Button>
        </Box>
      </CardContent>

      {/* Add Abbreviation Dialog */}
      <Dialog
        open={abbrDialogOpen}
        onClose={() => setAbbrDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add Abbreviation Expansion</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Abbreviation"
                placeholder="e.g., CO"
                value={newAbbr.key}
                onChange={(e) => setNewAbbr({ ...newAbbr, key: e.target.value })}
                helperText="The short form to find in bank names"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Expands To"
                placeholder="e.g., COMPANY"
                value={newAbbr.value}
                onChange={(e) => setNewAbbr({ ...newAbbr, value: e.target.value })}
                helperText="The full form to use instead"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setAbbrDialogOpen(false);
            setNewAbbr({ key: '', value: '' });
          }}>
            Cancel
          </Button>
          <Button
            onClick={addAbbreviation}
            variant="contained"
            disabled={!newAbbr.key.trim() || !newAbbr.value.trim()}
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};
