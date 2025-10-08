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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  Alert,
  Chip,
  Divider
} from '@mui/material';
import {
  Close as CloseIcon,
  Save as SaveIcon,
  Edit as EditIcon,
  Description as DocumentIcon
} from '@mui/icons-material';

import type {
  DocumentWithAccountDetails,
  DocumentType,
  DocumentFormData,
  DocumentUpdateForm
} from './types';

interface DocumentEditProps {
  document: DocumentWithAccountDetails;
  documentTypes: DocumentType[];
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface DocumentEditState {
  formData: DocumentFormData;
  saving: boolean;
  validationErrors: Record<string, string>;
  hasChanges: boolean;
}

export default function DocumentEdit({
  document,
  documentTypes,
  open,
  onClose,
  onSuccess
}: DocumentEditProps) {
  const [state, setState] = useState<DocumentEditState>({
    formData: {
      document_title: '',
      document_type: '',
      notes: '',
      document_date: ''
    },
    saving: false,
    validationErrors: {},
    hasChanges: false
  });

  // Initialize form data when dialog opens
  useEffect(() => {
    if (open && document) {
      const formData: DocumentFormData = {
        document_title: document.document_title,
        document_type: document.document_type,
        notes: document.notes || '',
        document_date: document.document_date || ''
      };

      setState({
        formData,
        saving: false,
        validationErrors: {},
        hasChanges: false
      });
    }
  }, [open, document]);

  // Handle form field changes
  const handleFieldChange = (field: keyof DocumentFormData, value: string) => {
    setState(prev => {
      const newFormData = { ...prev.formData, [field]: value };
      const hasChanges = (
        newFormData.document_title !== document.document_title ||
        newFormData.document_type !== document.document_type ||
        newFormData.notes !== (document.notes || '') ||
        newFormData.document_date !== (document.document_date || '')
      );

      const newValidationErrors = { ...prev.validationErrors };
      delete newValidationErrors[field];

      return {
        ...prev,
        formData: newFormData,
        validationErrors: newValidationErrors,
        hasChanges
      };
    });
  };

  // Validate form
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!state.formData.document_title.trim()) {
      errors.document_title = 'Document title is required';
    }

    if (!state.formData.document_type) {
      errors.document_type = 'Document type is required';
    }

    if (state.formData.document_date) {
      const date = new Date(state.formData.document_date);
      if (date > new Date()) {
        errors.document_date = 'Document date cannot be in the future';
      }
    }

    setState(prev => ({ ...prev, validationErrors: errors }));
    return Object.keys(errors).length === 0;
  };

  // Handle save
  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setState(prev => ({ ...prev, saving: true }));

      const updates: DocumentUpdateForm = {};

      // Only include changed fields
      if (state.formData.document_title !== document.document_title) {
        updates.document_title = state.formData.document_title.trim();
      }

      if (state.formData.document_type !== document.document_type) {
        updates.document_type = state.formData.document_type;
      }

      if (state.formData.notes !== (document.notes || '')) {
        updates.notes = state.formData.notes.trim() || undefined;
      }

      if (state.formData.document_date !== (document.document_date || '')) {
        updates.document_date = state.formData.document_date || undefined;
      }

      // Only make the API call if there are actually changes
      if (Object.keys(updates).length > 0) {
        const result = await window.electronAPI.documents.update(document.id, updates);

        if (result.success) {
          onSuccess();
        } else {
          setState(prev => ({
            ...prev,
            saving: false,
            validationErrors: { general: result.error || 'Failed to save changes' }
          }));
        }
      } else {
        // No changes to save
        onClose();
      }
    } catch (error) {
      console.error('[DocumentEdit] Save error:', error);
      setState(prev => ({
        ...prev,
        saving: false,
        validationErrors: { general: 'Failed to save changes due to an unexpected error' }
      }));
    }
  };

  // Handle cancel
  const handleCancel = () => {
    if (state.hasChanges) {
      if (window.confirm('You have unsaved changes. Are you sure you want to cancel?')) {
        onClose();
      }
    } else {
      onClose();
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
    return date.toLocaleDateString();
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
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown={state.saving}
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h6" display="flex" alignItems="center" gap={1}>
              <EditIcon />
              Edit Document
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Update document metadata and properties
            </Typography>
          </Box>
          {!state.saving && (
            <IconButton onClick={handleCancel}>
              <CloseIcon />
            </IconButton>
          )}
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {/* General Error */}
        {state.validationErrors.general && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {state.validationErrors.general}
          </Alert>
        )}

        {/* Document Info */}
        <Box mb={3}>
          <Paper sx={{ p: 2, backgroundColor: 'grey.50' }}>
            <Box display="flex" alignItems="center" gap={2}>
              <DocumentIcon color="primary" />
              <Box flex={1}>
                <Typography variant="body2" fontWeight="medium">
                  {document.file_name}
                </Typography>
                <Box display="flex" gap={1} mt={0.5}>
                  <Chip
                    label={formatFileSize(document.file_size)}
                    size="small"
                    variant="outlined"
                  />
                  <Chip
                    label={`Uploaded ${formatDate(document.uploaded_at)}`}
                    size="small"
                    variant="outlined"
                  />
                </Box>
              </Box>
            </Box>
          </Paper>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Form Fields */}
        <Box display="flex" flexDirection="column" gap={2}>
          <TextField
            label="Document Title"
            value={state.formData.document_title}
            onChange={(e) => handleFieldChange('document_title', e.target.value)}
            error={!!state.validationErrors.document_title}
            helperText={state.validationErrors.document_title}
            disabled={state.saving}
            required
            fullWidth
          />

          <FormControl
            error={!!state.validationErrors.document_type}
            disabled={state.saving}
            required
            fullWidth
          >
            <InputLabel>Document Type</InputLabel>
            <Select
              value={state.formData.document_type}
              label="Document Type"
              onChange={(e) => handleFieldChange('document_type', e.target.value)}
            >
              {documentTypes.map((type) => (
                <MenuItem key={type.id} value={type.type_name}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <span>{getDocumentTypeIcon(type.type_name)}</span>
                    {type.type_name}
                  </Box>
                </MenuItem>
              ))}
            </Select>
            {state.validationErrors.document_type && (
              <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                {state.validationErrors.document_type}
              </Typography>
            )}
          </FormControl>

          <TextField
            label="Document Date"
            type="date"
            value={state.formData.document_date}
            onChange={(e) => handleFieldChange('document_date', e.target.value)}
            error={!!state.validationErrors.document_date}
            helperText={state.validationErrors.document_date || 'Date this document refers to (optional)'}
            disabled={state.saving}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />

          <TextField
            label="Notes"
            multiline
            rows={3}
            value={state.formData.notes}
            onChange={(e) => handleFieldChange('notes', e.target.value)}
            disabled={state.saving}
            placeholder="Additional notes about this document (optional)"
            fullWidth
          />
        </Box>

        {/* Changes Indicator */}
        {state.hasChanges && (
          <Alert severity="info" sx={{ mt: 2 }}>
            You have unsaved changes. Click "Save Changes" to apply them.
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button
          onClick={handleCancel}
          disabled={state.saving}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={!state.hasChanges || state.saving}
        >
          {state.saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}