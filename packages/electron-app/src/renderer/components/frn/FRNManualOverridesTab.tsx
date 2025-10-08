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
} from '@mui/material';
import { 
  DataGrid, 
  GridColDef, 
  GridRenderCellParams,
  GridToolbar 
} from '@mui/x-data-grid';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';

interface Override {
  id: number;
  scraped_name: string;
  frn: string;
  firm_name: string;
  confidence_score: number;
  notes: string;
  created_at: string;
}

interface FormData {
  scraped_name: string;
  frn: string;
  firm_name: string;
  confidence_score: number;
  notes: string;
}

const FRNManualOverridesTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOverride, setEditingOverride] = useState<Override | null>(null);
  const [formData, setFormData] = useState<FormData>({
    scraped_name: '',
    frn: '',
    firm_name: '',
    confidence_score: 1.0,
    notes: '',
  });
  const [formErrors, setFormErrors] = useState<Partial<FormData>>({});

  useEffect(() => {
    loadOverrides();
  }, [page, pageSize, searchTerm]);

  const loadOverrides = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await window.electronAPI.getFRNManualOverrides({
        searchTerm,
        limit: pageSize,
        offset: page * pageSize,
      });

      setOverrides(result.overrides || []);
      setTotal(result.total || 0);
    } catch (err) {
      console.error('Error loading overrides:', err);
      setError('Failed to load overrides');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const errors: Partial<FormData> = {};

    if (!formData.scraped_name.trim()) {
      errors.scraped_name = 'Bank/scraped name is required';
    }

    if (!formData.frn.trim()) {
      errors.frn = 'FRN is required';
    } else if (!/^\d{6,7}$/.test(formData.frn.trim())) {
      errors.frn = 'FRN must be 6-7 digits';
    }

    if (!formData.firm_name.trim()) {
      errors.firm_name = 'Firm name is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAdd = () => {
    setEditingOverride(null);
    setFormData({
      scraped_name: '',
      frn: '',
      firm_name: '',
      confidence_score: 1.0,
      notes: '',
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleEdit = (override: Override) => {
    setEditingOverride(override);
    setFormData({
      scraped_name: override.scraped_name,
      frn: override.frn,
      firm_name: override.firm_name,
      confidence_score: override.confidence_score,
      notes: override.notes || '',
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this override?')) {
      return;
    }

    try {
      await window.electronAPI.deleteFRNOverride(id);
      await loadOverrides();
    } catch (err) {
      console.error('Error deleting override:', err);
      alert('Failed to delete override');
    }
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      if (editingOverride) {
        await window.electronAPI.updateFRNOverride(editingOverride.id, formData);
      } else {
        await window.electronAPI.createFRNOverride(formData);
      }
      
      setDialogOpen(false);
      await loadOverrides();
    } catch (err) {
      console.error('Error saving override:', err);
      alert('Failed to save override');
    }
  };

  const columns: GridColDef[] = [
    { 
      field: 'scraped_name', 
      headerName: 'Bank/Scraped Name', 
      flex: 1,
      minWidth: 150,
    },
    { 
      field: 'frn', 
      headerName: 'FRN', 
      width: 100,
    },
    { 
      field: 'firm_name', 
      headerName: 'Firm Name', 
      flex: 1,
      minWidth: 150,
    },
    { 
      field: 'confidence_score', 
      headerName: 'Confidence', 
      width: 100,
      renderCell: (params) => `${(params.value * 100).toFixed(0)}%`,
    },
    { 
      field: 'notes', 
      headerName: 'Notes', 
      flex: 1,
      minWidth: 150,
    },
    { 
      field: 'created_at', 
      headerName: 'Created', 
      width: 110,
      renderCell: (params) => new Date(params.value).toLocaleDateString(),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 100,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => (
        <Box>
          <Tooltip title="Edit">
            <IconButton size="small" onClick={() => handleEdit(params.row)}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" onClick={() => handleDelete(params.row.id)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  if (error && !loading) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <TextField
          placeholder="Search overrides..."
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
        <Button 
          variant="contained" 
          startIcon={<AddIcon />}
          onClick={handleAdd}
        >
          Add Override
        </Button>
        <IconButton onClick={loadOverrides}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* Data Grid */}
      <Box sx={{ flex: 1, minHeight: 400 }}>
        <DataGrid
          rows={overrides}
          columns={columns}
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
                fileName: 'frn-manual-overrides',
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

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingOverride ? 'Edit Override' : 'Add Override'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Bank/Scraped Name"
              value={formData.scraped_name}
              onChange={(e) => setFormData({ ...formData, scraped_name: e.target.value })}
              error={!!formErrors.scraped_name}
              helperText={formErrors.scraped_name}
              fullWidth
              required
            />
            <TextField
              label="FRN"
              value={formData.frn}
              onChange={(e) => setFormData({ ...formData, frn: e.target.value })}
              error={!!formErrors.frn}
              helperText={formErrors.frn || 'Must be 6-7 digits'}
              fullWidth
              required
            />
            <TextField
              label="Firm Name"
              value={formData.firm_name}
              onChange={(e) => setFormData({ ...formData, firm_name: e.target.value })}
              error={!!formErrors.firm_name}
              helperText={formErrors.firm_name}
              fullWidth
              required
            />
            <TextField
              label="Confidence Score"
              type="number"
              value={formData.confidence_score}
              onChange={(e) => setFormData({ ...formData, confidence_score: parseFloat(e.target.value) })}
              inputProps={{ min: 0, max: 1, step: 0.1 }}
              fullWidth
            />
            <TextField
              label="Notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              multiline
              rows={3}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} variant="contained">
            {editingOverride ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default FRNManualOverridesTab;