import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export interface PlatformData {
  platform_variant: string;
  canonical_name: string;
  display_name: string;
  platform_type: string;
  is_active: number;
}

export interface PlatformExport {
  exported_at: string;
  platforms: PlatformData[];
}

/**
 * Export platform data from the database to a JSON file
 *
 * This function extracts active platform data from the known_platforms table
 * and writes it to a JSON file for consumption by the scrapers package.
 *
 * This approach eliminates the need for scrapers to depend on better-sqlite3,
 * avoiding ABI version mismatches when scrapers run in different Node.js contexts.
 *
 * @param dbPath - Path to the SQLite database file
 * @param outputPath - Path where the JSON file should be written
 * @returns Object containing success status and optional error/count
 */
export async function exportPlatformsToJson(
  dbPath: string,
  outputPath: string
): Promise<{ success: boolean; error?: string; count?: number }> {
  let db: Database.Database | null = null;

  try {
    // Open database in read-only mode
    db = new Database(dbPath, { readonly: true });

    // Query active platforms
    const stmt = db.prepare(`
      SELECT platform_variant, canonical_name, display_name, platform_type, is_active
      FROM known_platforms
      WHERE is_active = 1
      ORDER BY platform_variant
    `);

    const platforms = stmt.all() as PlatformData[];

    // Create export data structure
    const exportData: PlatformExport = {
      exported_at: new Date().toISOString(),
      platforms
    };

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write JSON file
    fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf8');

    console.log(`✅ Exported ${platforms.length} platforms to ${outputPath}`);

    return { success: true, count: platforms.length };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to export platforms: ${errorMessage}`);
    return { success: false, error: errorMessage };
  } finally {
    // Always close the database connection
    if (db) {
      db.close();
    }
  }
}

/**
 * Get default paths for database and output file
 * @returns Object containing default dbPath and outputPath
 */
export function getDefaultPaths() {
  // Navigate up from packages/electron-app/src/main/utils to project root
  const projectRoot = path.resolve(__dirname, '../../../../../');

  return {
    dbPath: path.join(projectRoot, 'data/database/cash_savings.db'),
    outputPath: path.join(projectRoot, 'packages/scrapers/data/known-platforms.json')
  };
}
