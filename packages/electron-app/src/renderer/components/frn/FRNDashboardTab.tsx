import React, { useEffect, useState } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  Chip,
  LinearProgress,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Search as SearchIcon,
  Edit as EditIcon,
} from '@mui/icons-material';

interface Statistics {
  totalFRNs: number;
  totalOverrides: number;
  pendingResearch: number;
  completedResearch: number;
  coveragePercentage: number;
  recentActivity: number;
}

interface ActivityItem {
  type: 'override' | 'research_completed';
  entity_name: string;
  frn: string;
  firm_name: string;
  activity_date: string;
  notes: string;
}

const FRNDashboardTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [stats, activity] = await Promise.all([
        window.electronAPI.getFRNStatistics(),
        window.electronAPI.getFRNRecentActivity(10)
      ]);

      setStatistics(stats);
      setRecentActivity(activity || []);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!statistics) {
    return <Alert severity="warning">No data available</Alert>;
  }

  return (
    <Box sx={{ p: 2 }}>
      <Grid container spacing={3}>
        {/* Statistics Cards */}
        <Grid item xs={12} md={6} lg={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom variant="body2">
                Total FRNs
              </Typography>
              <Typography variant="h4">
                {statistics.totalFRNs}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Unique FRNs in system
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6} lg={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom variant="body2">
                Manual Overrides
              </Typography>
              <Typography variant="h4">
                {statistics.totalOverrides}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Custom mappings
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6} lg={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom variant="body2">
                Coverage
              </Typography>
              <Typography variant="h4">
                {statistics.coveragePercentage}%
              </Typography>
              <LinearProgress 
                variant="determinate" 
                value={statistics.coveragePercentage} 
                sx={{ mt: 1 }}
                color={statistics.coveragePercentage >= 90 ? 'success' : 
                       statistics.coveragePercentage >= 70 ? 'warning' : 'error'}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6} lg={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom variant="body2">
                Pending Research
              </Typography>
              <Typography variant="h4" color={statistics.pendingResearch > 0 ? 'warning.main' : 'success.main'}>
                {statistics.pendingResearch}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Banks needing FRNs
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Recent Activity */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recent Activity
              </Typography>
              {recentActivity.length === 0 ? (
                <Typography color="text.secondary">No recent activity</Typography>
              ) : (
                <List>
                  {recentActivity.map((item, index) => (
                    <ListItem key={index} divider={index < recentActivity.length - 1}>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {item.type === 'override' ? (
                              <EditIcon fontSize="small" color="primary" />
                            ) : (
                              <CheckCircleIcon fontSize="small" color="success" />
                            )}
                            <Typography component="span">
                              {item.entity_name}
                            </Typography>
                            {item.frn && (
                              <Chip 
                                label={`FRN: ${item.frn}`} 
                                size="small"
                                variant="outlined"
                              />
                            )}
                          </Box>
                        }
                        secondary={
                          <Box>
                            <Typography variant="body2" color="text.secondary">
                              {item.firm_name}
                              {item.notes && ` - ${item.notes}`}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {new Date(item.activity_date).toLocaleDateString()}
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Summary Card */}
        <Grid item xs={12}>
          <Card sx={{ bgcolor: 'background.default' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Summary
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CheckCircleIcon color="success" />
                    <Typography>
                      {statistics.completedResearch} research items completed
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {statistics.pendingResearch > 0 ? (
                      <>
                        <WarningIcon color="warning" />
                        <Typography>
                          {statistics.pendingResearch} items pending research
                        </Typography>
                      </>
                    ) : (
                      <>
                        <CheckCircleIcon color="success" />
                        <Typography>All research completed</Typography>
                      </>
                    )}
                  </Box>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <SearchIcon color="action" />
                    <Typography>
                      {statistics.recentActivity} updates in last 7 days
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default FRNDashboardTab;