import React, { useState, useMemo } from 'react';
import {
  Box,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  TableSortLabel,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Typography,
  Chip,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  TablePagination,
  Tooltip
} from '@mui/material';
import {
  MoreVert as MoreVertIcon,
  Visibility as ViewIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  GetApp as DownloadIcon,
  Search as SearchIcon,
  Description as DocumentIcon
} from '@mui/icons-material';

import type {
  DocumentWithAccountDetails,
  DocumentActionsProps,
  DocumentSortField,
  DocumentSortOrder,
  DocumentSortConfig,
  DocumentFilterConfig,
  DOCUMENT_TYPE_ICONS
} from './types';

interface DocumentListProps {
  documents: DocumentWithAccountDetails[];
  onView: (document: DocumentWithAccountDetails) => void;
  onEdit: (document: DocumentWithAccountDetails) => void;
  onDelete: (document: DocumentWithAccountDetails) => void;
  onDownload: (document: DocumentWithAccountDetails) => void;
}

interface DocumentActionsMenuProps extends DocumentActionsProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
}

function DocumentActionsMenu({
  document,
  anchorEl,
  open,
  onClose,
  onView,
  onEdit,
  onDelete,
  onDownload
}: DocumentActionsMenuProps) {
  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <Menu
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      anchorOrigin={{
        vertical: 'bottom',
        horizontal: 'right',
      }}
      transformOrigin={{
        vertical: 'top',
        horizontal: 'right',
      }}
    >
      <MenuItem onClick={() => handleAction(() => onView(document))}>
        <ListItemIcon>
          <ViewIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>View</ListItemText>
      </MenuItem>
      <MenuItem onClick={() => handleAction(() => onEdit(document))}>
        <ListItemIcon>
          <EditIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Edit</ListItemText>
      </MenuItem>
      <MenuItem onClick={() => handleAction(() => onDownload(document))}>
        <ListItemIcon>
          <DownloadIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Download</ListItemText>
      </MenuItem>
      <MenuItem
        onClick={() => handleAction(() => onDelete(document))}
        sx={{ color: 'warning.main' }}
      >
        <ListItemIcon>
          <DeleteIcon fontSize="small" color="warning" />
        </ListItemIcon>
        <ListItemText>Move to Trash</ListItemText>
      </MenuItem>
    </Menu>
  );
}

