import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  IconButton,
  Chip,
  Alert,
  LinearProgress,
  Badge,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  AccountBalance as HoldingsIcon,
  Settings as ConfigIcon,
  Refresh as RefreshIcon,
  Close as CloseIcon,
  CalendarToday as CalendarIcon,
  History as HistoryIcon,
  Update as BalanceUpdateIcon,
  Storage as DataIcon,
  TrendingUp as OptimizationIcon,
  Badge as FRNIcon,
} from '@mui/icons-material';
import { AppState } from '@cash-mgmt/shared';
import { NotificationCenter } from './notifications/NotificationCenter';

const drawerWidth = 280;

interface LayoutProps {
  children: React.ReactNode;
  appState: AppState;
  onRefresh: () => void;
  onClearError: () => void;
}

const navigationItems = [
  {
    path: '/dashboard',
    label: 'Portfolio Dashboard',
    icon: <DashboardIcon />,
    description: 'Overview and health metrics',
  },
  {
    path: '/management',
    label: 'Portfolio Management',
    icon: <HoldingsIcon />,
    description: 'Add, edit, and manage deposits',
  },
  {
    path: '/optimization',
    label: 'Optimization',
    icon: <OptimizationIcon />,
    description: 'FSCS compliance and rate optimization',
  },
  {
    path: '/calendar',
    label: 'Calendar & Reminders',
    icon: <CalendarIcon />,
    description: 'Track maturities and important dates',
  },
  {
    path: '/balance-checker',
    label: 'Balance Checker',
    icon: <BalanceUpdateIcon />,
    description: 'Update deposit balances systematically',
  },
  {
    path: '/data-collection',
    label: 'Data Collection',
    icon: <DataIcon />,
    description: 'Automated data scraping and monitoring',
  },
  {
    path: '/frn-management',
    label: 'FRN Management',
    icon: <FRNIcon />,
    description: 'Manage Firm Reference Numbers',
  },
  {
    path: '/audit',
    label: 'Audit Trail',
    icon: <HistoryIcon />,
    description: 'View detailed audit logs and change history',
  },
  {
    path: '/configuration',
    label: 'Configuration',
    icon: <ConfigIcon />,
    description: 'Settings and preferences',
  },
];

