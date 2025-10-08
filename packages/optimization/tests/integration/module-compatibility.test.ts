/**
 * Integration tests to ensure both FSCS and Rate Optimizer modules
 * produce compatible output for Electron integration
 */

import { execSync } from 'child_process';
import * as path from 'path';

const TEST_DB = require('path').join(__dirname, '../../data/test/databases/cash_savings_test_phase4.db');

describe('Module Compatibility Tests', () => {
  
  // Helper to run CLI commands
  function runCommand(command: string): any {
    try {
      const output = execSync(command, {
        cwd: path.join(__dirname, '../..'),
        encoding: 'utf-8'
      });
      return JSON.parse(output);
    } catch (error: any) {
      console.error(`Command failed: ${command}`);
      console.error(error.stdout || error.stderr);
      throw error;
    }
  }

  describe('FSCS Compliance Module', () => {
    it('should produce valid ModuleResult structure', () => {
      const result = runCommand(
        `npx ts-node src/cli/fscs-compliance.ts --format json --silent --database ${TEST_DB}`
      );
      
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('status');
      expect(result.status).toMatch(/SUCCESS|WARNING|ERROR/);
      expect(result).toHaveProperty('module', 'fscs-compliance');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('metadata');
    });

    it('should generate calendar events when requested', () => {
      const result = runCommand(
        `npx ts-node src/cli/fscs-compliance.ts --include-calendar-events --format json --silent --database ${TEST_DB}`
      );
      
      if (result.calendarEvents) {
        expect(Array.isArray(result.calendarEvents)).toBe(true);
        if (result.calendarEvents.length > 0) {
          const event = result.calendarEvents[0];
          expect(event).toHaveProperty('module', 'fscs-compliance');
          expect(event).toHaveProperty('category', 'COMPLIANCE');
          expect(event).toHaveProperty('priority');
        }
      }
    });

    it('should generate action items when requested', () => {
      const result = runCommand(
        `npx ts-node src/cli/fscs-compliance.ts --include-action-items --format json --silent --database ${TEST_DB}`
      );
      
      if (result.actionItems) {
        expect(Array.isArray(result.actionItems)).toBe(true);
        if (result.actionItems.length > 0) {
          const item = result.actionItems[0];
          expect(item).toHaveProperty('module', 'fscs-compliance');
          expect(item).toHaveProperty('category', 'COMPLIANCE');
          expect(item).toHaveProperty('status', 'pending');
        }
      }
    });

    it('should emit progress updates to stderr', (done) => {
      const { spawn } = require('child_process');
      const child = spawn('npx', [
        'ts-node', 'src/cli/fscs-compliance.ts',
        '--progress', '--silent', '--database', TEST_DB
      ], {
        cwd: path.join(__dirname, '../..')
      });
      
      const progressUpdates: string[] = [];
      
      child.stderr.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);
        progressUpdates.push(...lines);
      });
      
      child.on('close', () => {
        expect(progressUpdates.some(line => line.includes('PROGRESS:'))).toBe(true);
        expect(progressUpdates.some(line => line.includes('PROGRESS:100:'))).toBe(true);
        done();
      });
    });

    it('should return correct exit codes', () => {
      // This will throw if exit code is non-zero (has breaches)
      try {
        execSync(
          `npx ts-node src/cli/fscs-compliance.ts --format json --silent --database ${TEST_DB}`,
          { cwd: path.join(__dirname, '../..') }
        );
      } catch (error: any) {
        expect([0, 1]).toContain(error.status); // 0=success, 1=warning
      }
    });
  });

  describe('Rate Optimizer Module', () => {
    it('should produce valid ModuleResult structure', () => {
      const result = runCommand(
        `npx ts-node src/cli/index.ts optimize --json --database ${TEST_DB}`
      );
      
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('status');
      expect(result.status).toMatch(/SUCCESS|WARNING|ERROR/);
      expect(result).toHaveProperty('module', 'rate-optimizer');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('metadata');
    });

    // Similar tests for Rate Optimizer...
  });

  describe('Cross-Module Compatibility', () => {
    it('should use same database schema', () => {
      // Both modules should be able to read/write to same tables
      const fscsResult = runCommand(
        `npx ts-node src/cli/fscs-compliance.ts --format json --silent --database ${TEST_DB}`
      );
      
      const optimizerResult = runCommand(
        `npx ts-node src/cli/index.ts optimize --json --database ${TEST_DB}`
      );
      
      // Both should succeed with same database
      expect(fscsResult.status).toBeDefined();
      expect(optimizerResult.status).toBeDefined();
    });

    it('should use compatible priority levels', () => {
      const fscsResult = runCommand(
        `npx ts-node src/cli/fscs-compliance.ts --include-action-items --format json --silent --database ${TEST_DB}`
      );
      
      if (fscsResult.actionItems?.length > 0) {
        const priorities = fscsResult.actionItems.map((item: any) => item.priority);
        priorities.forEach((priority: string) => {
          expect(['URGENT', 'HIGH', 'MEDIUM', 'LOW']).toContain(priority);
        });
      }
    });

    it('should use compatible categories', () => {
      const validCategories = ['COMPLIANCE', 'OPTIMIZATION', 'REBALANCING', 'REVIEW'];
      
      const fscsResult = runCommand(
        `npx ts-node src/cli/fscs-compliance.ts --include-action-items --format json --silent --database ${TEST_DB}`
      );
      
      if (fscsResult.actionItems?.length > 0) {
        fscsResult.actionItems.forEach((item: any) => {
          expect(validCategories).toContain(item.category);
        });
      }
    });
  });
});

// Run with: npm test tests/integration/module-compatibility.test.ts