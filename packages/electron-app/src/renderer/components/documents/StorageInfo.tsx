import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Typography,
  Box,
  Paper,
  LinearProgress,
  Alert,
  Chip,
  Divider,
  Grid,
  CircularProgress
} from '@mui/material';
import {
  Close as CloseIcon,
  Storage as StorageIcon,
  Folder as FolderIcon,
  Delete as DeleteIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  CheckCircle as CheckIcon
} from '@mui/icons-material';

import type {
  StorageInfoProps,
  StorageCheckResponse
} from './types';

interface StorageUsage {
  active_size: number;
  trash_size: number;
  total_size: number;
  active_count: number;
  trash_count: number;
}

interface StorageInfoState {
  usage: StorageUsage | null;
  loading: boolean;
  error: string | null;
  cleaningUp: boolean;
}

export default function StorageInfo({
  open,
  onClose,
  storageCheck
}: StorageInfoProps & { open: boolean; onClose: () => void }) {
  const [state, setState] = useState<StorageInfoState>({
    usage: null,
    loading: false,
    error: null,
    cleaningUp: false
  });

  // Load storage usage when dialog opens
  useEffect(() => {
    if (open) {
      loadStorageUsage();
    }
  }, [open]);

  const loadStorageUsage = async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await window.electronAPI.documents.getStorageUsage();
      if (result.success) {
        setState(prev => ({
          ...prev,
          usage: result.data,
          loading: false
        }));
      } else {
        setState(prev => ({
          ...prev,
          loading: false,
          error: result.error || 'Failed to load storage information'
        }));
      }
    } catch (error) {
      console.error('[StorageInfo] Load usage error:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to load storage information due to an unexpected error'
      }));
    }
  };

  // Handle cleanup trash
  const handleCleanupTrash = async () => {
    if (!window.confirm('This will permanently delete all documents that have been in trash for more than 30 days. This action cannot be undone. Continue?')) {
      return;
    }

    setState(prev => ({ ...prev, cleaningUp: true, error: null }));

    try {
      const result = await window.electronAPI.documents.cleanupTrash();

      if (result.success) {
        // Reload usage data
        await loadStorageUsage();
        setState(prev => ({ ...prev, cleaningUp: false }));
      } else {
        setState(prev => ({
          ...prev,
          cleaningUp: false,
          error: result.error || 'Failed to cleanup trash'
        }));
      }
    } catch (error) {
      console.error('[StorageInfo] Cleanup error:', error);
      setState(prev => ({
        ...prev,
        cleaningUp: false,
        error: 'Failed to cleanup trash due to an unexpected error'
      }));
    }
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Calculate storage percentages
  const getStoragePercentages = () => {
    if (!state.usage) return { active: 0, trash: 0 };

    const total = state.usage.total_size;
    if (total === 0) return { active: 0, trash: 0 };

    return {
      active: (state.usage.active_size / total) * 100,
      trash: (state.usage.trash_size / total) * 100
    };
  };

  // Get available space color
  const getAvailableSpaceColor = () => {
    if (!storageCheck) return 'success';
    if (storageCheck.show_warning) return 'warning';
    return 'success';
  };

  // Get storage health status
  const getStorageHealthStatus = () => {
    if (!storageCheck) return { status: 'unknown', message: 'Unknown' };
    if (storageCheck.show_warning) return { status: 'warning', message: 'Low Space' };
    return { status: 'good', message: 'Healthy' };
  };

  const percentages = getStoragePercentages();
  const healthStatus = getStorageHealthStatus();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h6" display="flex" alignItems="center" gap={1}>
              <StorageIcon />
              Storage Information
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Document storage usage and management
            </Typography>
          </Box>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {/* Error Display */}
        {state.error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setState(prev => ({ ...prev, error: null }))}>
            {state.error}
          </Alert>
        )}

        {/* Storage Health Status */}
        {storageCheck && (
          <Box mb={3}>
            <Paper sx={{ p: 2, backgroundColor: healthStatus.status === 'warning' ? 'warning.light' : 'success.light' }}>
              <Box display="flex" alignItems="center" gap={2}>
                {healthStatus.status === 'warning' ? (
                  <WarningIcon color="warning" />
                ) : (
                  <CheckIcon color="success" />
                )}
                <Box flex={1}>
                  <Typography variant="h6">
                    Storage Status: {healthStatus.message}
                  </Typography>
                  <Typography variant="body2">
                    Available Space: <strong>{formatFileSize(storageCheck.available_space)}</strong>
                  </Typography>
                  {storageCheck.warning_message && (
                    <Typography variant="body2" color="warning.dark" sx={{ mt: 1 }}>
                      {storageCheck.warning_message}
                    </Typography>
                  )}
                </Box>
              </Box>
            </Paper>
          </Box>
        )}

        {/* Storage Usage */}
        {state.loading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        ) : state.usage ? (
          <Grid container spacing={3}>
            {/* Usage Summary */}
            <Grid item xs={12}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom display="flex" alignItems="center" gap={1}>
                  <FolderIcon />
                  Storage Usage
                </Typography>

                <Box mb={2}>
                  <Box display="flex" justifyContent="space-between" mb={1}>
                    <Typography variant="body2">Total Usage</Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {formatFileSize(state.usage.total_size)}
                    </Typography>
                  </Box>

                  <LinearProgress
                    variant="determinate"
                    value={Math.min(100, (state.usage.total_size / (storageCheck?.available_space || state.usage.total_size * 2)) * 100)}
                    sx={{
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: 'grey.200',
                      '& .MuiLinearProgress-bar': {
                        backgroundColor: getAvailableSpaceColor() === 'warning' ? 'warning.main' : 'success.main'
                      }
                    }}
                  />
                </Box>

                <Divider sx={{ my: 2 }} />

                {/* Active Documents */}
                <Box mb={2}>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                    <Typography variant="body2" display="flex" alignItems="center" gap={1}>
                      <Chip
                        label={state.usage.active_count}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                      Active Documents
                    </Typography>
                    <Typography variant="body2" fontWeight="medium">
                      {formatFileSize(state.usage.active_size)}
                    </Typography>
                  </Box>

                  {state.usage.total_size > 0 && (
                    <LinearProgress
                      variant="determinate"
                      value={percentages.active}
                      sx={{
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: 'grey.200',
                        '& .MuiLinearProgress-bar': { backgroundColor: 'primary.main' }
                      }}
                    />
                  )}
                </Box>

                {/* Trash Documents */}
                <Box>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                    <Typography variant="body2" display="flex" alignItems="center" gap={1}>
                      <Chip
                        label={state.usage.trash_count}
                        size="small"
                        color="warning"
                        variant="outlined"
                      />
                      Trash Documents
                    </Typography>
                    <Typography variant="body2" fontWeight="medium">
                      {formatFileSize(state.usage.trash_size)}
                    </Typography>
                  </Box>

                  {state.usage.total_size > 0 && (
                    <LinearProgress
                      variant="determinate"
                      value={percentages.trash}
                      sx={{
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: 'grey.200',
                        '& .MuiLinearProgress-bar': { backgroundColor: 'warning.main' }
                      }}
                    />
                  )}
                </Box>
              </Paper>
            </Grid>

            {/* Storage Actions */}
            <Grid item xs={12}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Storage Management
                </Typography>

                <Box display="flex" flexDirection="column" gap={2}>
                  <Button
                    variant="outlined"
                    startIcon={<DeleteIcon />}
                    onClick={handleCleanupTrash}
                    disabled={state.usage.trash_count === 0 || state.cleaningUp}
                    fullWidth
                  >
                    {state.cleaningUp ? 'Cleaning Up...' : 'Cleanup Expired Trash Documents'}
                  </Button>

                  <Alert severity="info">
                    <Typography variant="body2">
                      <strong>Automatic Cleanup:</strong> Documents in trash are automatically deleted after 30 days.
                      The cleanup process runs daily in the background.
                    </Typography>
                  </Alert>
                </Box>
              </Paper>
            </Grid>
          </Grid>
        ) : null}

        {/* Storage Tips */}
        <Box mt={3}>
          <Alert severity="info" icon={<InfoIcon />}>
            <Typography variant="body2">
              <strong>Storage Tips:</strong>
              <br />• Documents are stored locally on your computer
              <br />• Large files (&gt;5MB) will show a warning during upload
              <br />• Maximum file size is 50MB per document
              <br />• Deleted documents are kept in trash for 30 days for recovery
            </Typography>
          </Alert>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={loadStorageUsage} disabled={state.loading}>
          Refresh
        </Button>
        <Button onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}