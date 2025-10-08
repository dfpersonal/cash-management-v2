/**
 * Document Management Type Definitions
 *
 * TypeScript interfaces for the document management system.
 * Corresponds to database schema in 002_document_management.sql
 */

// ============================================
// CORE INTERFACES
// ============================================

/**
 * Document Type interface - corresponds to document_types table
 */
export interface DocumentType {
  id: number;
  type_name: string;
  display_order: number;
  is_system_type: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Account Document interface - corresponds to account_documents table
 */
export interface AccountDocument {
  id: number;
  account_id: number;

  // Document metadata
  document_title: string;
  document_type: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_hash: string;

  // Optional fields
  notes?: string;
  document_date?: string;

  // Future searchability (OCR)
  extracted_text?: string;

  // Soft delete fields
  is_deleted: boolean;
  deleted_at?: string;
  deleted_by?: string;

  // Audit fields
  uploaded_at: string;
  uploaded_by?: string;
  updated_at: string;
}

/**
 * Extended document with account details (from active_documents view)
 */
export interface DocumentWithAccountDetails extends AccountDocument {
  // Account details
  bank: string;
  account_name?: string;
  account_type: string;
  sub_type: string;

  // Document type details
  display_order: number;
  is_system_type: boolean;

  // Computed fields
  days_since_upload: number;
}

/**
 * Trash document with deletion details (from trash_documents view)
 */
export interface TrashDocument extends DocumentWithAccountDetails {
  days_in_trash: number;
  days_remaining: number;
}

/**
 * Document count summary (from document_counts_by_account view)
 */
export interface DocumentCountSummary {
  account_id: number;
  total_documents: number;
  active_documents: number;
  deleted_documents: number;
  total_file_size: number;
  last_upload_date: string;
}

// ============================================
// FORM AND REQUEST INTERFACES
// ============================================

/**
 * Document upload form data
 */
export interface DocumentUploadForm {
  account_id: number;
  document_title: string;
  document_type: string;
  notes?: string;
  document_date?: string;
  // File will be handled separately via file dialog
}

/**
 * Document update form data
 */
export interface DocumentUpdateForm {
  document_title?: string;
  document_type?: string;
  notes?: string;
  document_date?: string;
}

/**
 * Document type creation form
 */
export interface DocumentTypeForm {
  type_name: string;
  display_order?: number;
}

/**
 * Document filters for querying
 */
export interface DocumentFilters {
  account_id?: number;
  document_type?: string;
  include_deleted?: boolean;
  date_from?: string;
  date_to?: string;
  search_term?: string;
}

// ============================================
// API RESPONSE INTERFACES
// ============================================

/**
 * Standard API response wrapper
 */
export interface DocumentApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * File upload response
 */
export interface DocumentUploadResponse {
  success: boolean;
  document_id?: number;
  file_size?: number;
  file_hash?: string;
  error?: string;
  warning?: string; // For size warnings
}

/**
 * File selection response from dialog
 */
export interface FileSelectionResponse {
  success: boolean;
  file_path?: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
  warning?: string;
  error?: string;
}

/**
 * Download all response
 */
export interface DownloadAllResponse {
  success: boolean;
  zip_path?: string;
  file_count?: number;
  total_size?: number;
  error?: string;
}

/**
 * Storage check response
 */
export interface StorageCheckResponse {
  success: boolean;
  available_space: number;
  used_space?: number;
  show_warning: boolean;
  warning_message?: string;
  error?: string;
}

/**
 * Cleanup response
 */
export interface CleanupResponse {
  success: boolean;
  deleted_count: number;
  freed_space?: number;
  error?: string;
}

// ============================================
// UI-SPECIFIC INTERFACES
// ============================================

/**
 * Document list item for DataGrid
 */
export interface DocumentListItem {
  id: number;
  title: string;
  type: string;
  file_size: number;
  document_date?: string;
  uploaded_at: string;
  notes?: string;
  days_since_upload: number;
}

/**
 * Trash list item for DataGrid
 */
export interface TrashListItem extends DocumentListItem {
  deleted_at: string;
  days_in_trash: number;
  days_remaining: number;
}

/**
 * Document viewer props
 */
export interface DocumentViewerProps {
  document: AccountDocument;
  open: boolean;
  onClose: () => void;
  onDownload?: () => void;
  onOpenInSystem?: () => void;
}

/**
 * Document manager dialog props
 */
export interface DocumentManagerProps {
  account: {
    id: number;
    bank: string;
    account_name?: string;
    account_type: string;
    sub_type: string;
  };
  open: boolean;
  onClose: () => void;
  refreshTrigger?: number;
}

// ============================================
// CONSTANTS AND ENUMS
// ============================================

/**
 * File size constants (in bytes)
 */
export const FILE_SIZE_LIMITS = {
  MAX_SIZE: 50 * 1024 * 1024,      // 50MB hard limit
  WARNING_SIZE: 5 * 1024 * 1024,   // 5MB warning threshold
  STORAGE_WARNING: 100 * 1024 * 1024, // 100MB storage warning
} as const;

/**
 * Default document types (system types)
 */
export const DEFAULT_DOCUMENT_TYPES = [
  'Statement',
  'Tax Certificate',
  'Contract',
  'Rate Change Notice',
  'Maturity Notice',
  'Confirmation',
  'Other',
] as const;

/**
 * Supported file extensions
 */
export const SUPPORTED_EXTENSIONS = ['pdf'] as const;

/**
 * MIME types for validation
 */
export const SUPPORTED_MIME_TYPES = ['application/pdf'] as const;

/**
 * Trash retention period (days)
 */
export const TRASH_RETENTION_DAYS = 30;

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Type guard for AccountDocument
 */
export function isAccountDocument(obj: any): obj is AccountDocument {
  return obj &&
    typeof obj.id === 'number' &&
    typeof obj.account_id === 'number' &&
    typeof obj.document_title === 'string' &&
    typeof obj.document_type === 'string' &&
    typeof obj.file_name === 'string' &&
    typeof obj.file_path === 'string' &&
    typeof obj.file_size === 'number' &&
    typeof obj.file_hash === 'string' &&
    typeof obj.is_deleted === 'boolean' &&
    typeof obj.uploaded_at === 'string' &&
    typeof obj.updated_at === 'string';
}

/**
 * Type guard for DocumentType
 */
export function isDocumentType(obj: any): obj is DocumentType {
  return obj &&
    typeof obj.id === 'number' &&
    typeof obj.type_name === 'string' &&
    typeof obj.display_order === 'number' &&
    typeof obj.is_system_type === 'boolean' &&
    typeof obj.is_active === 'boolean' &&
    typeof obj.created_at === 'string' &&
    typeof obj.updated_at === 'string';
}

// ============================================
// UTILITY TYPES
// ============================================

/**
 * Extract file info from full path
 */
export interface FilePathInfo {
  directory: string;
  filename: string;
  extension: string;
  basename: string;
}

/**
 * Document statistics
 */
export interface DocumentStats {
  total_count: number;
  total_size: number;
  types_breakdown: Record<string, number>;
  size_breakdown: {
    small: number;  // <1MB
    medium: number; // 1-5MB
    large: number;  // >5MB
  };
  upload_trend: {
    this_week: number;
    this_month: number;
    this_year: number;
  };
}

/**
 * Validation result for documents
 */
export interface DocumentValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

