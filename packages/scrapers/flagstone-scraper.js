#!/usr/bin/env node

/**
 * Flagstone Scraper Wrapper
 * 
 * This is a simple wrapper that calls the main CLI runner with flagstone platform.
 * For more advanced options, use the CLI runner directly or npm scripts.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Run the CLI runner with flagstone platform
const cliRunner = join(__dirname, 'src', 'runners', 'cli-runner.js');
const child = spawn('node', [cliRunner, '--platform', 'flagstone'], {
  stdio: 'inherit',
  cwd: __dirname
});

child.on('error', (error) => {
  console.error('Failed to start flagstone scraper:', error);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code || 0);
});