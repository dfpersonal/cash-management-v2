import { Database } from 'sqlite3';
import {
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
  DocumentStats,
  DocumentValidationResult,
  isAccountDocument,
  isDocumentType,
  TRASH_RETENTION_DAYS
} from '../types/DocumentTypes';

export class DocumentService {
  private db: Database;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 100;
  private documentCache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 30000; // 30 seconds cache

  constructor(database: Database) {
    this.db = database;
  }

  /**
   * Execute database operation with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    retries: number = this.MAX_RETRIES
  ): Promise<T> {
    try {
      return await operation();
    } catch (error: any) {
      const isRecoverable = this.isRecoverableError(error);

      if (isRecoverable && retries > 0) {
        console.warn(`[DocumentService] ${operationName} failed, retrying... (${retries} retries left)`, error.message);
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));
        return this.executeWithRetry(operation, operationName, retries - 1);
      }

      console.error(`[DocumentService] ${operationName} failed permanently:`, error);
      throw error;
    }
  }

  /**
   * Check if error is recoverable (database locked, busy, etc.)
   */
  private isRecoverableError(error: any): boolean {
    if (!error || typeof error.code !== 'string') return false;

    const recoverableCodes = ['SQLITE_BUSY', 'SQLITE_LOCKED', 'SQLITE_CANTOPEN'];
    return recoverableCodes.includes(error.code) ||
           error.message?.includes('database is locked') ||
           error.message?.includes('database is busy');
  }

  /**
   * Validate cache entry
   */
  private isValidCacheEntry(timestamp: number): boolean {
    return Date.now() - timestamp < this.CACHE_TTL_MS;
  }

