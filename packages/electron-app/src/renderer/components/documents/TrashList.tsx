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
  Tooltip,
  LinearProgress,
  Alert
} from '@mui/material';
import {
  MoreVert as MoreVertIcon,
  Visibility as ViewIcon,
  RestoreFromTrash as RestoreIcon,
  DeleteForever as PermanentDeleteIcon,
  Search as SearchIcon,
  DeleteSweep as EmptyIcon,
  Warning as WarningIcon
} from '@mui/icons-material';

import type {
  TrashDocument,
  TrashActionsProps,
  DocumentSortField,
  DocumentSortOrder,
  DocumentSortConfig,
  DocumentFilterConfig,
  TRASH_RETENTION_DAYS
} from './types';

interface TrashListProps {
  documents: TrashDocument[];
  onView: (document: TrashDocument) => void;
  onRestore: (document: TrashDocument) => void;
  onPermanentDelete: (document: TrashDocument) => void;
}

interface TrashActionsMenuProps extends TrashActionsProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
}

function TrashActionsMenu({
  document,
  anchorEl,
  open,
  onClose,
  onView,
  onRestore,
  onPermanentDelete
}: TrashActionsMenuProps) {
  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  const isExpiringSoon = document.days_remaining <= 7;
  const isExpired = document.days_remaining <= 0;

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
      <MenuItem onClick={() => handleAction(() => onRestore(document))}>
        <ListItemIcon>
          <RestoreIcon fontSize="small" color="success" />
        </ListItemIcon>
        <ListItemText>Restore</ListItemText>
      </MenuItem>
      <MenuItem
        onClick={() => handleAction(() => onPermanentDelete(document))}
        sx={{
          color: isExpired ? 'error.main' : 'warning.main',
          '& .MuiListItemIcon-root': {
            color: isExpired ? 'error.main' : 'warning.main'
          }
        }}
      >
        <ListItemIcon>
          <PermanentDeleteIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>
          {isExpired ? 'Delete Permanently (Expired)' : 'Delete Permanently'}
        </ListItemText>
      </MenuItem>
    </Menu>
  );
}

export default function TrashList({
  documents,
  onView,
  onRestore,
  onPermanentDelete
}: TrashListProps) {
  const [sortConfig, setSortConfig] = useState<DocumentSortConfig>({
    field: 'uploaded_at',
    order: 'desc'
  });

  const [filterConfig, setFilterConfig] = useState<DocumentFilterConfig>({
    documentType: '',
    dateRange: { start: null, end: null },
    searchTerm: '',
    showDeleted: true
  });

  const [menuState, setMenuState] = useState<{
    anchorEl: HTMLElement | null;
    document: TrashDocument | null;
  }>({ anchorEl: null, document: null });

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Get unique document types for filter dropdown
  const documentTypes = useMemo(() => {
    const types = new Set(documents.map(doc => doc.document_type));
    return Array.from(types).sort();
  }, [documents]);

  // Count expired documents
  const expiredCount = useMemo(() => {
    return documents.filter(doc => doc.days_remaining <= 0).length;
  }, [documents]);

  // Count expiring soon (within 7 days)
  const expiringSoonCount = useMemo(() => {
    return documents.filter(doc => doc.days_remaining > 0 && doc.days_remaining <= 7).length;
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
          // Sort by days remaining by default
          aValue = a.days_remaining;
          bValue = b.days_remaining;
          break;
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
  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, document: TrashDocument) => {
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

  // Format days in trash
  const formatDaysInTrash = (days: number): string => {
    if (days < 1) return 'Today';
    if (days < 2) return '1 day ago';
    return `${Math.floor(days)} days ago`;
  };

  // Format days remaining with color
  const formatDaysRemaining = (daysRemaining: number) => {
    if (daysRemaining <= 0) {
      return (
        <Chip
          label="Expired"
          size="small"
          color="error"
          variant="filled"
          icon={<WarningIcon />}
        />
      );
    }

    if (daysRemaining <= 7) {
      return (
        <Chip
          label={`${Math.ceil(daysRemaining)} days`}
          size="small"
          color="warning"
          variant="outlined"
          icon={<WarningIcon />}
        />
      );
    }

    return (
      <Chip
        label={`${Math.ceil(daysRemaining)} days`}
        size="small"
        color="default"
        variant="outlined"
      />
    );
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

  // Get retention progress (0-100)
  const getRetentionProgress = (daysRemaining: number): number => {
    const TRASH_RETENTION_DAYS = 30;
    return Math.max(0, Math.min(100, (daysRemaining / TRASH_RETENTION_DAYS) * 100));
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
        <RestoreIcon sx={{ fontSize: 64, mb: 2, opacity: 0.5 }} />
        <Typography variant="h6" gutterBottom>
          Trash is Empty
        </Typography>
        <Typography variant="body2">
          Deleted documents will appear here for 30 days
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Status Alerts */}
      {(expiredCount > 0 || expiringSoonCount > 0) && (
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          {expiredCount > 0 && (
            <Alert severity="error" sx={{ mb: 1 }}>
              <strong>{expiredCount}</strong> document{expiredCount > 1 ? 's have' : ' has'} expired and will be permanently deleted during the next cleanup
            </Alert>
          )}
          {expiringSoonCount > 0 && (
            <Alert severity="warning">
              <strong>{expiringSoonCount}</strong> document{expiringSoonCount > 1 ? 's will' : ' will'} expire within 7 days
            </Alert>
          )}
        </Box>
      )}

      {/* Filters */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
          <TextField
            size="small"
            placeholder="Search deleted documents..."
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
                Deleted
              </TableCell>
              <TableCell>
                Expires
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
                sx={{
                  '&:last-child td, &:last-child th': { border: 0 },
                  backgroundColor: doc.days_remaining <= 0 ? 'error.light' :
                                 doc.days_remaining <= 7 ? 'warning.light' : 'inherit',
                  opacity: doc.days_remaining <= 0 ? 0.7 : 1
                }}
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
                  <Tooltip title={formatDate(doc.deleted_at!)}>
                    <Typography variant="body2" color="text.secondary">
                      {formatDaysInTrash(doc.days_in_trash)}
                    </Typography>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <Box>
                    {formatDaysRemaining(doc.days_remaining)}
                    <LinearProgress
                      variant="determinate"
                      value={getRetentionProgress(doc.days_remaining)}
                      sx={{
                        mt: 0.5,
                        height: 4,
                        backgroundColor: 'grey.200',
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: doc.days_remaining <= 0 ? 'error.main' :
                                         doc.days_remaining <= 7 ? 'warning.main' : 'success.main'
                        }
                      }}
                    />
                  </Box>
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
        <TrashActionsMenu
          document={menuState.document}
          anchorEl={menuState.anchorEl}
          open={Boolean(menuState.anchorEl)}
          onClose={handleMenuClose}
          onView={onView}
          onRestore={onRestore}
          onPermanentDelete={onPermanentDelete}
        />
      )}
    </Box>
  );
}