import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';

/**
 * Test utilities for dynamic counting and metadata validation
 * Implements TEST-SUITE-OVERHAUL-PLAN.md helper functions
 */

// Dynamic fixture counting - no hardcoded values
export function getFixtureProductCount(fixtureName: string): number {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const data = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  return data.products.length;
}

// Get all fixture product counts as a map
export function getAllFixtureCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  const fixtures = [
    'ajbell-sample.json',
    'flagstone-sample.json',
    'hargreaves-lansdown-sample.json',
    'moneyfacts-easy-access-sample.json',
    'moneyfacts-fixed-term-sample.json',
    'moneyfacts-notice-sample.json'
  ];

  for (const fixture of fixtures) {
    counts.set(fixture, getFixtureProductCount(fixture));
  }
  return counts;
}

// Get source name from fixture metadata
export function getFixtureSource(fixtureName: string): string {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const data = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  return data.metadata.source;
}

// Get method name from fixture metadata
export function getFixtureMethod(fixtureName: string): string {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const data = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  return data.metadata.method;
}

// Method-specific queries
export function getMethodCount(db: Database.Database, method: string): number {
  const result = db.prepare(
    'SELECT COUNT(*) as count FROM available_products_raw WHERE method = ?'
  ).get(method) as { count: number };
  return result.count;
}

// Total accumulation count
export function getRawTableCount(db: Database.Database): number {
  const result = db.prepare(
    'SELECT COUNT(*) as count FROM available_products_raw'
  ).get() as { count: number };
  return result.count;
}

// Clear raw table for fresh test
export function clearRawTable(db: Database.Database): void {
  db.prepare('DELETE FROM available_products_raw').run();
}

// Validate metadata structure
export function validateMetadata(data: any): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!data.metadata) {
    errors.push('Missing metadata object');
  } else {
    if (!data.metadata.source) {
      errors.push('Missing metadata.source');
    }
    if (!data.metadata.method) {
      errors.push('Missing metadata.method');
    }
  }

  if (!data.products) {
    errors.push('Missing products array');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Get final table count
export function getFinalTableCount(db: Database.Database): number {
  const result = db.prepare(
    'SELECT COUNT(*) as count FROM available_products'
  ).get() as { count: number };
  return result.count;
}

// Method-source combination tracking
export function getMethodSourceCombinations(db: Database.Database): Array<{
  source: string;
  method: string;
  count: number;
}> {
  return db.prepare(`
    SELECT source, method, COUNT(*) as count
    FROM available_products_raw
    GROUP BY source, method
    ORDER BY source, method
  `).all() as Array<{ source: string; method: string; count: number }>;
}

// Get count of valid products from audit table for a specific source/method
export function getValidProductCountFromAudit(db: Database.Database, source: string, method?: string): number {
  if (method) {
    const result = db.prepare(
      "SELECT COUNT(*) as count FROM json_ingestion_audit WHERE source = ? AND method = ? AND validation_status = 'valid'"
    ).get(source, method) as { count: number };
    return result.count;
  } else {
    const result = db.prepare(
      "SELECT COUNT(*) as count FROM json_ingestion_audit WHERE source = ? AND validation_status = 'valid'"
    ).get(source) as { count: number };
    return result.count;
  }
}

// Get total processed products from audit table for a specific source/method (valid + invalid)
export function getTotalProcessedCountFromAudit(db: Database.Database, source: string, method?: string): number {
  if (method) {
    const result = db.prepare(
      'SELECT COUNT(*) as count FROM json_ingestion_audit WHERE source = ? AND method = ?'
    ).get(source, method) as { count: number };
    return result.count;
  } else {
    const result = db.prepare(
      'SELECT COUNT(*) as count FROM json_ingestion_audit WHERE source = ?'
    ).get(source) as { count: number };
    return result.count;
  }
}

// Get method-specific raw count
export function getMethodRawCount(db: Database.Database, source: string, method: string): number {
  const result = db.prepare(
    'SELECT COUNT(*) as count FROM available_products_raw WHERE source = ? AND method = ?'
  ).get(source, method) as { count: number };
  return result.count;
}