import { ipcMain, dialog, shell } from 'electron';
import { Database } from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as archiver from 'archiver';
import { DocumentService } from '@cash-mgmt/shared';
import { DocumentFileManager } from '../services/DocumentFileManager';
import {
  DocumentFilters,
  DocumentUploadForm,
  DocumentUpdateForm,
  DocumentTypeForm,
  DocumentApiResponse,
  DocumentUploadResponse,
  FileSelectionResponse,
  DownloadAllResponse,
  StorageCheckResponse,
  CleanupResponse,
  FILE_SIZE_LIMITS,
  SUPPORTED_MIME_TYPES
} from '@cash-mgmt/shared';

/**
 * Register all document management IPC handlers
 */
export function registerDocumentHandlers(db: Database): void {
  const documentService = new DocumentService(db);
  const fileManager = new DocumentFileManager();

  // ============================================
  // DOCUMENT TYPE HANDLERS
  // ============================================

  /**
   * Get all document types
   */
  ipcMain.handle('documents:getTypes', async () => {
    try {
      console.log('[IPC] documents:getTypes called');
      const types = await documentService.getDocumentTypes();
      console.log(`[IPC] documents:getTypes returning ${types.length} types`);
      return { success: true, data: types };
    } catch (error: any) {
      console.error('[IPC] documents:getTypes error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Create new document type
   */
  ipcMain.handle('documents:createType', async (_, typeForm: DocumentTypeForm) => {
    try {
      console.log('[IPC] documents:createType called with:', typeForm);
      const result = await documentService.createDocumentType(typeForm);
      console.log('[IPC] documents:createType result:', result.success);
      return result;
    } catch (error: any) {
      console.error('[IPC] documents:createType error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Update document type
   */
  ipcMain.handle('documents:updateType', async (_, id: number, updates: Partial<DocumentTypeForm>) => {
    try {
      console.log('[IPC] documents:updateType called for ID:', id, 'with updates:', updates);
      const result = await documentService.updateDocumentType(id, updates);
      console.log('[IPC] documents:updateType result:', result.success);
      return result;
    } catch (error: any) {
      console.error('[IPC] documents:updateType error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Delete document type
   */
  ipcMain.handle('documents:deleteType', async (_, id: number) => {
    try {
      console.log('[IPC] documents:deleteType called for ID:', id);
      const result = await documentService.deleteDocumentType(id);
      console.log('[IPC] documents:deleteType result:', result.success);
      return result;
    } catch (error: any) {
      console.error('[IPC] documents:deleteType error:', error);
      return { success: false, error: error.message };
    }
  });

  // ============================================
  // DOCUMENT CRUD HANDLERS
  // ============================================

  /**
   * List documents for an account
   */
  ipcMain.handle('documents:list', async (_, accountId: number, filters?: DocumentFilters) => {
    try {
      console.log('[IPC] documents:list called for account:', accountId, 'with filters:', filters);
      const documents = await documentService.getDocuments(accountId, filters);
      console.log(`[IPC] documents:list returning ${documents.length} documents`);
      return { success: true, data: documents };
    } catch (error: any) {
      console.error('[IPC] documents:list error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * List trash documents
   */
  ipcMain.handle('documents:listTrash', async (_, accountId?: number) => {
    try {
      console.log('[IPC] documents:listTrash called for account:', accountId || 'all');
      const documents = await documentService.getTrashDocuments(accountId);
      console.log(`[IPC] documents:listTrash returning ${documents.length} documents`);
      return { success: true, data: documents };
    } catch (error: any) {
      console.error('[IPC] documents:listTrash error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get single document
   */
  ipcMain.handle('documents:get', async (_, documentId: number) => {
    try {
      console.log('[IPC] documents:get called for ID:', documentId);
      const document = await documentService.getDocument(documentId);
      console.log('[IPC] documents:get result:', document ? 'found' : 'not found');
      return { success: true, data: document };
    } catch (error: any) {
      console.error('[IPC] documents:get error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Select PDF file for upload
   */
  ipcMain.handle('documents:selectFile', async (): Promise<FileSelectionResponse> => {
    try {
      console.log('[IPC] documents:selectFile called');

      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'PDF Files', extensions: ['pdf'] }
        ],
        title: 'Select PDF Document'
      });

      if (result.canceled || result.filePaths.length === 0) {
        console.log('[IPC] documents:selectFile - selection canceled');
        return { success: false };
      }

      const filePath = result.filePaths[0];
      console.log('[IPC] documents:selectFile - file selected:', path.basename(filePath));

      // Validate the file
      const validation = await fileManager.validateFile(filePath);
      if (!validation.valid) {
        console.error('[IPC] documents:selectFile - validation failed:', validation.error);
        return { success: false, error: validation.error };
      }

      return {
        success: true,
        file_path: filePath,
        file_name: path.basename(filePath),
        file_size: validation.fileSize,
        mime_type: validation.mimeType,
        warning: validation.warning
      };
    } catch (error: any) {
      console.error('[IPC] documents:selectFile error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Upload document
   */
  ipcMain.handle('documents:upload', async (_, uploadData: {
    filePath: string;
    formData: DocumentUploadForm;
  }): Promise<DocumentUploadResponse> => {
    try {
      console.log('[IPC] documents:upload called for account:', uploadData.formData.account_id);

      // Validate form data
      const validation = documentService.validateDocument(uploadData.formData);
      if (!validation.valid) {
        console.error('[IPC] documents:upload - form validation failed:', validation.errors);
        return {
          success: false,
          error: validation.errors.join(', ')
        };
      }

      // Generate unique filename
      const fileName = fileManager.generateFileName(uploadData.formData.account_id, 'pdf');

      // Save file to storage
      const saveResult = await fileManager.saveDocument(uploadData.filePath, fileName);
      if (!saveResult.success) {
        console.error('[IPC] documents:upload - file save failed:', saveResult.error);
        return {
          success: false,
          error: saveResult.error
        };
      }

      // Create database record
      const dbResult = await documentService.createDocument({
        ...uploadData.formData,
        file_name: fileName,
        file_path: saveResult.filePath!,
        file_size: saveResult.fileSize!,
        file_hash: saveResult.fileHash!
      });

      if (!dbResult.success) {
        // Clean up file if database insert failed
        await fileManager.deleteFile(saveResult.filePath!);
        console.error('[IPC] documents:upload - database insert failed:', dbResult.error);
        return {
          success: false,
          error: dbResult.error
        };
      }

      console.log('[IPC] documents:upload - success, document ID:', dbResult.data?.documentId);
      return {
        success: true,
        document_id: dbResult.data?.documentId,
        file_size: saveResult.fileSize
      };
    } catch (error: any) {
      console.error('[IPC] documents:upload error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Update document metadata
   */
  ipcMain.handle('documents:update', async (_, documentId: number, updates: DocumentUpdateForm) => {
    try {
      console.log('[IPC] documents:update called for ID:', documentId, 'with updates:', updates);
      const result = await documentService.updateDocument(documentId, updates);
      console.log('[IPC] documents:update result:', result.success);
      return result;
    } catch (error: any) {
      console.error('[IPC] documents:update error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Soft delete document
   */
  ipcMain.handle('documents:softDelete', async (_, documentId: number) => {
    try {
      console.log('[IPC] documents:softDelete called for ID:', documentId);

      // Get document to get file path
      const document = await documentService.getDocument(documentId);
      if (!document) {
        return { success: false, error: 'Document not found' };
      }

      // Soft delete in database
      const dbResult = await documentService.softDeleteDocument(documentId);
      if (!dbResult.success) {
        console.error('[IPC] documents:softDelete - database update failed:', dbResult.error);
        return dbResult;
      }

      // Move file to trash
      const fileResult = await fileManager.moveToTrash(document.file_path);
      if (!fileResult.success) {
        console.warn('[IPC] documents:softDelete - file move failed but continuing:', fileResult.error);
        // Don't fail the operation if file move fails - database is authoritative
      }

      console.log('[IPC] documents:softDelete - success');
      return { success: true, message: 'Document moved to trash' };
    } catch (error: any) {
      console.error('[IPC] documents:softDelete error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Restore document from trash
   */
  ipcMain.handle('documents:restore', async (_, documentId: number) => {
    try {
      console.log('[IPC] documents:restore called for ID:', documentId);

      // Get document to get file path
      const document = await documentService.getDocument(documentId);
      if (!document) {
        return { success: false, error: 'Document not found' };
      }

      // Restore in database
      const dbResult = await documentService.restoreDocument(documentId);
      if (!dbResult.success) {
        console.error('[IPC] documents:restore - database update failed:', dbResult.error);
        return dbResult;
      }

      // Move file back to active (construct trash path from active path)
      const fileName = path.basename(document.file_path);
      const trashPath = fileManager.getTrashFilePath(fileName);
      const fileResult = await fileManager.restoreFromTrash(trashPath);
      if (!fileResult.success) {
        console.warn('[IPC] documents:restore - file move failed but continuing:', fileResult.error);
        // Don't fail the operation if file move fails - database is authoritative
      }

      console.log('[IPC] documents:restore - success');
      return { success: true, message: 'Document restored successfully' };
    } catch (error: any) {
      console.error('[IPC] documents:restore error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Permanently delete document (from trash only)
   */
  ipcMain.handle('documents:permanentDelete', async (_, documentId: number) => {
    try {
      console.log('[IPC] documents:permanentDelete called for ID:', documentId);

      // Get document to get file path
      const document = await documentService.getDocument(documentId);
      if (!document) {
        return { success: false, error: 'Document not found' };
      }

      // Only allow permanent deletion of documents that are already in trash
      if (!document.is_deleted) {
        return { success: false, error: 'Document must be in trash before permanent deletion' };
      }

      // Permanently delete from database first
      const dbResult = await documentService.permanentlyDeleteDocument(documentId);
      if (!dbResult.success) {
        console.error('[IPC] documents:permanentDelete - database delete failed:', dbResult.error);
        return dbResult;
      }

      // Delete the physical file
      const fileResult = await fileManager.deleteFile(document.file_path);
      if (!fileResult.success) {
        console.warn('[IPC] documents:permanentDelete - file delete failed but continuing:', fileResult.error);
        // Don't fail the operation if file delete fails - database is authoritative
      }

      console.log('[IPC] documents:permanentDelete - success');
      return { success: true, message: 'Document permanently deleted' };
    } catch (error: any) {
      console.error('[IPC] documents:permanentDelete error:', error);
      return { success: false, error: error.message };
    }
  });

  // ============================================
  // VIEW AND DOWNLOAD HANDLERS
  // ============================================

  /**
   * Get document for viewing (returns base64 data URL)
   */
  ipcMain.handle('documents:view', async (_, documentId: number) => {
    try {
      console.log('[IPC] documents:view called for ID:', documentId);

      const document = await documentService.getDocument(documentId);
      if (!document) {
        return { success: false, error: 'Document not found' };
      }

      const fileResult = await fileManager.readFile(document.file_path);
      if (!fileResult.success) {
        console.error('[IPC] documents:view - file read failed:', fileResult.error);
        return { success: false, error: fileResult.error };
      }

      // Convert to base64 data URL for PDF viewing
      const base64 = fileResult.buffer!.toString('base64');
      const dataUrl = `data:application/pdf;base64,${base64}`;

      console.log('[IPC] documents:view - success, file size:', fileResult.buffer!.length);
      return {
        success: true,
        data: {
          document,
          dataUrl,
          fileSize: fileResult.buffer!.length
        }
      };
    } catch (error: any) {
      console.error('[IPC] documents:view error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Open document in system PDF viewer
   */
  ipcMain.handle('documents:openInSystem', async (_, documentId: number) => {
    try {
      console.log('[IPC] documents:openInSystem called for ID:', documentId);

      const document = await documentService.getDocument(documentId);
      if (!document) {
        return { success: false, error: 'Document not found' };
      }

      // Check if file exists
      if (!fs.existsSync(document.file_path)) {
        return { success: false, error: 'Document file not found on disk' };
      }

      // Open with system default PDF viewer
      const result = await shell.openPath(document.file_path);

      if (result) {
        console.error('[IPC] documents:openInSystem - failed to open:', result);
        return { success: false, error: `Failed to open document: ${result}` };
      }

      console.log('[IPC] documents:openInSystem - success');
      return { success: true };
    } catch (error: any) {
      console.error('[IPC] documents:openInSystem error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Download single document
   */
  ipcMain.handle('documents:download', async (_, documentId: number) => {
    try {
      console.log('[IPC] documents:download called for ID:', documentId);

      const document = await documentService.getDocument(documentId);
      if (!document) {
        return { success: false, error: 'Document not found' };
      }

      // Show save dialog
      const saveResult = await dialog.showSaveDialog({
        defaultPath: `${document.document_title}.pdf`,
        filters: [
          { name: 'PDF Files', extensions: ['pdf'] }
        ]
      });

      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false };
      }

      // Copy file to chosen location
      await fs.promises.copyFile(document.file_path, saveResult.filePath);

      // Show in file manager
      shell.showItemInFolder(saveResult.filePath);

      console.log('[IPC] documents:download - success');
      return { success: true, path: saveResult.filePath };
    } catch (error: any) {
      console.error('[IPC] documents:download error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Download all documents for account as ZIP
   */
  ipcMain.handle('documents:downloadAll', async (_, accountId: number): Promise<DownloadAllResponse> => {
    try {
      console.log('[IPC] documents:downloadAll called for account:', accountId);

      // Get all active documents for account
      const documents = await documentService.getDocuments(accountId, { include_deleted: false });

      if (documents.length === 0) {
        return { success: false, error: 'No documents found for this account' };
      }

      // Show save dialog
      const saveResult = await dialog.showSaveDialog({
        defaultPath: `documents_account_${accountId}_${Date.now()}.zip`,
        filters: [
          { name: 'ZIP Files', extensions: ['zip'] }
        ]
      });

      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false };
      }

      // Create ZIP archive
      return new Promise<DownloadAllResponse>((resolve) => {
        const archive = archiver.create('zip', { zlib: { level: 9 } });
        const output = fs.createWriteStream(saveResult.filePath!);

        let totalSize = 0;

        archive.pipe(output);

        // Add each document to archive
        for (const doc of documents) {
          if (fs.existsSync(doc.file_path)) {
            // Use document title as filename in ZIP
            const zipFileName = `${doc.document_title}.pdf`;
            archive.file(doc.file_path, { name: zipFileName });
            totalSize += doc.file_size;
          }
        }

        archive.on('error', (error: any) => {
          console.error('[IPC] documents:downloadAll - archive error:', error);
          resolve({ success: false, error: error.message });
        });

        output.on('close', () => {
          console.log('[IPC] documents:downloadAll - success, files:', documents.length);

          // Show in file manager
          shell.showItemInFolder(saveResult.filePath!);

          resolve({
            success: true,
            zip_path: saveResult.filePath!,
            file_count: documents.length,
            total_size: totalSize
          });
        });

        archive.finalize();
      });
    } catch (error: any) {
      console.error('[IPC] documents:downloadAll error:', error);
      return { success: false, error: error.message };
    }
  });

  // ============================================
  // UTILITY HANDLERS
  // ============================================

  /**
   * Get document counts for portfolio grid
   */
  ipcMain.handle('documents:getCounts', async () => {
    try {
      console.log('[IPC] documents:getCounts called');
      const counts = await documentService.getDocumentCounts();
      console.log(`[IPC] documents:getCounts returning counts for ${Object.keys(counts).length} accounts`);
      return { success: true, data: counts };
    } catch (error: any) {
      console.error('[IPC] documents:getCounts error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Check storage space
   */
  ipcMain.handle('documents:checkStorage', async (): Promise<StorageCheckResponse> => {
    try {
      console.log('[IPC] documents:checkStorage called');
      const result = await fileManager.checkStorageSpace();
      console.log('[IPC] documents:checkStorage result:', result.success, 'warning:', result.show_warning);
      return result;
    } catch (error: any) {
      console.error('[IPC] documents:checkStorage error:', error);
      return { success: false, available_space: 0, show_warning: true, error: error.message };
    }
  });

  /**
   * Get storage usage statistics
   */
  ipcMain.handle('documents:getStorageUsage', async () => {
    try {
      console.log('[IPC] documents:getStorageUsage called');
      const usage = await fileManager.getStorageUsage();
      console.log('[IPC] documents:getStorageUsage result:', usage);
      return { success: true, data: usage };
    } catch (error: any) {
      console.error('[IPC] documents:getStorageUsage error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Manual cleanup of trash (for testing)
   */
  ipcMain.handle('documents:cleanupTrash', async (): Promise<CleanupResponse> => {
    try {
      console.log('[IPC] documents:cleanupTrash called');

      // Get documents eligible for cleanup
      const eligibleDocs = await documentService.getDocumentsForCleanup();
      console.log(`[IPC] documents:cleanupTrash found ${eligibleDocs.length} documents to cleanup`);

      if (eligibleDocs.length === 0) {
        return { success: true, deleted_count: 0, freed_space: 0 };
      }

      // Clean up files
      const filePaths = eligibleDocs.map(doc => doc.file_path);
      const fileResult = await fileManager.cleanupTrash(filePaths);

      // Remove database records
      let dbDeletedCount = 0;
      for (const doc of eligibleDocs) {
        const dbResult = await documentService.permanentlyDeleteDocument(doc.id);
        if (dbResult.success) {
          dbDeletedCount++;
        }
      }

      console.log('[IPC] documents:cleanupTrash complete:', fileResult.deleted_count, 'files,', dbDeletedCount, 'database records');

      return {
        success: fileResult.success,
        deleted_count: Math.min(fileResult.deleted_count, dbDeletedCount),
        freed_space: fileResult.freed_space,
        error: fileResult.error
      };
    } catch (error: any) {
      console.error('[IPC] documents:cleanupTrash error:', error);
      return { success: false, deleted_count: 0, error: error.message };
    }
  });

  console.log('[DocumentHandlers] All document IPC handlers registered successfully');
}