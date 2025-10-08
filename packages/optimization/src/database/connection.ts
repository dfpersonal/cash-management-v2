/**
 * Database connection utility for SQLite with environment-based path selection
 */

import sqlite3 from 'sqlite3';
import { DatabaseConnection, DatabaseError } from '../types';
import path from 'path';
import { getLogger } from '../utils/logger';

export class SQLiteConnection implements DatabaseConnection {
  private db: sqlite3.Database | null = null;
  public readonly databasePath: string;
  public readonly isProduction: boolean;
  private logger = getLogger({ component: 'database' });

  constructor(databasePath?: string) {
    // Environment-based database path selection
    if (databasePath) {
      this.databasePath = databasePath;
    } else {
      const isDev = process.env.NODE_ENV === 'development';
      const dbName = isDev ? 'cash_savings_dev.db' : 'cash_savings.db';
      this.databasePath = path.resolve(__dirname, '../../../data/database', dbName);
    }
    
    this.isProduction = !this.databasePath.includes('dev.db');
  }

  public async connect(): Promise<void> {
    if (this.db) {
      return; // Already connected
    }

    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.databasePath, (err) => {
        if (err) {
          reject(new DatabaseError(`Failed to connect to database: ${err.message}`, undefined));
        } else {
          this.logger.debug(`Connected to ${this.isProduction ? 'production' : 'development'} database: ${this.databasePath}`);
          resolve();
        }
      });
    });
  }

  public async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    await this.ensureConnected();
    
    return new Promise((resolve, reject) => {
      this.db!.all(sql, params, (err: Error | null, rows: T[]) => {
        if (err) {
          reject(new DatabaseError(`Query failed: ${err.message}`, sql));
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  public async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    await this.ensureConnected();
    
    return new Promise((resolve, reject) => {
      this.db!.get(sql, params, (err: Error | null, row: T) => {
        if (err) {
          reject(new DatabaseError(`Query failed: ${err.message}`, sql));
        } else {
          resolve(row || null);
        }
      });
    });
  }

  public async execute(sql: string, params: any[] = []): Promise<number> {
    await this.ensureConnected();
    
    return new Promise((resolve, reject) => {
      this.db!.run(sql, params, function(err: Error | null) {
        if (err) {
          reject(new DatabaseError(`Execution failed: ${err.message}`, sql));
        } else {
          resolve(this.changes || 0);
        }
      });
    });
  }

  public async close(): Promise<void> {
    if (!this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.db!.close((err) => {
        if (err) {
          reject(new DatabaseError(`Failed to close database: ${err.message}`, undefined));
        } else {
          this.db = null;
          this.logger.info('Database connection closed');
          resolve();
        }
      });
    });
  }

  public async beginTransaction(): Promise<void> {
    await this.execute('BEGIN TRANSACTION');
  }

  public async commit(): Promise<void> {
    await this.execute('COMMIT');
  }

  public async rollback(): Promise<void> {
    await this.execute('ROLLBACK');
  }

  private async ensureConnected(): Promise<void> {
    if (!this.db) {
      await this.connect();
    }
  }

  // Utility methods for testing
  public isConnected(): boolean {
    return this.db !== null;
  }

  public getDatabasePath(): string {
    return this.databasePath;
  }
}