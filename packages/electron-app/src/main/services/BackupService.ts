import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export class BackupService {
  private backupDir: string;
  private sourcePath: string;
  private retentionDays: number;

  constructor(databasePath: string, backupDir?: string, retentionDays: number = 5) {
    this.sourcePath = databasePath;
    this.backupDir = backupDir || path.join(path.dirname(databasePath), '../backups');
    this.retentionDays = retentionDays;

    // Ensure backup directory exists
    this.ensureBackupDirectory();
  }

  /**
   * Create a backup of the database
   * @returns The path to the created backup, or null if backup failed
   */
  public async createBackup(): Promise<string | null> {
    try {
      // Checkpoint WAL file to ensure all changes are in main database
      this.checkpointWAL();

      // Generate backup filename with timestamp
      const timestamp = new Date().toISOString()
        .replace(/T/, '_')
        .replace(/:/g, '-')
        .replace(/\..+/, '');
      const backupFileName = `cash_savings_backup_${timestamp}.db`;
      const backupPath = path.join(this.backupDir, backupFileName);

      // Check if source database exists
      if (!fs.existsSync(this.sourcePath)) {
        console.error(`Source database not found: ${this.sourcePath}`);
        return null;
      }

      // Copy the database file
      fs.copyFileSync(this.sourcePath, backupPath);

      // Verify backup was created successfully
      if (fs.existsSync(backupPath)) {
        const sourceSize = fs.statSync(this.sourcePath).size;
        const backupSize = fs.statSync(backupPath).size;

        if (backupSize === sourceSize) {
          // Clean up old backups first to get count
          const cleanedCount = await this.cleanupOldBackups();

          // Single consolidated message
          const cleanupMsg = cleanedCount > 0 ? ` [cleaned up ${cleanedCount} old backup${cleanedCount > 1 ? 's' : ''}]` : '';
          console.log(`✅ Backup: ${backupFileName} (${(backupSize / 1024 / 1024).toFixed(2)} MB)${cleanupMsg}`);

          return backupPath;
        } else {
          console.error('Backup file size mismatch - backup may be corrupted');
          fs.unlinkSync(backupPath);
          return null;
        }
      }

      return null;
    } catch (error) {
      console.error('Failed to create database backup:', error);
      return null;
    }
  }

  /**
   * Clean up backups older than retention period
   */
  private async cleanupOldBackups(): Promise<number> {
    try {
      const files = fs.readdirSync(this.backupDir);
      const now = Date.now();
      const retentionMs = this.retentionDays * 24 * 60 * 60 * 1000;

      let deletedCount = 0;

      for (const file of files) {
        // Only process backup files matching our pattern
        if (!file.startsWith('cash_savings_backup_') || !file.endsWith('.db')) {
          continue;
        }

        const filePath = path.join(this.backupDir, file);
        const stats = fs.statSync(filePath);
        const fileAge = now - stats.mtimeMs;

        if (fileAge > retentionMs) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      }

      return deletedCount;
    } catch (error) {
      console.error('Failed to cleanup old backups:', error);
      return 0;
    }
  }

  /**
   * Checkpoint WAL file to ensure all changes are written to main database
   */
  private checkpointWAL(): void {
    try {
      const walPath = this.sourcePath + '-wal';

      // Check if WAL file exists and has content
      if (fs.existsSync(walPath)) {
        const walSize = fs.statSync(walPath).size;
        if (walSize > 0) {
          // Use sqlite3 to checkpoint the WAL
          // PRAGMA wal_checkpoint(TRUNCATE) forces a checkpoint and truncates the WAL
          try {
            execSync(`sqlite3 "${this.sourcePath}" "PRAGMA wal_checkpoint(TRUNCATE);"`, {
              stdio: 'pipe'
            });
          } catch (sqliteError) {
            // Silently continue - backup will still work
          }
        }
      }
    } catch (error) {
      // Continue with backup even if checkpoint fails
    }
  }

  /**
   * Ensure backup directory exists
   */
  private ensureBackupDirectory(): void {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
      console.log(`Created backup directory: ${this.backupDir}`);
    }
  }

  /**
   * Get list of existing backups
   */
  public getBackups(): Array<{ name: string; path: string; size: number; created: Date }> {
    try {
      const files = fs.readdirSync(this.backupDir);

      return files
        .filter(file => file.startsWith('cash_savings_backup_') && file.endsWith('.db'))
        .map(file => {
          const filePath = path.join(this.backupDir, file);
          const stats = fs.statSync(filePath);
          return {
            name: file,
            path: filePath,
            size: stats.size,
            created: new Date(stats.mtime)
          };
        })
        .sort((a, b) => b.created.getTime() - a.created.getTime());
    } catch (error) {
      console.error('Failed to get backup list:', error);
      return [];
    }
  }

  /**
   * Restore from a backup
   * @param backupPath Path to the backup file
   * @returns true if restore was successful
   */
  public async restoreFromBackup(backupPath: string): Promise<boolean> {
    try {
      if (!fs.existsSync(backupPath)) {
        console.error(`Backup file not found: ${backupPath}`);
        return false;
      }

      // Create a safety backup of current database before restoring
      const safetyBackup = this.sourcePath + '.before-restore';
      fs.copyFileSync(this.sourcePath, safetyBackup);

      try {
        // Close any WAL files
        this.checkpointWAL();

        // Copy backup over current database
        fs.copyFileSync(backupPath, this.sourcePath);

        console.log(`✅ Database restored from backup: ${path.basename(backupPath)}`);

        // Remove safety backup
        fs.unlinkSync(safetyBackup);

        return true;
      } catch (restoreError) {
        // Restore failed, revert to safety backup
        console.error('Restore failed, reverting to original database');
        fs.copyFileSync(safetyBackup, this.sourcePath);
        fs.unlinkSync(safetyBackup);
        throw restoreError;
      }
    } catch (error) {
      console.error('Failed to restore from backup:', error);
      return false;
    }
  }
}