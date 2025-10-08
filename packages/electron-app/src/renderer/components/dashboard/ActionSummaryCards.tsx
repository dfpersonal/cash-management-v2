import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Stack,
  Chip,
  Divider,
} from '@mui/material';
import {
  Warning as WarningIcon,
  Schedule as ScheduleIcon,
  Security as SecurityIcon,
  ChevronRight as ChevronRightIcon,
  TrendingUp as TrendingUpIcon,
  NotificationImportant as UrgentIcon,
  EventNote as ReminderIcon,
  AccountBalance as MaturityIcon,
  Assignment as ReportIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

interface ActionSummary {
  urgent_actions: {
    overdue_count: number;
    urgent_count: number;
    notice_deadlines: number;
  };
  this_week: {
    maturities: number;
    rate_changes: number;
    notice_periods_ending: number;
    scheduled_reminders: number;
  };
  portfolio_health: {
    compliance_issues: number;
    optimization_opportunities: number;
    rebalancing_needs: number;
    pending_actions: number; // From action_items table
  };
}

interface ActionSummaryCardsProps {
  summary: ActionSummary;
  loading?: boolean;
}

export const ActionSummaryCards: React.FC<ActionSummaryCardsProps> = ({ summary, loading = false }) => {
  const navigate = useNavigate();

  const handleNavigateToCalendar = () => {
    navigate('/calendar');
  };

  const handleNavigateToReports = () => {
    navigate('/calendar?tab=reports');
  };

  // Calculate totals for each card
  const urgentTotal = summary.urgent_actions.overdue_count + summary.urgent_actions.urgent_count + summary.urgent_actions.notice_deadlines;
  const thisWeekTotal = summary.this_week.maturities + summary.this_week.rate_changes + summary.this_week.notice_periods_ending + summary.this_week.scheduled_reminders;
  const healthTotal = summary.portfolio_health.compliance_issues + summary.portfolio_health.optimization_opportunities + summary.portfolio_health.rebalancing_needs + summary.portfolio_health.pending_actions;

  // Determine card styling based on content
  const getUrgentCardStyle = () => {
    if (summary.urgent_actions.overdue_count > 0) {
      return {
        borderLeft: '4px solid #f44336',
        backgroundColor: 'rgba(244, 67, 54, 0.02)'
      };
    }
    if (urgentTotal > 0) {
      return {
        borderLeft: '4px solid #ff9800',
        backgroundColor: 'rgba(255, 152, 0, 0.02)'
      };
    }
    return {
      borderLeft: '4px solid #4caf50',
      backgroundColor: 'rgba(76, 175, 80, 0.02)'
    };
  };

  const getThisWeekCardStyle = () => {
    if (thisWeekTotal > 0) {
      return {
        borderLeft: '4px solid #2196f3',
        backgroundColor: 'rgba(33, 150, 243, 0.02)'
      };
    }
    return {
      borderLeft: '4px solid #4caf50',
      backgroundColor: 'rgba(76, 175, 80, 0.02)'
    };
  };

  const getHealthCardStyle = () => {
    if (summary.portfolio_health.compliance_issues > 0) {
      return {
        borderLeft: '4px solid #f44336',
        backgroundColor: 'rgba(244, 67, 54, 0.02)'
      };
    }
    if (healthTotal > 0) {
      return {
        borderLeft: '4px solid #ff9800',
        backgroundColor: 'rgba(255, 152, 0, 0.02)'
      };
    }
    return {
      borderLeft: '4px solid #4caf50',
      backgroundColor: 'rgba(76, 175, 80, 0.02)'
    };
  };

  if (loading) {
    return (
      <Box sx={{ opacity: 0.6 }}>
        <Typography variant="h6">Loading action summary...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
        Action Summary
      </Typography>
      
      <Box sx={{ 
        display: 'grid', 
        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, 
        gap: 3 
      }}>
        {/* Urgent Actions Card */}
        <Card sx={{ 
          minHeight: 280,
          display: 'flex',
          flexDirection: 'column',
          ...getUrgentCardStyle()
        }}>
          <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <UrgentIcon 
                  color={summary.urgent_actions.overdue_count > 0 ? 'error' : urgentTotal > 0 ? 'warning' : 'success'} 
                  sx={{ mr: 1 }} 
                />
                <Typography variant="h6" fontWeight={600}>
                  Urgent Actions
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={700} color={summary.urgent_actions.overdue_count > 0 ? 'error.main' : urgentTotal > 0 ? 'warning.main' : 'success.main'}>
                {urgentTotal}
              </Typography>
            </Box>

            <Box sx={{ flex: 1 }}>
              <Stack spacing={1} sx={{ mb: 2 }}>
              {summary.urgent_actions.overdue_count > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="error.main">
                    🚨 Overdue items
                  </Typography>
                  <Chip 
                    label={summary.urgent_actions.overdue_count} 
                    color="error" 
                    size="small" 
                  />
                </Box>
              )}
              {summary.urgent_actions.urgent_count > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="body2">
                    ⚠️ Urgent priority
                  </Typography>
                  <Chip 
                    label={summary.urgent_actions.urgent_count} 
                    color="warning" 
                    size="small" 
                  />
                </Box>
              )}
              {summary.urgent_actions.notice_deadlines > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="body2">
                    📢 Notice deadlines
                  </Typography>
                  <Chip 
                    label={summary.urgent_actions.notice_deadlines} 
                    color="warning" 
                    size="small" 
                  />
                </Box>
              )}
              {urgentTotal === 0 && (
                <Typography variant="body2" color="success.main" sx={{ textAlign: 'center', py: 1 }}>
                  ✅ All caught up!
                </Typography>
              )}
              </Stack>
            </Box>

            <Box>
              <Divider sx={{ mb: 2 }} />
              
              <Button
              fullWidth
              variant="outlined"
              color={summary.urgent_actions.overdue_count > 0 ? 'error' : urgentTotal > 0 ? 'warning' : 'success'}
              endIcon={<ChevronRightIcon />}
              onClick={handleNavigateToCalendar}
              disabled={urgentTotal === 0}
            >
              View Calendar
            </Button>
            </Box>
          </CardContent>
        </Card>

        {/* This Week Card */}
        <Card sx={{ 
          minHeight: 280,
          display: 'flex',
          flexDirection: 'column',
          ...getThisWeekCardStyle()
        }}>
          <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <ScheduleIcon 
                  color={thisWeekTotal > 0 ? 'primary' : 'success'} 
                  sx={{ mr: 1 }} 
                />
                <Typography variant="h6" fontWeight={600}>
                  This Week
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={700} color={thisWeekTotal > 0 ? 'primary.main' : 'success.main'}>
                {thisWeekTotal}
              </Typography>
            </Box>

            <Box sx={{ flex: 1 }}>
              <Stack spacing={1} sx={{ mb: 2 }}>
              {summary.this_week.maturities > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="body2">
                    📅 Maturities
                  </Typography>
                  <Chip 
                    label={summary.this_week.maturities} 
                    color="primary" 
                    size="small" 
                  />
                </Box>
              )}
              {summary.this_week.rate_changes > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="body2">
                    💰 Rate changes
                  </Typography>
                  <Chip 
                    label={summary.this_week.rate_changes} 
                    color="primary" 
                    size="small" 
                  />
                </Box>
              )}
              {summary.this_week.notice_periods_ending > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="body2">
                    🔔 Notice periods end
                  </Typography>
                  <Chip 
                    label={summary.this_week.notice_periods_ending} 
                    color="primary" 
                    size="small" 
                  />
                </Box>
              )}
              {summary.this_week.scheduled_reminders > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="body2">
                    ⏰ Scheduled reminders
                  </Typography>
                  <Chip 
                    label={summary.this_week.scheduled_reminders} 
                    color="primary" 
                    size="small" 
                  />
                </Box>
              )}
              {thisWeekTotal === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 1 }}>
                  📅 Quiet week ahead
                </Typography>
              )}
              </Stack>
            </Box>

            <Box>
              <Divider sx={{ mb: 2 }} />
              
              <Button
              fullWidth
              variant="outlined"
              color="primary"
              endIcon={<ChevronRightIcon />}
              onClick={handleNavigateToCalendar}
              disabled={thisWeekTotal === 0}
            >
              View Calendar
            </Button>
            </Box>
          </CardContent>
        </Card>

        {/* Portfolio Health Card */}
        <Card sx={{ 
          minHeight: 280,
          display: 'flex',
          flexDirection: 'column',
          ...getHealthCardStyle()
        }}>
          <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <SecurityIcon 
                  color={summary.portfolio_health.compliance_issues > 0 ? 'error' : healthTotal > 0 ? 'warning' : 'success'} 
                  sx={{ mr: 1 }} 
                />
                <Typography variant="h6" fontWeight={600}>
                  Portfolio Health
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={700} color={summary.portfolio_health.compliance_issues > 0 ? 'error.main' : healthTotal > 0 ? 'warning.main' : 'success.main'}>
                {healthTotal}
              </Typography>
            </Box>

            <Box sx={{ flex: 1 }}>
              <Stack spacing={1} sx={{ mb: 2 }}>
              {summary.portfolio_health.compliance_issues > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="error.main">
                    ⚠️ Compliance issues
                  </Typography>
                  <Chip 
                    label={summary.portfolio_health.compliance_issues} 
                    color="error" 
                    size="small" 
                  />
                </Box>
              )}
              {summary.portfolio_health.optimization_opportunities > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="body2">
                    📈 Optimization ops
                  </Typography>
                  <Chip 
                    label={summary.portfolio_health.optimization_opportunities} 
                    color="warning" 
                    size="small" 
                  />
                </Box>
              )}
              {summary.portfolio_health.rebalancing_needs > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="body2">
                    ⚖️ Rebalancing needs
                  </Typography>
                  <Chip 
                    label={summary.portfolio_health.rebalancing_needs} 
                    color="warning" 
                    size="small" 
                  />
                </Box>
              )}
              {summary.portfolio_health.pending_actions > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="body2">
                    📊 Pending actions
                  </Typography>
                  <Chip 
                    label={summary.portfolio_health.pending_actions} 
                    color="info" 
                    size="small" 
                  />
                </Box>
              )}
              {healthTotal === 0 && (
                <Typography variant="body2" color="success.main" sx={{ textAlign: 'center', py: 1 }}>
                  ✅ Portfolio healthy
                </Typography>
              )}
              </Stack>
            </Box>

            <Box>
              <Divider sx={{ mb: 2 }} />
              
              <Button
              fullWidth
              variant="outlined"
              color={summary.portfolio_health.compliance_issues > 0 ? 'error' : healthTotal > 0 ? 'warning' : 'success'}
              endIcon={<ChevronRightIcon />}
              onClick={handleNavigateToReports}
              disabled={healthTotal === 0}
            >
              View Reports
            </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
};