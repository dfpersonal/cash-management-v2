import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Divider,
  Badge,
  Stack,
  Button,
} from '@mui/material';
import {
  Warning as WarningIcon,
  Schedule as ScheduleIcon,
  Security as SecurityIcon,
  History as HistoryIcon,
  ChevronRight as ChevronRightIcon,
  Assignment as ReportIcon,
  RateReview as RateChangeIcon,
  EventNote as ReminderIcon,
  CheckCircle as CompleteIcon,
  FileUpload as ImportIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

interface DashboardNotifications {
  urgent_actions: Array<{
    type: string;
    title: string;
    due_date: string;
    days_until: number;
    priority: string;
    bank?: string;
  }>;
  this_week: Array<{
    type: string;
    title: string;
    due_date: string;
    days_until: number;
    amount?: number;
    bank?: string;
  }>;
  portfolio_health: Array<{
    type: string;
    title: string;
    description: string;
    priority: string;
    amount_affected?: number;
  }>;
  recent_activity: Array<{
    type: string;
    title: string;
    date: string;
    description?: string;
  }>;
  summary_counts: {
    overdue_actions: number;
    urgent_actions: number;
    this_week_actions: number;
    pending_reports: number;
  };
}

interface NotificationCardsProps {
  notifications: DashboardNotifications;
  loading?: boolean;
}

export const NotificationCards: React.FC<NotificationCardsProps> = ({ notifications, loading = false }) => {
  const navigate = useNavigate();

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    });
  };

  const formatCurrency = (amount: number | null | undefined): string => {
    if (!amount) return '';
    return `£${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'rate_change_reminder':
      case 'rate_change_effective':
        return <RateChangeIcon />;
      case 'report_action':
        return <ReportIcon />;
      case 'maturity':
        return <ScheduleIcon />;
      case 'completed':
        return <CompleteIcon />;
      case 'report_import':
        return <ImportIcon />;
      default:
        return <ReminderIcon />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'urgent': return 'error';
      case 'high': return 'warning';
      case 'medium': return 'info';
      case 'low': return 'default';
      default: return 'default';
    }
  };

  const handleNavigateToCalendar = () => {
    navigate('/calendar');
  };

  const handleNavigateToReports = () => {
    navigate('/calendar?tab=reports');
  };

  if (loading) {
    return (
      <Box sx={{ opacity: 0.6 }}>
        <Typography variant="h6">Loading notifications...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">
          Action Center
        </Typography>
        <Button
          variant="outlined"
          endIcon={<ChevronRightIcon />}
          onClick={handleNavigateToCalendar}
        >
          View Calendar
        </Button>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr 1fr' }, gap: 3 }}>
        {/* Urgent Actions Card */}
        <Card sx={{ 
          height: 'fit-content',
          border: notifications.summary_counts.overdue_actions > 0 ? '2px solid' : undefined,
          borderColor: 'error.main',
          backgroundColor: notifications.summary_counts.overdue_actions > 0 ? 'error.light' : undefined,
          opacity: notifications.summary_counts.overdue_actions > 0 ? 0.95 : 1
        }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Badge
                  badgeContent={notifications.summary_counts.overdue_actions + notifications.summary_counts.urgent_actions}
                  color="error"
                  sx={{ mr: 1 }}
                >
                  <WarningIcon color="error" />
                </Badge>
                <Typography variant="h6">
                  Urgent Actions
                </Typography>
              </Box>
              <IconButton size="small" onClick={handleNavigateToCalendar}>
                <ChevronRightIcon />
              </IconButton>
            </Box>

            {notifications.urgent_actions.length > 0 ? (
              <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
                {notifications.urgent_actions.slice(0, 5).map((action, index) => (
                  <ListItem key={index} sx={{ px: 0 }}>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      {getActionIcon(action.type)}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Typography variant="body2" noWrap>
                            {action.title}
                          </Typography>
                          <Chip
                            label={action.days_until < 0 ? `${Math.abs(action.days_until)}d overdue` : `${action.days_until}d left`}
                            color={action.days_until < 0 ? 'error' : 'warning'}
                            size="small"
                          />
                        </Box>
                      }
                      secondary={action.bank && `${action.bank} • ${formatDate(action.due_date)}`}
                    />
                  </ListItem>
                ))}
                {notifications.urgent_actions.length > 5 && (
                  <ListItem>
                    <ListItemText
                      secondary={`+${notifications.urgent_actions.length - 5} more actions`}
                    />
                  </ListItem>
                )}
              </List>
            ) : (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <CompleteIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  No urgent actions
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>

        {/* This Week Card */}
        <Card sx={{ height: 'fit-content' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Badge
                  badgeContent={notifications.summary_counts.this_week_actions}
                  color="primary"
                  sx={{ mr: 1 }}
                >
                  <ScheduleIcon color="primary" />
                </Badge>
                <Typography variant="h6">
                  This Week
                </Typography>
              </Box>
              <IconButton size="small" onClick={handleNavigateToCalendar}>
                <ChevronRightIcon />
              </IconButton>
            </Box>

            {notifications.this_week.length > 0 ? (
              <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
                {notifications.this_week.slice(0, 5).map((action, index) => (
                  <ListItem key={index} sx={{ px: 0 }}>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      {getActionIcon(action.type)}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Typography variant="body2" noWrap>
                            {action.title}
                          </Typography>
                          <Chip
                            label={action.days_until === 0 ? 'Today' : `${action.days_until}d`}
                            color={action.days_until <= 1 ? 'warning' : 'default'}
                            size="small"
                          />
                        </Box>
                      }
                      secondary={
                        <Box>
                          {action.bank && `${action.bank}`}
                          {action.amount && ` • ${formatCurrency(action.amount)}`}
                          {` • ${formatDate(action.due_date)}`}
                        </Box>
                      }
                    />
                  </ListItem>
                ))}
                {notifications.this_week.length > 5 && (
                  <ListItem>
                    <ListItemText
                      secondary={`+${notifications.this_week.length - 5} more this week`}
                    />
                  </ListItem>
                )}
              </List>
            ) : (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  No actions this week
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Portfolio Health Card */}
        <Card sx={{ height: 'fit-content' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Badge
                  badgeContent={notifications.portfolio_health.length}
                  color="warning"
                  sx={{ mr: 1 }}
                >
                  <SecurityIcon color="warning" />
                </Badge>
                <Typography variant="h6">
                  Portfolio Health
                </Typography>
              </Box>
              <IconButton size="small" onClick={handleNavigateToReports}>
                <ChevronRightIcon />
              </IconButton>
            </Box>

            {notifications.portfolio_health.length > 0 ? (
              <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
                {notifications.portfolio_health.slice(0, 4).map((issue, index) => (
                  <ListItem key={index} sx={{ px: 0 }}>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <SecurityIcon color="warning" />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Typography variant="body2" noWrap>
                            {issue.title}
                          </Typography>
                          <Chip
                            label={issue.priority}
                            color={getPriorityColor(issue.priority)}
                            size="small"
                          />
                        </Box>
                      }
                      secondary={
                        <Box>
                          <Typography variant="caption" display="block">
                            {issue.description}
                          </Typography>
                          {issue.amount_affected && (
                            <Typography variant="caption" color="warning.main">
                              {formatCurrency(issue.amount_affected)} affected
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                ))}
                {notifications.portfolio_health.length > 4 && (
                  <ListItem>
                    <ListItemText
                      secondary={`+${notifications.portfolio_health.length - 4} more issues`}
                    />
                  </ListItem>
                )}
              </List>
            ) : (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <CompleteIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  Portfolio healthy
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity Card */}
        <Card sx={{ height: 'fit-content' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <HistoryIcon color="action" sx={{ mr: 1 }} />
                <Typography variant="h6">
                  Recent Activity
                </Typography>
              </Box>
            </Box>

            {notifications.recent_activity.length > 0 ? (
              <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
                {notifications.recent_activity.slice(0, 6).map((activity, index) => (
                  <ListItem key={index} sx={{ px: 0 }}>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      {getActionIcon(activity.type)}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography variant="body2">
                          {activity.title}
                        </Typography>
                      }
                      secondary={
                        <Box>
                          {activity.description && (
                            <Typography variant="caption" display="block" noWrap>
                              {activity.description}
                            </Typography>
                          )}
                          <Typography variant="caption" color="text.secondary">
                            {formatDate(activity.date)}
                          </Typography>
                        </Box>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  No recent activity
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
};