/**
 * Environment-based Configuration
 * Manages different configurations for development, test, and production environments
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Environment configurations
const environments = {
  // Test environment - isolated and fast
  test: {
    outputDir: path.join(projectRoot, 'test', 'output'),
    logLevel: 'error', // Quiet during tests
    headless: true,
    timeout: 10000, // Shorter timeout for tests
    saveToFiles: true,
    saveToDatabase: false, // JSON-only mode for tests
    enableFileLogging: false
  },

  // Development environment - local development with verbose logging
  development: {
    outputDir: path.join(projectRoot, 'data'),
    logLevel: 'debug', // Verbose logging
    headless: false, // Visible browser for debugging
    timeout: 60000, // Longer timeout for debugging
    saveToFiles: true,
    saveToDatabase: false, // JSON-only pipeline
    enableFileLogging: true
  },

  // Production environment - optimized for performance and reliability
  production: {
    outputDir: path.join(projectRoot, 'data'),
    logLevel: 'info', // Standard logging
    headless: true, // Headless for performance
    timeout: 120000, // Extended timeout for stability
    saveToFiles: true,
    saveToDatabase: false, // JSON-only pipeline
    enableFileLogging: true
  }
};

// Platform-specific output directories
const platformDirectories = {
  ajbell: 'ajbell',
  flagstone: 'flagstone',
  hargreaves_lansdown: 'hargreaves-lansdown',
  moneyfacts: 'moneyfacts'
};

/**
 * Get configuration for current environment
 * @param {string} env - Environment name (test, development, production)
 * @returns {object} Environment configuration
 */
export function getConfig(env = null) {
  const environment = env || process.env.NODE_ENV || 'production';

  if (!environments[environment]) {
    console.warn(`Unknown environment '${environment}', falling back to production`);
    return environments.production;
  }

  return environments[environment];
}

/**
 * Get platform-specific output directory
 * @param {string} platform - Platform name
 * @param {string} env - Environment name
 * @returns {string} Platform output directory path
 */
export function getPlatformOutputDir(platform, env = null) {
  const config = getConfig(env);
  const platformDir = platformDirectories[platform] || platform;
  return path.join(config.outputDir, platformDir);
}

/**
 * Get scraper configuration for a specific platform
 * @param {string} platform - Platform name
 * @param {object} options - Additional options to override
 * @param {string} env - Environment name
 * @returns {object} Scraper configuration
 */
export function getScraperConfig(platform, options = {}, env = null) {
  const baseConfig = getConfig(env);
  const platformOutputDir = getPlatformOutputDir(platform, env);

  return {
    ...baseConfig,
    platform,
    outputDir: platformOutputDir,
    logDir: platformOutputDir, // Co-locate logs with JSON output
    dbPath: path.join(projectRoot, '../data/database/cash_savings.db'), // Path to main database
    ...options // Allow overrides
  };
}

/**
 * Initialize environment (create directories, etc.)
 * @param {string} env - Environment name
 */
export function initializeEnvironment(env = null) {
  const config = getConfig(env);

  // Create necessary directories
  import('fs').then(fs => {
    // Main directories
    if (!fs.existsSync(config.outputDir)) {
      fs.mkdirSync(config.outputDir, { recursive: true });
    }

    // Platform directories
    Object.values(platformDirectories).forEach(platformDir => {
      const fullPath = path.join(config.outputDir, platformDir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    });
  });
}

// Auto-initialize on import for non-test environments
if (process.env.NODE_ENV !== 'test') {
  initializeEnvironment();
}

// Export configurations for direct access if needed
export { environments, platformDirectories };
export default getConfig;