import React, { useState, useEffect } from 'react';
import {
  Box,
  IconButton,
  Badge,
  Popover,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Button,
  Chip,
  Stack,
  Tooltip,
} from '@mui/material';
import {
  Notifications as NotificationsIcon,
  Warning as WarningIcon,
  Schedule as ScheduleIcon,
  Security as SecurityIcon,
  Assignment as ReportIcon,
  RateReview as RateChangeIcon,
  EventNote as ReminderIcon,
  CheckCircle as CompleteIcon,
  Clear as ClearIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

interface NotificationItem {
  id: string;
  type: 'urgent' | 'reminder' | 'health' | 'activity';
  priority: 'error' | 'warning' | 'info' | 'success';
  title: string;
  description: string;
  timestamp: string;
  actionPath?: string;
  dismissible?: boolean;
}

interface NotificationCenterProps {
  refreshTrigger?: any; // To trigger refresh when app state changes
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ refreshTrigger }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const open = Boolean(anchorEl);

  // Load notifications
  const loadNotifications = async () => {
    try {
      setLoading(true);
      const dashboardData = await window.electronAPI.getDashboardNotifications();
      
      const notificationList: NotificationItem[] = [];
      
      // Add urgent/overdue actions
      dashboardData.urgent_actions.forEach((action: any, index: number) => {
        const isOverdue = action.days_until < 0;
        notificationList.push({
          id: `urgent-${index}`,
          type: 'urgent',
          priority: isOverdue ? 'error' : 'warning',
          title: action.title,
          description: isOverdue 
            ? `${Math.abs(action.days_until)} days overdue`
            : `${action.days_until} days remaining`,
          timestamp: action.due_date,
          actionPath: '/calendar',
          dismissible: false
        });
      });
      
      // Add portfolio health issues
      dashboardData.portfolio_health.forEach((issue: any, index: number) => {
        notificationList.push({
          id: `health-${index}`,
          type: 'health',
          priority: issue.priority.toLowerCase() === 'urgent' ? 'error' : 'warning',
          title: issue.title,
          description: issue.description,
          timestamp: new Date().toISOString().split('T')[0],
          actionPath: '/calendar?tab=reports',
          dismissible: true
        });
      });
      
      // Add upcoming this week (non-urgent)
      dashboardData.this_week
        .filter((action: any) => action.days_until >= 0 && !dashboardData.urgent_actions.some((urgent: any) => urgent.title === action.title))
        .slice(0, 3) // Limit to avoid overwhelming
        .forEach((action: any, index: number) => {
          notificationList.push({
            id: `upcoming-${index}`,
            type: 'reminder',
            priority: 'info',
            title: action.title,
            description: `Due ${action.days_until === 0 ? 'today' : `in ${action.days_until} day${action.days_until === 1 ? '' : 's'}`}`,
            timestamp: action.due_date,
            actionPath: '/calendar',
            dismissible: true
          });
        });
      
      // Add recent activity
      dashboardData.recent_activity.slice(0, 2).forEach((activity: any, index: number) => {
        notificationList.push({
          id: `activity-${index}`,
          type: 'activity',
          priority: 'success',
          title: activity.title,
          description: activity.description || 'Completed successfully',
          timestamp: activity.date,
          dismissible: true
        });
      });
      
      // Sort by priority and timestamp
      notificationList.sort((a, b) => {
        const priorityOrder = { error: 0, warning: 1, info: 2, success: 3 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
      
      setNotifications(notificationList);
      setUnreadCount(
        dashboardData.summary_counts.overdue_actions + 
        Math.min(dashboardData.summary_counts.urgent_actions, 5) + 
        Math.min(dashboardData.portfolio_health.length, 3)
      );
      
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, [refreshTrigger]);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
    if (!open) {
      loadNotifications(); // Refresh when opening
    }
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleNotificationClick = (notification: NotificationItem) => {
    if (notification.actionPath) {
      navigate(notification.actionPath);
      handleClose();
    }
  };

  const handleMarkAllRead = () => {
    setUnreadCount(0);
  };

  const getNotificationIcon = (type: string, priority: string) => {
    switch (type) {
      case 'urgent':
        return priority === 'error' ? <WarningIcon color="error" /> : <ScheduleIcon color="warning" />;
      case 'health':
        return <SecurityIcon color="warning" />;
      case 'reminder':
        return <ReminderIcon color="info" />;
      case 'activity':
        return <CompleteIcon color="success" />;
      default:
        return <NotificationsIcon />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    
    return date.toLocaleDateString('en-GB', { 
      day: 'numeric', 
      month: 'short' 
    });
  };

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton 
          color="inherit" 
          onClick={handleClick}
          sx={{ mr: 1 }}
        >
          <Badge badgeContent={unreadCount} color="error" max={99}>
            <NotificationsIcon />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'center',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'center',
        }}
        PaperProps={{
          sx: { 
            width: 400, 
            maxHeight: 600,
            mt: 1
          }
        }}
      >
        <Paper>
          {/* Header */}
          <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6">
                Notifications
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                {unreadCount > 0 && (
                  <Button 
                    size="small" 
                    onClick={handleMarkAllRead}
                    startIcon={<CompleteIcon />}
                  >
                    Mark Read
                  </Button>
                )}
                <Tooltip title="Notification Settings">
                  <IconButton size="small">
                    <SettingsIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
            
            {unreadCount > 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {unreadCount} unread notification{unreadCount === 1 ? '' : 's'}
              </Typography>
            )}
          </Box>

          {/* Notification List */}
          {loading ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">Loading notifications...</Typography>
            </Box>
          ) : notifications.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <CompleteIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
              <Typography color="text.secondary">No notifications</Typography>
              <Typography variant="body2" color="text.secondary">
                You're all caught up!
              </Typography>
            </Box>
          ) : (
            <List sx={{ maxHeight: 400, overflow: 'auto', p: 0 }}>
              {notifications.map((notification) => (
                <React.Fragment key={notification.id}>
                  <ListItem 
                    sx={{ 
                      px: 2, 
                      py: 1.5,
                      cursor: notification.actionPath ? 'pointer' : 'default',
                      '&:hover': notification.actionPath ? { backgroundColor: 'action.hover' } : {},
                      borderLeft: '4px solid',
                      borderColor: `${notification.priority}.main`,
                    }}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <ListItemIcon sx={{ minWidth: 40 }}>
                      {getNotificationIcon(notification.type, notification.priority)}
                    </ListItemIcon>
                    
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Typography variant="body2" fontWeight={500} noWrap>
                            {notification.title}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatTimestamp(notification.timestamp)}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Box sx={{ mt: 0.5 }}>
                          <Typography variant="caption" color="text.secondary" display="block">
                            {notification.description}
                          </Typography>
                          {notification.type === 'urgent' && (
                            <Chip
                              label={notification.priority === 'error' ? 'OVERDUE' : 'URGENT'}
                              color={notification.priority}
                              size="small"
                              sx={{ mt: 0.5, height: 20, fontSize: '0.625rem' }}
                            />
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                  <Divider />
                </React.Fragment>
              ))}
            </List>
          )}

          {/* Footer */}
          <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
            <Stack direction="row" spacing={1} justifyContent="center">
              <Button 
                size="small" 
                variant="outlined"
                onClick={() => {
                  navigate('/calendar');
                  handleClose();
                }}
              >
                View Calendar
              </Button>
              <Button 
                size="small" 
                variant="outlined"
                onClick={() => {
                  navigate('/calendar?tab=reports');
                  handleClose();
                }}
              >
                Portfolio Reports
              </Button>
            </Stack>
          </Box>
        </Paper>
      </Popover>
    </>
  );
};