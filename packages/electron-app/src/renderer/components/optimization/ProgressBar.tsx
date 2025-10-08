/**
 * ProgressBar Component - Shows progress for FSCS and Rate Optimizer operations
 */

import React from 'react';
import { CircularProgress, LinearProgress, Box, Typography, IconButton, Chip } from '@mui/material';
import { Cancel as CancelIcon } from '@mui/icons-material';

interface ProgressBarProps {
  percent: number;
  message: string;
  module?: 'fscs-compliance' | 'rate-optimizer';
  onCancel?: () => void;
  variant?: 'linear' | 'circular';
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  percent,
  message,
  module,
  onCancel,
  variant = 'linear'
}) => {
  // Module-specific colors
  const getModuleColor = () => {
    switch (module) {
      case 'fscs-compliance':
        return {
          primary: '#f44336', // Red for FSCS
          secondary: '#ffebee',
          text: '#d32f2f'
        };
      case 'rate-optimizer':
        return {
          primary: '#4caf50', // Green for Optimizer
          secondary: '#e8f5e9',
          text: '#388e3c'
        };
      default:
        return {
          primary: '#2196f3', // Blue for generic
          secondary: '#e3f2fd',
          text: '#1976d2'
        };
    }
  };

  const colors = getModuleColor();
  const moduleLabel = module === 'fscs-compliance' 
    ? 'FSCS Compliance' 
    : module === 'rate-optimizer' 
    ? 'Rate Optimizer' 
    : 'Processing';

  if (variant === 'circular') {
    return (
      <Box display="flex" alignItems="center" gap={2}>
        <Box position="relative" display="inline-flex">
          <CircularProgress
            variant="determinate"
            value={percent}
            size={60}
            thickness={4}
            sx={{ color: colors.primary }}
          />
          <Box
            top={0}
            left={0}
            bottom={0}
            right={0}
            position="absolute"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Typography
              variant="caption"
              component="div"
              color="text.secondary"
              fontWeight="bold"
            >
              {`${Math.round(percent)}%`}
            </Typography>
          </Box>
        </Box>
        <Box flex={1}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {moduleLabel}
          </Typography>
          <Typography variant="body1">
            {message}
          </Typography>
        </Box>
        {onCancel && (
          <IconButton
            onClick={onCancel}
            size="small"
            sx={{ color: colors.text }}
            title="Cancel operation"
          >
            <CancelIcon />
          </IconButton>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%' }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
        <Box display="flex" alignItems="center" gap={1}>
          {module && (
            <Chip
              label={moduleLabel}
              size="small"
              sx={{
                backgroundColor: colors.secondary,
                color: colors.text,
                fontWeight: 'bold'
              }}
            />
          )}
          <Typography variant="body2" color="text.secondary">
            {message}
          </Typography>
        </Box>
        <Box display="flex" alignItems="center" gap={1}>
          <Typography variant="body2" color="text.secondary" fontWeight="bold">
            {Math.round(percent)}%
          </Typography>
          {onCancel && (
            <IconButton
              onClick={onCancel}
              size="small"
              sx={{ color: colors.text }}
              title="Cancel operation"
            >
              <CancelIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      </Box>
      <LinearProgress
        variant="determinate"
        value={percent}
        sx={{
          height: 8,
          borderRadius: 4,
          backgroundColor: colors.secondary,
          '& .MuiLinearProgress-bar': {
            backgroundColor: colors.primary,
            borderRadius: 4,
            transition: 'transform 0.4s ease',
          }
        }}
      />
    </Box>
  );
};

export default ProgressBar;