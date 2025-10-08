import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import {
  ScrapingProcess,
  ScrapingOptions,
  ScrapingResults,
  Platform,
  ScraperConfig,
  ProgressData,
  OutputData,
  CompletionData,
  TriggerScraperResponse
} from '@cash-mgmt/shared';
import { getDeduplicationOrchestrator, initializeDeduplicationOrchestrator } from '@cash-mgmt/pipeline';
import { LogCategory } from '@cash-mgmt/shared';

export class ScraperProcessManager extends EventEmitter {
  private processes: Map<string, ScrapingProcess> = new Map();
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private databasePath: string;
  private scraperConfigs: Map<string, ScraperConfig> = new Map();
  private deduplicationEnabled: boolean = true;
  private deduplicationInitialized: boolean = false;

  // Platform configurations based on puppeteer-scraper package.json
  private platforms: Platform[] = [
    {
      id: 'flagstone',
      name: 'Flagstone',
      supportsModular: false,
      supportsVisible: true,
      status: 'available'
    },
    {
      id: 'hl',
      name: 'Hargreaves Lansdown',
      supportsModular: false,
      supportsVisible: true,
      status: 'available'
    },
    {
      id: 'ajbell',
      name: 'AJ Bell',
      supportsModular: false,
      supportsVisible: true,
      status: 'available'
    },
    {
      id: 'moneyfacts',
      name: 'MoneyFacts',
      accountTypes: ['easy-access', 'fixed-term', 'notice'],
      supportsModular: true,
      supportsVisible: true,
      status: 'available'
    }
  ];

  constructor(databasePath?: string) {
    super();
    this.databasePath = databasePath || path.join(__dirname, '../../../../../data/database/cash_savings.db');
    this.loadScraperConfigs();
    this.initializeDeduplication();
  }

  /**
   * Initialize deduplication orchestrator for automatic processing
   */
  private async initializeDeduplication(): Promise<void> {
    if (!this.deduplicationEnabled || this.deduplicationInitialized) {
      return;
    }

    try {
      console.log(`${LogCategory.DEBUG} 🔧 Initializing deduplication orchestrator...`);

      const sqlite3 = require('sqlite3').verbose();
      const db = new sqlite3.Database(this.databasePath);

      // Initialize the global deduplication orchestrator
      const orchestrator = await initializeDeduplicationOrchestrator(db, {
        enableAutomaticProcessing: true,
        processingTimeoutMs: 30000,
        maxRetries: 3,
        circuitBreakerThreshold: 3,
        enableFallbackProcessing: true
      });

      // Set up event forwarding from this ScraperProcessManager to the orchestrator
      this.on('process:completed', (completionData: CompletionData) => {
        if (completionData.success) {
          console.log(`${LogCategory.DEBUG} ✅ Scraper completed successfully, triggering deduplication`);

          // Emit scraper completion event to orchestrator
          orchestrator.emit('scraper:completed', {
            type: 'scraper:completed',
            source: `scraper_${completionData.processId}`,
            data: completionData,
            timestamp: new Date()
          });
        } else {
          console.log(`${LogCategory.DEBUG} ❌ Scraper failed, skipping deduplication`);
        }
      });

      this.deduplicationInitialized = true;
      console.log(`${LogCategory.DEBUG} ✅ Deduplication orchestrator initialized and event forwarding configured`);

    } catch (error) {
      console.log(`${LogCategory.WARNING} ⚠️ Failed to initialize deduplication orchestrator: ${error}`);
      // Continue operation without deduplication
      this.deduplicationEnabled = false;
    }
  }

  /**
   * Manually trigger deduplication processing
   */
  public async triggerDeduplication(): Promise<{ success: boolean; message: string }> {
    if (!this.deduplicationEnabled) {
      return { success: false, message: 'Deduplication is disabled' };
    }

    if (!this.deduplicationInitialized) {
      return { success: false, message: 'Deduplication orchestrator not initialized' };
    }

    try {
      const orchestrator = getDeduplicationOrchestrator();
      await orchestrator.triggerManualProcessing();
      return { success: true, message: 'Deduplication processing triggered successfully' };
    } catch (error) {
      console.log(`${LogCategory.ERROR} ❌ Failed to trigger manual deduplication: ${error}`);
      return { success: false, message: `Failed to trigger deduplication: ${error}` };
    }
  }

