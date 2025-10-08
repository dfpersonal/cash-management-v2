import { app, BrowserWindow, ipcMain, Menu, session, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';
import { DatabaseService } from '@cash-mgmt/shared';
import { OrchestrationService } from '@cash-mgmt/pipeline';
import { ScraperProcessManager } from './services/ScraperProcessManager';
import { BackupService } from './services/BackupService';
import { DocumentCleanupService } from './services/DocumentCleanupService';
import { createApplicationMenu } from './menu';
import { registerOptimizationHandlers } from './ipc-handlers/optimization-handlers';
import { registerScraperConfigHandlers } from './ipc-handlers/scraper-config-handlers';
import { registerTransactionHandlers } from './ipc-handlers/transaction-handlers';
import { registerDocumentHandlers } from './ipc-handlers/document-handlers';
import { registerOrchestratorHandlers } from './ipc-handlers/orchestrator-handlers';

// Enable remote debugging for development and when --dev flag is used
const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

if (isDev) {
  app.commandLine.appendSwitch('remote-debugging-port', '9223');
  console.log('Remote debugging enabled on port 9223');
}

class CashManagementApp {
  private mainWindow: BrowserWindow | null = null;
  private databaseService: DatabaseService | null = null;
  private orchestrationService: OrchestrationService | null = null;
  private scraperManager: ScraperProcessManager | null = null;
  private documentCleanupService: DocumentCleanupService | null = null;

  constructor() {
    this.initializeApp();
  }

  private initializeApp(): void {
    // Handle app ready event
    app.whenReady().then(async () => {
      // Install React DevTools in development
      if (isDev) {
        try {
          const { default: installExtension, REACT_DEVELOPER_TOOLS } = await import('electron-devtools-installer');
          await installExtension(REACT_DEVELOPER_TOOLS);
          console.log('React DevTools installed');
        } catch (error) {
          console.log('Failed to install React DevTools:', error);
        }
      }

      this.createMainWindow();
      await this.initializeDatabase();
      await this.initializeOrchestrationService();
      this.initializeScraperManager();
      this.initializeDocumentCleanup();
      this.setupIpcHandlers();
      this.setupMenu();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          this.createMainWindow();
        }
      });
    });

    // Handle app window close events
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    // Handle app before quit
    app.on('before-quit', () => {
      this.cleanup();
    });
  }

  private createMainWindow(): void {
    this.mainWindow = new BrowserWindow({
      width: 1750,
      height: 990,
      minWidth: 1000,
      minHeight: 700,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        webSecurity: true,
      },
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 20, y: 14 }, // Lower positioning for 40px bar alignment
      vibrancy: 'window',
      visualEffectState: 'active',
      acceptFirstMouse: true,
      show: false, // Don't show until ready
      icon: this.getAppIcon(),
    });

    // Load the app
    if (process.env.NODE_ENV === 'development') {
      this.mainWindow.loadFile(path.join(__dirname, '../index.html'));
      this.mainWindow.webContents.openDevTools();
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../index.html'));
    }

    // Show window when ready to prevent visual flash
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
    });

    // Handle window closed
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

  private async initializeDatabase(): Promise<void> {
    try {
      // Use DATABASE_PATH environment variable for testing, fallback to default
      const defaultPath = path.join(__dirname, '../../data/database/cash_savings.db');
      const databasePath = process.env.DATABASE_PATH || defaultPath;

      // Create automatic backup on startup (only for production database)
      if (!process.env.DATABASE_PATH || process.env.DATABASE_PATH === defaultPath) {
        console.log('\n📦 Creating database backup on startup...');
        const backupService = new BackupService(databasePath);
        const backupPath = await backupService.createBackup();

        if (backupPath) {
          console.log(`   Backup saved to: ${path.basename(backupPath)}`);

          // Show notification to user
          if (this.mainWindow) {
            this.mainWindow.webContents.send('notification', {
              type: 'success',
              message: `Database backup created: ${path.basename(backupPath)}`
            });
          }
        } else {
          console.warn('   ⚠️ Backup creation failed - continuing with app startup');
        }
      } else {
        console.log('   Skipping backup for test database');
      }

      this.databaseService = new DatabaseService(databasePath);

      console.log('\n✅ Database service initialized with path:', databasePath);
    } catch (error) {
      console.error('Failed to initialize database:', error);
    }
  }

  private async initializeOrchestrationService(): Promise<void> {
    try {
      if (!this.databaseService) {
        throw new Error('Database service must be initialized before orchestration service');
      }

      // Use the same database path as other services
      const defaultPath = path.join(__dirname, '../../data/database/cash_savings.db');
      const databasePath = process.env.DATABASE_PATH || defaultPath;

      // OrchestrationService creates its own better-sqlite3 connection
      this.orchestrationService = new OrchestrationService(new Database(databasePath), databasePath);
      await this.orchestrationService.initialize();

      console.log('\n✅ Orchestration service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize orchestration service:', error);
      throw error;
    }
  }

  private initializeScraperManager(): void {
    try {
      // Initialize scraper process manager with database path
      const defaultPath = path.join(__dirname, '../../data/database/cash_savings.db');
      const databasePath = process.env.DATABASE_PATH || defaultPath;
      this.scraperManager = new ScraperProcessManager(databasePath);
      
      // Set up event forwarding from ScraperProcessManager to renderer
      this.scraperManager.on('process:output', (data) => {
        this.mainWindow?.webContents.send('scraper:output', data);
      });

      this.scraperManager.on('process:progress', (data) => {
        this.mainWindow?.webContents.send('scraper:progress', data);
      });

      this.scraperManager.on('process:completed', (data) => {
        this.mainWindow?.webContents.send('scraper:completed', data);
      });

      this.scraperManager.on('process:started', (data) => {
        this.mainWindow?.webContents.send('scraper:started', data);
      });

      this.scraperManager.on('process:error', (data) => {
        this.mainWindow?.webContents.send('scraper:error', data);
      });
      
      console.log('Scraper process manager initialized');
    } catch (error) {
      console.error('Failed to initialize scraper manager:', error);
    }
  }

  private initializeDocumentCleanup(): void {
    try {
      // Initialize document cleanup service with database connection
      const defaultPath = path.join(__dirname, '../../data/database/cash_savings.db');
      const databasePath = process.env.DATABASE_PATH || defaultPath;

      const sqlite3 = require('sqlite3').verbose();
      const db = new sqlite3.Database(databasePath);

      this.documentCleanupService = new DocumentCleanupService(db);
      this.documentCleanupService.start();

      console.log('📄 Document cleanup service initialized and started');
    } catch (error) {
      console.error('Failed to initialize document cleanup service:', error);
    }
  }

  private setupIpcHandlers(): void {
    // Register optimization handlers (FSCS and Rate Optimizer)
    registerOptimizationHandlers();
    
    // Register scraper configuration handlers
    if (this.scraperManager) {
      registerScraperConfigHandlers(this.scraperManager);
    }
    
    // Register transaction handlers with database
    if (this.databaseService) {
      const sqlite3 = require('sqlite3').verbose();
      const defaultPath = path.join(__dirname, '../../data/database/cash_savings.db');
      const dbPath = process.env.DATABASE_PATH || defaultPath;
      console.log('🗄️ Main: Transaction handlers using database path:', dbPath);
      console.log('🔧 Main: DATABASE_PATH environment variable:', process.env.DATABASE_PATH);
      const db = new sqlite3.Database(dbPath);
      registerTransactionHandlers(db);
      registerDocumentHandlers(db);
    }

    // Register orchestrator handlers for pipeline management
    if (this.orchestrationService && this.mainWindow) {
      registerOrchestratorHandlers(this.orchestrationService, this.mainWindow);
    }

    // Portfolio data handlers
    ipcMain.handle('get-portfolio-summary', async () => {
      try {
        return await this.databaseService?.getPortfolioSummary();
      } catch (error) {
        console.error('Error getting portfolio summary:', error);
        throw error;
      }
    });

    // Income history handlers
    ipcMain.handle('get-income-history', async (_, period?: number, unit?: 'days' | 'weeks' | 'months') => {
      try {
        return await this.databaseService?.getIncomeHistory(period, unit);
      } catch (error) {
        console.error('Error getting income history:', error);
        throw error;
      }
    });

    ipcMain.handle('capture-income-snapshot', async () => {
      try {
        await this.databaseService?.captureIncomeSnapshot();
        return { success: true };
      } catch (error) {
        console.error('Error capturing income snapshot:', error);
        throw error;
      }
    });

    ipcMain.handle('check-and-capture-snapshot', async () => {
      try {
        return await this.databaseService?.checkAndCaptureSnapshot();
      } catch (error) {
        console.error('Error checking and capturing snapshot:', error);
        throw error;
      }
    });

    ipcMain.handle('get-income-comparison', async () => {
      try {
        return await this.databaseService?.getIncomeComparison();
      } catch (error) {
        console.error('Error getting income comparison:', error);
        throw error;
      }
    });

    ipcMain.handle('get-portfolio-holdings', async () => {
      try {
        return await this.databaseService?.getPortfolioHoldings();
      } catch (error) {
        console.error('Error getting portfolio holdings:', error);
        throw error;
      }
    });

    ipcMain.handle('get-allocation-analysis', async () => {
      try {
        return await this.databaseService?.getAllocationAnalysis();
      } catch (error) {
        console.error('Error getting allocation analysis:', error);
        throw error;
      }
    });

    ipcMain.handle('get-projected-allocation-analysis', async () => {
      try {
        return await this.databaseService?.getProjectedAllocationAnalysis();
      } catch (error) {
        console.error('Error getting projected allocation analysis:', error);
        throw error;
      }
    });

    ipcMain.handle('has-pending-deposits', async () => {
      try {
        return await this.databaseService?.hasPendingDeposits();
      } catch (error) {
        console.error('Error checking pending deposits:', error);
        throw error;
      }
    });

    ipcMain.handle('get-pending-moves-summary', async () => {
      try {
        return await this.databaseService?.getPendingMovesSummary();
      } catch (error) {
        console.error('Error getting pending moves summary:', error);
        throw error;
      }
    });

    // Configuration handlers
    ipcMain.handle('get-configuration', async () => {
      try {
        return await this.databaseService?.getConfiguration();
      } catch (error) {
        console.error('Error getting configuration:', error);
        throw error;
      }
    });

    ipcMain.handle('get-config-value', async (_, key: string) => {
      try {
        // Use sqlite3 directly to query unified_config table
        const sqlite3 = require('sqlite3').verbose();
        const dbPath = process.env.DATABASE_PATH || require('path').join(process.cwd(), 'data', 'database', 'cash_savings.db');
        const db = new sqlite3.Database(dbPath);
        
        return new Promise((resolve, reject) => {
          db.get(
            'SELECT config_value, config_type FROM unified_config WHERE config_key = ? AND is_active = 1',
            [key],
            (err: any, row: any) => {
              if (err) {
                db.close();
                reject(err);
              } else if (!row) {
                db.close();
                resolve({ value: null, error: `Config key '${key}' not found` });
              } else {
                // Parse value based on type
                let value = row.config_value;
                if (row.config_type === 'number') {
                  value = parseFloat(value);
                } else if (row.config_type === 'boolean') {
                  value = value.toLowerCase() === 'true';
                } else if (row.config_type === 'json') {
                  try {
                    value = JSON.parse(value);
                  } catch {
                    // Keep as string if JSON parse fails
                  }
                }
                db.close();
                resolve({ value, type: row.config_type });
              }
            }
          );
        });
      } catch (error) {
        console.error('Error getting config value:', error);
        throw error;
      }
    });

    ipcMain.handle('update-configuration', async (_, config: any) => {
      try {
        return await this.databaseService?.updateConfiguration(config);
      } catch (error) {
        console.error('Error updating configuration:', error);
        throw error;
      }
    });

    // Logging handler
    ipcMain.handle('log-error', async (_, errorData: any) => {
      console.error('[Renderer Error]', errorData);
      // Could also write to audit log if needed
      return { success: true };
    });

    // CRUD handlers for Portfolio Management
    ipcMain.handle('get-all-deposits', async () => {
      try {
        return await this.databaseService?.getAllDeposits();
      } catch (error) {
        console.error('Error getting all deposits:', error);
        throw error;
      }
    });

    ipcMain.handle('get-all-pending-deposits', async () => {
      try {
        return await this.databaseService?.getAllPendingDeposits();
      } catch (error) {
        console.error('Error getting all pending deposits:', error);
        throw error;
      }
    });

    ipcMain.handle('find-accounts-by-frn', async (_, frn: string) => {
      try {
        return await this.databaseService?.findAccountsByFRN(frn);
      } catch (error) {
        console.error('Error finding accounts by FRN:', error);
        throw error;
      }
    });

    ipcMain.handle('find-potential-duplicates', async (_, accountDetails: any) => {
      try {
        return await this.databaseService?.findPotentialDuplicates(accountDetails);
      } catch (error) {
        console.error('Error finding potential duplicates:', error);
        throw error;
      }
    });

    ipcMain.handle('get-valid-platforms', async () => {
      try {
        return await this.databaseService?.getValidPlatforms();
      } catch (error) {
        console.error('Error getting valid platforms:', error);
        throw error;
      }
    });

    ipcMain.handle('validate-frn', async (_, frn: string) => {
      try {
        return await this.databaseService?.validateFRN(frn);
      } catch (error) {
        console.error('Error validating FRN:', error);
        throw error;
      }
    });

    ipcMain.handle('search-frn-suggestions', async (_, partialFRN: string) => {
      try {
        return await this.databaseService?.searchFRNSuggestions(partialFRN);
      } catch (error) {
        console.error('Error searching FRN suggestions:', error);
        throw error;
      }
    });

    ipcMain.handle('search-my-deposits', async (_, searchTerm: string) => {
      try {
        return await this.databaseService?.searchMyDeposits(searchTerm);
      } catch (error) {
        console.error('Error searching my deposits:', error);
        throw error;
      }
    });

    ipcMain.handle('get-all-accounts', async () => {
      try {
        return await this.databaseService?.getAllAccounts();
      } catch (error) {
        console.error('Error getting all accounts:', error);
        throw error;
      }
    });

    ipcMain.handle('get-liquidity-tiers', async () => {
      try {
        return await this.databaseService?.getLiquidityTiers();
      } catch (error) {
        console.error('Error getting liquidity tiers:', error);
        throw error;
      }
    });

    ipcMain.handle('get-platforms-for-dropdown', async () => {
      try {
        return await this.databaseService?.getPlatformsForDropdown();
      } catch (error) {
        console.error('Error getting platforms for dropdown:', error);
        throw error;
      }
    });

    ipcMain.handle('create-pending-deposit', async (_, pendingDeposit: any) => {
      // Add debug logging to trace monetary value
      console.log('[DEBUG: IPC Main] Received from renderer:', {
        balance: pendingDeposit.balance,
        type: typeof pendingDeposit.balance
      });
      try {
        const id = await this.databaseService?.createPendingDeposit(pendingDeposit);
        return { success: true, id };
      } catch (error) {
        console.error('Error creating pending deposit:', error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        };
      }
    });

    ipcMain.handle('update-pending-deposit', async (_, pendingDeposit: any) => {
      // Add debug logging to trace monetary value
      console.log('[DEBUG: IPC Main Update] Received from renderer:', {
        balance: pendingDeposit.balance,
        type: typeof pendingDeposit.balance
      });
      try {
        const success = await this.databaseService?.updatePendingDeposit(pendingDeposit);
        return { success };
      } catch (error) {
        console.error('Error updating pending deposit:', error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        };
      }
    });

    ipcMain.handle('delete-pending-deposit', async (_, id: number) => {
      try {
        const success = await this.databaseService?.deletePendingDeposit(id);
        return { success };
      } catch (error) {
        console.error('Error deleting pending deposit:', error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        };
      }
    });

    ipcMain.handle('execute-pending-move', async (_, id: number) => {
      try {
        return await this.databaseService?.executePendingMove(id);
      } catch (error) {
        console.error('Error executing pending move:', error);
        throw error;
      }
    });

    ipcMain.handle('create-deposit', async (_, deposit: any) => {
      try {
        return await this.databaseService?.createDeposit(deposit);
      } catch (error) {
        console.error('Error creating deposit:', error);
        throw error;
      }
    });

    ipcMain.handle('update-deposit', async (_, deposit: any) => {
      try {
        return await this.databaseService?.updateDeposit(deposit);
      } catch (error) {
        console.error('Error updating deposit:', error);
        throw error;
      }
    });

    ipcMain.handle('delete-deposit', async (_, id: number) => {
      try {
        return await this.databaseService?.deleteDeposit(id);
      } catch (error) {
        console.error('Error deleting deposit:', error);
        throw error;
      }
    });

    // Report generation handler
    ipcMain.handle('generate-report', async (_, options: any) => {
      try {
        // This would integrate with the existing Python report generator
        console.log('Report generation requested with options:', options);
        // For now, return a placeholder
        return { success: true, message: 'Report generation integration pending' };
      } catch (error) {
        console.error('Error generating report:', error);
        throw error;
      }
    });

    // Database query handler - removed as DatabaseService doesn't have a generic query method

    // Application handlers
    ipcMain.handle('get-app-version', () => {
      return app.getVersion();
    });

    ipcMain.handle('quit-app', () => {
      app.quit();
    });

    // Calendar & Reminder handlers
    ipcMain.handle('get-upcoming-actions', async () => {
      try {
        return await this.databaseService?.getUpcomingActions();
      } catch (error) {
        console.error('Error getting upcoming actions:', error);
        throw error;
      }
    });

    ipcMain.handle('get-calendar-summary', async () => {
      try {
        return await this.databaseService?.getCalendarSummary();
      } catch (error) {
        console.error('Error getting calendar summary:', error);
        throw error;
      }
    });

    ipcMain.handle('create-rate-change', async (_, rateChange: any) => {
      try {
        return await this.databaseService?.createRateChange(rateChange);
      } catch (error) {
        console.error('Error creating rate change:', error);
        throw error;
      }
    });

    ipcMain.handle('create-notice-event', async (_, noticeEvent: any) => {
      try {
        return await this.databaseService?.createNoticeEvent(noticeEvent);
      } catch (error) {
        console.error('Error creating notice event:', error);
        throw error;
      }
    });

    ipcMain.handle('create-reminder', async (_, reminder: any) => {
      try {
        return await this.databaseService?.createReminder(reminder);
      } catch (error) {
        console.error('Error creating reminder:', error);
        throw error;
      }
    });

    ipcMain.handle('get-notice-account-status', async () => {
      try {
        return await this.databaseService?.getNoticeAccountStatus();
      } catch (error) {
        console.error('Error getting notice account status:', error);
        throw error;
      }
    });

    ipcMain.handle('update-reminder-status', async (_, reminderId: number, updates: any) => {
      try {
        return await this.databaseService?.updateReminderStatus(reminderId, updates);
      } catch (error) {
        console.error('Error updating reminder status:', error);
        throw error;
      }
    });

    ipcMain.handle('mark-rate-change-reminder-completed', async (_, rateChangeId: number) => {
      try {
        return await this.databaseService?.markRateChangeReminderCompleted(rateChangeId);
      } catch (error) {
        console.error('Error marking rate change reminder as completed:', error);
        throw error;
      }
    });

    // New calendar event management handlers
    ipcMain.handle('dismiss-calendar-event', async (_, eventType: string, eventId: number) => {
      try {
        return await this.databaseService?.dismissCalendarEvent(eventType, eventId);
      } catch (error) {
        console.error('Error dismissing calendar event:', error);
        throw error;
      }
    });

    ipcMain.handle('snooze-calendar-event', async (_, eventType: string, eventId: number, snoozedUntil: string) => {
      try {
        return await this.databaseService?.snoozeCalendarEvent(eventType, eventId, snoozedUntil);
      } catch (error) {
        console.error('Error snoozing calendar event:', error);
        throw error;
      }
    });

    ipcMain.handle('complete-calendar-event', async (_, eventType: string, eventId: number) => {
      try {
        return await this.databaseService?.completeCalendarEvent(eventType, eventId);
      } catch (error) {
        console.error('Error completing calendar event:', error);
        throw error;
      }
    });

    ipcMain.handle('get-snooze-config', async () => {
      try {
        return await this.databaseService?.getSnoozeConfig();
      } catch (error) {
        console.error('Error getting snooze config:', error);
        throw error;
      }
    });

    // Report actions removed - will be replaced by action_items table




    // Dashboard notification handlers
    ipcMain.handle('get-dashboard-notifications', async () => {
      try {
        return await this.databaseService?.getDashboardNotifications();
      } catch (error) {
        console.error('Error getting dashboard notifications:', error);
        throw error;
      }
    });

    ipcMain.handle('get-dashboard-action-summary', async () => {
      try {
        return await this.databaseService?.getDashboardActionSummary();
      } catch (error) {
        console.error('Error getting dashboard action summary:', error);
        throw error;
      }
    });

    // Audit trail handlers
    ipcMain.handle('get-record-audit-trail', async (_, tableName: string, recordId: number) => {
      try {
        return await this.databaseService?.getRecordAuditTrail(tableName, recordId) || [];
      } catch (error) {
        console.error('Error getting record audit trail:', error);
        throw error;
      }
    });

    ipcMain.handle('get-all-audit-entries', async (_, filters?: any) => {
      try {
        return await this.databaseService?.getAllAuditEntries(filters) || [];
      } catch (error) {
        console.error('Error getting all audit entries:', error);
        throw error;
      }
    });

    ipcMain.handle('get-field-changes', async (_, fieldName: string, limit?: number) => {
      try {
        return await this.databaseService?.getFieldChanges(fieldName, limit) || [];
      } catch (error) {
        console.error('Error getting field changes:', error);
        throw error;
      }
    });

    ipcMain.handle('get-field-change-stats', async (_, daysBack?: number) => {
      try {
        return await this.databaseService?.getFieldChangeStats(daysBack) || [];
      } catch (error) {
        console.error('Error getting field change stats:', error);
        throw error;
      }
    });

    ipcMain.handle('get-balance-change-summary', async (_, daysBack?: number) => {
      try {
        return await this.databaseService?.getBalanceChangeSummary(daysBack) || { total_changes: 0, total_increases: 0, total_decreases: 0, avg_change: 0 };
      } catch (error) {
        console.error('Error getting balance change summary:', error);
        throw error;
      }
    });

    // Balance Update IPC Handlers
    ipcMain.handle('get-deposits-with-balance-status', async (_, filters?: any) => {
      try {
        return await this.databaseService?.getDepositsWithBalanceStatus(filters) || [];
      } catch (error) {
        console.error('Error getting deposits with balance status:', error);
        throw error;
      }
    });

    ipcMain.handle('create-balance-update-session', async (_, sessionType?: 'manual' | 'scheduled') => {
      try {
        return await this.databaseService?.createBalanceUpdateSession(sessionType);
      } catch (error) {
        console.error('Error creating balance update session:', error);
        throw error;
      }
    });

    ipcMain.handle('update-deposit-balance-in-session', async (_, sessionId: number, depositId: number, newBalance: number, resetSchedule?: boolean, newAer?: number) => {
      try {
        return await this.databaseService?.updateDepositBalanceInSession(sessionId, depositId, newBalance, resetSchedule, newAer);
      } catch (error) {
        console.error('Error updating deposit balance in session:', error);
        throw error;
      }
    });

    ipcMain.handle('complete-balance-update-session', async (_, sessionId: number) => {
      try {
        return await this.databaseService?.completeBalanceUpdateSession(sessionId);
      } catch (error) {
        console.error('Error completing balance update session:', error);
        throw error;
      }
    });

    ipcMain.handle('get-balance-update-session-progress', async (_, sessionId: number) => {
      try {
        return await this.databaseService?.getBalanceUpdateSessionProgress(sessionId);
      } catch (error) {
        console.error('Error getting balance update session progress:', error);
        throw error;
      }
    });

    ipcMain.handle('get-overdue-deposits-count', async () => {
      try {
        return await this.databaseService?.getOverdueDepositsCount() || 0;
      } catch (error) {
        console.error('Error getting overdue deposits count:', error);
        throw error;
      }
    });

    ipcMain.handle('initialize-balance-check-schedules', async () => {
      try {
        return await this.databaseService?.initializeBalanceCheckSchedules();
      } catch (error) {
        console.error('Error initializing balance check schedules:', error);
        throw error;
      }
    });

    ipcMain.handle('generate-balance-check-reminders', async () => {
      try {
        return await this.databaseService?.generateBalanceCheckReminders() || { created: 0, skipped: 0, errors: ['Database service not available'] };
      } catch (error) {
        console.error('Error generating balance check reminders:', error);
        throw error;
      }
    });

    ipcMain.handle('create-balance-check-reminder-for-deposit', async (_, depositId: number, nextCheckDate: string) => {
      try {
        return await this.databaseService?.createBalanceCheckReminderForDeposit(depositId, nextCheckDate);
      } catch (error) {
        console.error('Error creating balance check reminder for deposit:', error);
        throw error;
      }
    });

    // FRN Management handlers
    ipcMain.handle('frn:get-statistics', async () => {
      try {
        return await this.databaseService?.getFRNStatistics();
      } catch (error) {
        console.error('Error getting FRN statistics:', error);
        throw error;
      }
    });

    ipcMain.handle('frn:get-recent-activity', async (_, limit?: number) => {
      try {
        return await this.databaseService?.getFRNRecentActivity(limit);
      } catch (error) {
        console.error('Error getting FRN recent activity:', error);
        throw error;
      }
    });

    ipcMain.handle('frn:get-manual-overrides', async (_, filters?: any) => {
      try {
        return await this.databaseService?.getFRNManualOverrides(filters);
      } catch (error) {
        console.error('Error getting FRN manual overrides:', error);
        throw error;
      }
    });

    ipcMain.handle('frn:create-override', async (_, override: any) => {
      try {
        return await this.databaseService?.createFRNOverride(override);
      } catch (error) {
        console.error('Error creating FRN override:', error);
        throw error;
      }
    });

    ipcMain.handle('frn:update-override', async (_, id: number, updates: any) => {
      try {
        return await this.databaseService?.updateFRNOverride(id, updates);
      } catch (error) {
        console.error('Error updating FRN override:', error);
        throw error;
      }
    });

    ipcMain.handle('frn:delete-override', async (_, id: number) => {
      try {
        return await this.databaseService?.deleteFRNOverride(id);
      } catch (error) {
        console.error('Error deleting FRN override:', error);
        throw error;
      }
    });

    ipcMain.handle('frn:get-research-queue', async (_, filters?: any) => {
      try {
        return await this.databaseService?.getFRNResearchQueue(filters);
      } catch (error) {
        console.error('Error getting FRN research queue:', error);
        throw error;
      }
    });

    ipcMain.handle('frn:complete-research', async (_, rowId: number, frn: string, firmName: string, notes?: string) => {
      try {
        return await this.databaseService?.completeFRNResearch(rowId, frn, firmName, notes);
      } catch (error) {
        console.error('Error completing FRN research:', error);
        throw error;
      }
    });

    ipcMain.handle('frn:dismiss-research', async (_, rowId: number) => {
      try {
        return await this.databaseService?.dismissFRNResearch(rowId);
      } catch (error) {
        console.error('Error dismissing FRN research:', error);
        throw error;
      }
    });

    ipcMain.handle('frn:get-lookup-helper', async (_, filters?: any) => {
      try {
        return await this.databaseService?.getFRNLookupHelper(filters);
      } catch (error) {
        console.error('Error getting FRN lookup helper:', error);
        throw error;
      }
    });

    ipcMain.handle('frn:get-boe-institutions', async (_, filters?: any) => {
      try {
        return await this.databaseService?.getBOEInstitutions(filters);
      } catch (error) {
        console.error('Error getting BOE institutions:', error);
        throw error;
      }
    });

    ipcMain.handle('frn:get-bank-stats', async (_, bankName: string) => {
      try {
        return await this.databaseService?.getBankStatsByName(bankName);
      } catch (error) {
        console.error('Error getting bank stats:', error);
        throw error;
      }
    });

    // Scraper management handlers
    ipcMain.handle('scraper:trigger', async (_, platform: string, options?: any) => {
      try {
        return await this.scraperManager?.triggerScraper(platform, options);
      } catch (error) {
        console.error('Error triggering scraper:', error);
        throw error;
      }
    });

    ipcMain.handle('scraper:status', async (_, processId?: string) => {
      try {
        if (processId) {
          return this.scraperManager?.getProcessStatus(processId);
        } else {
          return this.scraperManager?.getAllProcesses();
        }
      } catch (error) {
        console.error('Error getting scraper status:', error);
        throw error;
      }
    });

    ipcMain.handle('scraper:active', async () => {
      try {
        return this.scraperManager?.getActiveProcesses();
      } catch (error) {
        console.error('Error getting active scrapers:', error);
        throw error;
      }
    });

    ipcMain.handle('scraper:kill', async (_, processId: string) => {
      try {
        return await this.scraperManager?.killProcess(processId);
      } catch (error) {
        console.error('Error killing scraper process:', error);
        throw error;
      }
    });

    ipcMain.handle('scraper:platforms', async () => {
      try {
        return this.scraperManager?.getPlatforms();
      } catch (error) {
        console.error('Error getting scraper platforms:', error);
        throw error;
      }
    });

    ipcMain.handle('scraper:cleanup', async () => {
      try {
        this.scraperManager?.cleanup();
        return { success: true };
      } catch (error) {
        console.error('Error cleaning up scraper processes:', error);
        throw error;
      }
    });

    // Optimization data handlers
    ipcMain.handle('get-action-items', async (_, filter?: { module?: string; status?: string }) => {
      try {
        if (!this.databaseService) {
          console.error('Database service not available');
          return [];
        }
        
        return new Promise<any[]>((resolve, reject) => {
          const whereClause = [];
          const params: any[] = [];
          
          if (filter?.module) {
            whereClause.push('module = ?');
            params.push(filter.module);
          }
          if (filter?.status) {
            whereClause.push('status = ?');
            params.push(filter.status);
          }
          
          const query = `SELECT * FROM action_items${whereClause.length ? ' WHERE ' + whereClause.join(' AND ') : ''} ORDER BY created_at DESC`;
          
          // Access the internal database of DatabaseService
          (this.databaseService as any).db.all(query, params, (err: any, rows: any[]) => {
            if (err) {
              console.error('Error getting action items:', err);
              resolve([]);
            } else {
              // Parse source_data JSON field for each row
              const parsedRows = (rows || []).map(row => {
                if (row.source_data && typeof row.source_data === 'string') {
                  try {
                    return { ...row, source_data: JSON.parse(row.source_data) };
                  } catch (e) {
                    console.error('Error parsing source_data for action item:', row.action_id, e);
                    return row;
                  }
                }
                return row;
              });
              resolve(parsedRows);
            }
          });
        });
      } catch (error) {
        console.error('Error getting action items:', error);
        return [];
      }
    });

    ipcMain.handle('get-calendar-events', async (_, filter?: { module?: string; category?: string }) => {
      try {
        if (!this.databaseService) {
          console.error('Database service not available');
          return [];
        }
        
        return new Promise<any[]>((resolve, reject) => {
          const whereClause = [];
          const params: any[] = [];
          
          if (filter?.module) {
            whereClause.push('module = ?');
            params.push(filter.module);
          }
          if (filter?.category) {
            whereClause.push('category = ?');
            params.push(filter.category);
          }
          
          const query = `SELECT * FROM calendar_events${whereClause.length ? ' WHERE ' + whereClause.join(' AND ') : ''} ORDER BY event_date DESC`;
          
          // Access the internal database of DatabaseService
          (this.databaseService as any).db.all(query, params, (err: any, rows: any[]) => {
            if (err) {
              console.error('Error getting calendar events:', err);
              resolve([]);
            } else {
              resolve(rows || []);
            }
          });
        });
      } catch (error) {
        console.error('Error getting calendar events:', error);
        return [];
      }
    });

    ipcMain.handle('update-action-item-status', async (_, actionId: string, status: string) => {
      try {
        if (!this.databaseService) {
          console.error('Database service not available');
          throw new Error('Database service not available');
        }
        
        return new Promise<{ success: boolean }>((resolve, reject) => {
          const query = `UPDATE action_items SET status = ?, updated_at = datetime('now') WHERE action_id = ?`;
          
          // Access the internal database of DatabaseService
          (this.databaseService as any).db.run(query, [status, actionId], function(this: any, err: any) {
            if (err) {
              console.error('Error updating action item status:', err);
              reject(err);
            } else {
              resolve({ success: this.changes > 0 });
            }
          });
        });
      } catch (error) {
        console.error('Error updating action item status:', error);
        throw error;
      }
    });

    // File system handlers
    ipcMain.handle('open-path', async (_, filePath: string) => {
      try {
        await shell.openPath(filePath);
        return { success: true };
      } catch (error) {
        console.error('Error opening file path:', error);
        throw error;
      }
    });
  }


  private setupMenu(): void {
    const menu = createApplicationMenu();
    Menu.setApplicationMenu(menu);
  }

  private getAppIcon(): string | undefined {
    // Return path to app icon based on platform
    if (process.platform === 'darwin') {
      return path.join(__dirname, '../../assets/icon.icns');
    } else if (process.platform === 'win32') {
      return path.join(__dirname, '../../assets/icon.ico');
    } else {
      return path.join(__dirname, '../../assets/icon.png');
    }
  }

  private cleanup(): void {
    // Stop document cleanup service
    this.documentCleanupService?.stop();

    // Reset orchestration service state
    this.orchestrationService?.reset();

    // Close database connections
    this.databaseService?.close();

    console.log('Application cleanup completed');
  }
}

// Create and start the application
new CashManagementApp();