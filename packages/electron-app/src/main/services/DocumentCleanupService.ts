import { Database } from 'sqlite3';
import { DocumentService } from '@cash-mgmt/shared';
import { DocumentFileManager } from './DocumentFileManager';
import { CleanupResponse, TRASH_RETENTION_DAYS } from '@cash-mgmt/shared';

export class DocumentCleanupService {
  private db: Database;
  private documentService: DocumentService;
  private fileManager: DocumentFileManager;
  private cleanupIntervalId: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_HOURS = 24; // Run cleanup every 24 hours

  constructor(database: Database) {
    this.db = database;
    this.documentService = new DocumentService(database);
    this.fileManager = new DocumentFileManager();
  }

  /**
   * Start the background cleanup service
   */
  start(): void {
    if (this.cleanupIntervalId) {
      return; // Already running, silently skip
    }

    // Run cleanup immediately on startup and log result
    this.performCleanup()
      .then(result => {
        if (result.deleted_count > 0) {
          console.log(`   ✅ Document cleanup: removed ${result.deleted_count} file${result.deleted_count > 1 ? 's' : ''}, freed ${this.formatFileSize(result.freed_space ?? 0)} (24h schedule, ${TRASH_RETENTION_DAYS}d retention)`);
        } else {
          console.log(`   ✅ Document cleanup: checked, no files to remove (24h schedule, ${TRASH_RETENTION_DAYS}d retention)`);
        }
      })
      .catch(error => {
        console.error(`   ⚠️ Document cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      });

    // Schedule periodic cleanup (silently)
    this.cleanupIntervalId = setInterval(() => {
      this.performCleanup().catch(error => {
        console.error('[DocumentCleanupService] Scheduled cleanup failed:', error);
      });
    }, this.CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000); // Convert hours to milliseconds
  }

  /**
   * Stop the background cleanup service
   */
  stop(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
      console.log('[DocumentCleanupService] Background service stopped');
    }
  }

  /**
   * Perform the actual cleanup operation
   */
  async performCleanup(): Promise<CleanupResponse> {
    try {
      // Get documents eligible for cleanup from database
      const eligibleDocs = await this.documentService.getDocumentsForCleanup();

      if (eligibleDocs.length === 0) {
        return {
          success: true,
          deleted_count: 0,
          freed_space: 0
        };
      }

      let totalDeletedCount = 0;
      let totalFreedSpace = 0;
      const errors: string[] = [];

      // Process each document
      for (const doc of eligibleDocs) {
        try {
          // Delete the physical file
          const fileResult = await this.fileManager.deleteFile(doc.file_path);
          if (!fileResult.success) {
            errors.push(`Failed to delete file for document ID ${doc.id}`);
            continue; // Skip database deletion if file deletion failed
          }

          // Get file size before database deletion (for freed space calculation)
          let fileSize = 0;
          try {
            const fs = require('fs');
            if (fs.existsSync(doc.file_path)) {
              const stats = fs.statSync(doc.file_path);
              fileSize = stats.size;
            }
          } catch {
            // File doesn't exist or can't be accessed, that's okay
          }

          // Remove from database
          const dbResult = await this.documentService.permanentlyDeleteDocument(doc.id);
          if (!dbResult.success) {
            errors.push(`Failed to delete database record for document ID ${doc.id}`);
            continue;
          }

          totalDeletedCount++;
          totalFreedSpace += fileSize;
        } catch (error) {
          errors.push(`Error processing document ID ${doc.id}: ${error}`);
        }
      }

      const result: CleanupResponse = {
        success: errors.length === 0,
        deleted_count: totalDeletedCount,
        freed_space: totalFreedSpace,
        error: errors.length > 0 ? errors.join('; ') : undefined
      };

      // Log errors if any occurred
      if (errors.length > 0) {
        console.error(`[DocumentCleanupService] ⚠️ Encountered ${errors.length} error(s) during cleanup`);
      }

      return result;
    } catch (error) {
      console.error('[DocumentCleanupService] Cleanup failed with unexpected error:', error);
      return {
        success: false,
        deleted_count: 0,
        freed_space: 0,
        error: `Cleanup failed: ${error}`
      };
    }
  }

  /**
   * Get cleanup statistics
   */
  async getCleanupStats(): Promise<{
    eligible_count: number;
    total_size: number;
    oldest_days: number;
    newest_days: number;
  }> {
    try {
      const eligibleDocs = await this.documentService.getDocumentsForCleanup();

      if (eligibleDocs.length === 0) {
        return {
          eligible_count: 0,
          total_size: 0,
          oldest_days: 0,
          newest_days: 0
        };
      }

      let totalSize = 0;
      let oldestDays = 0;
      let newestDays = Number.MAX_SAFE_INTEGER;

      for (const doc of eligibleDocs) {
        // Get file size
        try {
          const fs = require('fs');
          if (fs.existsSync(doc.file_path)) {
            const stats = fs.statSync(doc.file_path);
            totalSize += stats.size;
          }
        } catch {
          // File doesn't exist or can't be accessed
        }

        // Track age range
        const days = Math.floor(doc.days_in_trash);
        if (days > oldestDays) oldestDays = days;
        if (days < newestDays) newestDays = days;
      }

      return {
        eligible_count: eligibleDocs.length,
        total_size: totalSize,
        oldest_days: oldestDays,
        newest_days: newestDays === Number.MAX_SAFE_INTEGER ? 0 : newestDays
      };
    } catch (error) {
      console.error('[DocumentCleanupService] Failed to get cleanup stats:', error);
      return {
        eligible_count: 0,
        total_size: 0,
        oldest_days: 0,
        newest_days: 0
      };
    }
  }

  /**
   * Check if cleanup service is running
   */
  isRunning(): boolean {
    return this.cleanupIntervalId !== null;
  }

  /**
   * Get next scheduled cleanup time
   */
  getNextCleanupTime(): Date | null {
    if (!this.isRunning()) {
      return null;
    }

    // Calculate next cleanup time based on interval
    const now = new Date();
    const nextCleanup = new Date(now.getTime() + (this.CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000));
    return nextCleanup;
  }

  /**
   * Force immediate cleanup (for testing or manual triggers)
   */
  async forceCleanup(): Promise<CleanupResponse> {
    console.log('[DocumentCleanupService] Manual cleanup requested');
    return await this.performCleanup();
  }

  /**
   * Format file size for logging
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get service configuration
   */
  getConfiguration() {
    return {
      retention_days: TRASH_RETENTION_DAYS,
      cleanup_interval_hours: this.CLEANUP_INTERVAL_HOURS,
      is_running: this.isRunning(),
      next_cleanup: this.getNextCleanupTime()
    };
  }
}