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
  TextField,
  Paper,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Alert,
  Chip,
  Divider,
  Menu,
  MenuItem
} from '@mui/material';
import {
  Close as CloseIcon,
  Settings as SettingsIcon,
  Add as AddIcon,
  DragIndicator as DragIcon,
  MoreVert as MoreVertIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Lock as LockIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';

import type {
  DocumentType,
  DocumentTypeForm,
  DocumentTypeManagerProps
} from './types';

interface DocumentTypeManagerState {
  types: DocumentType[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  newTypeName: string;
  editingType: DocumentType | null;
  editTypeName: string;
}

interface TypeMenuState {
  anchorEl: HTMLElement | null;
  type: DocumentType | null;
}

export default function DocumentTypeManager({
  documentTypes,
  open,
  onClose,
  onTypeCreated,
  onTypeUpdated,
  onTypeDeleted
}: DocumentTypeManagerProps) {
  const [state, setState] = useState<DocumentTypeManagerState>({
    types: [],
    loading: false,
    saving: false,
    error: null,
    newTypeName: '',
    editingType: null,
    editTypeName: ''
  });

  const [menuState, setMenuState] = useState<TypeMenuState>({
    anchorEl: null,
    type: null
  });

  // Initialize types when dialog opens
  useEffect(() => {
    if (open) {
      setState(prev => ({
        ...prev,
        types: [...documentTypes].sort((a, b) => a.display_order - b.display_order),
        error: null,
        newTypeName: '',
        editingType: null,
        editTypeName: ''
      }));
    }
  }, [open, documentTypes]);

  // Handle menu open/close
  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, type: DocumentType) => {
    setMenuState({ anchorEl: event.currentTarget, type });
  };

  const handleMenuClose = () => {
    setMenuState({ anchorEl: null, type: null });
  };

  // Handle add new type
  const handleAddType = async () => {
    if (!state.newTypeName.trim()) {
      setState(prev => ({ ...prev, error: 'Type name is required' }));
      return;
    }

    // Check for duplicate names
    if (state.types.some(type => type.type_name.toLowerCase() === state.newTypeName.trim().toLowerCase())) {
      setState(prev => ({ ...prev, error: 'A document type with this name already exists' }));
      return;
    }

    try {
      setState(prev => ({ ...prev, saving: true, error: null }));

      const typeForm: DocumentTypeForm = {
        type_name: state.newTypeName.trim(),
        display_order: Math.max(...state.types.map(t => t.display_order), 0) + 10
      };

      const result = await window.electronAPI.documents.createType(typeForm);

      if (result.success) {
        setState(prev => ({ ...prev, newTypeName: '', saving: false }));
        onTypeCreated();
      } else {
        setState(prev => ({
          ...prev,
          saving: false,
          error: result.error || 'Failed to create document type'
        }));
      }
    } catch (error) {
      console.error('[DocumentTypeManager] Create type error:', error);
      setState(prev => ({
        ...prev,
        saving: false,
        error: 'Failed to create document type due to an unexpected error'
      }));
    }
  };

  // Handle edit type
  const handleEditType = (type: DocumentType) => {
    setState(prev => ({
      ...prev,
      editingType: type,
      editTypeName: type.type_name
    }));
    handleMenuClose();
  };

  // Handle save edit
  const handleSaveEdit = async () => {
    if (!state.editingType || !state.editTypeName.trim()) {
      setState(prev => ({ ...prev, error: 'Type name is required' }));
      return;
    }

    // Check for duplicate names (excluding current type)
    if (state.types.some(type =>
      type.id !== state.editingType!.id &&
      type.type_name.toLowerCase() === state.editTypeName.trim().toLowerCase()
    )) {
      setState(prev => ({ ...prev, error: 'A document type with this name already exists' }));
      return;
    }

    try {
      setState(prev => ({ ...prev, saving: true, error: null }));

      const updates: Partial<DocumentTypeForm> = {
        type_name: state.editTypeName.trim()
      };

      const result = await window.electronAPI.documents.updateType(state.editingType.id, updates);

      if (result.success) {
        setState(prev => ({
          ...prev,
          editingType: null,
          editTypeName: '',
          saving: false
        }));
        onTypeUpdated();
      } else {
        setState(prev => ({
          ...prev,
          saving: false,
          error: result.error || 'Failed to update document type'
        }));
      }
    } catch (error) {
      console.error('[DocumentTypeManager] Update type error:', error);
      setState(prev => ({
        ...prev,
        saving: false,
        error: 'Failed to update document type due to an unexpected error'
      }));
    }
  };

  // Handle cancel edit
  const handleCancelEdit = () => {
    setState(prev => ({
      ...prev,
      editingType: null,
      editTypeName: '',
      error: null
    }));
  };

  // Handle delete type
  const handleDeleteType = async (type: DocumentType) => {
    if (type.is_system_type) {
      setState(prev => ({ ...prev, error: 'System document types cannot be deleted' }));
      handleMenuClose();
      return;
    }

    if (!window.confirm(`Are you sure you want to delete the "${type.type_name}" document type? This action cannot be undone.`)) {
      handleMenuClose();
      return;
    }

    try {
      setState(prev => ({ ...prev, saving: true, error: null }));

      const result = await window.electronAPI.documents.deleteType(type.id);

      if (result.success) {
        setState(prev => ({ ...prev, saving: false }));
        onTypeDeleted();
      } else {
        setState(prev => ({
          ...prev,
          saving: false,
          error: result.error || 'Failed to delete document type'
        }));
      }
    } catch (error) {
      console.error('[DocumentTypeManager] Delete type error:', error);
      setState(prev => ({
        ...prev,
        saving: false,
        error: 'Failed to delete document type due to an unexpected error'
      }));
    }

    handleMenuClose();
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

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="md"
        fullWidth
        disableEscapeKeyDown={state.saving}
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h6" display="flex" alignItems="center" gap={1}>
                <SettingsIcon />
                Manage Document Types
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Add, edit, or remove custom document types
              </Typography>
            </Box>
            {!state.saving && (
              <IconButton onClick={onClose}>
                <CloseIcon />
              </IconButton>
            )}
          </Box>
        </DialogTitle>

        <DialogContent dividers>
          {/* Error Display */}
          {state.error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setState(prev => ({ ...prev, error: null }))}>
              {state.error}
            </Alert>
          )}

          {/* Add New Type */}
          <Box mb={3}>
            <Typography variant="subtitle1" gutterBottom>
              Add New Document Type
            </Typography>
            <Box display="flex" gap={2} alignItems="flex-start">
              <TextField
                label="Type Name"
                value={state.newTypeName}
                onChange={(e) => setState(prev => ({ ...prev, newTypeName: e.target.value, error: null }))}
                disabled={state.saving}
                placeholder="Enter new document type name"
                fullWidth
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddType();
                  }
                }}
              />
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleAddType}
                disabled={!state.newTypeName.trim() || state.saving}
                sx={{ minWidth: 120 }}
              >
                Add Type
              </Button>
            </Box>
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* Existing Types */}
          <Box>
            <Typography variant="subtitle1" gutterBottom>
              Existing Document Types ({state.types.length})
            </Typography>

            <Paper variant="outlined">
              <List dense>
                {state.types.map((type, index) => (
                  <React.Fragment key={type.id}>
                    {index > 0 && <Divider />}
                    <ListItem>
                      <ListItemIcon>
                        {type.is_system_type ? (
                          <LockIcon color="action" />
                        ) : (
                          <DragIcon color="action" />
                        )}
                      </ListItemIcon>

                      <ListItemText>
                        {state.editingType?.id === type.id ? (
                          <Box display="flex" gap={1} alignItems="center">
                            <TextField
                              value={state.editTypeName}
                              onChange={(e) => setState(prev => ({ ...prev, editTypeName: e.target.value }))}
                              size="small"
                              disabled={state.saving}
                              autoFocus
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSaveEdit();
                                } else if (e.key === 'Escape') {
                                  e.preventDefault();
                                  handleCancelEdit();
                                }
                              }}
                            />
                            <Button
                              size="small"
                              onClick={handleSaveEdit}
                              disabled={state.saving}
                            >
                              Save
                            </Button>
                            <Button
                              size="small"
                              onClick={handleCancelEdit}
                              disabled={state.saving}
                            >
                              Cancel
                            </Button>
                          </Box>
                        ) : (
                          <Box display="flex" alignItems="center" gap={1}>
                            <Typography variant="body1">
                              {getDocumentTypeIcon(type.type_name)} {type.type_name}
                            </Typography>
                            {type.is_system_type && (
                              <Chip
                                label="System"
                                size="small"
                                variant="outlined"
                                color="default"
                              />
                            )}
                          </Box>
                        )}
                      </ListItemText>

                      {state.editingType?.id !== type.id && (
                        <ListItemSecondaryAction>
                          <IconButton
                            edge="end"
                            onClick={(e) => handleMenuOpen(e, type)}
                            disabled={state.saving}
                          >
                            <MoreVertIcon />
                          </IconButton>
                        </ListItemSecondaryAction>
                      )}
                    </ListItem>
                  </React.Fragment>
                ))}
              </List>
            </Paper>

            {state.types.length === 0 && (
              <Box
                display="flex"
                flexDirection="column"
                alignItems="center"
                justifyContent="center"
                py={4}
                color="text.secondary"
              >
                <SettingsIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
                <Typography variant="h6" gutterBottom>
                  No Document Types
                </Typography>
                <Typography variant="body2">
                  Add your first custom document type above
                </Typography>
              </Box>
            )}
          </Box>

          {/* System Types Info */}
          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2">
              <strong>Note:</strong> System document types (marked with 🔒) cannot be edited or deleted.
              You can add custom types which will appear in the document upload form alongside the system types.
            </Typography>
          </Alert>
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose} disabled={state.saving}>
            {state.saving ? 'Processing...' : 'Done'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Type Actions Menu */}
      <Menu
        anchorEl={menuState.anchorEl}
        open={Boolean(menuState.anchorEl)}
        onClose={handleMenuClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        {menuState.type && (
          <>
            <MenuItem
              onClick={() => handleEditType(menuState.type!)}
              disabled={menuState.type.is_system_type}
            >
              <ListItemIcon>
                <EditIcon fontSize="small" />
              </ListItemIcon>
              <Typography variant="inherit">Edit Name</Typography>
            </MenuItem>
            <MenuItem
              onClick={() => handleDeleteType(menuState.type!)}
              disabled={menuState.type.is_system_type}
              sx={{ color: 'error.main' }}
            >
              <ListItemIcon>
                <DeleteIcon fontSize="small" color="error" />
              </ListItemIcon>
              <Typography variant="inherit">Delete Type</Typography>
            </MenuItem>
            {menuState.type.is_system_type && (
              <MenuItem disabled>
                <ListItemIcon>
                  <LockIcon fontSize="small" />
                </ListItemIcon>
                <Typography variant="inherit">System Type</Typography>
              </MenuItem>
            )}
          </>
        )}
      </Menu>
    </>
  );
}