export default function DocumentList({
  documents,
  onView,
  onEdit,
  onDelete,
  onDownload
}: DocumentListProps) {
  const [sortConfig, setSortConfig] = useState<DocumentSortConfig>({
    field: 'uploaded_at',
    order: 'desc'
  });

  const [filterConfig, setFilterConfig] = useState<DocumentFilterConfig>({
    documentType: '',
    dateRange: { start: null, end: null },
    searchTerm: '',
    showDeleted: false
  });

  const [menuState, setMenuState] = useState<{
    anchorEl: HTMLElement | null;
    document: DocumentWithAccountDetails | null;
  }>({ anchorEl: null, document: null });

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Get unique document types for filter dropdown
  const documentTypes = useMemo(() => {
    const types = new Set(documents.map(doc => doc.document_type));
    return Array.from(types).sort();
  }, [documents]);

  // Filter and sort documents
  const filteredAndSortedDocuments = useMemo(() => {
    let filtered = documents.filter(doc => {
      // Search term filter
      if (filterConfig.searchTerm) {
        const searchLower = filterConfig.searchTerm.toLowerCase();
        if (!doc.document_title.toLowerCase().includes(searchLower) &&
            !doc.document_type.toLowerCase().includes(searchLower) &&
            !doc.notes?.toLowerCase().includes(searchLower)) {
          return false;
        }
      }

      // Document type filter
      if (filterConfig.documentType && doc.document_type !== filterConfig.documentType) {
        return false;
      }

      // Date range filter
      if (filterConfig.dateRange.start || filterConfig.dateRange.end) {
        const docDate = doc.document_date ? new Date(doc.document_date) : new Date(doc.uploaded_at);
        if (filterConfig.dateRange.start && docDate < new Date(filterConfig.dateRange.start)) {
          return false;
        }
        if (filterConfig.dateRange.end && docDate > new Date(filterConfig.dateRange.end)) {
          return false;
        }
      }

      return true;
    });

    // Sort documents
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortConfig.field) {
        case 'document_title':
          aValue = a.document_title.toLowerCase();
          bValue = b.document_title.toLowerCase();
          break;
        case 'document_type':
          aValue = a.document_type;
          bValue = b.document_type;
          break;
        case 'uploaded_at':
          aValue = new Date(a.uploaded_at);
          bValue = new Date(b.uploaded_at);
          break;
        case 'document_date':
          aValue = a.document_date ? new Date(a.document_date) : new Date(0);
          bValue = b.document_date ? new Date(b.document_date) : new Date(0);
          break;
        case 'file_size':
          aValue = a.file_size;
          bValue = b.file_size;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) {
        return sortConfig.order === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.order === 'asc' ? 1 : -1;
      }
      return 0;
    });

    return filtered;
  }, [documents, sortConfig, filterConfig]);

  // Paginated documents
  const paginatedDocuments = useMemo(() => {
    const startIndex = page * rowsPerPage;
    return filteredAndSortedDocuments.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredAndSortedDocuments, page, rowsPerPage]);

  // Handle sorting
  const handleSort = (field: DocumentSortField) => {
    setSortConfig(prev => ({
      field,
      order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Handle menu open/close
  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, document: DocumentWithAccountDetails) => {
    setMenuState({ anchorEl: event.currentTarget, document });
  };

  const handleMenuClose = () => {
    setMenuState({ anchorEl: null, document: null });
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Format date
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  // Format days since upload
  const formatDaysSince = (days: number): string => {
    if (days < 1) return 'Today';
    if (days < 2) return '1 day ago';
    if (days < 7) return `${Math.floor(days)} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return `${Math.floor(days / 30)} months ago`;
  };

  // Get document type icon
  const getDocumentTypeIcon = (type: string): string => {
    const icons: Record<string, string> = {
      'Statement': '📄',
      'Tax Certificate': '🧾',
      'Contract': '📝',
      'Rate Change Notice': '📊',
      'Maturity Notice': '⏰',
      'Confirmation': '✅',
      'Other': '📋'
    };
    return icons[type] || '📋';
  };

  if (documents.length === 0) {
    return (
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        height="300px"
        color="text.secondary"
      >
        <DocumentIcon sx={{ fontSize: 64, mb: 2, opacity: 0.5 }} />
        <Typography variant="h6" gutterBottom>
          No Documents
        </Typography>
        <Typography variant="body2">
          Upload your first document to get started
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Filters */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
          <TextField
            size="small"
            placeholder="Search documents..."
            value={filterConfig.searchTerm}
            onChange={(e) => setFilterConfig(prev => ({ ...prev, searchTerm: e.target.value }))}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ minWidth: 200 }}
          />

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Document Type</InputLabel>
            <Select
              value={filterConfig.documentType}
              label="Document Type"
              onChange={(e) => setFilterConfig(prev => ({ ...prev, documentType: e.target.value }))}
            >
              <MenuItem value="">All Types</MenuItem>
              {documentTypes.map(type => (
                <MenuItem key={type} value={type}>
                  {getDocumentTypeIcon(type)} {type}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            size="small"
            type="date"
            label="From Date"
            value={filterConfig.dateRange.start || ''}
            onChange={(e) => setFilterConfig(prev => ({
              ...prev,
              dateRange: { ...prev.dateRange, start: e.target.value || null }
            }))}
            InputLabelProps={{ shrink: true }}
          />

          <TextField
            size="small"
            type="date"
            label="To Date"
            value={filterConfig.dateRange.end || ''}
            onChange={(e) => setFilterConfig(prev => ({
              ...prev,
              dateRange: { ...prev.dateRange, end: e.target.value || null }
            }))}
            InputLabelProps={{ shrink: true }}
          />
        </Box>
      </Box>

      {/* Table */}
      <TableContainer component={Paper} sx={{ flex: 1 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>
                <TableSortLabel
                  active={sortConfig.field === 'document_title'}
                  direction={sortConfig.field === 'document_title' ? sortConfig.order : 'asc'}
                  onClick={() => handleSort('document_title')}
                >
                  Document
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortConfig.field === 'document_type'}
                  direction={sortConfig.field === 'document_type' ? sortConfig.order : 'asc'}
                  onClick={() => handleSort('document_type')}
                >
                  Type
                </TableSortLabel>
              </TableCell>
              <TableCell align="right">
                <TableSortLabel
                  active={sortConfig.field === 'file_size'}
                  direction={sortConfig.field === 'file_size' ? sortConfig.order : 'asc'}
                  onClick={() => handleSort('file_size')}
                >
                  Size
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortConfig.field === 'document_date'}
                  direction={sortConfig.field === 'document_date' ? sortConfig.order : 'asc'}
                  onClick={() => handleSort('document_date')}
                >
                  Document Date
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortConfig.field === 'uploaded_at'}
                  direction={sortConfig.field === 'uploaded_at' ? sortConfig.order : 'asc'}
                  onClick={() => handleSort('uploaded_at')}
                >
                  Uploaded
                </TableSortLabel>
              </TableCell>
              <TableCell align="center" width={60}>
                Actions
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedDocuments.map((doc) => (
              <TableRow
                key={doc.id}
                hover
                sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
              >
                <TableCell>
                  <Box>
                    <Typography variant="body2" fontWeight="medium">
                      {doc.document_title}
                    </Typography>
                    {doc.notes && (
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {doc.notes}
                      </Typography>
                    )}
                  </Box>
                </TableCell>
                <TableCell>
                  <Chip
                    label={doc.document_type}
                    size="small"
                    variant="outlined"
                    icon={<span style={{ fontSize: '14px' }}>{getDocumentTypeIcon(doc.document_type)}</span>}
                  />
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" fontFamily="monospace">
                    {formatFileSize(doc.file_size)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {doc.document_date ? formatDate(doc.document_date) : '-'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Tooltip title={formatDate(doc.uploaded_at)}>
                    <Typography variant="body2" color="text.secondary">
                      {formatDaysSince(doc.days_since_upload)}
                    </Typography>
                  </Tooltip>
                </TableCell>
                <TableCell align="center">
                  <IconButton
                    size="small"
                    onClick={(e) => handleMenuOpen(e, doc)}
                  >
                    <MoreVertIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      <TablePagination
        rowsPerPageOptions={[5, 10, 25, 50]}
        component="div"
        count={filteredAndSortedDocuments.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={(_, newPage) => setPage(newPage)}
        onRowsPerPageChange={(e) => {
          setRowsPerPage(parseInt(e.target.value, 10));
          setPage(0);
        }}
      />

      {/* Actions Menu */}
      {menuState.document && (
        <DocumentActionsMenu
          document={menuState.document}
          anchorEl={menuState.anchorEl}
          open={Boolean(menuState.anchorEl)}
          onClose={handleMenuClose}
          onView={onView}
          onEdit={onEdit}
          onDelete={onDelete}
          onDownload={onDownload}
        />
      )}
    </Box>
  );
}