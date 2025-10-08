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
  LinearProgress,
  Alert,
  Chip,
  Divider
} from '@mui/material';
import {
  Close as CloseIcon,
  CloudUpload as UploadIcon,
  InsertDriveFile as FileIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon
} from '@mui/icons-material';

import type {
  DocumentType,
  DocumentUploadForm,
  DocumentFormData,
  DocumentUploadState,
  FileSelectionResponse,
  DocumentUploadResponse
} from './types';

import {
  FILE_SIZE_LIMITS
} from './types';

interface DocumentUploadProps {
  account: {
    id: number;
    bank: string;
    account_name?: string;
    account_type: string;
    sub_type: string;
  };
  documentTypes: DocumentType[];
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function DocumentUpload({
  account,
  documentTypes,
  open,
  onClose,
  onSuccess
}: DocumentUploadProps) {
  const [state, setState] = useState<DocumentUploadState>({
    selectedFile: null,
    formData: {
      document_title: '',
      document_type: '',
      notes: '',
      document_date: ''
    },
    uploading: false,
    uploadProgress: 0,
    validationErrors: {}
  });

  const [showSizeWarning, setShowSizeWarning] = useState(false);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setState({
        selectedFile: null,
        formData: {
          document_title: '',
          document_type: documentTypes.length > 0 ? documentTypes[0].type_name : '',
          notes: '',
          document_date: ''
        },
        uploading: false,
        uploadProgress: 0,
        validationErrors: {}
      });
      setShowSizeWarning(false);
    }
  }, [open, documentTypes]);

  // Handle file selection
  const handleFileSelect = async () => {
    try {
      const result: FileSelectionResponse = await window.electronAPI.documents.selectFile();

      if (result.success && result.file_path) {
        setState(prev => ({ ...prev, selectedFile: result }));

        // Auto-populate title from filename if empty
        if (!state.formData.document_title && result.file_name) {
          const titleFromFile = result.file_name.replace(/\.[^/.]+$/, ''); // Remove extension
          setState(prev => ({
            ...prev,
            formData: { ...prev.formData, document_title: titleFromFile }
          }));
        }

        // Show size warning if needed
        if (result.warning) {
          setShowSizeWarning(true);
        }
      } else if (result.error) {
        setState(prev => ({
          ...prev,
          validationErrors: { file: result.error! }
        }));
      }
    } catch (error) {
      console.error('[DocumentUpload] File selection error:', error);
      setState(prev => ({
        ...prev,
        validationErrors: { file: 'Failed to select file' }
      }));
    }
  };

  // Handle form field changes
  const handleFieldChange = (field: keyof DocumentFormData, value: string) => {
    setState(prev => {
      const newValidationErrors = { ...prev.validationErrors };
      delete newValidationErrors[field];

      return {
        ...prev,
        formData: { ...prev.formData, [field]: value },
        validationErrors: newValidationErrors
      };
    });
  };

  // Validate form
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!state.selectedFile) {
      errors.file = 'Please select a PDF file';
    }

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

  // Handle upload
  const handleUpload = async () => {
    if (!validateForm() || !state.selectedFile) {
      return;
    }

    try {
      setState(prev => ({ ...prev, uploading: true, uploadProgress: 0 }));

      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setState(prev => ({
          ...prev,
          uploadProgress: Math.min(prev.uploadProgress + 10, 90)
        }));
      }, 200);

      const uploadData: { filePath: string; formData: DocumentUploadForm } = {
        filePath: state.selectedFile.file_path!,
        formData: {
          account_id: account.id,
          document_title: state.formData.document_title.trim(),
          document_type: state.formData.document_type,
          notes: state.formData.notes.trim() || undefined,
          document_date: state.formData.document_date || undefined
        }
      };

      const result: DocumentUploadResponse = await window.electronAPI.documents.upload(uploadData);

      clearInterval(progressInterval);
      setState(prev => ({ ...prev, uploadProgress: 100 }));

      if (result.success) {
        // Brief delay to show completed progress
        setTimeout(() => {
          onSuccess();
        }, 500);
      } else {
        setState(prev => ({
          ...prev,
          uploading: false,
          uploadProgress: 0,
          validationErrors: { general: result.error || 'Upload failed' }
        }));
      }
    } catch (error) {
      console.error('[DocumentUpload] Upload error:', error);
      setState(prev => ({
        ...prev,
        uploading: false,
        uploadProgress: 0,
        validationErrors: { general: 'Upload failed due to an unexpected error' }
      }));
    }
  };

  // Handle cancel
  const handleCancel = () => {
    if (!state.uploading) {
      onClose();
    }
  };

  // Format file size
  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Get file size chip color
  const getFileSizeColor = (bytes?: number) => {
    if (!bytes) return 'default';
    if (bytes > FILE_SIZE_LIMITS.WARNING_SIZE) return 'warning';
    return 'success';
  };

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown={state.uploading}
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">
            📄 Upload Document
          </Typography>
          {!state.uploading && (
            <IconButton onClick={handleCancel}>
              <CloseIcon />
            </IconButton>
          )}
        </Box>
        <Typography variant="body2" color="text.secondary">
          {account.bank} - {account.account_name || account.account_type}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        {/* General Error */}
        {state.validationErrors.general && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {state.validationErrors.general}
          </Alert>
        )}

        {/* Size Warning */}
        {showSizeWarning && state.selectedFile?.warning && (
          <Alert
            severity="warning"
            sx={{ mb: 2 }}
            onClose={() => setShowSizeWarning(false)}
          >
            {state.selectedFile.warning}
          </Alert>
        )}

        {/* File Selection */}
        <Box mb={3}>
          <Typography variant="subtitle2" gutterBottom>
            Select PDF File *
          </Typography>

          {!state.selectedFile ? (
            <Paper
              sx={{
                p: 3,
                textAlign: 'center',
                border: '2px dashed',
                borderColor: state.validationErrors.file ? 'error.main' : 'grey.300',
                cursor: 'pointer',
                '&:hover': { borderColor: 'primary.main' }
              }}
              onClick={handleFileSelect}
            >
              <UploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
              <Typography variant="h6" gutterBottom>
                Choose PDF File
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Click to select a PDF document from your computer
              </Typography>
              <Typography variant="caption" display="block" mt={1}>
                Maximum file size: {formatFileSize(FILE_SIZE_LIMITS.MAX_SIZE)}
              </Typography>
            </Paper>
          ) : (
            <Paper
              sx={{
                p: 2,
                border: 1,
                borderColor: 'success.main',
                backgroundColor: 'success.light',
                borderRadius: 1
              }}
            >
              <Box display="flex" alignItems="center" gap={2}>
                <FileIcon color="success" />
                <Box flex={1}>
                  <Typography variant="body2" fontWeight="medium">
                    {state.selectedFile.file_name}
                  </Typography>
                  <Box display="flex" gap={1} mt={0.5}>
                    <Chip
                      label={formatFileSize(state.selectedFile.file_size)}
                      size="small"
                      color={getFileSizeColor(state.selectedFile.file_size)}
                      variant="outlined"
                    />
                    <Chip
                      label={state.selectedFile.mime_type}
                      size="small"
                      variant="outlined"
                    />
                  </Box>
                </Box>
                <Button
                  size="small"
                  onClick={handleFileSelect}
                  disabled={state.uploading}
                >
                  Change
                </Button>
              </Box>
            </Paper>
          )}

          {state.validationErrors.file && (
            <Typography variant="caption" color="error" display="block" mt={1}>
              {state.validationErrors.file}
            </Typography>
          )}
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
            disabled={state.uploading}
            required
            fullWidth
          />

          <FormControl
            error={!!state.validationErrors.document_type}
            disabled={state.uploading}
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
                  {type.type_name}
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
            disabled={state.uploading}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />

          <TextField
            label="Notes"
            multiline
            rows={3}
            value={state.formData.notes}
            onChange={(e) => handleFieldChange('notes', e.target.value)}
            disabled={state.uploading}
            placeholder="Additional notes about this document (optional)"
            fullWidth
          />
        </Box>

        {/* Upload Progress */}
        {state.uploading && (
          <Box mt={3}>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              {state.uploadProgress < 100 ? (
                <Typography variant="body2">Uploading document...</Typography>
              ) : (
                <>
                  <CheckIcon color="success" fontSize="small" />
                  <Typography variant="body2" color="success.main">
                    Upload complete!
                  </Typography>
                </>
              )}
            </Box>
            <LinearProgress
              variant="determinate"
              value={state.uploadProgress}
              sx={{ height: 8, borderRadius: 4 }}
            />
            <Typography variant="caption" color="text.secondary">
              {state.uploadProgress}%
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button
          onClick={handleCancel}
          disabled={state.uploading}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          startIcon={<UploadIcon />}
          onClick={handleUpload}
          disabled={!state.selectedFile || state.uploading}
        >
          {state.uploading ? 'Uploading...' : 'Upload Document'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}