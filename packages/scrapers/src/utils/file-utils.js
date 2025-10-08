/**
 * File Utilities - Centralized file operations for all scrapers
 * Extracted from flagstone-scraper.js to ensure consistency
 */

import fs from 'fs/promises';
import path from 'path';

export class FileUtils {
  constructor(outputDir = './output') {
    this.outputDir = outputDir;
  }

  async ensureDirectoryExists(dir = null) {
    const targetDir = dir || this.outputDir;
    await fs.mkdir(targetDir, { recursive: true });
    return targetDir;
  }

  generateTimestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
  }

  async saveToFile(data, prefix = '', customDir = null) {
    const outputDir = customDir || this.outputDir;
    
    // Ensure output directory exists
    await this.ensureDirectoryExists(outputDir);
    
    const timestamp = this.generateTimestamp();
    const prefixStr = prefix ? `${prefix}-` : '';
    const filename = `${prefixStr}${timestamp}`;
    
    const filepath = path.join(outputDir, `${filename}.json`);
    await fs.writeFile(filepath, JSON.stringify(data, null, 2));
    console.log(`Saved ${data.length} entries to ${path.basename(filepath)}`);
    return filepath;
  }

  // Helper method to save with platform-specific naming
  async savePlatformData(data, platform, dataType = 'rates', customDir = null) {
    const outputDir = customDir || this.outputDir;
    const prefix = `${platform}-${dataType}`;
    
    return await this.saveToFile(data, prefix, outputDir);
  }

  // Helper method to read existing files (for testing/comparison)
  async readJsonFile(filepath) {
    try {
      const content = await fs.readFile(filepath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`Error reading file ${filepath}:`, error.message);
      return null;
    }
  }

  // Helper method to check if file exists
  async fileExists(filepath) {
    try {
      await fs.access(filepath);
      return true;
    } catch {
      return false;
    }
  }

  // Helper method to get file stats
  async getFileStats(filepath) {
    try {
      return await fs.stat(filepath);
    } catch (error) {
      console.error(`Error getting stats for ${filepath}:`, error.message);
      return null;
    }
  }
}