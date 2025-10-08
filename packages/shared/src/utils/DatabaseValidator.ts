/**
 * Database validation utility for pre-flight checks
 */

import * as fs from 'fs';
import * as path from 'path';

export interface DatabaseValidationResult {
  isValid: boolean;
  error?: string;
  path?: string;
}

export class DatabaseValidator {
  /**
   * Validates database existence and accessibility
   */
  static validateDatabase(dbPath?: string): DatabaseValidationResult {
    const databasePath = dbPath || process.env.DATABASE_PATH ||
                        path.join(process.cwd(), 'data', 'database', 'cash_savings.db');

    // Check if database file exists
    if (!fs.existsSync(databasePath)) {
      return {
        isValid: false,
        error: `Database file does not exist: ${databasePath}`,
        path: databasePath
      };
    }

    // Check if file is readable
    try {
      fs.accessSync(databasePath, fs.constants.R_OK);
    } catch (error) {
      return {
        isValid: false,
        error: `Database file is not readable: ${databasePath}`,
        path: databasePath
      };
    }

    // Check if file is writable (required for SQLite operations)
    try {
      fs.accessSync(databasePath, fs.constants.W_OK);
    } catch (error) {
      return {
        isValid: false,
        error: `Database file is not writable: ${databasePath}`,
        path: databasePath
      };
    }

    // Check if directory exists and is writable (for WAL files)
    const dbDirectory = path.dirname(databasePath);
    if (!fs.existsSync(dbDirectory)) {
      return {
        isValid: false,
        error: `Database directory does not exist: ${dbDirectory}`,
        path: databasePath
      };
    }

    try {
      fs.accessSync(dbDirectory, fs.constants.W_OK);
    } catch (error) {
      return {
        isValid: false,
        error: `Database directory is not writable: ${dbDirectory}`,
        path: databasePath
      };
    }

    return {
      isValid: true,
      path: databasePath
    };
  }

  /**
   * Validates database with SQLite connection test
   */
  static async validateDatabaseConnection(dbPath?: string): Promise<DatabaseValidationResult> {
    const basicValidation = this.validateDatabase(dbPath);
    if (!basicValidation.isValid) {
      return basicValidation;
    }

    try {
      // Test actual SQLite connection
      const sqlite3 = require('sqlite3').verbose();
      const db = new sqlite3.Database(basicValidation.path);

      return new Promise<DatabaseValidationResult>((resolve) => {
        db.get('SELECT 1 as test', (err: any) => {
          db.close();
          if (err) {
            resolve({
              isValid: false,
              error: `Database connection test failed: ${err.message}`,
              path: basicValidation.path
            });
          } else {
            resolve({
              isValid: true,
              path: basicValidation.path
            });
          }
        });
      });
    } catch (error) {
      return {
        isValid: false,
        error: `Failed to test database connection: ${error instanceof Error ? error.message : String(error)}`,
        path: basicValidation.path
      };
    }
  }

  /**
   * Get standardized database path
   */
  static getDatabasePath(providedPath?: string): string {
    return providedPath || process.env.DATABASE_PATH ||
           path.join(process.cwd(), 'data', 'database', 'cash_savings.db');
  }
}