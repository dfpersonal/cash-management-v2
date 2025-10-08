import React, { useEffect, useState } from 'react';
import {
  Box,
  TextField,
  IconButton,
  Alert,
  CircularProgress,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
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
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon,
} from '@mui/icons-material';

interface LookupItem {
  frn: string;
  canonical_name: string;
  search_name: string;
  match_type: string;
  confidence_score: number;
  match_rank: number;
}

const FRNLookupHelperTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<LookupItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [searchTerm, setSearchTerm] = useState('');
  const [matchTypeFilter, setMatchTypeFilter] = useState<string>('');

  useEffect(() => {
    loadLookupHelper();
  }, [page, pageSize, searchTerm, matchTypeFilter]);

  const loadLookupHelper = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await window.electronAPI.getFRNLookupHelper({
        searchTerm,
        matchType: matchTypeFilter || undefined,
        limit: pageSize,
        offset: page * pageSize,
      });

      setItems(result.items || []);
      setTotal(result.total || 0);
    } catch (err) {
      console.error('Error loading lookup helper:', err);
      setError('Failed to load FRN lookup data');
    } finally {
      setLoading(false);
    }
  };

  const getMatchTypeColor = (matchType: string): 'default' | 'primary' | 'secondary' | 'success' | 'warning' => {
    switch (matchType) {
      case 'manual_override':
        return 'success';
      case 'exact_match':
        return 'primary';
      case 'shared_brand':
        return 'secondary';
      case 'boe_registry':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getMatchTypeLabel = (matchType: string): string => {
    switch (matchType) {
      case 'manual_override':
        return 'Manual';
      case 'exact_match':
        return 'Exact';
      case 'shared_brand':
        return 'Shared Brand';
      case 'boe_registry':
        return 'BoE';
      default:
        return matchType;
    }
  };

  const columns: GridColDef[] = [
    { 
      field: 'frn', 
      headerName: 'FRN', 
      width: 100,
    },
    { 
      field: 'canonical_name', 
      headerName: 'Canonical Name', 
      flex: 1,
      minWidth: 200,
    },
    { 
      field: 'search_name', 
      headerName: 'Search Name', 
      flex: 1,
      minWidth: 200,
      renderCell: (params: GridRenderCellParams) => {
        if (params.value === params.row.canonical_name) {
          return <Typography color="text.secondary">(same as canonical)</Typography>;
        }
        return params.value;
      },
    },
    { 
      field: 'match_type', 
      headerName: 'Match Type', 
      width: 140,
      renderCell: (params: GridRenderCellParams) => (
        <Chip 
          label={getMatchTypeLabel(params.value)} 
          size="small"
          color={getMatchTypeColor(params.value)}
        />
      ),
    },
    { 
      field: 'confidence_score', 
      headerName: 'Confidence', 
      width: 100,
      renderCell: (params) => `${(params.value * 100).toFixed(0)}%`,
    },
    { 
      field: 'match_rank', 
      headerName: 'Rank', 
      width: 70,
      align: 'center',
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
          This is a read-only view of the FRN lookup helper. It shows how FRNs are resolved from various sources
          in priority order: Manual Overrides → Exact Matches → Shared Brands → BoE Registry.
        </Typography>
      </Alert>

      {/* Toolbar */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
        <TextField
          placeholder="Search FRN, name..."
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
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Match Type</InputLabel>
          <Select
            value={matchTypeFilter}
            onChange={(e) => setMatchTypeFilter(e.target.value)}
            label="Match Type"
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="manual_override">Manual Override</MenuItem>
            <MenuItem value="exact_match">Exact Match</MenuItem>
            <MenuItem value="shared_brand">Shared Brand</MenuItem>
            <MenuItem value="boe_registry">BoE Registry</MenuItem>
          </Select>
        </FormControl>
        <IconButton onClick={loadLookupHelper}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* Stats */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Total entries: {total}
        </Typography>
        {matchTypeFilter && (
          <Typography variant="body2" color="text.secondary">
            Filtered by: {getMatchTypeLabel(matchTypeFilter)}
          </Typography>
        )}
      </Box>

      {/* Data Grid */}
      <Box sx={{ flex: 1, minHeight: 400 }}>
        <DataGrid
          rows={items}
          columns={columns}
          getRowId={(row) => `${row.frn}_${row.search_name}_${row.match_rank}`}
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
                fileName: 'frn-lookup-helper',
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

export default FRNLookupHelperTab;