import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Grid,
  Card,
  CardContent,
  Chip,
  Stack,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  History as HistoryIcon,
  Assessment as AssessmentIcon,
  FilterList as FilterIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Timeline as TimelineIcon,
} from '@mui/icons-material';
import { AuditViewer } from '../components/AuditViewer';
import { AppState, AuditStats, FieldChangeStats } from '@cash-mgmt/shared';

interface AuditProps {
  appState: AppState;
}

export const Audit: React.FC<AuditProps> = ({ appState }) => {
  const [auditViewerOpen, setAuditViewerOpen] = useState(false);
  const [auditFilters, setAuditFilters] = useState({});
  const [auditTitle, setAuditTitle] = useState('Complete Audit Trail');
  
  // Statistics state
  const [balanceStats, setBalanceStats] = useState<AuditStats | null>(null);
  const [fieldChangeStats, setFieldChangeStats] = useState<FieldChangeStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load audit statistics
  useEffect(() => {
    const loadAuditStatistics = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Load balance change summary and field change statistics in parallel
        const [balanceStatsResult, fieldStatsResult] = await Promise.all([
          window.electronAPI.getBalanceChangeSummary(30),
          window.electronAPI.getFieldChangeStats(30)
        ]);
        
        setBalanceStats(balanceStatsResult);
        setFieldChangeStats(fieldStatsResult);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load audit statistics');
      } finally {
        setLoading(false);
      }
    };

    loadAuditStatistics();
  }, []);

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP'
    }).format(value);
  };

  const handleViewAllAudit = () => {
    setAuditFilters({});
    setAuditTitle('Complete Audit Trail');
    setAuditViewerOpen(true);
  };

  const handleViewTableAudit = (tableName: string, tableLabel: string) => {
    setAuditFilters({ tableName });
    setAuditTitle(`${tableLabel} Audit Trail`);
    setAuditViewerOpen(true);
  };

  const handleViewRecentChanges = () => {
    setAuditFilters({ daysBack: 7 });
    setAuditTitle('Recent Changes (Last 7 Days)');
    setAuditViewerOpen(true);
  };

  const handleViewBalanceChanges = () => {
    setAuditFilters({ fieldName: 'balance' });
    setAuditTitle('Balance Changes Audit Trail');
    setAuditViewerOpen(true);
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box mb={4}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 2 }}>
          <HistoryIcon sx={{ fontSize: 40 }} />
          Audit Trail Management
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          View detailed audit logs and track all changes to your portfolio data
        </Typography>
      </Box>

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Audit Statistics Dashboard */}
      {loading ? (
        <Box display="flex" justifyContent="center" my={4}>
          <CircularProgress />
        </Box>
      ) : balanceStats && balanceStats.total_changes > 0 && (
        <Paper sx={{ p: 3, mb: 4 }}>
          <Typography variant="h6" gutterBottom fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AssessmentIcon />
            Audit Statistics (Last 30 Days)
          </Typography>
          
          <Grid container spacing={3} mb={3}>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ bgcolor: 'primary.50', border: '1px solid', borderColor: 'primary.200' }}>
                <CardContent>
                  <Stack spacing={1} alignItems="center" textAlign="center">
                    <TimelineIcon sx={{ fontSize: 32, color: 'primary.main' }} />
                    <Typography variant="h4" fontWeight="bold" color="primary.main">
                      {balanceStats.total_changes}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Balance Changes
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ bgcolor: 'success.50', border: '1px solid', borderColor: 'success.200' }}>
                <CardContent>
                  <Stack spacing={1} alignItems="center" textAlign="center">
                    <TrendingUpIcon sx={{ fontSize: 32, color: 'success.main' }} />
                    <Typography variant="h5" fontWeight="bold" color="success.main">
                      {formatCurrency(balanceStats.total_increases)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Increases
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ bgcolor: 'error.50', border: '1px solid', borderColor: 'error.200' }}>
                <CardContent>
                  <Stack spacing={1} alignItems="center" textAlign="center">
                    <TrendingDownIcon sx={{ fontSize: 32, color: 'error.main' }} />
                    <Typography variant="h5" fontWeight="bold" color="error.main">
                      {formatCurrency(balanceStats.total_decreases)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Decreases
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ bgcolor: 'info.50', border: '1px solid', borderColor: 'info.200' }}>
                <CardContent>
                  <Stack spacing={1} alignItems="center" textAlign="center">
                    <AssessmentIcon sx={{ fontSize: 32, color: 'info.main' }} />
                    <Typography variant="h5" fontWeight="bold" color="info.main">
                      {formatCurrency(balanceStats.avg_change)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Average Change
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Field Change Statistics */}
          {fieldChangeStats.length > 0 && (
            <>
              <Typography variant="subtitle1" gutterBottom fontWeight="bold" mt={2}>
                Most Changed Fields
              </Typography>
              <Grid container spacing={2}>
                {fieldChangeStats.slice(0, 6).map((stat) => (
                  <Grid item xs={12} sm={6} md={4} key={stat.field_name}>
                    <Card variant="outlined">
                      <CardContent sx={{ py: 2 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Box>
                            <Typography variant="subtitle2" fontWeight="bold">
                              {stat.field_name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {stat.records_affected} records affected
                            </Typography>
                          </Box>
                          <Chip 
                            label={stat.change_count} 
                            color="primary" 
                            size="small"
                          />
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </>
          )}
        </Paper>
      )}

      {/* Quick Actions */}
      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} sm={6} md={3}>
          <Card 
            sx={{ 
              cursor: 'pointer',
              '&:hover': { 
                boxShadow: 4,
                transform: 'translateY(-2px)',
                transition: 'all 0.2s ease-in-out'
              }
            }}
            onClick={handleViewAllAudit}
          >
            <CardContent>
              <Stack spacing={2} alignItems="center" textAlign="center">
                <HistoryIcon sx={{ fontSize: 48, color: 'primary.main' }} />
                <Typography variant="h6" fontWeight="bold">
                  Complete Audit Trail
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  View all audit entries and operations
                </Typography>
                <Chip label="View All" color="primary" />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card 
            sx={{ 
              cursor: 'pointer',
              '&:hover': { 
                boxShadow: 4,
                transform: 'translateY(-2px)',
                transition: 'all 0.2s ease-in-out'
              }
            }}
            onClick={handleViewRecentChanges}
          >
            <CardContent>
              <Stack spacing={2} alignItems="center" textAlign="center">
                <AssessmentIcon sx={{ fontSize: 48, color: 'success.main' }} />
                <Typography variant="h6" fontWeight="bold">
                  Recent Changes
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  View changes from the last 7 days
                </Typography>
                <Chip label="Last 7 Days" color="success" />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card 
            sx={{ 
              cursor: 'pointer',
              '&:hover': { 
                boxShadow: 4,
                transform: 'translateY(-2px)',
                transition: 'all 0.2s ease-in-out'
              }
            }}
            onClick={handleViewBalanceChanges}
          >
            <CardContent>
              <Stack spacing={2} alignItems="center" textAlign="center">
                <FilterIcon sx={{ fontSize: 48, color: 'warning.main' }} />
                <Typography variant="h6" fontWeight="bold">
                  Balance Changes
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  View all financial balance changes
                </Typography>
                <Chip label="Financial Changes" color="warning" />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card 
            sx={{ 
              cursor: 'pointer',
              '&:hover': { 
                boxShadow: 4,
                transform: 'translateY(-2px)',
                transition: 'all 0.2s ease-in-out'
              }
            }}
            onClick={() => handleViewTableAudit('my_deposits', 'Deposits')}
          >
            <CardContent>
              <Stack spacing={2} alignItems="center" textAlign="center">
                <HistoryIcon sx={{ fontSize: 48, color: 'info.main' }} />
                <Typography variant="h6" fontWeight="bold">
                  Deposit Changes
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  View deposit modification history
                </Typography>
                <Chip label="Deposits Only" color="info" />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Table-Specific Audit Trails */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom fontWeight="bold">
          Table-Specific Audit Trails
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>
          View audit trails for specific data tables in your portfolio
        </Typography>
        
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={4}>
            <Button
              variant="outlined"
              fullWidth
              startIcon={<HistoryIcon />}
              onClick={() => handleViewTableAudit('my_deposits', 'Current Deposits')}
              sx={{ justifyContent: 'flex-start', p: 2 }}
            >
              <Box>
                <Typography variant="subtitle2" fontWeight="bold">
                  Current Deposits
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  All changes to active deposits
                </Typography>
              </Box>
            </Button>
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <Button
              variant="outlined"
              fullWidth
              startIcon={<HistoryIcon />}
              onClick={() => handleViewTableAudit('my_pending_deposits', 'Pending Deposits')}
              sx={{ justifyContent: 'flex-start', p: 2 }}
            >
              <Box>
                <Typography variant="subtitle2" fontWeight="bold">
                  Pending Deposits
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  All changes to pending moves
                </Typography>
              </Box>
            </Button>
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <Button
              variant="outlined"
              fullWidth
              startIcon={<HistoryIcon />}
              onClick={() => handleViewTableAudit('rate_changes', 'Rate Changes')}
              sx={{ justifyContent: 'flex-start', p: 2 }}
            >
              <Box>
                <Typography variant="subtitle2" fontWeight="bold">
                  Rate Changes
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  All rate change notifications
                </Typography>
              </Box>
            </Button>
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <Button
              variant="outlined"
              fullWidth
              startIcon={<HistoryIcon />}
              onClick={() => handleViewTableAudit('notice_events', 'Notice Events')}
              sx={{ justifyContent: 'flex-start', p: 2 }}
            >
              <Box>
                <Typography variant="subtitle2" fontWeight="bold">
                  Notice Events
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  All notice period activities
                </Typography>
              </Box>
            </Button>
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <Button
              variant="outlined"
              fullWidth
              startIcon={<HistoryIcon />}
              onClick={() => handleViewTableAudit('reminders', 'Reminders')}
              sx={{ justifyContent: 'flex-start', p: 2 }}
            >
              <Box>
                <Typography variant="subtitle2" fontWeight="bold">
                  Reminders
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  All reminder modifications
                </Typography>
              </Box>
            </Button>
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <Button
              variant="outlined"
              fullWidth
              startIcon={<HistoryIcon />}
              onClick={() => handleViewTableAudit('report_actions', 'Report Actions')}
              sx={{ justifyContent: 'flex-start', p: 2 }}
            >
              <Box>
                <Typography variant="subtitle2" fontWeight="bold">
                  Report Actions
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  All portfolio report actions
                </Typography>
              </Box>
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Audit Viewer */}
      <AuditViewer
        open={auditViewerOpen}
        onClose={() => setAuditViewerOpen(false)}
        initialFilters={auditFilters}
        title={auditTitle}
      />
    </Box>
  );
};