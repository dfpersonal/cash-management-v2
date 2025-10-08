import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  TextField,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  Tooltip,
  InputAdornment,
  ToggleButton,
  ToggleButtonGroup,
  Chip,
  Typography,
} from '@mui/material';
import { 
  DataGrid, 
  GridColDef, 
  GridRenderCellParams,
  GridToolbar 
} from '@mui/x-data-grid';
import {
  CheckCircle as CompleteIcon,
  Cancel as DismissIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon,
} from '@mui/icons-material';

interface ResearchItem {
  rowid: number;
  bank_name: string;
  platform: string;
  source: string;
  account_type: string;
  product_count: number;
  min_rate: number;
  max_rate: number;
  avg_rate: number;
  first_seen: string;
  last_seen: string;
  researched_frn: string | null;
  researched_firm_name: string | null;
  research_notes: string | null;
  research_status: string | null;
  research_date: string | null;
  applied_date: string | null;
}

interface CompleteFormData {
  frn: string;
  firmName: string;
  notes: string;
}

const FRNResearchQueueTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ResearchItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [searchTerm, setSearchTerm] = useState('');
  const [status, setStatus] = useState<'pending' | 'completed'>('pending');
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ResearchItem | null>(null);
  const [bankStats, setBankStats] = useState<any>(null);
  const [formData, setFormData] = useState<CompleteFormData>({
    frn: '',
    firmName: '',
    notes: '',
  });
  const [formErrors, setFormErrors] = useState<Partial<CompleteFormData>>({});

  useEffect(() => {
    loadResearchQueue();
  }, [page, pageSize, searchTerm, status]);

  const loadResearchQueue = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await window.electronAPI.getFRNResearchQueue({
        searchTerm,
        status,
        limit: pageSize,
        offset: page * pageSize,
      });

      setItems(result.items || []);
      setTotal(result.total || 0);
    } catch (err) {
      console.error('Error loading research queue:', err);
      setError('Failed to load research queue');
    } finally {
      setLoading(false);
    }
  };

  const validateCompleteForm = (): boolean => {
    const errors: Partial<CompleteFormData> = {};

    if (!formData.frn.trim()) {
      errors.frn = 'FRN is required';
    } else if (!/^\d{6,7}$/.test(formData.frn.trim())) {
      errors.frn = 'FRN must be 6-7 digits';
    }

    if (!formData.firmName.trim()) {
      errors.firmName = 'Firm name is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleComplete = async (item: ResearchItem) => {
    setSelectedItem(item);
    setFormData({
      frn: '',
      firmName: item.bank_name, // Pre-fill with bank name
      notes: '',
    });
    setFormErrors({});
    setCompleteDialogOpen(true);

    // Load bank stats for additional context
    try {
      const stats = await window.electronAPI.getBankStatsByName(item.bank_name);
      setBankStats(stats);
    } catch (err) {
      console.error('Error loading bank stats:', err);
      setBankStats(null);
    }
  };

  const handleCompleteSubmit = async () => {
    if (!validateCompleteForm() || !selectedItem) {
      return;
    }

    try {
      await window.electronAPI.completeFRNResearch(
        selectedItem.rowid,
        formData.frn,
        formData.firmName,
        formData.notes
      );
      
      setCompleteDialogOpen(false);
      await loadResearchQueue();
    } catch (err) {
      console.error('Error completing research:', err);
      alert('Failed to complete research');
    }
  };

  const handleDismiss = async (rowId: number) => {
    if (!window.confirm('Are you sure you want to dismiss this research item?')) {
      return;
    }

    try {
      await window.electronAPI.dismissFRNResearch(rowId);
      await loadResearchQueue();
    } catch (err) {
      console.error('Error dismissing research:', err);
      alert('Failed to dismiss research');
    }
  };

  const columns: GridColDef[] = [
    { 
      field: 'bank_name', 
      headerName: 'Bank Name', 
      flex: 1,
      minWidth: 150,
    },
    { 
      field: 'platform', 
      headerName: 'Platform', 
      width: 100,
    },
    { 
      field: 'product_count', 
      headerName: 'Products', 
      width: 80,
      align: 'center',
    },
    { 
      field: 'avg_rate', 
      headerName: 'Avg Rate', 
      width: 90,
      renderCell: (params) => params.value ? `${params.value.toFixed(2)}%` : '-',
    },
    { 
      field: 'last_seen', 
      headerName: 'Last Seen', 
      width: 110,
      renderCell: (params) => params.value ? new Date(params.value).toLocaleDateString() : '-',
    },
  ];

  // Additional columns for completed items
  if (status === 'completed') {
    columns.push(
      { 
        field: 'researched_frn', 
        headerName: 'FRN', 
        width: 100,
      },
      { 
        field: 'researched_firm_name', 
        headerName: 'Firm Name', 
        flex: 1,
        minWidth: 150,
      },
      { 
        field: 'research_date', 
        headerName: 'Research Date', 
        width: 110,
        renderCell: (params) => params.value ? new Date(params.value).toLocaleDateString() : '-',
      }
    );
  } else {
    // Actions column for pending items
    columns.push({
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => (
        <Box>
          <Tooltip title="Complete Research">
            <IconButton size="small" color="success" onClick={() => handleComplete(params.row)}>
              <CompleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Dismiss">
            <IconButton size="small" color="error" onClick={() => handleDismiss(params.row.rowid)}>
              <DismissIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    });
  }

  if (error && !loading) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
        <TextField
          placeholder="Search queue..."
          size="small"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
          sx={{ flex: 1, maxWidth: 400 }}
        />
        <ToggleButtonGroup
          value={status}
          exclusive
          onChange={(e, newStatus) => newStatus && setStatus(newStatus)}
          size="small"
        >
          <ToggleButton value="pending">
            Pending ({status === 'pending' ? total : '...'})
          </ToggleButton>
          <ToggleButton value="completed">
            Completed
          </ToggleButton>
        </ToggleButtonGroup>
        <IconButton onClick={loadResearchQueue}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* Info Alert for Pending Items */}
      {status === 'pending' && total > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2">
            Complete research by finding the FRN for each bank. This will enable FSCS protection tracking.
          </Typography>
        </Alert>
      )}

      {/* Data Grid */}
      <Box sx={{ flex: 1, minHeight: 400 }}>
        <DataGrid
          rows={items}
          columns={columns}
          getRowId={(row) => row.rowid}
          rowCount={total}
          loading={loading}
          pageSizeOptions={[10, 25, 50, 100]}
          paginationModel={{
            page,
            pageSize,
          }}
          onPaginationModelChange={(model) => {
            setPage(model.page);
            setPageSize(model.pageSize);
          }}
          paginationMode="server"
          disableRowSelectionOnClick
          slots={{ toolbar: GridToolbar }}
          slotProps={{
            toolbar: {
              showQuickFilter: true,
              csvOptions: { 
                fileName: `frn-research-queue-${status}`,
                delimiter: ',',
                utf8WithBom: true 
              },
              printOptions: {
                hideFooter: true,
                hideToolbar: true,
              },
            }
          }}
        />
      </Box>

      {/* Complete Research Dialog */}
      <Dialog open={completeDialogOpen} onClose={() => setCompleteDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Complete Research for {selectedItem?.bank_name}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {/* Bank Stats */}
            {bankStats && (
              <Alert severity="info">
                <Typography variant="body2">
                  <strong>Portfolio Impact:</strong> {bankStats.product_count || 0} products, 
                  Total balance: £{(bankStats.total_balance || 0).toLocaleString()}
                </Typography>
                <Typography variant="body2">
                  <strong>Platforms:</strong> {bankStats.platforms || 'N/A'}
                </Typography>
                <Typography variant="body2">
                  <strong>Account Types:</strong> {bankStats.account_types || 'N/A'}
                </Typography>
              </Alert>
            )}
            
            <TextField
              label="FRN"
              value={formData.frn}
              onChange={(e) => setFormData({ ...formData, frn: e.target.value })}
              error={!!formErrors.frn}
              helperText={formErrors.frn || 'Enter the 6-7 digit FRN from BoE or FCA register'}
              fullWidth
              required
            />
            <TextField
              label="Firm Name"
              value={formData.firmName}
              onChange={(e) => setFormData({ ...formData, firmName: e.target.value })}
              error={!!formErrors.firmName}
              helperText={formErrors.firmName || 'Official firm name from the register'}
              fullWidth
              required
            />
            <TextField
              label="Notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              multiline
              rows={3}
              fullWidth
              placeholder="Any additional notes about this FRN research..."
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCompleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCompleteSubmit} variant="contained" color="success">
            Complete Research
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default FRNResearchQueueTab;