  /**
   * Get deduplication orchestrator status
   */
  public getDeduplicationStatus(): {
    enabled: boolean;
    initialized: boolean;
    stats?: any;
    circuitBreakerState?: string;
  } {
    const status = {
      enabled: this.deduplicationEnabled,
      initialized: this.deduplicationInitialized
    };

    if (this.deduplicationInitialized) {
      try {
        const orchestrator = getDeduplicationOrchestrator();
        return {
          ...status,
          stats: orchestrator.getStats(),
          circuitBreakerState: orchestrator.getCircuitBreakerState()
        };
      } catch (error) {
        console.log(`${LogCategory.WARNING} ⚠️ Failed to get orchestrator status: ${error}`);
      }
    }

    return status;
  }

  /**
   * Enable or disable automatic deduplication
   */
  public setDeduplicationEnabled(enabled: boolean): void {
    this.deduplicationEnabled = enabled;
    console.log(`${LogCategory.INFO} 🔧 Deduplication ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Load scraper configurations from database
   */
  private async loadScraperConfigs(): Promise<void> {
    try {
      const sqlite3 = require('sqlite3').verbose();
      const db = new sqlite3.Database(this.databasePath);
      
      await new Promise<void>((resolve, reject) => {
        db.all(
          'SELECT * FROM scraper_config ORDER BY display_order',
          (err: Error | null, rows: ScraperConfig[]) => {
            if (err) {
              console.error('Failed to load scraper configs:', err);
              reject(err);
            } else {
              this.scraperConfigs.clear();
              rows.forEach(config => {
                this.scraperConfigs.set(config.scraper_id, config);
              });
              resolve();
            }
          }
        );
      });
      
      db.close();
    } catch (error) {
      console.error('Error loading scraper configurations:', error);
    }
  }

  /**
   * Get scraper configurations
   */
  async getScraperConfigs(): Promise<ScraperConfig[]> {
    await this.loadScraperConfigs();
    return Array.from(this.scraperConfigs.values())
      .sort((a, b) => a.display_order - b.display_order);
  }

  /**
   * Update scraper configuration
   */
  async updateScraperConfig(scraperId: string, updates: Partial<ScraperConfig>): Promise<boolean> {
    try {
      const sqlite3 = require('sqlite3').verbose();
      const db = new sqlite3.Database(this.databasePath);
      
      const fields: string[] = [];
      const values: any[] = [];
      
      if (updates.is_enabled !== undefined) {
        fields.push('is_enabled = ?');
        values.push(updates.is_enabled ? 1 : 0);
      }
      if (updates.display_order !== undefined) {
        fields.push('display_order = ?');
        values.push(updates.display_order);
      }
      if (updates.custom_name !== undefined) {
        fields.push('custom_name = ?');
        values.push(updates.custom_name);
      }
      
      values.push(scraperId);
      
      const success = await new Promise<boolean>((resolve, reject) => {
        db.run(
          `UPDATE scraper_config SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE scraper_id = ?`,
          values,
          function(this: any, err: Error | null) {
            if (err) {
              console.error('Failed to update scraper config:', err);
              resolve(false);
            } else {
              resolve(this.changes > 0);
            }
          }
        );
      });
      
      db.close();
      
      if (success) {
        await this.loadScraperConfigs();
      }
      
      return success;
    } catch (error) {
      console.error('Error updating scraper configuration:', error);
      return false;
    }
  }

  /**
   * Reset scraper configurations to defaults
   */
  async resetScraperConfigs(): Promise<boolean> {
    try {
      const sqlite3 = require('sqlite3').verbose();
      const db = new sqlite3.Database(this.databasePath);
      
      const success = await new Promise<boolean>((resolve, reject) => {
        db.run(
          `UPDATE scraper_config 
           SET is_enabled = 1, 
               custom_name = NULL, 
               updated_at = CURRENT_TIMESTAMP`,
          function(this: any, err: Error | null) {
            if (err) {
              console.error('Failed to reset scraper configs:', err);
              resolve(false);
            } else {
              resolve(true);
            }
          }
        );
      });
      
      db.close();
      
      if (success) {
        await this.loadScraperConfigs();
      }
      
      return success;
    } catch (error) {
      console.error('Error resetting scraper configurations:', error);
      return false;
    }
  }

  /**
   * Get available platforms (filtered by enabled status)
   */
  getPlatforms(): Platform[] {
    return this.platforms
      .filter(platform => {
        const config = this.scraperConfigs.get(platform.id);
        return !config || config.is_enabled;
      })
      .map(platform => {
        const config = this.scraperConfigs.get(platform.id);
        return {
          ...platform,
          name: config?.custom_name || platform.name
        };
      })
      .sort((a, b) => {
        const configA = this.scraperConfigs.get(a.id);
        const configB = this.scraperConfigs.get(b.id);
        const orderA = configA?.display_order ?? 999;
        const orderB = configB?.display_order ?? 999;
        return orderA - orderB;
      });
  }

  /**
   * Get all platforms (including disabled ones, for settings)
   */
  getAllPlatforms(): Platform[] {
    return this.platforms.map(platform => ({
      ...platform,
      status: this.getProcessesForPlatform(platform.id).some(p => p.status === 'running') 
        ? 'running' 
        : 'available'
    }));
  }

  /**
   * Trigger a scraper for the specified platform
   */
  async triggerScraper(platform: string, options: ScrapingOptions = {}): Promise<TriggerScraperResponse> {
    try {
      // Validate platform
      const platformConfig = this.platforms.find(p => p.id === platform);
      if (!platformConfig) {
        return { success: false, error: `Unknown platform: ${platform}` };
      }

      // Check if platform is already running
      const activeForPlatform = this.getProcessesForPlatform(platform).filter(p => p.status === 'running');
      if (activeForPlatform.length > 0) {
        return { success: false, error: `Platform ${platform} is already running` };
      }

      // Generate unique process ID
      const processId = `${platform}-${Date.now()}`;

      // Build command
      const command = this.buildCommand(platform, options);

      // Create process record
      const scrapingProcess: ScrapingProcess = {
        id: processId,
        platform,
        command,
        status: 'idle',
        output: [],
        options
      };

      this.processes.set(processId, scrapingProcess);

      // Start the process
      await this.executeProcess(processId);

      return { success: true, processId };

    } catch (error) {
      console.error('Error triggering scraper:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Build command string based on platform and options
   */
  private buildCommand(platform: string, options: ScrapingOptions): string {
    // Map platform names to correct scraper files
    const scraperMap: { [key: string]: string } = {
      'flagstone': 'flagstone-scraper.js',
      'hl': 'hl-scraper.js', 
      'hargreaves-lansdown': 'hl-scraper.js',
      'ajbell': 'ajbell-scraper.js',
      'aj-bell': 'ajbell-scraper.js',
      'moneyfacts': 'moneyfacts-scraper.js'
    };
    
    const scraperFile = scraperMap[platform.toLowerCase()] || `${platform}-scraper.js`;
    let command = `node ${scraperFile}`;
    
    // Add verbose flag if needed for debugging
    if (options.verbose) {
      command += ' --verbose';
    }
    
    // Add headless flag for browser control
    if (!options.visible) {
      command += ' --headless';
    }
    
    // MoneyFacts specific options
    if (platform === 'moneyfacts' && options.accountTypes) {
      command += ` --types=${options.accountTypes.join(',')}`;
    }
    
    if (platform === 'moneyfacts' && options.excludeTypes) {
      command += ` --exclude=${options.excludeTypes.join(',')}`;
    }
    
    return command;
  }

  /**
   * Execute a scraping process
   */
  private async executeProcess(processId: string): Promise<void> {
    const scrapingProcess = this.processes.get(processId);
    if (!scrapingProcess) {
      throw new Error(`Process ${processId} not found`);
    }

    // Update process status
    scrapingProcess.status = 'running';
    scrapingProcess.startTime = new Date();
    this.processes.set(processId, scrapingProcess);

    // Get puppeteer-scraper directory path
    const scraperDir = path.join(__dirname, '../../../puppeteer-scraper');

    // Spawn child process
    const childProcess = spawn('bash', ['-c', scrapingProcess.command], {
      cwd: scraperDir,
      stdio: 'pipe',
      env: { ...process.env }
    });

    scrapingProcess.pid = childProcess.pid;
    this.activeProcesses.set(processId, childProcess);

    // Handle stdout
    childProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      this.handleProcessOutput(processId, output, 'stdout');
    });

    // Handle stderr
    childProcess.stderr?.on('data', (data) => {
      const output = data.toString();
      this.handleProcessOutput(processId, output, 'stderr');
    });

    // Handle process completion
    childProcess.on('close', (code) => {
      this.handleProcessCompletion(processId, code || 0);
    });

    // Handle process errors
    childProcess.on('error', (error) => {
      this.handleProcessError(processId, error);
    });

    // Emit process started event
    this.emit('process:started', { processId, platform: scrapingProcess.platform });
  }

  /**
   * Handle process output and parse for progress
   */
  private handleProcessOutput(processId: string, output: string, type: 'stdout' | 'stderr'): void {
    const scrapingProcess = this.processes.get(processId);
    if (!scrapingProcess) return;

    // Add to process output
    scrapingProcess.output.push(output);
    
    // Create filtered output for clean display
    if (!scrapingProcess.filteredOutput) {
      scrapingProcess.filteredOutput = [];
    }
    scrapingProcess.filteredOutput.push(this.filterOutputForUI(output, false));
    
    this.processes.set(processId, scrapingProcess);

    // Emit output event
    const outputData: OutputData = {
      processId,
      output,
      type,
      timestamp: new Date()
    };
    this.emit('process:output', outputData);

    // Parse for progress indicators
    this.parseProgressFromOutput(processId, output);
  }

  /**
   * Parse progress indicators from scraper output
   */
  private parseProgressFromOutput(processId: string, output: string): void {
    const lines = output.split('\n').filter(line => line.trim());

    for (const line of lines) {
      let progressData: ProgressData | null = null;

      // Parse emoji patterns that exist in the scrapers
      if (line.includes('✅')) {
        progressData = {
          processId,
          type: 'success',
          message: line.replace(/✅\s*/, '').trim(),
          timestamp: new Date()
        };
      } else if (line.includes('⚠️')) {
        progressData = {
          processId,
          type: 'warning',
          message: line.replace(/⚠️\s*/, '').trim(),
          timestamp: new Date()
        };
      } else if (line.includes('❌')) {
        progressData = {
          processId,
          type: 'error',
          message: line.replace(/❌\s*/, '').trim(),
          timestamp: new Date()
        };
      } else if (line.includes('⏳')) {
        progressData = {
          processId,
          type: 'info',
          message: line.replace(/⏳\s*/, '').trim(),
          timestamp: new Date()
        };
      }

      // Emit progress event if we found a pattern
      if (progressData) {
        this.emit('process:progress', progressData);
      }
    }
  }

  /**
   * Smart output filtering for clean display
   */
  private filterOutputForUI(output: string, showDebug: boolean): string {
    const lines = output.split('\n').filter(line => line.trim());
    
    if (showDebug) {
      return lines.join('\n'); // Show everything on failure
    }
    
    // Filter out debug and excessive detail for normal operation
    return lines
      .filter(line => {
        // Keep important messages
        if (line.includes('[Info]') || 
            line.includes('[Progress]') || 
            line.includes('[Warning]') || 
            line.includes('[Error]') ||
            line.includes(': Starting extraction') ||
            line.includes(': Completed successfully') ||
            line.includes('Found ') ||
            line.includes('Processed ')) {
          return true;
        }
        
        // Filter out debug and browser noise
        return !line.includes('[Debug]') &&
               !line.includes('Launching browser') &&
               !line.includes('Navigating to') &&
               !line.includes('Content detected') &&
               !line.includes('Browser closed');
      })
      .join('\n');
  }

  /**
   * Parse scraping results from output
   */
  private parseScrapingResults(output: string[], exitCode: number): ScrapingResults | undefined {
    const fullOutput = output.join('\n');
    const success = exitCode === 0;
    
    const results: Partial<ScrapingResults> = {
      success,
      files: {}
    };

    // Parse record counts from current format
    // "Found 41 rates"
    const ratesMatch = fullOutput.match(/Found (\d+) rates/);
    if (ratesMatch) {
      results.recordCount = parseInt(ratesMatch[1]);
    }

    // "Processed 41 products for database"
    const processedMatch = fullOutput.match(/Processed (\d+) products for database/);
    if (processedMatch) {
      results.processedCount = parseInt(processedMatch[1]);
    }

    // Parse completion messages
    const completionMatch = fullOutput.match(/([^:]+): Completed successfully/);
    if (completionMatch) {
      results.completionMessage = `${completionMatch[1]} completed successfully`;
    }

    // Parse error messages if failed
    if (!success) {
      const errorLines = fullOutput.split('\n')
        .filter(line => line.includes('[Error]') || line.includes('Failed'))
        .slice(0, 3); // First few errors
      results.errorMessage = errorLines.join('\n');
    }

    // Parse Platform Results section for file information
    const platformResultsMatch = fullOutput.match(/Platform Results:(.*?)(?:\n={40,}|\n\n|$)/s);
    if (platformResultsMatch) {
      const platformSection = platformResultsMatch[1];
      
      // Look for Files: lines
      const fileMatches = platformSection.match(/Files: ([^\n]+)/g);
      if (fileMatches) {
        fileMatches.forEach((match, index) => {
          const filePaths = match.replace('Files: ', '');
          const files = filePaths.split(', ').map(f => f.trim());
          
          files.forEach(file => {
            if (file.includes('raw')) {
              results.files!['raw'] = file;
            } else if (file.includes('normalized')) {
              results.files!['normalized'] = file;
            } else if (file.endsWith('.log')) {
              results.files!['log'] = file;
            } else if (file.endsWith('.json')) {
              results.files!['main'] = file;
            }
          });
        });
      }
    }

    return results as ScrapingResults;
  }

  /**
   * Handle process completion
   */
  private handleProcessCompletion(processId: string, exitCode: number): void {
    const scrapingProcess = this.processes.get(processId);
    if (!scrapingProcess) return;

    const success = exitCode === 0;
    scrapingProcess.status = success ? 'completed' : 'error';
    scrapingProcess.endTime = new Date();
    scrapingProcess.exitCode = exitCode;

    // On failure, show more detail
    if (!success && scrapingProcess.output) {
      scrapingProcess.filteredOutput = scrapingProcess.output.map(
        line => this.filterOutputForUI(line, true) // Show debug on failure
      );
    }

    // Parse results
    scrapingProcess.results = this.parseScrapingResults(scrapingProcess.output, exitCode);
    if (scrapingProcess.results) {
      scrapingProcess.results.processId = processId;
      scrapingProcess.results.platform = scrapingProcess.platform;
    }

    this.processes.set(processId, scrapingProcess);

    // Clean up active process
    this.activeProcesses.delete(processId);

    // Calculate duration
    const duration = scrapingProcess.endTime.getTime() - (scrapingProcess.startTime?.getTime() || 0);

    // Emit completion event
    const completionData: CompletionData = {
      processId,
      success,
      exitCode,
      duration,
      results: scrapingProcess.results,
      timestamp: new Date()
    };

    this.emit('process:completed', completionData);

    // Clean up JSON files after successful Electron scraper run
    if (success) {
      this.cleanupJsonFiles(scrapingProcess.platform).catch(error => {
        console.warn(`Failed to cleanup JSON files for ${scrapingProcess.platform}:`, error.message);
      });
    }
  }

  /**
   * Clean up JSON files after successful scraper completion
   */
  private async cleanupJsonFiles(platform: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      // Define platform data directories
      const dataDirs = [
        `${platform}-data`,
        `${platform}_data`,
        'test-output' // In case any test files were created
      ];

      // Get current working directory (should be project root)
      const projectRoot = process.cwd();

      for (const dataDir of dataDirs) {
        const dirPath = path.join(projectRoot, 'puppeteer-scraper', dataDir);

        try {
          const files = await fs.readdir(dirPath);

          // Delete JSON files from today's scraper run
          const today = new Date().toISOString().split('T')[0];
          const filesToDelete = files.filter(file =>
            file.endsWith('.json') && file.includes(today)
          );

          for (const file of filesToDelete) {
            const filePath = path.join(dirPath, file);
            await fs.unlink(filePath);
            console.log(`Cleaned up JSON file: ${file}`);
          }

          if (filesToDelete.length > 0) {
            console.log(`Cleaned up ${filesToDelete.length} JSON files for ${platform}`);
          }

        } catch (dirError: any) {
          // Directory doesn't exist or can't be read - that's fine
          if (dirError.code !== 'ENOENT') {
            console.warn(`Warning: Could not access directory ${dirPath}:`, dirError.message);
          }
        }
      }
    } catch (error: any) {
      console.error(`Error during JSON cleanup for ${platform}:`, error.message);
      throw error;
    }
  }

  /**
   * Handle process errors
   */
  private handleProcessError(processId: string, error: Error): void {
    const scrapingProcess = this.processes.get(processId);
    if (!scrapingProcess) return;

    scrapingProcess.status = 'error';
    scrapingProcess.endTime = new Date();
    this.processes.set(processId, scrapingProcess);

    this.activeProcesses.delete(processId);

    // Emit error event
    this.emit('process:error', { processId, error: error.message });
  }

  /**
   * Get process status
   */
  getProcessStatus(processId: string): ScrapingProcess | undefined {
    return this.processes.get(processId);
  }

  /**
   * Get all processes
   */
  getAllProcesses(): ScrapingProcess[] {
    return Array.from(this.processes.values());
  }

  /**
   * Get active processes
   */
  getActiveProcesses(): ScrapingProcess[] {
    return Array.from(this.processes.values()).filter(p => p.status === 'running');
  }

  /**
   * Get processes for a specific platform
   */
  private getProcessesForPlatform(platform: string): ScrapingProcess[] {
    return Array.from(this.processes.values()).filter(p => p.platform === platform);
  }

  /**
   * Kill a running process
   */
  async killProcess(processId: string): Promise<boolean> {
    const childProcess = this.activeProcesses.get(processId);
    const scrapingProcess = this.processes.get(processId);

    if (!childProcess || !scrapingProcess) {
      return false;
    }

    try {
      // Kill the process
      childProcess.kill('SIGTERM');

      // Wait a bit for graceful shutdown
      setTimeout(() => {
        if (!childProcess.killed) {
          childProcess.kill('SIGKILL');
        }
      }, 5000);

      // Update process status
      scrapingProcess.status = 'error';
      scrapingProcess.endTime = new Date();
      scrapingProcess.exitCode = -1;
      this.processes.set(processId, scrapingProcess);

      // Clean up
      this.activeProcesses.delete(processId);

      return true;
    } catch (error) {
      console.error('Error killing process:', error);
      return false;
    }
  }

  /**
   * Clean up old completed processes
   */
  cleanup(): void {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    for (const [processId, scrapingProcess] of this.processes.entries()) {
      if (scrapingProcess.status !== 'running' && scrapingProcess.endTime && scrapingProcess.endTime < oneDayAgo) {
        this.processes.delete(processId);
      }
    }
  }
}