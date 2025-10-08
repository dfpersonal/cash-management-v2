import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
  Chip,
  IconButton,
  Tooltip,
  Tabs,
  Tab,
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  AccountBalance,
  Security,
  Warning,
  InfoOutlined,
  CheckCircle,
  SwapHoriz,
  Dashboard as DashboardIcon,
  PieChart as PieChartIcon,
  Timeline as TimelineIcon,
} from '@mui/icons-material';
import { PieChart } from '@mui/x-charts/PieChart';
import { BarChart } from '@mui/x-charts/BarChart';
import { PortfolioSummary, AllocationAnalysis, AppState } from '@cash-mgmt/shared';
import { ActionSummaryCards } from '../components/dashboard/ActionSummaryCards';
import { IncomeHistoryChart } from '../components/IncomeHistoryChart';

interface DashboardProps {
  appState: AppState;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export const Dashboard: React.FC<DashboardProps> = ({ appState }) => {
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummary | null>(null);
  const [allocationData, setAllocationData] = useState<AllocationAnalysis[]>([]);
  const [projectedAllocationData, setProjectedAllocationData] = useState<AllocationAnalysis[]>([]);
  const [actionSummary, setActionSummary] = useState<any>(null);
  const [hasPendingMoves, setHasPendingMoves] = useState(false);
  const [pendingMovesSummary, setPendingMovesSummary] = useState<{
    totalValue: number;
    moveCount: number;
    avgMoveSize: number;
    externalValue: number;
    externalCount: number;
    internalValue: number;
    internalCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    const loadDashboardData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Check and capture income snapshot if needed (based on audit trail)
        try {
          const snapshotResult = await window.electronAPI.checkAndCaptureSnapshot();
          if (snapshotResult?.captured) {
            console.log('Income snapshot captured:', snapshotResult.reason);
          }
        } catch (snapshotError) {
          console.warn('Snapshot check failed, continuing with dashboard load:', snapshotError);
          // Don't fail the entire dashboard load if snapshot check fails
        }

        // Check for pending moves first
        const hasPending = await window.electronAPI.hasPendingDeposits();
        setHasPendingMoves(hasPending);
        
        // Load dashboard data in parallel
        const promises = [
          window.electronAPI.getPortfolioSummary(),
          window.electronAPI.getAllocationAnalysis(),
          window.electronAPI.getDashboardActionSummary(),
        ];
        
        // Add projected allocation if there are pending moves
        if (hasPending) {
          promises.push(window.electronAPI.getProjectedAllocationAnalysis());
          promises.push(window.electronAPI.getPendingMovesSummary());
        }
        
        const results = await Promise.all(promises);
        
        setPortfolioSummary(results[0]);
        setAllocationData(results[1]);
        setActionSummary(results[2]);
        
        if (hasPending && results[3]) {
          setProjectedAllocationData(results[3]);
        }
        if (hasPending && results[4]) {
          setPendingMovesSummary(results[4]);
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
        setError('Failed to load portfolio data. Please check your database connection.');
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, [appState.lastRefresh]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="400px">
        <CircularProgress size={60} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 3 }}>
        {error}
      </Alert>
    );
  }

  if (!portfolioSummary) {
    return (
      <Alert severity="warning" sx={{ mb: 3 }}>
        No portfolio data available.
      </Alert>
    );
  }

  // Helper function to create chart data with value-first labels
  // Data should already be sorted by tier_order from the database
  const createChartData = (data: AllocationAnalysis[]) => {
    return data.map((tier, index) => ({
      name: tier.tierShortName || tier.tierDescription,
      fullName: tier.tierDescription,
      value: tier.currentBalance,
      percentage: tier.currentPercentage,
      target: tier.targetPercentage,
      color: COLORS[index % COLORS.length],
      liquidityTier: tier.liquidityTier,
    }));
  };

  // Prepare allocation chart data
  const allocationChartData = createChartData(allocationData);
  const projectedChartData = hasPendingMoves ? createChartData(projectedAllocationData) : [];

  // Create combined data for bar chart when there are pending moves
  const combinedChartData = hasPendingMoves && projectedChartData.length > 0 
    ? allocationChartData.map(currentTier => {
        const projectedTier = projectedChartData.find(p => p.liquidityTier === currentTier.liquidityTier);
        return {
          ...currentTier,
          projectedPercentage: projectedTier ? projectedTier.percentage : currentTier.percentage
        };
      })
    : allocationChartData;

  // Format currency helper
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Calculate portfolio health score (simplified)
  const calculateHealthScore = () => {
    const rateScore = Math.min(30, (portfolioSummary.weightedAverageRate - 2.0) * 10);
    const liquidityScore = Math.min(20, portfolioSummary.liquidityPercentage);
    const allocationScore = allocationData.filter(tier => 
      Math.abs(tier.allocationGap) <= 5
    ).length * 5;
    
    return Math.round(rateScore + liquidityScore + allocationScore);
  };

  const healthScore = calculateHealthScore();
  const getHealthStatus = (score: number) => {
    if (score >= 80) return { label: 'Excellent', color: 'success' };
    if (score >= 65) return { label: 'Good', color: 'primary' };
    if (score >= 50) return { label: 'Fair', color: 'warning' };
    return { label: 'Poor', color: 'error' };
  };

  const healthStatus = getHealthStatus(healthScore);

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Portfolio Dashboard
      </Typography>

      <Tabs 
        value={activeTab} 
        onChange={handleTabChange} 
        variant="fullWidth"
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab icon={<DashboardIcon />} label="Overview" />
        <Tab icon={<PieChartIcon />} label="Allocation" />
        <Tab icon={<TimelineIcon />} label="Trends" />
      </Tabs>

      {/* Overview Tab */}
      {activeTab === 0 && (
        <Box>
          {/* Action Summary Cards */}
          {actionSummary && (
            <ActionSummaryCards 
              summary={actionSummary} 
              loading={loading}
            />
          )}
          
          {/* Current Portfolio Cards (Row 1) */}
          <Typography variant="h6" sx={{ mb: 2, mt: 3, color: 'primary.main' }}>
            Current Portfolio
          </Typography>
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ height: 140, borderLeft: '4px solid', borderLeftColor: 'primary.main' }}>
                <CardContent>
                  <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Box>
                      <Typography color="textSecondary" gutterBottom variant="body2">
                        Total Portfolio Value
                      </Typography>
                      <Typography variant="h5">
                        {formatCurrency(portfolioSummary.totalValue)}
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        {portfolioSummary.totalAccounts} accounts
                      </Typography>
                    </Box>
                    <AccountBalance color="primary" fontSize="large" />
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ height: 140, borderLeft: '4px solid', borderLeftColor: 'primary.main' }}>
                <CardContent>
                  <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Box>
                      <Typography color="textSecondary" gutterBottom variant="body2">
                        Weighted Average Rate
                      </Typography>
                      <Typography variant="h5">
                        {formatPercentage(portfolioSummary.weightedAverageRate)}
                      </Typography>
                      <Box display="flex" alignItems="center" mt={1}>
                        {portfolioSummary.weightedAverageRate >= 4.0 ? (
                          <TrendingUp color="success" fontSize="small" />
                        ) : (
                          <TrendingDown color="error" fontSize="small" />
                        )}
                        <Typography variant="body2" color="textSecondary" ml={0.5}>
                          vs 4.0% target
                        </Typography>
                      </Box>
                    </Box>
                    <TrendingUp color={portfolioSummary.weightedAverageRate >= 4.0 ? 'success' : 'error'} fontSize="large" />
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ height: 140, borderLeft: '4px solid', borderLeftColor: 'primary.main' }}>
                <CardContent>
                  <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Box>
                      <Typography color="textSecondary" gutterBottom variant="body2">
                        Annual Income
                      </Typography>
                      <Typography variant="h5">
                        {formatCurrency(portfolioSummary.annualIncome)}
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        Current deposits
                      </Typography>
                    </Box>
                    <TrendingUp color="primary" fontSize="large" />
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ height: 140, borderLeft: '4px solid', borderLeftColor: 'primary.main' }}>
                <CardContent>
                  <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Box>
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <Typography color="textSecondary" gutterBottom variant="body2">
                          Portfolio Health
                        </Typography>
                        <Tooltip title="Health score combines rate performance (0-30 pts), liquidity percentage (0-20 pts), and allocation compliance (5 pts per tier within target). Higher scores indicate better portfolio optimization.">
                          <IconButton size="small" sx={{ p: 0.25 }}>
                            <InfoOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                      <Box display="flex" alignItems="center">
                        <Typography variant="h5" mr={1}>
                          {healthScore}/100
                        </Typography>
                        <Chip 
                          label={healthStatus.label} 
                          color={healthStatus.color as any}
                          size="small"
                        />
                      </Box>
                      <Typography variant="body2" color="textSecondary">
                        Current status
                      </Typography>
                    </Box>
                    <Security color="primary" fontSize="large" />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Projected Portfolio Cards (Row 2) */}
          {portfolioSummary.pendingDepositCount > 0 && (
            <>
              <Typography variant="h6" sx={{ mb: 2, mt: 3, color: 'warning.main' }}>
                Projected Portfolio (After Pending Moves)
              </Typography>
              <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6} md={3}>
                  <Card sx={{ height: 140, borderLeft: '4px solid', borderLeftColor: 'warning.main' }}>
                    <CardContent>
                      <Box display="flex" alignItems="center" justifyContent="space-between">
                        <Box>
                          <Typography color="textSecondary" gutterBottom variant="body2">
                            Projected Portfolio Value
                          </Typography>
                          <Typography variant="h5">
                            {formatCurrency(portfolioSummary.projectedTotalValue)}
                          </Typography>
                          {pendingMovesSummary && (
                            <>
                              {pendingMovesSummary.externalCount > 0 && (
                                <Typography variant="body2" color="success.main">
                                  +{formatCurrency(pendingMovesSummary.externalValue)} new ({pendingMovesSummary.externalCount} deposits)
                                </Typography>
                              )}
                              {pendingMovesSummary.internalCount > 0 && (
                                <Typography variant="body2" color="info.main">
                                  {formatCurrency(pendingMovesSummary.internalValue)} transfers ({pendingMovesSummary.internalCount} moves)
                                </Typography>
                              )}
                            </>
                          )}
                        </Box>
                        <AccountBalance color="warning" fontSize="large" />
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <Card sx={{ height: 140, borderLeft: '4px solid', borderLeftColor: 'warning.main' }}>
                    <CardContent>
                      <Box display="flex" alignItems="center" justifyContent="space-between">
                        <Box>
                          <Typography color="textSecondary" gutterBottom variant="body2">
                            Projected Weighted Rate
                          </Typography>
                          <Typography variant="h5">
                            {formatPercentage(portfolioSummary.projectedWeightedAverageRate)}
                          </Typography>
                          <Typography variant="body2" color={portfolioSummary.projectedWeightedAverageRate > portfolioSummary.weightedAverageRate ? 'success.main' : 'error.main'}>
                            {portfolioSummary.projectedWeightedAverageRate > portfolioSummary.weightedAverageRate ? '+' : ''}{formatPercentage(portfolioSummary.projectedWeightedAverageRate - portfolioSummary.weightedAverageRate)} change
                          </Typography>
                        </Box>
                        <TrendingUp color={portfolioSummary.projectedWeightedAverageRate >= 4.0 ? 'success' : 'error'} fontSize="large" />
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <Card sx={{ height: 140, borderLeft: '4px solid', borderLeftColor: 'warning.main' }}>
                    <CardContent>
                      <Box display="flex" alignItems="center" justifyContent="space-between">
                        <Box>
                          <Typography color="textSecondary" gutterBottom variant="body2">
                            Projected Annual Income
                          </Typography>
                          <Typography variant="h5">
                            {formatCurrency(portfolioSummary.projectedAnnualIncome)}
                          </Typography>
                          <Typography variant="body2" color="success.main">
                            +{formatCurrency(portfolioSummary.projectedAnnualIncome - portfolioSummary.annualIncome)} increase
                          </Typography>
                        </Box>
                        <TrendingUp color="success" fontSize="large" />
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <Card sx={{ height: 140, borderLeft: '4px solid', borderLeftColor: 'warning.main' }}>
                    <CardContent>
                      <Box display="flex" alignItems="center" justifyContent="space-between">
                        <Box>
                          <Typography color="textSecondary" gutterBottom variant="body2">
                            Projected Portfolio Health
                          </Typography>
                          <Typography variant="h5">
                            TBD/100
                          </Typography>
                          <Typography variant="body2" color="textSecondary">
                            Estimated improvement
                          </Typography>
                        </Box>
                        <Security color="warning" fontSize="large" />
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </>
          )}
        </Box>
      )}

      {/* Allocation Tab */}
      {activeTab === 1 && (
        <Box>
          <Grid container spacing={3}>

        {/* Strategic Allocation Charts */}
        <Grid item xs={12} md={hasPendingMoves ? 12 : 6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                <Typography variant="h6">
                  {hasPendingMoves ? 'Current vs Projected Allocation' : 'Strategic Allocation'}
                </Typography>
                <Tooltip title={hasPendingMoves ? 'Compare current allocation with projected allocation after pending moves' : 'Current allocation vs strategic targets'}>
                  <IconButton size="small">
                    <InfoOutlined fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
              
              <Box display="flex" flexDirection={hasPendingMoves ? 'row' : 'column'} gap={2} justifyContent="center">
                {/* Current Allocation Chart */}
                <Box flex={1} display="flex" flexDirection="column" alignItems="center">
                  <Typography variant="subtitle1" align="center" gutterBottom>
                    {hasPendingMoves ? 'Current Portfolio' : 'Current Allocation'}
                  </Typography>
                  <PieChart
                    series={[
                      {
                        data: allocationChartData.map((item, index) => ({
                          id: index,
                          value: item.value,
                          label: `${item.name}: ${formatCurrency(item.value)} (${item.percentage.toFixed(1)}%)`,
                          color: item.color,
                        })),
                        highlightScope: { faded: 'global', highlighted: 'item' },
                        faded: { innerRadius: 30, additionalRadius: -30, color: 'gray' },
                        cx: hasPendingMoves ? 140 : 175,
                        cy: 200,
                        outerRadius: 100,
                      },
                    ]}
                    width={hasPendingMoves ? 550 : 650}
                    height={400}
                    slotProps={{
                      legend: {
                        direction: 'column',
                        position: { vertical: 'middle', horizontal: 'right' },
                        padding: 10,
                        itemMarkWidth: 8,
                        itemMarkHeight: 8,
                        markGap: 5,
                        itemGap: 8,
                        labelStyle: {
                          fontSize: '14px',
                          fontFamily: 'inherit',
                          fontWeight: 400,
                          lineHeight: 1.2,
                        },
                      },
                    }}
                  />
                </Box>

                {/* Projected Allocation Chart (only if pending moves exist) */}
                {hasPendingMoves && (
                  <Box flex={1} display="flex" flexDirection="column" alignItems="center">
                    <Typography variant="subtitle1" align="center" gutterBottom>
                      After Pending Moves
                    </Typography>
                    <PieChart
                      series={[
                        {
                          data: projectedChartData.map((item, index) => ({
                            id: index,
                            value: item.value,
                            label: `${item.name}: ${formatCurrency(item.value)} (${item.percentage.toFixed(1)}%)`,
                            color: item.color,
                          })),
                          highlightScope: { faded: 'global', highlighted: 'item' },
                          faded: { innerRadius: 30, additionalRadius: -30, color: 'gray' },
                          cx: 140,
                          cy: 200,
                          outerRadius: 100,
                        },
                      ]}
                      width={550}
                      height={400}
                      slotProps={{
                        legend: {
                          direction: 'column',
                          position: { vertical: 'middle', horizontal: 'right' },
                          padding: 10,
                          itemMarkWidth: 8,
                          itemMarkHeight: 8,
                          markGap: 5,
                          itemGap: 8,
                          labelStyle: {
                            fontSize: '14px',
                            fontFamily: 'inherit',
                            fontWeight: 400,
                            lineHeight: 1.2,
                          },
                        },
                      }}
                    />
                  </Box>
                )}
              </Box>
              
              {hasPendingMoves && pendingMovesSummary && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
                  Comparison shows impact of {pendingMovesSummary.moveCount} planned portfolio moves
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Allocation Compliance - always show for better layout */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Allocation vs Targets{hasPendingMoves ? ' (with Pending Moves)' : ''}
              </Typography>
              
              <Box display="flex" justifyContent="center">
                <BarChart
                  dataset={combinedChartData}
                  xAxis={[{ 
                    scaleType: 'band', 
                    dataKey: 'name',
                    tickLabelStyle: {
                      angle: 45,
                      textAnchor: 'start'
                    }
                  }]}
                  yAxis={[{
                    label: 'Percentage (%)',
                    min: 0
                  }]}
                  series={[
                    {
                      dataKey: 'percentage',
                      label: 'Current %',
                      color: '#1976d2',
                    },
                    {
                      dataKey: 'target',
                      label: 'Target %',
                      color: '#2e7d32',
                    },
                    ...(hasPendingMoves && projectedChartData.length > 0 ? [{
                      dataKey: 'projectedPercentage',
                      label: 'Projected %',
                      color: '#ff9800',
                    }] : [])
                  ]}
                  width={800}
                  height={400}
                  margin={{ left: 80, bottom: 80, right: 50, top: 50 }}
                  slotProps={{
                    legend: {
                      direction: 'row',
                      position: { vertical: 'top', horizontal: 'middle' },
                      padding: 0,
                    },
                  }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

      </Grid>
    </Box>
  )}

      {/* Trends Tab */}
      {activeTab === 2 && (
        <Box sx={{ width: '100%' }}>
          <IncomeHistoryChart height={500} showControls={true} />
        </Box>
      )}
    </Box>
  );
};