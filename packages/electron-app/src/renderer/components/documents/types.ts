/**
 * Document Components Type Definitions
 *
 * Local types specific to React components for document management
 */

// Import commonly used types from shared types
import type {
  DocumentType,
  AccountDocument,
  DocumentWithAccountDetails,
  TrashDocument,
  DocumentCountSummary,
  DocumentUploadForm,
  DocumentUpdateForm,
  DocumentTypeForm,
  DocumentFilters,
  DocumentApiResponse,
  DocumentUploadResponse,
  FileSelectionResponse,
  DownloadAllResponse,
  StorageCheckResponse,
  CleanupResponse,
  DocumentListItem,
  TrashListItem,
  DocumentViewerProps,
  DocumentManagerProps,
  DocumentValidationResult,
  DEFAULT_DOCUMENT_TYPES
} from '@cash-mgmt/shared';

import {
  FILE_SIZE_LIMITS,
  TRASH_RETENTION_DAYS
} from '@cash-mgmt/shared';

// Re-export for convenience
export type {
  DocumentType,
  AccountDocument,
  DocumentWithAccountDetails,
  TrashDocument,
  DocumentCountSummary,
  DocumentUploadForm,
  DocumentUpdateForm,
  DocumentTypeForm,
  DocumentFilters,
  DocumentApiResponse,
  DocumentUploadResponse,
  FileSelectionResponse,
  DownloadAllResponse,
  StorageCheckResponse,
  CleanupResponse,
  DocumentListItem,
  TrashListItem,
  DocumentViewerProps,
  DocumentManagerProps,
  DocumentValidationResult,
};

// Re-export constants
export {
  FILE_SIZE_LIMITS,
  TRASH_RETENTION_DAYS
};

// Component-specific interfaces
export interface DocumentTabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

export interface DocumentActionsProps {
  document: DocumentWithAccountDetails;
  onView: (document: DocumentWithAccountDetails) => void;
  onEdit: (document: DocumentWithAccountDetails) => void;
  onDelete: (document: DocumentWithAccountDetails) => void;
  onDownload: (document: DocumentWithAccountDetails) => void;
}

export interface TrashActionsProps {
  document: TrashDocument;
  onView: (document: TrashDocument) => void;
  onRestore: (document: TrashDocument) => void;
  onPermanentDelete: (document: TrashDocument) => void;
}

export interface DocumentFormData {
  document_title: string;
  document_type: string;
  notes: string;
  document_date: string;
}

export interface DocumentFormProps {
  initialData?: Partial<DocumentFormData>;
  documentTypes: DocumentType[];
  onSubmit: (data: DocumentFormData) => void;
  onCancel: () => void;
  loading?: boolean;
}

export interface DocumentTypeManagerProps {
  documentTypes: DocumentType[];
  open: boolean;
  onClose: () => void;
  onTypeCreated: () => void;
  onTypeUpdated: () => void;
  onTypeDeleted: () => void;
}

export interface StorageInfoProps {
  usage?: {
    active_size: number;
    trash_size: number;
    total_size: number;
    active_count: number;
    trash_count: number;
  };
  storageCheck?: StorageCheckResponse;
}

// Component state interfaces
export interface DocumentManagerState {
  activeTab: number;
  documents: DocumentWithAccountDetails[];
  trashDocuments: TrashDocument[];
  documentTypes: DocumentType[];
  loading: boolean;
  uploading: boolean;
  error: string | null;
}

export interface DocumentUploadState {
  selectedFile: FileSelectionResponse | null;
  formData: DocumentFormData;
  uploading: boolean;
  uploadProgress: number;
  validationErrors: Record<string, string>;
}

// Snackbar/notification interfaces
export interface DocumentSnackbarState {
  open: boolean;
  message: string;
  severity: 'success' | 'error' | 'warning' | 'info';
}

// Dialog state interfaces
export interface DocumentDialogStates {
  uploadOpen: boolean;
  viewerOpen: boolean;
  editOpen: boolean;
  typeManagerOpen: boolean;
  confirmDeleteOpen: boolean;
  confirmRestoreOpen: boolean;
  storageInfoOpen: boolean;
}

// File size formatting utility type
export type FileSizeUnit = 'B' | 'KB' | 'MB' | 'GB';

export interface FileSizeFormatted {
  value: number;
  unit: FileSizeUnit;
  formatted: string;
}

// Document sort options
export type DocumentSortField = 'document_title' | 'document_type' | 'uploaded_at' | 'document_date' | 'file_size';
export type DocumentSortOrder = 'asc' | 'desc';

export interface DocumentSortConfig {
  field: DocumentSortField;
  order: DocumentSortOrder;
}

// Filter options for documents
export interface DocumentFilterConfig {
  documentType: string;
  dateRange: {
    start: string | null;
    end: string | null;
  };
  searchTerm: string;
  showDeleted: boolean;
}

// Component refs for imperative methods
export interface DocumentManagerRef {
  refreshDocuments: () => Promise<void>;
  clearCache: () => void;
  openUpload: () => void;
  closeAllDialogs: () => void;
}

// Event handlers
export type DocumentEventHandler<T = AccountDocument> = (document: T) => void | Promise<void>;
export type DocumentFormEventHandler = (data: DocumentFormData) => void | Promise<void>;
export type DocumentTypeEventHandler = (type: DocumentType) => void | Promise<void>;
export type DocumentErrorHandler = (error: string) => void;

// Constants for component styling
export const DOCUMENT_DIALOG_WIDTHS = {
  manager: 'lg' as const,
  viewer: 'lg' as const,
  upload: 'sm' as const,
  edit: 'sm' as const,
  typeManager: 'md' as const,
} as const;

export const DOCUMENT_GRID_PAGE_SIZES = [10, 25, 50] as const;

// Icons mapping for different document types
export const DOCUMENT_TYPE_ICONS: Record<string, string> = {
  'Statement': '📄',
  'Tax Certificate': '🧾',
  'Contract': '📝',
  'Rate Change Notice': '📊',
  'Maturity Notice': '⏰',
  'Confirmation': '✅',
  'Other': '📋',
} as const;

// Status colors for different states
export const DOCUMENT_STATUS_COLORS = {
  active: 'primary' as const,
  trash: 'warning' as const,
  expired: 'error' as const,
} as const;