export const Layout: React.FC<LayoutProps> = ({
  children,
  appState,
  onRefresh,
  onClearError,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [notificationCounts, setNotificationCounts] = useState<{
    urgent_actions: number;
    pending_reports: number;
    overdue_actions: number;
    overdue_balance_checks: number;
  }>({ urgent_actions: 0, pending_reports: 0, overdue_actions: 0, overdue_balance_checks: 0 });

  // Load notification counts
  useEffect(() => {
    const loadNotificationCounts = async () => {
      try {
        const [notifications, overdueBalanceCount] = await Promise.all([
          window.electronAPI.getDashboardNotifications(),
          window.electronAPI.getOverdueDepositsCount()
        ]);
        
        setNotificationCounts({
          urgent_actions: notifications.summary_counts.urgent_actions + notifications.summary_counts.overdue_actions,
          pending_reports: notifications.summary_counts.pending_reports,
          overdue_actions: notifications.summary_counts.overdue_actions,
          overdue_balance_checks: overdueBalanceCount
        });
      } catch (error) {
        console.error('Failed to load notification counts:', error);
      }
    };

    loadNotificationCounts();
  }, [appState.lastRefresh]);

  const handleNavigation = (path: string) => {
    navigate(path);
  };

  const formatLastRefresh = (date: Date | null) => {
    if (!date) return 'Never';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    return date.toLocaleDateString();
  };

  const getBadgeCount = (path: string): number => {
    switch (path) {
      case '/calendar':
        return notificationCounts.urgent_actions;
      case '/dashboard':
        return notificationCounts.overdue_actions;
      case '/balance-checker':
        return notificationCounts.overdue_balance_checks;
      default:
        return 0;
    }
  };

  const getBadgeColor = (path: string): 'error' | 'warning' | 'primary' => {
    switch (path) {
      case '/calendar':
        return notificationCounts.overdue_actions > 0 ? 'error' : 'warning';
      case '/dashboard':
        return 'error';
      case '/balance-checker':
        return notificationCounts.overdue_balance_checks > 0 ? 'error' : 'primary';
      default:
        return 'primary';
    }
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      {/* App Bar */}
      <AppBar
        position="fixed"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          bgcolor: 'primary.main',
          WebkitAppRegion: 'drag',
          height: '40px', // Even thinner for sleek appearance
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <Toolbar 
          sx={{ 
            minHeight: '40px !important',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            paddingTop: 0,
            paddingBottom: 0,
            paddingLeft: '70px', // Space for traffic lights
            paddingRight: '20px',
          }}
        >
          <Typography 
            variant="h6" 
            noWrap 
            component="div" 
            sx={{ 
              flexGrow: 1,
              fontWeight: 500,
              letterSpacing: '0.02em',
              fontSize: '0.95rem', // Slightly smaller for the thinner bar
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
            }}
          >
            Cash Management Desktop
          </Typography>
          
          {appState.lastRefresh && (
            <Chip
              label={`Updated: ${formatLastRefresh(appState.lastRefresh)}`}
              size="small"
              variant="outlined"
              sx={{ 
                color: 'white', 
                borderColor: 'rgba(255, 255, 255, 0.3)',
                WebkitAppRegion: 'no-drag',
                height: '22px', // Even smaller for thinner bar
                fontSize: '0.7rem', // Smaller text
                position: 'absolute',
                right: '55px', // Adjusted position
              }}
            />
          )}
          
          <Box sx={{ 
            position: 'absolute',
            right: '15px',
            display: 'flex',
            alignItems: 'center',
            WebkitAppRegion: 'no-drag'
          }}>
            <NotificationCenter refreshTrigger={appState.lastRefresh} />
            
            <IconButton
              color="inherit"
              onClick={onRefresh}
              disabled={appState.isLoading}
              title="Refresh Data"
              sx={{ 
                padding: '4px', // Smaller padding for thinner bar
                '& .MuiSvgIcon-root': {
                  fontSize: '1.2rem', // Smaller icon
                },
              }}
            >
              <RefreshIcon />
            </IconButton>
          </Box>
        </Toolbar>
        
        {appState.isLoading && (
          <LinearProgress sx={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} />
        )}
      </AppBar>

      {/* Navigation Drawer */}
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: drawerWidth,
            boxSizing: 'border-box',
            borderRight: '1px solid rgba(0, 0, 0, 0.12)',
            paddingTop: '40px', // Match the thinner AppBar height
          },
        }}
      >
        <Box sx={{ overflow: 'auto', pt: 2 }}>
          <List>
            {navigationItems.map((item) => (
              <ListItem key={item.path} disablePadding sx={{ mb: 1 }}>
                <ListItemButton
                  selected={location.pathname === item.path}
                  onClick={() => handleNavigation(item.path)}
                  data-testid={item.path === '/management' ? 'nav-portfolio' : undefined}
                  sx={{
                    mx: 1,
                    borderRadius: 1,
                    '&.Mui-selected': {
                      bgcolor: 'primary.light',
                      color: 'white',
                      '&:hover': {
                        bgcolor: 'primary.main',
                      },
                    },
                  }}
                >
                  <ListItemIcon sx={{ 
                    color: location.pathname === item.path ? 'white' : 'inherit',
                    minWidth: 40 
                  }}>
                    <Badge 
                      badgeContent={getBadgeCount(item.path)}
                      color={getBadgeColor(item.path)}
                      max={99}
                      invisible={getBadgeCount(item.path) === 0}
                    >
                      {item.icon}
                    </Badge>
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    secondary={item.description}
                    secondaryTypographyProps={{
                      variant: 'caption',
                      color: location.pathname === item.path ? 'rgba(255, 255, 255, 0.7)' : 'text.secondary',
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>

        {/* Status Section */}
        <Box sx={{ mt: 'auto', p: 2, borderTop: '1px solid rgba(0, 0, 0, 0.12)' }}>
          {appState.error && (
            <Alert
              severity="error"
              action={
                <IconButton
                  aria-label="close"
                  color="inherit"
                  size="small"
                  onClick={onClearError}
                >
                  <CloseIcon fontSize="inherit" />
                </IconButton>
              }
              sx={{ mb: 1 }}
            >
              Connection Error
            </Alert>
          )}
          
          <Typography variant="caption" color="text.secondary" display="block">
            Portfolio Management System
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            Version 1.0.0
          </Typography>
        </Box>
      </Drawer>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          overflow: 'auto',
          bgcolor: 'background.default',
          paddingTop: '43px', // Account for thinner AppBar height (40px + 3px padding)
        }}
      >
        {children}
      </Box>
    </Box>
  );
};