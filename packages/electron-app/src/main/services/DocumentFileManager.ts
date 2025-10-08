import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { app } from 'electron';
import {
  FILE_SIZE_LIMITS,
  SUPPORTED_MIME_TYPES,
  FilePathInfo,
  StorageCheckResponse,
  CleanupResponse
} from '@cash-mgmt/shared';
import { DocumentTypes';

export class DocumentFileManager {
  private readonly documentsPath: string;
  private readonly activePath: string;
  private readonly trashPath: string;

  constructor() {
    // Use cross-platform userData path
    this.documentsPath = path.join(app.getPath('userData'), 'documents');
    this.activePath = path.join(this.documentsPath, 'active');
    this.trashPath = path.join(this.documentsPath, 'trash');

    this.ensureDirectoriesExist();
  }

  /**
   * Ensure all required directories exist
   */
  private ensureDirectoriesExist(): void {
    try {
      if (!fs.existsSync(this.documentsPath)) {
        fs.mkdirSync(this.documentsPath, { recursive: true });
      }
      if (!fs.existsSync(this.activePath)) {
        fs.mkdirSync(this.activePath, { recursive: true });
      }
      if (!fs.existsSync(this.trashPath)) {
        fs.mkdirSync(this.trashPath, { recursive: true });
      }
    } catch (error) {
      console.error('[DocumentFileManager] Failed to create directories:', error);
      throw new Error('Failed to initialize document storage directories');
    }
  }

  /**
   * Generate unique filename for document
   */
  generateFileName(accountId: number, originalExtension: string = 'pdf'): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `account_${accountId}_${timestamp}_${random}.${originalExtension}`;
  }

  /**
   * Get year/month subdirectory path
   */
  private getDateSubdirectory(): string {
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    return path.join(year, month);
  }

  /**
   * Get full file path for active document
   */
  getActiveFilePath(fileName: string): string {
    const dateDir = this.getDateSubdirectory();
    const fullDir = path.join(this.activePath, dateDir);

    // Ensure date directory exists
    if (!fs.existsSync(fullDir)) {
      fs.mkdirSync(fullDir, { recursive: true });
    }

    return path.join(fullDir, fileName);
  }

  /**
   * Get full file path for trash document
   */
  getTrashFilePath(fileName: string): string {
    const dateDir = this.getDateSubdirectory();
    const fullDir = path.join(this.trashPath, dateDir);

    // Ensure date directory exists
    if (!fs.existsSync(fullDir)) {
      fs.mkdirSync(fullDir, { recursive: true });
    }

    return path.join(fullDir, fileName);
  }

  /**
   * Validate file before processing
   */
  async validateFile(filePath: string): Promise<{
    valid: boolean;
    error?: string;
    warning?: string;
    fileSize?: number;
    mimeType?: string;
  }> {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return { valid: false, error: 'File not found' };
      }

      // Get file stats
      const stats = fs.statSync(filePath);
      const fileSize = stats.size;

      // Check file size limits
      if (fileSize > FILE_SIZE_LIMITS.MAX_SIZE) {
        return {
          valid: false,
          error: `File size (${this.formatFileSize(fileSize)}) exceeds maximum limit of ${this.formatFileSize(FILE_SIZE_LIMITS.MAX_SIZE)}`
        };
      }

      // Check if file is a PDF by reading magic bytes
      const fileHandle = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(4);
      fs.readSync(fileHandle, buffer, 0, 4, 0);
      fs.closeSync(fileHandle);
      const isPDF = buffer.toString('ascii', 0, 4) === '%PDF';

      if (!isPDF) {
        return { valid: false, error: 'File is not a valid PDF document' };
      }

      // Generate warning for large files
      let warning: string | undefined;
      if (fileSize > FILE_SIZE_LIMITS.WARNING_SIZE) {
        warning = `Large file detected (${this.formatFileSize(fileSize)}). Upload may take longer.`;
      }

      return {
        valid: true,
        fileSize,
        mimeType: 'application/pdf',
        warning
      };
    } catch (error) {
      console.error('[DocumentFileManager] File validation error:', error);
      return { valid: false, error: 'Failed to validate file' };
    }
  }

  /**
   * Generate SHA-256 hash for file
   */
  async generateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (data) => {
        hash.update(data);
      });

      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });

      stream.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Copy file to active storage
   */
  async saveDocument(sourceFilePath: string, fileName: string): Promise<{
    success: boolean;
    filePath?: string;
    fileSize?: number;
    fileHash?: string;
    error?: string;
  }> {
    try {
      // Validate source file
      const validation = await this.validateFile(sourceFilePath);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Get destination path
      const destinationPath = this.getActiveFilePath(fileName);

      // Copy file
      await fs.promises.copyFile(sourceFilePath, destinationPath);

      // Verify copy was successful
      if (!fs.existsSync(destinationPath)) {
        return { success: false, error: 'File copy failed - destination file not found' };
      }

      // Generate hash of copied file
      const fileHash = await this.generateFileHash(destinationPath);

      return {
        success: true,
        filePath: destinationPath,
        fileSize: validation.fileSize,
        fileHash
      };
    } catch (error) {
      console.error('[DocumentFileManager] Save document error:', error);
      return { success: false, error: 'Failed to save document' };
    }
  }

  /**
   * Move file to trash
   */
  async moveToTrash(activeFilePath: string): Promise<{ success: boolean; trashPath?: string; error?: string }> {
    try {
      if (!fs.existsSync(activeFilePath)) {
        return { success: false, error: 'Active file not found' };
      }

      // Extract filename
      const fileName = path.basename(activeFilePath);
      const trashFilePath = this.getTrashFilePath(fileName);

      // Move file to trash
      await fs.promises.rename(activeFilePath, trashFilePath);

      return {
        success: true,
        trashPath: trashFilePath
      };
    } catch (error) {
      console.error('[DocumentFileManager] Move to trash error:', error);
      return { success: false, error: 'Failed to move file to trash' };
    }
  }

  /**
   * Restore file from trash
   */
  async restoreFromTrash(trashFilePath: string): Promise<{ success: boolean; activePath?: string; error?: string }> {
    try {
      if (!fs.existsSync(trashFilePath)) {
        return { success: false, error: 'Trash file not found' };
      }

      // Extract filename
      const fileName = path.basename(trashFilePath);
      const activeFilePath = this.getActiveFilePath(fileName);

      // Check if active file already exists
      if (fs.existsSync(activeFilePath)) {
        return { success: false, error: 'Active file with same name already exists' };
      }

      // Move file back to active
      await fs.promises.rename(trashFilePath, activeFilePath);

      return {
        success: true,
        activePath: activeFilePath
      };
    } catch (error) {
      console.error('[DocumentFileManager] Restore from trash error:', error);
      return { success: false, error: 'Failed to restore file from trash' };
    }
  }

  /**
   * Permanently delete file
   */
  async deleteFile(filePath: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: true }; // Already deleted
      }

      await fs.promises.unlink(filePath);

      return { success: true };
    } catch (error) {
      console.error('[DocumentFileManager] Delete file error:', error);
      return { success: false, error: 'Failed to delete file' };
    }
  }

  /**
   * Read file as buffer (for viewing/downloading)
   */
  async readFile(filePath: string): Promise<{ success: boolean; buffer?: Buffer; error?: string }> {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }

      const buffer = await fs.promises.readFile(filePath);
      return { success: true, buffer };
    } catch (error) {
      console.error('[DocumentFileManager] Read file error:', error);
      return { success: false, error: 'Failed to read file' };
    }
  }

  /**
   * Check available storage space
   */
  async checkStorageSpace(): Promise<StorageCheckResponse> {
    try {
      const stats = fs.statSync(this.documentsPath);

      // Get disk usage (this is platform-specific)
      // For cross-platform compatibility, we'll use a simple approach
      let availableSpace = Number.MAX_SAFE_INTEGER; // Default to "unlimited"

      try {
        // Try to get actual disk space if possible
        const { execSync } = require('child_process');
        let command = '';

        if (process.platform === 'win32') {
          command = `fsutil volume diskfree ${path.parse(this.documentsPath).root}`;
        } else {
          command = `df -k "${this.documentsPath}"`;
        }

        const output = execSync(command, { encoding: 'utf8' });
        // Parse output based on platform
        // This is a simplified implementation
        const match = output.match(/(\d+)/g);
        if (match && match.length > 0) {
          availableSpace = parseInt(match[0]) * 1024; // Convert KB to bytes
        }
      } catch {
        // Fallback: assume plenty of space available
        availableSpace = FILE_SIZE_LIMITS.STORAGE_WARNING * 10;
      }

      const showWarning = availableSpace < FILE_SIZE_LIMITS.STORAGE_WARNING;

      return {
        success: true,
        available_space: availableSpace,
        show_warning: showWarning,
        warning_message: showWarning
          ? `Document storage space is running low (${this.formatFileSize(availableSpace)} remaining). Please free up space or remove old documents.`
          : undefined
      };
    } catch (error) {
      console.error('[DocumentFileManager] Storage check error:', error);
      return {
        success: false,
        available_space: 0,
        show_warning: true,
        error: 'Failed to check storage space'
      };
    }
  }

  /**
   * Clean up old files from trash
   */
  async cleanupTrash(filePaths: string[]): Promise<CleanupResponse> {
    let deletedCount = 0;
    let freedSpace = 0;
    const errors: string[] = [];

    for (const filePath of filePaths) {
      try {
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          await fs.promises.unlink(filePath);
          deletedCount++;
          freedSpace += stats.size;
        }
      } catch (error) {
        console.error(`[DocumentFileManager] Failed to delete ${filePath}:`, error);
        errors.push(`Failed to delete ${path.basename(filePath)}`);
      }
    }

    return {
      success: errors.length === 0,
      deleted_count: deletedCount,
      freed_space: freedSpace,
      error: errors.length > 0 ? errors.join(', ') : undefined
    };
  }

  /**
   * Parse file path into components
   */
  parseFilePath(filePath: string): FilePathInfo {
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const basename = path.basename(filePath, ext);
    const filename = path.basename(filePath);

    return {
      directory: dir,
      filename: filename,
      extension: ext.substring(1), // Remove the dot
      basename: basename
    };
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get document storage paths
   */
  getPaths() {
    return {
      documents: this.documentsPath,
      active: this.activePath,
      trash: this.trashPath
    };
  }

  /**
   * Get total storage usage
   */
  async getStorageUsage(): Promise<{
    active_size: number;
    trash_size: number;
    total_size: number;
    active_count: number;
    trash_count: number;
  }> {
    const calculateDirSize = async (dirPath: string): Promise<{ size: number; count: number }> => {
      let totalSize = 0;
      let fileCount = 0;

      const scanDirectory = async (dir: string): Promise<void> => {
        try {
          const items = await fs.promises.readdir(dir);

          for (const item of items) {
            const itemPath = path.join(dir, item);
            const stats = await fs.promises.stat(itemPath);

            if (stats.isDirectory()) {
              await scanDirectory(itemPath);
            } else {
              totalSize += stats.size;
              fileCount++;
            }
          }
        } catch (error) {
          // Directory might not exist or be accessible
          console.warn(`[DocumentFileManager] Could not scan directory ${dir}:`, error);
        }
      };

      await scanDirectory(dirPath);
      return { size: totalSize, count: fileCount };
    };

    try {
      const [activeStats, trashStats] = await Promise.all([
        calculateDirSize(this.activePath),
        calculateDirSize(this.trashPath)
      ]);

      return {
        active_size: activeStats.size,
        trash_size: trashStats.size,
        total_size: activeStats.size + trashStats.size,
        active_count: activeStats.count,
        trash_count: trashStats.count
      };
    } catch (error) {
      console.error('[DocumentFileManager] Storage usage calculation error:', error);
      return {
        active_size: 0,
        trash_size: 0,
        total_size: 0,
        active_count: 0,
        trash_count: 0
      };
    }
  }
}