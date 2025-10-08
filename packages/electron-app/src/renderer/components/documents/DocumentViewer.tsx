import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Chip,
  Divider,
  Paper
} from '@mui/material';
import {
  Close as CloseIcon,
  GetApp as DownloadIcon,
  OpenInNew as OpenInSystemIcon,
  Refresh as RefreshIcon,
  Error as ErrorIcon,
  Description as DocumentIcon
} from '@mui/icons-material';

import type {
  AccountDocument,
  TrashDocument,
  DocumentWithAccountDetails
} from './types';

interface DocumentViewerProps {
  document: AccountDocument | TrashDocument | DocumentWithAccountDetails;
  open: boolean;
  onClose: () => void;
  onDownload?: () => void;
}

interface ViewerState {
  loading: boolean;
  error: string | null;
  pdfDataUrl: string | null;
  retryCount: number;
}

export default function DocumentViewer({
  document,
  open,
  onClose,
  onDownload
}: DocumentViewerProps) {
  const [state, setState] = useState<ViewerState>({
    loading: false,
    error: null,
    pdfDataUrl: null,
    retryCount: 0
  });

  // Load document data when dialog opens
  useEffect(() => {
    if (open && document) {
      loadDocumentData();
    } else {
      // Clear data when dialog closes
      setState({
        loading: false,
        error: null,
        pdfDataUrl: null,
        retryCount: 0
      });
    }
  }, [open, document]);

  const loadDocumentData = async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await window.electronAPI.documents.view(document.id);

      if (result.success && result.data) {
        setState(prev => ({
          ...prev,
          loading: false,
          pdfDataUrl: result.data,
          error: null
        }));
      } else {
        setState(prev => ({
          ...prev,
          loading: false,
          error: result.error || 'Failed to load document'
        }));
      }
    } catch (error) {
      console.error('[DocumentViewer] Load error:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to load document due to an unexpected error'
      }));
    }
  };

  const handleRetry = () => {
    if (state.retryCount < 3) {
      setState(prev => ({ ...prev, retryCount: prev.retryCount + 1 }));
      loadDocumentData();
    }
  };

  const handleOpenInSystem = async () => {
    try {
      const result = await window.electronAPI.documents.openInSystem(document.id);
      if (!result.success && result.error) {
        setState(prev => ({ ...prev, error: result.error! }));
      }
    } catch (error) {
      console.error('[DocumentViewer] Open in system error:', error);
      setState(prev => ({ ...prev, error: 'Failed to open document in system viewer' }));
    }
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
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
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

  // Check if document is in trash
  const isInTrash = 'days_in_trash' in document;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: { height: '90vh', display: 'flex', flexDirection: 'column' }
      }}
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box flex={1}>
            <Typography variant="h6" noWrap>
              {getDocumentTypeIcon(document.document_type)} {document.document_title}
            </Typography>
            <Box display="flex" gap={1} mt={0.5} flexWrap="wrap">
              <Chip
                label={document.document_type}
                size="small"
                variant="outlined"
                color="primary"
              />
              <Chip
                label={formatFileSize(document.file_size)}
                size="small"
                variant="outlined"
              />
              {document.document_date && (
                <Chip
                  label={`Date: ${formatDate(document.document_date)}`}
                  size="small"
                  variant="outlined"
                />
              )}
              {isInTrash && (
                <Chip
                  label="In Trash"
                  size="small"
                  color="warning"
                  variant="filled"
                />
              )}
            </Box>
          </Box>
          <Box display="flex" gap={1}>
            <IconButton onClick={handleOpenInSystem} title="Open in System Viewer">
              <OpenInSystemIcon />
            </IconButton>
            {onDownload && (
              <IconButton onClick={onDownload} title="Download">
                <DownloadIcon />
              </IconButton>
            )}
            <IconButton onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ flex: 1, p: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Document Notes */}
        {document.notes && (
          <Box px={3} pt={2}>
            <Paper sx={{ p: 2, backgroundColor: 'grey.50' }}>
              <Typography variant="body2">
                <strong>Notes:</strong> {document.notes}
              </Typography>
            </Paper>
          </Box>
        )}

        {/* Error Display */}
        {state.error && (
          <Box px={3} pt={2}>
            <Alert
              severity="error"
              action={
                state.retryCount < 3 && (
                  <Button size="small" onClick={handleRetry} startIcon={<RefreshIcon />}>
                    Retry
                  </Button>
                )
              }
            >
              {state.error}
            </Alert>
          </Box>
        )}

        {/* PDF Viewer */}
        <Box flex={1} sx={{ position: 'relative', minHeight: 400 }}>
          {state.loading ? (
            <Box
              display="flex"
              flexDirection="column"
              alignItems="center"
              justifyContent="center"
              height="100%"
              gap={2}
            >
              <CircularProgress size={48} />
              <Typography variant="body2" color="text.secondary">
                Loading document...
              </Typography>
            </Box>
          ) : state.error ? (
            <Box
              display="flex"
              flexDirection="column"
              alignItems="center"
              justifyContent="center"
              height="100%"
              gap={2}
              color="text.secondary"
            >
              <ErrorIcon sx={{ fontSize: 64, opacity: 0.5 }} />
              <Typography variant="h6">
                Unable to Display Document
              </Typography>
              <Typography variant="body2" textAlign="center">
                The document could not be loaded for viewing.<br />
                You can try downloading it or opening it in your system's default PDF viewer.
              </Typography>
            </Box>
          ) : state.pdfDataUrl ? (
            <Box
              sx={{
                width: '100%',
                height: '100%',
                '& iframe, & embed, & object': {
                  width: '100%',
                  height: '100%',
                  border: 0
                }
              }}
            >
              <embed
                src={state.pdfDataUrl}
                type="application/pdf"
                width="100%"
                height="100%"
                style={{ border: 0 }}
              />
            </Box>
          ) : (
            <Box
              display="flex"
              flexDirection="column"
              alignItems="center"
              justifyContent="center"
              height="100%"
              gap={2}
              color="text.secondary"
            >
              <DocumentIcon sx={{ fontSize: 64, opacity: 0.5 }} />
              <Typography variant="h6">
                Document Viewer
              </Typography>
              <Typography variant="body2">
                Click a document to view it here
              </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions>
        <Box display="flex" justifyContent="space-between" width="100%">
          <Box display="flex" gap={1}>
            <Button
              startIcon={<OpenInSystemIcon />}
              onClick={handleOpenInSystem}
            >
              Open in System
            </Button>
            {onDownload && (
              <Button
                startIcon={<DownloadIcon />}
                onClick={onDownload}
              >
                Download
              </Button>
            )}
          </Box>
          <Button onClick={onClose}>
            Close
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}