import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Chip,
  Stack,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  Card,
  CardContent,
  Grid,
  Menu,
  ListItemIcon,
  ListItemText,
  AppBar,
  Toolbar,
} from '@mui/material';
import {
  DataGrid,
  GridColDef,
  GridRowsProp,
  GridToolbar,
  GridFilterModel,
  GridSortModel,
  GridValueFormatter,
} from '@mui/x-data-grid';
import {
  Refresh as RefreshIcon,
  FileDownload as ExportIcon,
  Visibility as ViewIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  TableChart as CsvIcon,
  DataObject as JsonIcon,
} from '@mui/icons-material';
import { AuditEntry, AuditFilters, AuditStats } from '@cash-mgmt/shared';

interface AuditViewerProps {
  open: boolean;
  onClose: () => void;
  initialFilters?: AuditFilters;
  title?: string;
}

export const AuditViewer: React.FC<AuditViewerProps> = ({
  open,
  onClose,
  initialFilters,
  title = 'Audit Trail Viewer'
}) => {
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balanceStats, setBalanceStats] = useState<AuditStats | null>(null);
  
  // Filter states
  const [filters, setFilters] = useState<AuditFilters>({
    daysBack: 30,
    limit: 1000,
    ...initialFilters
  });

  // Table states
  const [sortModel, setSortModel] = useState<GridSortModel>([
    { field: 'timestamp', sort: 'desc' }
  ]);
  const [filterModel, setFilterModel] = useState<GridFilterModel>({ items: [] });
  
  // Export menu state
  const [exportMenuAnchor, setExportMenuAnchor] = useState<null | HTMLElement>(null);

  // Load audit data
  const loadAuditData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Load audit entries - use specific record trail if both tableName and recordId are provided
      let entries;
      if (filters.tableName && filters.recordId) {
        entries = await window.electronAPI.getRecordAuditTrail(filters.tableName, filters.recordId);
      } else {
        entries = await window.electronAPI.getAllAuditEntries(filters);
      }
      setAuditEntries(entries);

      // Load balance change summary if no specific filters
      if (!filters.tableName && !filters.fieldName && !filters.recordId) {
        const stats = await window.electronAPI.getBalanceChangeSummary(filters.daysBack);
        setBalanceStats(stats);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit data');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Load data when component mounts or filters change
  useEffect(() => {
    if (open) {
      loadAuditData();
    }
  }, [open, loadAuditData]);

  // Handle filter changes
  const handleFilterChange = (key: keyof AuditFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  // Clear filters
  const clearFilters = () => {
    setFilters({
      daysBack: 30,
      limit: 1000
    });
  };

  // Export data with format selection
  const exportData = (format: 'csv' | 'json' = 'csv') => {
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `audit_trail_${timestamp}`;
    
    if (format === 'csv') {
      const csvContent = [
        ['Timestamp', 'Table', 'Record ID', 'Field', 'Old Value', 'New Value', 'Operation', 'Notes'],
        ...auditEntries.map(entry => [
          entry.timestamp,
          entry.table_name,
          entry.record_id.toString(),
          entry.field_name,
          entry.old_value,
          entry.new_value,
          entry.operation_context,
          entry.notes || ''
        ])
      ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      // JSON export with structured data
      const jsonData = {
        export_info: {
          generated_at: new Date().toISOString(),
          total_entries: auditEntries.length,
          filters_applied: filters,
          period: filters.daysBack ? `Last ${filters.daysBack} days` : 'All time'
        },
        audit_entries: auditEntries.map(entry => ({
          ...entry,
          timestamp: new Date(entry.timestamp).toISOString(),
          changes: {
            field: entry.field_name,
            from: entry.old_value,
            to: entry.new_value,
            is_financial: isCurrencyField(entry.field_name),
            formatted_old: isCurrencyField(entry.field_name) && !isNaN(parseFloat(entry.old_value)) 
              ? formatCurrency(entry.old_value) : entry.old_value,
            formatted_new: isCurrencyField(entry.field_name) && !isNaN(parseFloat(entry.new_value)) 
              ? formatCurrency(entry.new_value) : entry.new_value
          }
        })),
        summary: balanceStats ? {
          total_changes: balanceStats.total_changes,
          total_increases: balanceStats.total_increases,
          total_decreases: balanceStats.total_decreases,
          average_change: balanceStats.avg_change
        } : null
      };

      const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // Get operation color
  const getOperationColor = (operation: string) => {
    if (operation.includes('CREATE')) return 'success';
    if (operation.includes('UPDATE')) return 'warning';
    if (operation.includes('DELETE')) return 'error';
    return 'default';
  };

  // Format currency values
  const formatCurrency = (value: string): string => {
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP'
    }).format(num);
  };

  // Check if value is likely a currency
  const isCurrencyField = (fieldName: string): boolean => {
    return ['balance', 'amount', 'aer'].includes(fieldName.toLowerCase());
  };

  // DataGrid columns
  const columns: GridColDef[] = [
    {
      field: 'timestamp',
      headerName: 'Timestamp',
      width: 180,
      valueFormatter: (value: any) => {
        if (!value) return '';
        const date = new Date(value);
        return isNaN(date.getTime()) ? 'Invalid Date' : date.toLocaleString('en-GB');
      }
    },
    {
      field: 'operation_context',
      headerName: 'Operation',
      width: 150,
      renderCell: (params) => (
        <Chip
          label={params.value}
          color={getOperationColor(params.value) as any}
          size="small"
          variant="outlined"
        />
      )
    },
    {
      field: 'table_name',
      headerName: 'Table',
      width: 150,
    },
    {
      field: 'record_id',
      headerName: 'Record ID',
      width: 100,
      type: 'number'
    },
    {
      field: 'field_name',
      headerName: 'Field',
      width: 150,
    },
    {
      field: 'old_value',
      headerName: 'Old Value',
      width: 180,
      renderCell: (params) => {
        const value = params.value || '';
        if (isCurrencyField(params.row.field_name) && !isNaN(parseFloat(value))) {
          return formatCurrency(value);
        }
        return value.length > 50 ? `${value.substring(0, 50)}...` : value;
      }
    },
    {
      field: 'new_value',
      headerName: 'New Value',
      width: 180,
      renderCell: (params) => {
        const value = params.value || '';
        if (isCurrencyField(params.row.field_name) && !isNaN(parseFloat(value))) {
          return formatCurrency(value);
        }
        return value.length > 50 ? `${value.substring(0, 50)}...` : value;
      }
    },
    {
      field: 'change_direction',
      headerName: 'Change',
      width: 100,
      renderCell: (params) => {
        const oldVal = parseFloat(params.row.old_value);
        const newVal = parseFloat(params.row.new_value);
        
        if (isNaN(oldVal) || isNaN(newVal)) return null;
        
        if (newVal > oldVal) {
          return <TrendingUpIcon color="success" fontSize="small" />;
        } else if (newVal < oldVal) {
          return <TrendingDownIcon color="error" fontSize="small" />;
        }
        return null;
      }
    },
    {
      field: 'notes',
      headerName: 'Notes',
      width: 200,
      renderCell: (params) => {
        const notes = params.value || '';
        return notes.length > 40 ? (
          <Tooltip title={notes}>
            <span>{notes.substring(0, 40)}...</span>
          </Tooltip>
        ) : notes;
      }
    }
  ];

  if (!open) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        bgcolor: 'background.paper',
        zIndex: 1300,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden' // Prevent body scroll, allow internal scroll
      }}
    >
      {/* Header */}
      <AppBar
        position="static"
        elevation={1}
        sx={{
          bgcolor: 'background.paper',
          color: 'text.primary',
          borderBottom: 1,
          borderColor: 'divider'
        }}
      >
        <Toolbar sx={{ position: 'relative', justifyContent: 'center' }}>
          <Typography variant="h5" fontWeight="bold" component="h1">
            {title}
          </Typography>
          <Box sx={{ position: 'absolute', right: 16, display: 'flex', gap: 1 }}>
            <Tooltip title="Refresh Data">
              <IconButton onClick={loadAuditData} disabled={loading}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Export Data">
              <IconButton 
                onClick={(e) => setExportMenuAnchor(e.currentTarget)} 
                disabled={auditEntries.length === 0}
              >
                <ExportIcon />
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={exportMenuAnchor}
              open={Boolean(exportMenuAnchor)}
              onClose={() => setExportMenuAnchor(null)}
            >
              <MenuItem onClick={() => { exportData('csv'); setExportMenuAnchor(null); }}>
                <ListItemIcon>
                  <CsvIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Export as CSV</ListItemText>
              </MenuItem>
              <MenuItem onClick={() => { exportData('json'); setExportMenuAnchor(null); }}>
                <ListItemIcon>
                  <JsonIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Export as JSON</ListItemText>
              </MenuItem>
            </Menu>
            <Button variant="outlined" onClick={onClose}>
              Close
            </Button>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Stats Cards */}
      {balanceStats && balanceStats.total_changes > 0 && (
        <Box p={2}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    Total Changes
                  </Typography>
                  <Typography variant="h5">
                    {balanceStats.total_changes}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    Total Increases
                  </Typography>
                  <Typography variant="h5" color="success.main">
                    {formatCurrency(balanceStats.total_increases.toString())}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    Total Decreases
                  </Typography>
                  <Typography variant="h5" color="error.main">
                    {formatCurrency(balanceStats.total_decreases.toString())}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    Average Change
                  </Typography>
                  <Typography variant="h5">
                    {formatCurrency(balanceStats.avg_change.toString())}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}

      {/* Filters */}
      <Paper elevation={0} sx={{ p: 2, bgcolor: 'grey.50' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Table</InputLabel>
            <Select
              value={filters.tableName || ''}
              label="Table"
              onChange={(e) => handleFilterChange('tableName', e.target.value || undefined)}
            >
              <MenuItem value="">All Tables</MenuItem>
              <MenuItem value="my_deposits">Deposits</MenuItem>
              <MenuItem value="my_pending_deposits">Pending Deposits</MenuItem>
              <MenuItem value="notice_events">Notice Events</MenuItem>
              <MenuItem value="rate_changes">Rate Changes</MenuItem>
              <MenuItem value="reminders">Reminders</MenuItem>
            </Select>
          </FormControl>

          <TextField
            size="small"
            label="Field Name"
            value={filters.fieldName || ''}
            onChange={(e) => handleFilterChange('fieldName', e.target.value || undefined)}
            sx={{ minWidth: 150 }}
          />

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Operation</InputLabel>
            <Select
              value={filters.operationContext || ''}
              label="Operation"
              onChange={(e) => handleFilterChange('operationContext', e.target.value || undefined)}
            >
              <MenuItem value="">All Operations</MenuItem>
              <MenuItem value="CREATE_DEPOSIT">Create Deposit</MenuItem>
              <MenuItem value="UPDATE_DEPOSIT">Update Deposit</MenuItem>
              <MenuItem value="DELETE_DEPOSIT">Delete Deposit</MenuItem>
              <MenuItem value="CREATE_PENDING_DEPOSIT">Create Pending</MenuItem>
              <MenuItem value="UPDATE_PENDING_DEPOSIT">Update Pending</MenuItem>
              <MenuItem value="DELETE_PENDING_DEPOSIT">Delete Pending</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Days Back</InputLabel>
            <Select
              value={filters.daysBack || 30}
              label="Days Back"
              onChange={(e) => handleFilterChange('daysBack', e.target.value)}
            >
              <MenuItem value={7}>7 days</MenuItem>
              <MenuItem value={30}>30 days</MenuItem>
              <MenuItem value={90}>90 days</MenuItem>
              <MenuItem value={365}>1 year</MenuItem>
              <MenuItem value={0}>All time</MenuItem>
            </Select>
          </FormControl>

          <Button
            variant="outlined"
            onClick={clearFilters}
            size="small"
          >
            Clear Filters
          </Button>

          {loading && <CircularProgress size={24} />}
        </Stack>
      </Paper>

      {/* Error Display */}
      {error && (
        <Box p={2}>
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        </Box>
      )}

      {/* DataGrid */}
      <Box flex={1} p={2} sx={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Paper elevation={1} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <DataGrid
            rows={auditEntries}
            columns={columns}
            sortModel={sortModel}
            onSortModelChange={setSortModel}
            filterModel={filterModel}
            onFilterModelChange={setFilterModel}
            slots={{ toolbar: GridToolbar }}
            slotProps={{
              toolbar: {
                showQuickFilter: true,
                quickFilterProps: { debounceMs: 500 },
              },
            }}
            initialState={{
              pagination: {
                paginationModel: {
                  pageSize: 25,
                },
              },
              columns: {
                columnVisibilityModel: {
                  notes: false, // Hide notes column by default
                },
              },
            }}
            pageSizeOptions={[25, 50, 100]}
            loading={loading}
            disableRowSelectionOnClick
            sx={{
              border: 0,
              minWidth: 'fit-content', // Prevent compression for horizontal scroll
              '& .MuiDataGrid-row:hover': {
                backgroundColor: 'action.hover',
              },
              '& .MuiDataGrid-virtualScroller': {
                overflow: 'scroll !important', // Force scrollbars
              },
            }}
          />
        </Paper>
      </Box>
    </Box>
  );
};