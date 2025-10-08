/**
 * Base class for subprocess services
 * Provides common functionality for running CLI tools as subprocesses
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export interface SubprocessOptions {
  database: string;
  format: 'json' | 'text';
  includeCalendarEvents?: boolean;
  includeActionItems?: boolean;
  outputFile?: string;
  silent?: boolean;
  progress?: boolean;
  [key: string]: any; // Module-specific options
}

export interface ModuleResult {
  version: string;
  timestamp: string;
  status: 'SUCCESS' | 'WARNING' | 'ERROR';
  module: 'fscs-compliance' | 'rate-optimizer';
  summary: {
    totalAccounts: number;
    totalValue: number;
    recommendationCount: number;
    urgentActions: number;
    totalBenefit?: number;
    totalAtRisk?: number;
    breachCount?: number;
  };
  recommendations: any[];
  calendarEvents?: any[];
  actionItems?: any[];
  metadata: {
    executionTime: number;
    configVersion: string;
    [key: string]: any;
  };
}

export interface ProgressUpdate {
  percent: number;
  message: string;
  stage?: string;
}

export abstract class SubprocessService extends EventEmitter {
  protected abstract readonly cliPath: string;
  protected abstract readonly moduleName: string;
  protected child: ChildProcess | null = null;
  
  protected async runCommand(
    command: string,
    args: string[],
    options: SubprocessOptions
  ): Promise<ModuleResult> {
    return new Promise((resolve, reject) => {
      const fullArgs = this.buildFullArgs(command, args, options);
      
      this.child = spawn('npx', ['ts-node', this.cliPath, ...fullArgs], {
        cwd: this.getWorkingDirectory(),
        env: { ...process.env, NODE_ENV: 'production' }
      });
      
      let output = '';
      let errorOutput = '';
      
      this.child.stdout?.on('data', (data) => {
        const text = data.toString();
        output += text;
      });
      
      this.child.stderr?.on('data', (data) => {
        const text = data.toString();
        
        // Check for progress updates
        const lines = text.split('\n');
        for (const line of lines) {
          const progressMatch = line.match(/^PROGRESS:(\d+):(.+)$/);
          if (progressMatch) {
            const progress: ProgressUpdate = {
              percent: parseInt(progressMatch[1]),
              message: progressMatch[2]
            };
            this.emit('progress', progress);
            if (options.progress) {
              console.log(`[${this.moduleName}] ${progress.percent}% - ${progress.message}`);
            }
          } else if (line.trim()) {
            errorOutput += line + '\n';
          }
        }
      });
      
      this.child.on('close', (code) => {
        if (code === 0 || code === 1) { // Success or Warning
          try {
            const result = JSON.parse(output);
            
            // Validate result structure
            if (!result.module || !result.status) {
              reject(new Error(`Invalid ${this.moduleName} output structure`));
              return;
            }
            
            resolve(result);
          } catch (e: any) {
            reject(new Error(`Failed to parse ${this.moduleName} output: ${e.message}\nOutput: ${output}`));
          }
        } else {
          reject(new Error(`${this.moduleName} failed with code ${code}: ${errorOutput}`));
        }
      });
      
      this.child.on('error', (error) => {
        reject(new Error(`Failed to spawn ${this.moduleName}: ${error.message}`));
      });
    });
  }
  
  protected buildFullArgs(command: string, args: string[], options: SubprocessOptions): string[] {
    const fullArgs: string[] = [];
    
    if (command) {
      fullArgs.push(command);
    }
    
    // Add common flags
    fullArgs.push('--database', options.database);
    fullArgs.push('--format', options.format || 'json');
    
    if (options.includeCalendarEvents) {
      fullArgs.push('--include-calendar-events');
    }
    
    if (options.includeActionItems) {
      fullArgs.push('--include-action-items');
    }
    
    if (options.silent) {
      fullArgs.push('--silent');
    }
    
    if (options.progress) {
      fullArgs.push('--progress');
    }
    
    if (options.outputFile) {
      fullArgs.push('--output', options.outputFile);
    }
    
    // Add module-specific args
    fullArgs.push(...args);
    
    return fullArgs;
  }
  
  /**
   * Cancel the running subprocess
   */
  public cancel(): void {
    if (this.child) {
      this.child.kill('SIGINT');
      this.child = null;
      this.emit('cancelled');
    }
  }
  
  /**
   * Check if subprocess is running
   */
  public isRunning(): boolean {
    return this.child !== null && !this.child.killed;
  }
  
  protected abstract getWorkingDirectory(): string;
}