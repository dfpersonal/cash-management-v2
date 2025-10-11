/**
 * Read-only Database Utility
 * Provides read-only access to the cash_savings database for platform lookups
 * Used by MoneyFacts scraper for platform variant parsing
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ReadOnlyDatabase {
  constructor(dbPath = null) {
    // Default to the main cash_savings database
    // From src/utils: go up to scrapers -> packages -> root, then into data/database
    this.dbPath = dbPath || path.resolve(__dirname, '../../../../data/database/cash_savings.db');
    this.db = null;
  }

  async connect() {
    try {
      this.db = new Database(this.dbPath, { readonly: true });
      return true;
    } catch (error) {
      console.error(`Failed to connect to database at ${this.dbPath}: ${error.message}`);
      return false;
    }
  }

  async getKnownPlatforms() {
    if (!this.db) {
      const connected = await this.connect();
      if (!connected) {
        throw new Error('Cannot connect to database');
      }
    }

    try {
      const stmt = this.db.prepare(`
        SELECT platform_variant, canonical_name, display_name, platform_type, is_active
        FROM known_platforms 
        WHERE is_active = 1
        ORDER BY platform_variant
      `);
      
      return stmt.all();
    } catch (error) {
      console.error(`Failed to query known_platforms: ${error.message}`);
      throw error;
    }
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}