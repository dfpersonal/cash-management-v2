import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Chip
} from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';
import { TrendingUp, TrendingDown, Timeline } from '@mui/icons-material';
import { IncomeHistoryPoint } from '@cash-mgmt/shared';
import { PortfolioTypes';

interface IncomeHistoryChartProps {
  height?: number;
  showControls?: boolean;
}

export const IncomeHistoryChart: React.FC<IncomeHistoryChartProps> = ({
  height = 400,
  showControls = true
}) => {
  const [historyData, setHistoryData] = useState<IncomeHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<string>('12m'); // Default to 12 months

  // Time range configurations
  const timeRangeConfigs = {
    '1w': { period: 7, unit: 'days' as const, label: '1 Week' },
    '1m': { period: 4, unit: 'weeks' as const, label: '1 Month' },
    '3m': { period: 3, unit: 'months' as const, label: '3 Months' },
    '6m': { period: 6, unit: 'months' as const, label: '6 Months' },
    '12m': { period: 12, unit: 'months' as const, label: '12 Months' },
    '24m': { period: 24, unit: 'months' as const, label: '24 Months' },
  };

  useEffect(() => {
    loadIncomeHistory();
  }, [timeRange]);

  const loadIncomeHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const config = timeRangeConfigs[timeRange as keyof typeof timeRangeConfigs];
      const data = await window.electronAPI.getIncomeHistory(config.period, config.unit);
      setHistoryData(data || []);
      
      if (!data || data.length === 0) {
        setError('No historical data available yet. Start by capturing some snapshots!');
      }
    } catch (err) {
      console.error('Failed to load income history:', err);
      setError('Failed to load income history data.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateString: string): string => {
    const config = timeRangeConfigs[timeRange as keyof typeof timeRangeConfigs];
    const date = new Date(dateString);
    
    if (config.unit === 'days') {
      // For daily view: show day and date (e.g., "Wed 20", "Thu 21")
      return date.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short'
      });
    } else if (config.unit === 'weeks') {
      // For weekly view: show week starting date (e.g., "Week of 19 Aug")
      return `Week of ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
    } else {
      // For monthly view: show month and year, or day if same month (e.g., "20 Aug", "21 Aug")
      if (historyData.length <= 7) {
        // If few data points, show day and month for clarity
        return date.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short'
        });
      } else {
        return date.toLocaleDateString('en-GB', {
          month: 'short',
          year: 'numeric'
        });
      }
    }
  };

  const calculateTrend = () => {
    if (historyData.length < 2) return null;
    
    const first = historyData[0];
    const last = historyData[historyData.length - 1];
    
    const change = last.currentIncome - first.currentIncome;
    const changePercentage = first.currentIncome > 0 ? (change / first.currentIncome) * 100 : 0;
    
    return {
      change,
      changePercentage,
      direction: change >= 0 ? 'up' : 'down',
      firstDate: first.date,
      lastDate: last.date
    };
  };

  const trend = calculateTrend();

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="center" alignItems="center" height={height}>
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <Alert severity="info" icon={<Timeline />}>
            <Typography variant="body1" gutterBottom>
              Income History Not Yet Available
            </Typography>
            <Typography variant="body2">
              {error} Historical income tracking will begin automatically as you use the system.
            </Typography>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ width: '100%' }}>
      <CardContent sx={{ width: '100%' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Box display="flex" alignItems="center" gap={2}>
            <Typography variant="h6">
              Annual Income Trend
            </Typography>
            {trend && (
              <Box display="flex" alignItems="center" gap={1}>
                {trend.direction === 'up' ? (
                  <TrendingUp color="success" fontSize="small" />
                ) : (
                  <TrendingDown color="error" fontSize="small" />
                )}
                <Chip
                  label={`${trend.changePercentage >= 0 ? '+' : ''}${trend.changePercentage.toFixed(1)}%`}
                  color={trend.changePercentage >= 0 ? 'success' : 'error'}
                  size="small"
                />
                <Typography variant="caption" color="text.secondary">
                  since {formatDate(trend.firstDate)}
                </Typography>
              </Box>
            )}
          </Box>
          
          {showControls && (
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Time Range</InputLabel>
              <Select
                value={timeRange}
                label="Time Range"
                onChange={(e) => setTimeRange(e.target.value as string)}
              >
                <MenuItem value="1w">1 Week</MenuItem>
                <MenuItem value="1m">1 Month</MenuItem>
                <MenuItem value="3m">3 Months</MenuItem>
                <MenuItem value="6m">6 Months</MenuItem>
                <MenuItem value="12m">12 Months</MenuItem>
                <MenuItem value="24m">24 Months</MenuItem>
              </Select>
            </FormControl>
          )}
        </Box>

        {historyData.length > 0 ? (
          <Box sx={{ width: '100%', overflow: 'hidden' }}>
            <LineChart
              width={1000}
              height={height}
              series={[
                {
                  data: historyData.map(point => point.currentIncome),
                  label: 'Current Income',
                  color: '#1976d2'
                },
                {
                  data: historyData.map(point => point.projectedIncome),
                  label: 'Projected Income',
                  color: '#ed6c02'
                }
              ]}
              xAxis={[{
                data: historyData.map(point => new Date(point.date)),
                scaleType: 'time',
                tickNumber: historyData.length,
                tickMinStep: 3600 * 1000 * 24, // 1 day minimum
                valueFormatter: (value) => {
                  const date = new Date(value);
                  return formatDate(date.toISOString().split('T')[0]);
                }
              }]}
              yAxis={[{
                valueFormatter: (value: number) => formatCurrency(value)
              }]}
              margin={{ left: 80, right: 20, top: 20, bottom: 60 }}
              slotProps={{
                legend: {
                  direction: 'row',
                  position: { vertical: 'top', horizontal: 'middle' },
                  padding: 0
                }
              }}
            />
            
            <Box mt={2} display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="body2" color="text.secondary">
                {historyData.length} data points over {timeRangeConfigs[timeRange as keyof typeof timeRangeConfigs].label.toLowerCase()}
              </Typography>
              
              {historyData.length > 0 && (
                <Box display="flex" gap={2}>
                  <Typography variant="body2" color="text.secondary">
                    Latest: <strong>{formatCurrency(historyData[historyData.length - 1].currentIncome)}</strong>
                  </Typography>
                  {historyData[historyData.length - 1].projectedIncome !== historyData[historyData.length - 1].currentIncome && (
                    <Typography variant="body2" color="warning.main">
                      Projected: <strong>{formatCurrency(historyData[historyData.length - 1].projectedIncome)}</strong>
                    </Typography>
                  )}
                </Box>
              )}
            </Box>
          </Box>
        ) : (
          <Box display="flex" justifyContent="center" alignItems="center" height={height}>
            <Alert severity="info">
              <Typography variant="body2">
                No data points available for the selected time range. 
                Try selecting a longer period or wait for more data to be collected.
              </Typography>
            </Alert>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};