  /**
   * Clear expired cache entries
   */
  private clearExpiredCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.documentCache.entries()) {
      if (!this.isValidCacheEntry(entry.timestamp)) {
        this.documentCache.delete(key);
      }
    }
  }

  // ============================================
  // DOCUMENT TYPE MANAGEMENT
  // ============================================

  /**
   * Get all document types
   */
  async getDocumentTypes(): Promise<DocumentType[]> {
    return this.executeWithRetry(async () => {
      return new Promise<DocumentType[]>((resolve, reject) => {
        this.db.all(`
          SELECT id, type_name, display_order, is_system_type, is_active, created_at, updated_at
          FROM document_types
          WHERE is_active = 1
          ORDER BY display_order ASC, type_name ASC
        `, [], (err: Error | null, rows: any[]) => {
          if (err) {
            reject(err);
          } else {
            const types = rows.map(row => ({
              ...row,
              is_system_type: Boolean(row.is_system_type),
              is_active: Boolean(row.is_active)
            }));
            resolve(types);
          }
        });
      });
    }, 'getDocumentTypes');
  }

  /**
   * Create a new document type
   */
  async createDocumentType(typeForm: DocumentTypeForm): Promise<DocumentApiResponse<DocumentType>> {
    return this.executeWithRetry(async () => {
      // Check for duplicate name
      const existing = await new Promise<any>((resolve, reject) => {
        this.db.get(`
          SELECT id FROM document_types WHERE LOWER(type_name) = LOWER(?)
        `, [typeForm.type_name], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (existing) {
        return {
          success: false,
          error: `Document type '${typeForm.type_name}' already exists`
        };
      }

      return new Promise<DocumentApiResponse<DocumentType>>((resolve, reject) => {
        this.db.run(`
          INSERT INTO document_types (type_name, display_order, is_system_type, is_active)
          VALUES (?, ?, 0, 1)
        `, [
          typeForm.type_name.trim(),
          typeForm.display_order || 999
        ], function(err: Error | null) {
          if (err) {
            reject(err);
          } else {
            resolve({
              success: true,
              data: {
                id: this.lastID,
                type_name: typeForm.type_name.trim(),
                display_order: typeForm.display_order || 999,
                is_system_type: false,
                is_active: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }
            });
          }
        });
      });
    }, 'createDocumentType');
  }

  /**
   * Update document type (only custom types)
   */
  async updateDocumentType(id: number, updates: Partial<DocumentTypeForm>): Promise<DocumentApiResponse<DocumentType>> {
    return this.executeWithRetry(async () => {
      // Check if it's a system type
      const existing = await new Promise<any>((resolve, reject) => {
        this.db.get(`
          SELECT id, type_name, is_system_type FROM document_types WHERE id = ?
        `, [id], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!existing) {
        return { success: false, error: 'Document type not found' };
      }

      if (existing.is_system_type) {
        return { success: false, error: 'Cannot modify system document types' };
      }

      // Check for duplicate name if changing name
      if (updates.type_name && updates.type_name !== existing.type_name) {
        const duplicate = await new Promise<any>((resolve, reject) => {
          this.db.get(`
            SELECT id FROM document_types WHERE LOWER(type_name) = LOWER(?) AND id != ?
          `, [updates.type_name, id], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });

        if (duplicate) {
          return {
            success: false,
            error: `Document type '${updates.type_name}' already exists`
          };
        }
      }

      const updateFields: string[] = [];
      const updateValues: any[] = [];

      if (updates.type_name !== undefined) {
        updateFields.push('type_name = ?');
        updateValues.push(updates.type_name.trim());
      }

      if (updates.display_order !== undefined) {
        updateFields.push('display_order = ?');
        updateValues.push(updates.display_order);
      }

      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      updateValues.push(id);

      return new Promise<DocumentApiResponse<DocumentType>>((resolve, reject) => {
        this.db.run(`
          UPDATE document_types
          SET ${updateFields.join(', ')}
          WHERE id = ?
        `, updateValues, function(err: Error | null) {
          if (err) {
            reject(err);
          } else {
            resolve({ success: true, message: 'Document type updated successfully' });
          }
        });
      });
    }, 'updateDocumentType');
  }

  /**
   * Delete document type (only custom types with no documents)
   */
  async deleteDocumentType(id: number): Promise<DocumentApiResponse> {
    return this.executeWithRetry(async () => {
      // Check if it's a system type and if it has documents
      const typeCheck = await new Promise<any>((resolve, reject) => {
        this.db.get(`
          SELECT
            dt.id,
            dt.type_name,
            dt.is_system_type,
            COUNT(ad.id) as document_count
          FROM document_types dt
          LEFT JOIN account_documents ad ON dt.type_name = ad.document_type
          WHERE dt.id = ?
          GROUP BY dt.id, dt.type_name, dt.is_system_type
        `, [id], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!typeCheck) {
        return { success: false, error: 'Document type not found' };
      }

      if (typeCheck.is_system_type) {
        return { success: false, error: 'Cannot delete system document types' };
      }

      if (typeCheck.document_count > 0) {
        return {
          success: false,
          error: `Cannot delete document type '${typeCheck.type_name}' because it has ${typeCheck.document_count} associated documents`
        };
      }

      return new Promise<DocumentApiResponse>((resolve, reject) => {
        this.db.run(`DELETE FROM document_types WHERE id = ?`, [id], function(err: Error | null) {
          if (err) {
            reject(err);
          } else {
            resolve({ success: true, message: 'Document type deleted successfully' });
          }
        });
      });
    }, 'deleteDocumentType');
  }

  // ============================================
  // DOCUMENT CRUD OPERATIONS
  // ============================================

  /**
   * Get documents for an account
   */
  async getDocuments(accountId: number, filters?: DocumentFilters): Promise<DocumentWithAccountDetails[]> {
    const cacheKey = `docs_${accountId}_${JSON.stringify(filters)}`;
    const cached = this.documentCache.get(cacheKey);

    if (cached && this.isValidCacheEntry(cached.timestamp)) {
      return cached.data;
    }

    const result = await this.executeWithRetry(async () => {
      let whereClause = 'WHERE ad.account_id = ?';
      const params: any[] = [accountId];

      if (!filters?.include_deleted) {
        whereClause += ' AND ad.is_deleted = 0';
      }

      if (filters?.document_type) {
        whereClause += ' AND ad.document_type = ?';
        params.push(filters.document_type);
      }

      if (filters?.date_from) {
        whereClause += ' AND ad.document_date >= ?';
        params.push(filters.date_from);
      }

      if (filters?.date_to) {
        whereClause += ' AND ad.document_date <= ?';
        params.push(filters.date_to);
      }

      if (filters?.search_term) {
        whereClause += ' AND (ad.document_title LIKE ? OR ad.notes LIKE ?)';
        const searchTerm = `%${filters.search_term}%`;
        params.push(searchTerm, searchTerm);
      }

      return new Promise<DocumentWithAccountDetails[]>((resolve, reject) => {
        this.db.all(`
          SELECT * FROM active_documents
          ${whereClause.replace('ad.', '')}
          ORDER BY uploaded_at DESC
        `, params, (err: Error | null, rows: any[]) => {
          if (err) {
            reject(err);
          } else {
            const documents = rows.map(row => ({
              ...row,
              is_deleted: Boolean(row.is_deleted),
              is_system_type: Boolean(row.is_system_type)
            }));
            resolve(documents);
          }
        });
      });
    }, 'getDocuments');

    // Cache the result
    this.documentCache.set(cacheKey, { data: result, timestamp: Date.now() });
    this.clearExpiredCache();

    return result;
  }

  /**
   * Get documents in trash
   */
  async getTrashDocuments(accountId?: number): Promise<TrashDocument[]> {
    return this.executeWithRetry(async () => {
      let whereClause = '';
      const params: any[] = [];

      if (accountId) {
        whereClause = 'WHERE account_id = ?';
        params.push(accountId);
      }

      return new Promise<TrashDocument[]>((resolve, reject) => {
        this.db.all(`
          SELECT * FROM trash_documents
          ${whereClause}
          ORDER BY deleted_at ASC
        `, params, (err: Error | null, rows: any[]) => {
          if (err) {
            reject(err);
          } else {
            const documents = rows.map(row => ({
              ...row,
              is_deleted: Boolean(row.is_deleted),
              is_system_type: Boolean(row.is_system_type)
            }));
            resolve(documents);
          }
        });
      });
    }, 'getTrashDocuments');
  }

  /**
   * Get single document by ID
   */
  async getDocument(documentId: number): Promise<AccountDocument | null> {
    return this.executeWithRetry(async () => {
      return new Promise<AccountDocument | null>((resolve, reject) => {
        this.db.get(`
          SELECT * FROM account_documents WHERE id = ?
        `, [documentId], (err: Error | null, row: any) => {
          if (err) {
            reject(err);
          } else {
            if (row) {
              resolve({
                ...row,
                is_deleted: Boolean(row.is_deleted)
              });
            } else {
              resolve(null);
            }
          }
        });
      });
    }, 'getDocument');
  }

  /**
   * Create new document record (metadata only)
   */
  async createDocument(documentData: DocumentUploadForm & {
    file_name: string;
    file_path: string;
    file_size: number;
    file_hash: string;
  }): Promise<DocumentApiResponse<{ documentId: number }>> {
    return this.executeWithRetry(async () => {
      return new Promise<DocumentApiResponse<{ documentId: number }>>((resolve, reject) => {
        this.db.run(`
          INSERT INTO account_documents (
            account_id, document_title, document_type, file_name, file_path,
            file_size, file_hash, notes, document_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          documentData.account_id,
          documentData.document_title,
          documentData.document_type,
          documentData.file_name,
          documentData.file_path,
          documentData.file_size,
          documentData.file_hash,
          documentData.notes || null,
          documentData.document_date || null
        ], function(err: Error | null) {
          if (err) {
            reject(err);
          } else {
            resolve({
              success: true,
              data: { documentId: this.lastID }
            });
          }
        });
      });
    }, 'createDocument');
  }

  /**
   * Update document metadata
   */
  async updateDocument(documentId: number, updates: DocumentUpdateForm): Promise<DocumentApiResponse> {
    return this.executeWithRetry(async () => {
      const updateFields: string[] = [];
      const updateValues: any[] = [];

      if (updates.document_title !== undefined) {
        updateFields.push('document_title = ?');
        updateValues.push(updates.document_title);
      }

      if (updates.document_type !== undefined) {
        updateFields.push('document_type = ?');
        updateValues.push(updates.document_type);
      }

      if (updates.notes !== undefined) {
        updateFields.push('notes = ?');
        updateValues.push(updates.notes || null);
      }

      if (updates.document_date !== undefined) {
        updateFields.push('document_date = ?');
        updateValues.push(updates.document_date || null);
      }

      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      updateValues.push(documentId);

      return new Promise<DocumentApiResponse>((resolve, reject) => {
        this.db.run(`
          UPDATE account_documents
          SET ${updateFields.join(', ')}
          WHERE id = ?
        `, updateValues, function(err: Error | null) {
          if (err) {
            reject(err);
          } else if (this.changes === 0) {
            resolve({ success: false, error: 'Document not found' });
          } else {
            resolve({ success: true, message: 'Document updated successfully' });
          }
        });
      });
    }, 'updateDocument');
  }

  /**
   * Soft delete document
   */
  async softDeleteDocument(documentId: number): Promise<DocumentApiResponse> {
    return this.executeWithRetry(async () => {
      return new Promise<DocumentApiResponse>((resolve, reject) => {
        this.db.run(`
          UPDATE account_documents
          SET is_deleted = 1,
              deleted_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND is_deleted = 0
        `, [documentId], function(err: Error | null) {
          if (err) {
            reject(err);
          } else if (this.changes === 0) {
            resolve({ success: false, error: 'Document not found or already deleted' });
          } else {
            resolve({ success: true, message: 'Document moved to trash' });
          }
        });
      });
    }, 'softDeleteDocument');
  }

  /**
   * Restore document from trash
   */
  async restoreDocument(documentId: number): Promise<DocumentApiResponse> {
    return this.executeWithRetry(async () => {
      return new Promise<DocumentApiResponse>((resolve, reject) => {
        this.db.run(`
          UPDATE account_documents
          SET is_deleted = 0,
              deleted_at = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND is_deleted = 1
        `, [documentId], function(err: Error | null) {
          if (err) {
            reject(err);
          } else if (this.changes === 0) {
            resolve({ success: false, error: 'Document not found in trash' });
          } else {
            resolve({ success: true, message: 'Document restored successfully' });
          }
        });
      });
    }, 'restoreDocument');
  }

  /**
   * Permanently delete document (removes from database)
   */
  async permanentlyDeleteDocument(documentId: number): Promise<DocumentApiResponse<{ filePath: string }>> {
    return this.executeWithRetry(async () => {
      // First get the file path
      const document = await this.getDocument(documentId);
      if (!document) {
        return { success: false, error: 'Document not found' };
      }

      return new Promise<DocumentApiResponse<{ filePath: string }>>((resolve, reject) => {
        this.db.run(`DELETE FROM account_documents WHERE id = ?`, [documentId], function(err: Error | null) {
          if (err) {
            reject(err);
          } else {
            resolve({
              success: true,
              data: { filePath: document.file_path },
              message: 'Document permanently deleted'
            });
          }
        });
      });
    }, 'permanentlyDeleteDocument');
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Get document counts by account
   */
  async getDocumentCounts(): Promise<Record<number, number>> {
    return this.executeWithRetry(async () => {
      return new Promise<Record<number, number>>((resolve, reject) => {
        this.db.all(`
          SELECT account_id, active_documents as document_count
          FROM document_counts_by_account
        `, [], (err: Error | null, rows: any[]) => {
          if (err) {
            reject(err);
          } else {
            const counts: Record<number, number> = {};
            rows.forEach(row => {
              counts[row.account_id] = row.document_count;
            });
            resolve(counts);
          }
        });
      });
    }, 'getDocumentCounts');
  }

  /**
   * Get documents eligible for cleanup (>30 days in trash)
   */
  async getDocumentsForCleanup(): Promise<{ id: number; file_path: string; days_in_trash: number }[]> {
    return this.executeWithRetry(async () => {
      return new Promise<{ id: number; file_path: string; days_in_trash: number }[]>((resolve, reject) => {
        this.db.all(`
          SELECT id, file_path,
                 julianday('now') - julianday(deleted_at) as days_in_trash
          FROM account_documents
          WHERE is_deleted = 1
            AND julianday('now') - julianday(deleted_at) > ?
          ORDER BY deleted_at ASC
        `, [TRASH_RETENTION_DAYS], (err: Error | null, rows: any[]) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        });
      });
    }, 'getDocumentsForCleanup');
  }

  /**
   * Validate document data
   */
  validateDocument(data: Partial<DocumentUploadForm>): DocumentValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!data.document_title || data.document_title.trim().length === 0) {
      errors.push('Document title is required');
    } else if (data.document_title.length > 255) {
      errors.push('Document title must be less than 255 characters');
    }

    if (!data.document_type || data.document_type.trim().length === 0) {
      errors.push('Document type is required');
    }

    if (!data.account_id || data.account_id <= 0) {
      errors.push('Valid account ID is required');
    }

    if (data.notes && data.notes.length > 1000) {
      warnings.push('Notes are quite long (over 1000 characters)');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Clear document cache
   */
  clearCache(): void {
    this.documentCache.clear();
  }
}