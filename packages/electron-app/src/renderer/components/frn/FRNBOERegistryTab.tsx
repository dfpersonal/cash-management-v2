import React, { useEffect, useState } from 'react';
import {
  Box,
  TextField,
  IconButton,
  Alert,
  CircularProgress,
  InputAdornment,
  Chip,
  Typography,
  Tooltip,
} from '@mui/material';
import { 
  DataGrid, 
  GridColDef, 
  GridRenderCellParams,
  GridToolbar 
} from '@mui/x-data-grid';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon,
  OpenInNew as OpenIcon,
} from '@mui/icons-material';

interface BOEInstitution {
  frn: string;
  firm_name: string;
  created_at: string;
  updated_at: string;
  shared_brands?: string;
}

const FRNBOERegistryTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [institutions, setInstitutions] = useState<BOEInstitution[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadBOEInstitutions();
  }, [page, pageSize, searchTerm]);

  const loadBOEInstitutions = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await window.electronAPI.getBOEInstitutions({
        searchTerm,
        limit: pageSize,
        offset: page * pageSize,
      });

      setInstitutions(result.institutions || []);
      setTotal(result.total || 0);
    } catch (err) {
      console.error('Error loading BOE institutions:', err);
      setError('Failed to load BOE registry data');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenBOELink = (frn: string) => {
    // Open BOE register link in browser
    const url = `https://register.fca.org.uk/s/firm?id=${frn}`;
    window.open(url, '_blank');
  };

  const columns: GridColDef[] = [
    { 
      field: 'frn', 
      headerName: 'FRN', 
      width: 100,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography>{params.value}</Typography>
          <Tooltip title="View on FCA Register">
            <IconButton size="small" onClick={() => handleOpenBOELink(params.value)}>
              <OpenIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
    { 
      field: 'firm_name', 
      headerName: 'Firm Name', 
      flex: 1,
      minWidth: 250,
    },
    { 
      field: 'shared_brands', 
      headerName: 'Shared Brands', 
      flex: 1,
      minWidth: 200,
      renderCell: (params: GridRenderCellParams) => {
        if (!params.value) {
          return <Typography color="text.secondary">-</Typography>;
        }
        
        const brands = params.value.split(', ');
        if (brands.length <= 2) {
          return (
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {brands.map((brand: string, index: number) => (
                <Chip key={index} label={brand} size="small" variant="outlined" />
              ))}
            </Box>
          );
        }
        
        return (
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            <Chip label={brands[0]} size="small" variant="outlined" />
            <Typography variant="body2" color="text.secondary">
              +{brands.length - 1} more
            </Typography>
            <Tooltip title={params.value}>
              <InfoIcon fontSize="small" color="action" />
            </Tooltip>
          </Box>
        );
      },
    },
    { 
      field: 'created_at', 
      headerName: 'Added', 
      width: 110,
      renderCell: (params) => new Date(params.value).toLocaleDateString(),
    },
    { 
      field: 'updated_at', 
      headerName: 'Updated', 
      width: 110,
      renderCell: (params) => new Date(params.value).toLocaleDateString(),
    },
  ];

  if (error && !loading) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Info Alert */}
      <Alert severity="info" sx={{ mb: 2 }} icon={<InfoIcon />}>
        <Typography variant="body2">
          This is a read-only view of the Bank of England institutions registry. 
          This data is used as the authoritative source for FRN validation. 
          Shared brands show multiple trading names under the same FRN.
        </Typography>
      </Alert>

      {/* Toolbar */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
        <TextField
          placeholder="Search FRN or firm name..."
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
        <IconButton onClick={loadBOEInstitutions}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* Stats */}
      <Box sx={{ display: 'flex', gap: 3, mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Total institutions: <strong>{total}</strong>
        </Typography>
        {searchTerm && (
          <Typography variant="body2" color="text.secondary">
            Searching for: <strong>{searchTerm}</strong>
          </Typography>
        )}
      </Box>

      {/* Data Grid */}
      <Box sx={{ flex: 1, minHeight: 400 }}>
        <DataGrid
          rows={institutions}
          columns={columns}
          getRowId={(row) => row.frn}
          rowCount={total}
          loading={loading}
          pageSizeOptions={[25, 50, 100]}
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
                fileName: 'boe-registry',
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
    </Box>
  );
};

export default FRNBOERegistryTab;