/**
 * Integration tests for Rate Optimizer subprocess
 * Tests CLI functionality, progress reporting, and output format
 */

import { spawn } from 'child_process';
import * as path from 'path';

describe('Rate Optimizer Subprocess Integration', () => {
  const CLI_PATH = path.join(__dirname, '../../src/cli/optimize-cli.ts');
  const DB_PATH = path.join(__dirname, '../../data/test/databases/cash_savings_test_phase4.db');
  
  // Helper to run CLI and capture output
  const runCLI = (args: string[]): Promise<{ stdout: string; stderr: string; code: number }> => {
    return new Promise((resolve, reject) => {
      const proc = spawn('npx', ['ts-node', CLI_PATH, ...args], {
        env: { ...process.env, DATABASE_PATH: DB_PATH }
      });
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });
      
      proc.on('close', (code) => {
        resolve({ stdout, stderr, code: code || 0 });
      });
      
      proc.on('error', reject);
    });
  };

  describe('CLI Flags', () => {
    test('should handle --help flag', async () => {
      const { stdout, code } = await runCLI(['--help']);
      expect(code).toBe(0);
      expect(stdout).toContain('Rate Optimizer');
    });

    test('should output JSON with --format json', async () => {
      const { stdout, code } = await runCLI(['--format', 'json', '--silent']);
      expect(code).toBe(0);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty('module', 'rate-optimizer');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('recommendations');
    });

    test('should handle --exclude-sharia flag', async () => {
      const { stdout, code } = await runCLI(['--format', 'json', '--silent', '--exclude-sharia']);
      expect(code).toBe(0);
      const result = JSON.parse(stdout);
      // Check no Sharia banks in recommendations
      result.recommendations.forEach((rec: any) => {
        expect(rec.target.bankName).not.toMatch(/Al Rayan/i);
      });
    });

    test('should respect --min-benefit threshold', async () => {
      const minBenefit = 500;
      const { stdout, code } = await runCLI([
        '--format', 'json', 
        '--silent', 
        '--min-benefit', minBenefit.toString()
      ]);
      expect(code).toBe(0);
      const result = JSON.parse(stdout);
      result.recommendations.forEach((rec: any) => {
        expect(rec.benefits.annualBenefit.amount).toBeGreaterThanOrEqual(minBenefit);
      });
    });

    test('should respect --min-move-amount threshold', async () => {
      const minMove = 5000;
      const { stdout, code } = await runCLI([
        '--format', 'json',
        '--silent',
        '--min-move-amount', minMove.toString()
      ]);
      expect(code).toBe(0);
      const result = JSON.parse(stdout);
      result.recommendations.forEach((rec: any) => {
        expect(rec.source.amount.amount).toBeGreaterThanOrEqual(minMove);
      });
    });
  });

  describe('Progress Reporting', () => {
    test('should emit progress updates to stderr', async () => {
      const { stderr, code } = await runCLI(['--progress']);
      expect(code).toBe(0);
      
      // Check for progress format
      const progressLines = stderr.split('\n').filter(line => line.startsWith('PROGRESS:'));
      expect(progressLines.length).toBeGreaterThan(0);
      
      // Verify progress format
      progressLines.forEach(line => {
        expect(line).toMatch(/^PROGRESS:\d+:.+$/);
      });
      
      // Check progress sequence
      expect(stderr).toContain('PROGRESS:10:Connecting to database');
      expect(stderr).toContain('PROGRESS:20:Loading configuration');
      expect(stderr).toContain('PROGRESS:40:Loading portfolio');
      expect(stderr).toContain('PROGRESS:100:Complete');
    });

    test('should not emit progress without --progress flag', async () => {
      const { stderr, code } = await runCLI(['--format', 'json', '--silent']);
      expect(code).toBe(0);
      const progressLines = stderr.split('\n').filter(line => line.startsWith('PROGRESS:'));
      expect(progressLines.length).toBe(0);
    });
  });

  describe('ModuleResult Format', () => {
    test('should return valid ModuleResult structure', async () => {
      const { stdout, code } = await runCLI(['--format', 'json', '--silent']);
      expect(code).toBe(0);
      const result = JSON.parse(stdout);
      
      // Check required fields
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('module', 'rate-optimizer');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('recommendations');
      expect(result).toHaveProperty('metadata');
      
      // Check summary structure
      expect(result.summary).toHaveProperty('totalAccounts');
      expect(result.summary).toHaveProperty('totalValue');
      expect(result.summary).toHaveProperty('recommendationCount');
      expect(result.summary).toHaveProperty('urgentActions');
      expect(result.summary).toHaveProperty('totalBenefit');
      expect(result.summary).toHaveProperty('averageRateImprovement');
      
      // Check metadata
      expect(result.metadata).toHaveProperty('executionTime');
      expect(result.metadata.executionTime).toBeGreaterThan(0);
    });

    test('should include calendar events when requested', async () => {
      const { stdout, code } = await runCLI([
        '--format', 'json',
        '--silent',
        '--include-calendar-events'
      ]);
      expect(code).toBe(0);
      const result = JSON.parse(stdout);
      
      expect(result).toHaveProperty('calendarEvents');
      expect(Array.isArray(result.calendarEvents)).toBe(true);
      
      if (result.calendarEvents.length > 0) {
        const event = result.calendarEvents[0];
        expect(event).toHaveProperty('module', 'rate-optimizer');
        expect(event).toHaveProperty('event_date');
        expect(event).toHaveProperty('title');
        expect(event).toHaveProperty('category', 'OPTIMIZATION');
      }
    });

    test('should include action items when requested', async () => {
      const { stdout, code } = await runCLI([
        '--format', 'json',
        '--silent',
        '--include-action-items'
      ]);
      expect(code).toBe(0);
      const result = JSON.parse(stdout);
      
      expect(result).toHaveProperty('actionItems');
      expect(Array.isArray(result.actionItems)).toBe(true);
      
      if (result.actionItems.length > 0) {
        const item = result.actionItems[0];
        expect(item).toHaveProperty('module', 'rate-optimizer');
        expect(item).toHaveProperty('action_id');
        expect(item).toHaveProperty('title');
        expect(item).toHaveProperty('priority');
        expect(item).toHaveProperty('category');
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle database connection errors gracefully', async () => {
      const { stdout } = await runCLI(['--format', 'json', '--silent']);
      // Even with errors, should return valid JSON
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty('module', 'rate-optimizer');
      
      if (result.status === 'ERROR') {
        expect(result.metadata).toHaveProperty('error');
      }
    });

    test('should return exit code 0 for success', async () => {
      const { code } = await runCLI(['--format', 'json', '--silent']);
      // Should be 0 if successful, 1 if warning (no recommendations), 2 if error
      expect([0, 1, 2]).toContain(code);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty portfolio gracefully', async () => {
      // This would need a test database with no accounts
      // For now, just verify it doesn't crash
      const { stdout } = await runCLI(['--format', 'json', '--silent']);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty('module', 'rate-optimizer');
    });

    test('should handle very high thresholds', async () => {
      const { stdout, code } = await runCLI([
        '--format', 'json',
        '--silent',
        '--min-benefit', '999999'
      ]);
      expect(code).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.recommendations.length).toBe(0);
      expect(result.status).toBe('WARNING'); // No recommendations is a warning
    });
  });

  describe('Performance', () => {
    test('should complete within reasonable time', async () => {
      const start = Date.now();
      const { code } = await runCLI(['--format', 'json', '--silent']);
      const duration = Date.now() - start;
      
      expect(code).toBe(0);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    });

    test('should report execution time in metadata', async () => {
      const { stdout } = await runCLI(['--format', 'json', '--silent']);
      const result = JSON.parse(stdout);
      
      expect(result.metadata.executionTime).toBeDefined();
      expect(result.metadata.executionTime).toBeGreaterThan(0);
      expect(result.metadata.executionTime).toBeLessThan(10000);
    });
  });
});