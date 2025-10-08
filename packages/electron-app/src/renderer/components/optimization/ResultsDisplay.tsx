/**
 * ResultsDisplay Component - Shows results from FSCS and Rate Optimizer modules
 */

import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Alert,
  AlertTitle,
  Collapse,
  IconButton,
  Grid,
  Divider,
  Button,
  Tooltip,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  CheckCircle as SuccessIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  TrendingUp as BenefitIcon,
  Security as ComplianceIcon,
  CalendarMonth as CalendarIcon,
  Assignment as ActionIcon,
  Download as DownloadIcon,
  Share as ShareIcon,
} from '@mui/icons-material';

interface ModuleResult {
  version: string;
  timestamp: string;
  status: 'SUCCESS' | 'WARNING' | 'ERROR';
  module: 'fscs-compliance' | 'rate-optimizer';
  summary: {
    totalAccounts?: number;
    portfolioValue?: number;
    breachCount?: number;
    complianceStatus?: string;
    recommendationCount?: number;
    totalBenefit?: number;
    executionTime?: number;
  };
  recommendations: any[];
  calendarEvents?: any[];
  actionItems?: any[];
  metadata: {
    processingTime?: number;
    dataSource?: string;
    configVersion?: string;
  };
}

interface ResultsDisplayProps {
  result: ModuleResult;
  onExport?: () => void;
  onShare?: () => void;
  onViewDetails?: () => void;
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({
  result,
  onExport,
  onShare,
  onViewDetails,
}) => {
  const [expanded, setExpanded] = useState(true);

  const getStatusIcon = () => {
    switch (result.status) {
      case 'SUCCESS':
        return <SuccessIcon sx={{ color: '#4caf50' }} />;
      case 'WARNING':
        return <WarningIcon sx={{ color: '#ff9800' }} />;
      case 'ERROR':
        return <ErrorIcon sx={{ color: '#f44336' }} />;
    }
  };

  const getStatusColor = () => {
    switch (result.status) {
      case 'SUCCESS':
        return 'success';
      case 'WARNING':
        return 'warning';
      case 'ERROR':
        return 'error';
    }
  };

  const getModuleColor = () => {
    return result.module === 'fscs-compliance' ? '#f44336' : '#4caf50';
  };

  const formatCurrency = (amount?: number) => {
    if (!amount) return '£0';
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatTime = (ms?: number) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const renderFSCSSummary = () => (
    <Grid container spacing={2}>
      <Grid item xs={12} sm={6} md={3}>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Compliance Status
          </Typography>
          <Typography variant="h6" fontWeight="bold">
            {result.summary.complianceStatus || 'Unknown'}
          </Typography>
        </Box>
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Breaches Found
          </Typography>
          <Typography variant="h6" fontWeight="bold" color={result.summary.breachCount ? 'error' : 'success'}>
            {result.summary.breachCount || 0}
          </Typography>
        </Box>
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Accounts Analyzed
          </Typography>
          <Typography variant="h6" fontWeight="bold">
            {result.summary.totalAccounts || 0}
          </Typography>
        </Box>
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Portfolio Value
          </Typography>
          <Typography variant="h6" fontWeight="bold">
            {formatCurrency(result.summary.portfolioValue)}
          </Typography>
        </Box>
      </Grid>
    </Grid>
  );

  const renderOptimizerSummary = () => (
    <Grid container spacing={2}>
      <Grid item xs={12} sm={6} md={3}>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Recommendations
          </Typography>
          <Typography variant="h6" fontWeight="bold">
            {result.summary.recommendationCount || 0}
          </Typography>
        </Box>
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Total Annual Benefit
          </Typography>
          <Typography variant="h6" fontWeight="bold" color="primary">
            {formatCurrency(result.summary.totalBenefit)}/year
          </Typography>
        </Box>
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Portfolio Value
          </Typography>
          <Typography variant="h6" fontWeight="bold">
            {formatCurrency(result.summary.portfolioValue)}
          </Typography>
        </Box>
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Processing Time
          </Typography>
          <Typography variant="h6" fontWeight="bold">
            {formatTime(result.metadata.processingTime)}
          </Typography>
        </Box>
      </Grid>
    </Grid>
  );

  const getAlertSeverity = (): 'error' | 'warning' | 'info' | 'success' => {
    if (result.status === 'ERROR') return 'error';
    if (result.status === 'WARNING') return 'warning';
    if (result.module === 'fscs-compliance' && result.summary.breachCount) return 'error';
    return 'success';
  };

  const getAlertMessage = () => {
    if (result.module === 'fscs-compliance') {
      if (result.summary.breachCount) {
        return `Found ${result.summary.breachCount} FSCS breach${result.summary.breachCount > 1 ? 'es' : ''} requiring immediate attention`;
      }
      return 'Portfolio is fully FSCS compliant';
    } else {
      if (result.summary.recommendationCount) {
        return `Found ${result.summary.recommendationCount} optimization opportunit${result.summary.recommendationCount > 1 ? 'ies' : 'y'} worth ${formatCurrency(result.summary.totalBenefit)}/year`;
      }
      return 'Portfolio is already optimally allocated';
    }
  };

  return (
    <Card elevation={2}>
      <CardContent>
        {/* Header */}
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Box display="flex" alignItems="center" gap={1}>
            {getStatusIcon()}
            <Typography variant="h6" fontWeight="bold">
              {result.module === 'fscs-compliance' ? 'FSCS Compliance Check' : 'Rate Optimization'}
            </Typography>
            <Chip
              label={result.module === 'fscs-compliance' ? 'FSCS' : 'Optimizer'}
              size="small"
              sx={{
                backgroundColor: getModuleColor(),
                color: 'white',
                fontWeight: 'bold',
              }}
            />
            <Chip
              label={result.status}
              size="small"
              color={getStatusColor()}
              variant="outlined"
            />
          </Box>
          <Box display="flex" alignItems="center" gap={1}>
            <Typography variant="caption" color="text.secondary">
              {new Date(result.timestamp).toLocaleString()}
            </Typography>
            <IconButton
              size="small"
              onClick={() => setExpanded(!expanded)}
              aria-label="toggle details"
            >
              {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
        </Box>

        {/* Alert */}
        <Alert severity={getAlertSeverity()} sx={{ mb: 2 }}>
          <AlertTitle>
            {result.status === 'SUCCESS' ? 'Analysis Complete' : 
             result.status === 'WARNING' ? 'Analysis Complete with Warnings' : 
             'Analysis Failed'}
          </AlertTitle>
          {getAlertMessage()}
        </Alert>

        {/* Details */}
        <Collapse in={expanded}>
          <Box>
            {/* Summary Stats */}
            {result.module === 'fscs-compliance' ? renderFSCSSummary() : renderOptimizerSummary()}

            <Divider sx={{ my: 2 }} />

            {/* Additional Info */}
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <Box display="flex" alignItems="center" gap={1}>
                  <ActionIcon fontSize="small" color="action" />
                  <Typography variant="body2">
                    <strong>{result.actionItems?.length || 0}</strong> Action Items
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Box display="flex" alignItems="center" gap={1}>
                  <CalendarIcon fontSize="small" color="action" />
                  <Typography variant="body2">
                    <strong>{result.calendarEvents?.length || 0}</strong> Calendar Events
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Box display="flex" alignItems="center" gap={1}>
                  {result.module === 'fscs-compliance' ? (
                    <ComplianceIcon fontSize="small" color="action" />
                  ) : (
                    <BenefitIcon fontSize="small" color="action" />
                  )}
                  <Typography variant="body2">
                    <strong>{result.recommendations.length}</strong> Recommendations
                  </Typography>
                </Box>
              </Grid>
            </Grid>

            {/* Actions */}
            <Box display="flex" gap={1} mt={3}>
              {onViewDetails && (
                <Button
                  variant="contained"
                  size="small"
                  onClick={onViewDetails}
                  sx={{ backgroundColor: getModuleColor() }}
                >
                  View Details
                </Button>
              )}
              {onExport && (
                <Tooltip title="Export results">
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<DownloadIcon />}
                    onClick={onExport}
                  >
                    Export
                  </Button>
                </Tooltip>
              )}
              {onShare && (
                <Tooltip title="Share results">
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<ShareIcon />}
                    onClick={onShare}
                  >
                    Share
                  </Button>
                </Tooltip>
              )}
            </Box>

            {/* Metadata */}
            <Box mt={2}>
              <Typography variant="caption" color="text.secondary">
                Version: {result.version} | 
                Data Source: {result.metadata.dataSource || 'Database'} | 
                Config: {result.metadata.configVersion || 'Default'}
              </Typography>
            </Box>
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
};

export default ResultsDisplay;