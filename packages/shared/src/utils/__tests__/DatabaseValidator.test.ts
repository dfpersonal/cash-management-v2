/**
 * Tests for DatabaseValidator utility
 */

import * as fs from 'fs';
import * as path from 'path';
import { DatabaseValidator } from '../DatabaseValidator';

describe('DatabaseValidator', () => {
  const testDbPath = path.join(__dirname, 'test.db');
  const nonExistentPath = path.join(__dirname, 'nonexistent.db');

  beforeEach(() => {
    // Create a test database file
    if (!fs.existsSync(testDbPath)) {
      fs.writeFileSync(testDbPath, '');
    }
  });

  afterEach(() => {
    // Clean up test database file
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('validateDatabase', () => {
    test('should return valid for existing readable/writable database file', () => {
      const result = DatabaseValidator.validateDatabase(testDbPath);
      expect(result.isValid).toBe(true);
      expect(result.path).toBe(testDbPath);
      expect(result.error).toBeUndefined();
    });

    test('should return invalid for non-existent database file', () => {
      const result = DatabaseValidator.validateDatabase(nonExistentPath);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Database file does not exist');
      expect(result.path).toBe(nonExistentPath);
    });

    test('should use default database path when none provided', () => {
      const result = DatabaseValidator.validateDatabase();
      expect(result.path).toContain('cash_savings.db');
    });

    test('should use environment variable when set', () => {
      process.env.DATABASE_PATH = testDbPath;
      const result = DatabaseValidator.validateDatabase();
      expect(result.path).toBe(testDbPath);
      delete process.env.DATABASE_PATH;
    });
  });

  describe('getDatabasePath', () => {
    test('should return provided path when given', () => {
      const customPath = '/custom/path/db.sqlite';
      const result = DatabaseValidator.getDatabasePath(customPath);
      expect(result).toBe(customPath);
    });

    test('should return environment variable path when set', () => {
      process.env.DATABASE_PATH = testDbPath;
      const result = DatabaseValidator.getDatabasePath();
      expect(result).toBe(testDbPath);
      delete process.env.DATABASE_PATH;
    });

    test('should return default path when no environment variable', () => {
      delete process.env.DATABASE_PATH;
      const result = DatabaseValidator.getDatabasePath();
      expect(result).toContain('cash_savings.db');
    });
  });
});