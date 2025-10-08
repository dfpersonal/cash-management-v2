import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Typography,
  Box,
  Tabs,
  Tab,
  Alert,
  Chip,
  Divider,
  CircularProgress,
  Snackbar
} from '@mui/material';
import {
  Close as CloseIcon,
  CloudUpload as UploadIcon,
  GetApp as DownloadAllIcon,
  Storage as StorageIcon,
  Settings as SettingsIcon
} from '@mui/icons-material';

import type {
  DocumentManagerProps,
  DocumentManagerState,
  DocumentWithAccountDetails,
  TrashDocument,
  DocumentType,
  DocumentSnackbarState,
  DocumentDialogStates,
  StorageCheckResponse
} from './types';

import DocumentList from './DocumentList';
import TrashList from './TrashList';
import DocumentUpload from './DocumentUpload';
import DocumentViewer from './DocumentViewer';
import DocumentEdit from './DocumentEdit';
import DocumentTypeManager from './DocumentTypeManager';
import StorageInfo from './StorageInfo';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      style={{ height: '100%' }}
    >
      {value === index && children}
    </div>
  );
}

export default function DocumentManager({
  account,
  open,
  onClose,
  refreshTrigger = 0
}: DocumentManagerProps) {
  const [state, setState] = useState<DocumentManagerState>({
    activeTab: 0,
    documents: [],
    trashDocuments: [],
    documentTypes: [],
    loading: false,
    uploading: false,
    error: null
  });

  const [dialogs, setDialogs] = useState<DocumentDialogStates>({
    uploadOpen: false,
    viewerOpen: false,
    editOpen: false,
    typeManagerOpen: false,
    confirmDeleteOpen: false,
    confirmRestoreOpen: false,
    storageInfoOpen: false
  });

  const [snackbar, setSnackbar] = useState<DocumentSnackbarState>({
    open: false,
    message: '',
    severity: 'info'
  });

  const [selectedDocument, setSelectedDocument] = useState<DocumentWithAccountDetails | TrashDocument | null>(null);
  const [storageInfo, setStorageInfo] = useState<StorageCheckResponse | null>(null);

  // Load documents and related data
  const loadData = useCallback(async () => {
    if (!open || !account?.id) return;

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Load active documents
      const activeResult = await window.electronAPI.documents.list(account.id);
      if (!activeResult.success) {
        throw new Error(activeResult.error || 'Failed to load documents');
      }

      // Load trash documents
      const trashResult = await window.electronAPI.documents.listTrash(account.id);
      if (!trashResult.success) {
        throw new Error(trashResult.error || 'Failed to load trash documents');
      }

      // Load document types
      const typesResult = await window.electronAPI.documents.getTypes();
      if (!typesResult.success) {
        throw new Error(typesResult.error || 'Failed to load document types');
      }

      // Check storage
      const storageResult = await window.electronAPI.documents.checkStorage();
      setStorageInfo(storageResult);

      setState(prev => ({
        ...prev,
        documents: activeResult.data || [],
        trashDocuments: trashResult.data || [],
        documentTypes: typesResult.data || [],
        loading: false
      }));

    } catch (error) {
      console.error('[DocumentManager] Failed to load data:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load documents'
      }));
    }
  }, [account?.id, open]);

  // Load data when dialog opens or refresh is triggered
  useEffect(() => {
    loadData();
  }, [loadData, refreshTrigger]);

  // Handle tab change
  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setState(prev => ({ ...prev, activeTab: newValue }));
  };

  // Dialog handlers
  const openDialog = (dialogName: keyof DocumentDialogStates) => {
    setDialogs(prev => ({ ...prev, [dialogName]: true }));
  };

  const closeDialog = (dialogName: keyof DocumentDialogStates) => {
    setDialogs(prev => ({ ...prev, [dialogName]: false }));
    setSelectedDocument(null);
  };

  const closeAllDialogs = () => {
    setDialogs({
      uploadOpen: false,
      viewerOpen: false,
      editOpen: false,
      typeManagerOpen: false,
      confirmDeleteOpen: false,
      confirmRestoreOpen: false,
      storageInfoOpen: false
    });
    setSelectedDocument(null);
  };

  // Document action handlers
  const handleView = (document: DocumentWithAccountDetails | TrashDocument) => {
    setSelectedDocument(document);
    openDialog('viewerOpen');
  };

  const handleEdit = (document: DocumentWithAccountDetails) => {
    setSelectedDocument(document);
    openDialog('editOpen');
  };

  const handleDelete = async (document: DocumentWithAccountDetails) => {
    try {
      const result = await window.electronAPI.documents.softDelete(document.id);
      if (result.success) {
        showSnackbar('Document moved to trash', 'info');
        await loadData();
      } else {
        showSnackbar(result.error || 'Failed to delete document', 'error');
      }
    } catch (error) {
      console.error('[DocumentManager] Delete error:', error);
      showSnackbar('Failed to delete document', 'error');
    }
  };

  const handleRestore = async (document: TrashDocument) => {
    try {
      const result = await window.electronAPI.documents.restore(document.id);
      if (result.success) {
        showSnackbar('Document restored', 'success');
        await loadData();
      } else {
        showSnackbar(result.error || 'Failed to restore document', 'error');
      }
    } catch (error) {
      console.error('[DocumentManager] Restore error:', error);
      showSnackbar('Failed to restore document', 'error');
    }
  };

  const handlePermanentDelete = async (document: TrashDocument) => {
    try {
      const result = await window.electronAPI.documents.permanentDelete(document.id);
      if (result.success) {
        showSnackbar('Document permanently deleted', 'warning');
        await loadData();
      } else {
        showSnackbar(result.error || 'Failed to permanently delete document', 'error');
      }
    } catch (error) {
      console.error('[DocumentManager] Permanent delete error:', error);
      showSnackbar('Failed to permanently delete document', 'error');
    }
  };

  const handleDownload = async (document: DocumentWithAccountDetails | TrashDocument) => {
    try {
      const result = await window.electronAPI.documents.download(document.id);
      if (result.success) {
        showSnackbar('Document downloaded', 'success');
      } else {
        showSnackbar(result.error || 'Failed to download document', 'error');
      }
    } catch (error) {
      console.error('[DocumentManager] Download error:', error);
      showSnackbar('Failed to download document', 'error');
    }
  };

  // Bulk operations
  const handleDownloadAll = async () => {
    if (state.documents.length === 0) {
      showSnackbar('No documents to download', 'info');
      return;
    }

    try {
      setState(prev => ({ ...prev, loading: true }));
      const result = await window.electronAPI.documents.downloadAll(account.id);

      if (result.success) {
        showSnackbar(`Downloaded ${result.file_count} documents as ZIP`, 'success');
      } else {
        showSnackbar(result.error || 'Failed to download documents', 'error');
      }
    } catch (error) {
      console.error('[DocumentManager] Download all error:', error);
      showSnackbar('Failed to download documents', 'error');
    } finally {
      setState(prev => ({ ...prev, loading: false }));
    }
  };

  const handleUploadSuccess = () => {
    closeDialog('uploadOpen');
    showSnackbar('Document uploaded successfully', 'success');
    loadData();
  };

  const handleEditSuccess = () => {
    closeDialog('editOpen');
    showSnackbar('Document updated successfully', 'success');
    loadData();
  };

  const handleTypeManagerSuccess = () => {
    showSnackbar('Document types updated', 'success');
    loadData();
  };

  // Utility functions
  const showSnackbar = (message: string, severity: DocumentSnackbarState['severity']) => {
    setSnackbar({ open: true, message, severity });
  };

  const handleSnackbarClose = () => {
    setSnackbar(prev => ({ ...prev, open: false }));
  };

  // Storage warning
  const showStorageWarning = storageInfo?.show_warning && storageInfo?.warning_message;

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: { height: '80vh', display: 'flex', flexDirection: 'column' }
        }}
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h6" component="div">
                📄 Documents: {account.bank}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {account.account_name ? `${account.account_name} - ` : ''}
                {account.account_type} - {account.sub_type}
              </Typography>
            </Box>
            <Box display="flex" gap={1}>
              <IconButton onClick={() => openDialog('storageInfoOpen')} size="small">
                <StorageIcon />
              </IconButton>
              <IconButton onClick={() => openDialog('typeManagerOpen')} size="small">
                <SettingsIcon />
              </IconButton>
              <IconButton onClick={onClose}>
                <CloseIcon />
              </IconButton>
            </Box>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 0 }}>
          {/* Storage Warning */}
          {showStorageWarning && (
            <Box px={3} pt={2}>
              <Alert severity="warning" onClose={() => setStorageInfo(prev => prev ? { ...prev, show_warning: false } : null)}>
                {storageInfo.warning_message}
              </Alert>
            </Box>
          )}

          {/* Error Display */}
          {state.error && (
            <Box px={3} pt={2}>
              <Alert severity="error" onClose={() => setState(prev => ({ ...prev, error: null }))}>
                {state.error}
              </Alert>
            </Box>
          )}

          {/* Tabs */}
          <Box px={3} pt={2}>
            <Tabs value={state.activeTab} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tab
                label={
                  <Box display="flex" alignItems="center" gap={1}>
                    Active
                    {state.documents.length > 0 && (
                      <Chip label={state.documents.length} size="small" color="primary" variant="outlined" />
                    )}
                  </Box>
                }
              />
              <Tab
                label={
                  <Box display="flex" alignItems="center" gap={1}>
                    Trash
                    {state.trashDocuments.length > 0 && (
                      <Chip label={state.trashDocuments.length} size="small" color="warning" variant="outlined" />
                    )}
                  </Box>
                }
              />
            </Tabs>
          </Box>

          {/* Tab Content */}
          <Box flex={1} sx={{ position: 'relative' }}>
            {state.loading ? (
              <Box display="flex" justifyContent="center" alignItems="center" height="300px">
                <CircularProgress />
              </Box>
            ) : (
              <>
                <TabPanel value={state.activeTab} index={0}>
                  <DocumentList
                    documents={state.documents}
                    onView={handleView}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onDownload={handleDownload}
                  />
                </TabPanel>
                <TabPanel value={state.activeTab} index={1}>
                  <TrashList
                    documents={state.trashDocuments}
                    onView={handleView}
                    onRestore={handleRestore}
                    onPermanentDelete={handlePermanentDelete}
                  />
                </TabPanel>
              </>
            )}
          </Box>

          {/* Upload Button */}
          <Box px={3} py={2}>
            <Divider sx={{ mb: 2 }} />
            <Button
              variant="contained"
              startIcon={<UploadIcon />}
              onClick={() => openDialog('uploadOpen')}
              fullWidth
              disabled={state.loading || state.uploading}
            >
              Upload New Document
            </Button>
          </Box>
        </DialogContent>

        <DialogActions>
          <Box display="flex" justifyContent="space-between" width="100%">
            <Button
              startIcon={<DownloadAllIcon />}
              onClick={handleDownloadAll}
              disabled={state.documents.length === 0 || state.loading}
            >
              Download All ({state.documents.length})
            </Button>
            <Button onClick={onClose}>Close</Button>
          </Box>
        </DialogActions>
      </Dialog>

      {/* Document Upload Dialog */}
      <DocumentUpload
        account={account}
        documentTypes={state.documentTypes}
        open={dialogs.uploadOpen}
        onClose={() => closeDialog('uploadOpen')}
        onSuccess={handleUploadSuccess}
      />

      {/* Document Viewer */}
      {selectedDocument && (
        <DocumentViewer
          document={selectedDocument}
          open={dialogs.viewerOpen}
          onClose={() => closeDialog('viewerOpen')}
          onDownload={() => handleDownload(selectedDocument)}
        />
      )}

      {/* Document Editor */}
      {selectedDocument && 'account_id' in selectedDocument && !('days_in_trash' in selectedDocument) && (
        <DocumentEdit
          document={selectedDocument as DocumentWithAccountDetails}
          documentTypes={state.documentTypes}
          open={dialogs.editOpen}
          onClose={() => closeDialog('editOpen')}
          onSuccess={handleEditSuccess}
        />
      )}

      {/* Document Type Manager */}
      <DocumentTypeManager
        documentTypes={state.documentTypes}
        open={dialogs.typeManagerOpen}
        onClose={() => closeDialog('typeManagerOpen')}
        onTypeCreated={handleTypeManagerSuccess}
        onTypeUpdated={handleTypeManagerSuccess}
        onTypeDeleted={handleTypeManagerSuccess}
      />

      {/* Storage Info */}
      <StorageInfo
        open={dialogs.storageInfoOpen}
        onClose={() => closeDialog('storageInfoOpen')}
        storageCheck={storageInfo || undefined}
      />

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={handleSnackbarClose} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}