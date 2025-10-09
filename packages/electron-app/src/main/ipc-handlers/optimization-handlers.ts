/**
 * IPC handlers for optimization modules (FSCS and Rate Optimizer)
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { FSCSComplianceService } from '../services/FSCSComplianceService';
import { RateOptimizerService } from '../services/RateOptimizerService';
import { ModuleResult } from '../services/SubprocessService';
import { FSCSOptions, OptimizationOptions, ActionItemUpdate } from '@cash-mgmt/shared';
import { DatabaseValidator } from '@cash-mgmt/shared';

// Service instances
let fscsService: FSCSComplianceService | null = null;
let optimizerService: RateOptimizerService | null = null;

// Database path (should come from app config)
const getDatabasePath = () => {
  // __dirname is at dist/main/ipc-handlers, need to go up 5 levels to monorepo root
  const path = require('path');
  const fs = require('fs');

  const defaultPath = path.join(__dirname, '../../../../../data/database/cash_savings.db');
  const dbPath = process.env.DATABASE_PATH || defaultPath;

  console.log('🔍 getDatabasePath() called');
  console.log('  __dirname:', __dirname);
  console.log('  defaultPath:', defaultPath);
  console.log('  dbPath:', dbPath);
  console.log('  File exists?:', fs.existsSync(dbPath));

  return dbPath;
};

export function registerOptimizationHandlers() {
  
  // ============= FSCS Compliance Handlers =============
  
  ipcMain.handle('fscs:check', async (event: IpcMainInvokeEvent, options: FSCSOptions) => {
    console.log('🎯 fscs:check IPC handler called');
    try {
      const dbPath = getDatabasePath();
      console.log('📁 Database path resolved to:', dbPath);

      const fs = require('fs');
      console.log('📂 Database file exists?:', fs.existsSync(dbPath));

      if (!fscsService) {
        fscsService = new FSCSComplianceService();
      }

      // Listen for progress updates
      fscsService.on('progress', (progress) => {
        event.sender.send('fscs:progress', progress);
      });

      const result = await fscsService.checkCompliance({
        database: dbPath,
        format: 'json',
        includeCalendarEvents: true,
        includeActionItems: true,
        silent: true,
        progress: true,
        ...options
      });

      return { success: true, data: result };
    } catch (error) {
      console.error('❌ FSCS check failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  
  ipcMain.handle('fscs:diversify', async (event: IpcMainInvokeEvent, options: FSCSOptions) => {
    try {
      if (!fscsService) {
        fscsService = new FSCSComplianceService();
      }
      
      fscsService.on('progress', (progress) => {
        event.sender.send('fscs:progress', progress);
      });
      
      const result = await fscsService.generateDiversification({
        database: getDatabasePath(),
        format: 'json',
        includeCalendarEvents: true,
        includeActionItems: true,
        silent: true,
        progress: true,
        diversify: true,
        ...options
      });
      
      return { success: true, data: result };
    } catch (error) {
      console.error('FSCS diversification failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  
  ipcMain.handle('fscs:cancel', async () => {
    if (fscsService) {
      fscsService.cancel();
      return { success: true };
    }
    return { success: false, error: 'No FSCS process running' };
  });
  
  // ============= Rate Optimizer Handlers =============
  
  ipcMain.handle('optimize:generate', async (event: IpcMainInvokeEvent, options: OptimizationOptions) => {
    try {
      if (!optimizerService) {
        optimizerService = new RateOptimizerService();
      }
      
      optimizerService.on('progress', (progress) => {
        event.sender.send('optimization:progress', progress);
      });
      
      const result = await optimizerService.optimize({
        database: getDatabasePath(),
        format: 'json',
        includeCalendarEvents: true,
        includeActionItems: true,
        silent: true,
        progress: true,
        ...options
      });
      
      return { success: true, data: result };
    } catch (error) {
      console.error('Optimization failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  
  ipcMain.handle('optimize:analyze', async (event: IpcMainInvokeEvent, options: OptimizationOptions) => {
    try {
      if (!optimizerService) {
        optimizerService = new RateOptimizerService();
      }
      
      const result = await optimizerService.analyze({
        database: getDatabasePath(),
        format: 'json',
        silent: true,
        ...options
      });
      
      return { success: true, data: result };
    } catch (error) {
      console.error('Analysis failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  
  ipcMain.handle('optimize:cancel', async () => {
    if (optimizerService) {
      optimizerService.cancel();
      return { success: true };
    }
    return { success: false, error: 'No optimization process running' };
  });
  
  // ============= Action Item Handlers =============
  
  ipcMain.handle('action-item:update-status', async (
    event: IpcMainInvokeEvent, 
    actionId: string, 
    status: string, 
    pendingDepositId?: number,
    dismissalReason?: string
  ) => {
    try {
      console.log(`🔄 Updating action item ${actionId}: status=${status}, pendingDepositId=${pendingDepositId}`);
      
      // Build the SQL query dynamically based on what fields need updating
      const fieldsToUpdate = ['status = ?', 'updated_at = ?'];
      const values: any[] = [status, new Date().toISOString()];
      
      // Add pending deposit ID if provided
      if (pendingDepositId) {
        fieldsToUpdate.push('pending_deposit_id = ?');
        values.push(pendingDepositId);
      }
      
      // Add lifecycle dates based on status
      if (status === 'completed') {
        fieldsToUpdate.push('completed_date = ?');
        values.push(new Date().toISOString());
      } else if (status === 'dismissed') {
        fieldsToUpdate.push('dismissed_date = ?');
        values.push(new Date().toISOString());
        if (dismissalReason) {
          fieldsToUpdate.push('dismissed_reason = ?');
          values.push(dismissalReason);
        }
      }
      
      // Add the WHERE clause parameter
      values.push(actionId);
      
      // Build and execute the query
      const query = `UPDATE action_items SET ${fieldsToUpdate.join(', ')} WHERE action_id = ?`;
      
      console.log(`🔍 SQL: ${query}`);
      console.log(`🔍 Values:`, values);
      
      // Use sqlite3 directly since we don't need the DatabaseService wrapper
      const sqlite3 = require('sqlite3').verbose();
      const db = new sqlite3.Database(getDatabasePath());
      
      await new Promise<void>((resolve, reject) => {
        db.run(query, values, function(this: any, err: Error | null) {
          if (err) {
            console.error('❌ SQL Error:', err);
            db.close();
            reject(err);
          } else {
            console.log(`✅ Updated ${this.changes} row(s) for action item ${actionId}`);
            db.close();
            resolve();
          }
        });
      });
      
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to update action item status:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('action-item:update-by-pending-deposit', async (
    event: IpcMainInvokeEvent,
    pendingDepositId: number,
    updates: { status?: string; pending_deposit_id?: number | null }
  ) => {
    try {
      console.log(`🔄 Updating action items linked to pending deposit ${pendingDepositId}:`, updates);
      
      // Build the SQL query dynamically
      const fieldsToUpdate = ['updated_at = ?'];
      const values: any[] = [new Date().toISOString()];
      
      if (updates.status) {
        fieldsToUpdate.push('status = ?');
        values.push(updates.status);
      }
      
      if (updates.pending_deposit_id !== undefined) {
        fieldsToUpdate.push('pending_deposit_id = ?');
        values.push(updates.pending_deposit_id);
      }
      
      // Add WHERE clause parameter
      values.push(pendingDepositId);
      
      const query = `UPDATE action_items SET ${fieldsToUpdate.join(', ')} WHERE pending_deposit_id = ?`;
      
      console.log(`🔍 SQL: ${query}`);
      console.log(`🔍 Values:`, values);
      
      // Use sqlite3 directly
      const sqlite3 = require('sqlite3').verbose();
      const db = new sqlite3.Database(getDatabasePath());
      
      const changes = await new Promise<number>((resolve, reject) => {
        db.run(query, values, function(this: any, err: Error | null) {
          if (err) {
            console.error('❌ SQL Error:', err);
            db.close();
            reject(err);
          } else {
            console.log(`✅ Updated ${this.changes} action item(s) linked to pending deposit ${pendingDepositId}`);
            db.close();
            resolve(this.changes);
          }
        });
      });
      
      return { success: true, updatedCount: changes };
    } catch (error) {
      console.error('❌ Failed to update action items by pending deposit:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // ============= Shared Handlers =============
  
  ipcMain.handle('optimization:approve', async (event: IpcMainInvokeEvent, recommendationIds: string[]) => {
    try {
      console.log('Approving recommendations:', recommendationIds);
      
      // Use sqlite3 directly to update action items
      const sqlite3 = require('sqlite3').verbose();
      const db = new sqlite3.Database(getDatabasePath());
      
      // Prepare placeholders for SQL IN clause
      const placeholders = recommendationIds.map(() => '?').join(',');
      const query = `
        UPDATE action_items 
        SET status = 'approved',
            updated_at = CURRENT_TIMESTAMP
        WHERE action_id IN (${placeholders})
      `;
      
      await new Promise<void>((resolve, reject) => {
        db.run(query, recommendationIds, function(this: any, err: Error | null) {
          if (err) {
            console.error('❌ Failed to approve recommendations:', err);
            db.close();
            reject(err);
          } else {
            console.log(`✅ Approved ${this.changes} recommendation(s)`);
            db.close();
            resolve();
          }
        });
      });
      return { success: true, updatedCount: recommendationIds.length };
    } catch (error) {
      console.error('❌ Error approving recommendations:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  
  ipcMain.handle('optimization:reject', async (event: IpcMainInvokeEvent, recommendationId: string, reason: string) => {
    try {
      console.log('Rejecting recommendation:', recommendationId, 'Reason:', reason);
      
      // Use sqlite3 directly to update action items
      const sqlite3 = require('sqlite3').verbose();
      const db = new sqlite3.Database(getDatabasePath());
      
      const query = `
        UPDATE action_items 
        SET status = 'dismissed',
            dismissed_date = CURRENT_TIMESTAMP,
            dismissed_reason = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE action_id = ?
      `;
      
      await new Promise<void>((resolve, reject) => {
        db.run(query, [reason, recommendationId], function(this: any, err: Error | null) {
          if (err) {
            console.error('❌ Failed to reject recommendation:', err);
            db.close();
            reject(err);
          } else {
            console.log(`✅ Rejected recommendation ${recommendationId} (${this.changes} row(s) updated)`);
            db.close();
            resolve();
          }
        });
      });
      return { success: true };
    } catch (error) {
      console.error('❌ Error rejecting recommendation:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  
  // Cleanup on app quit
  ipcMain.on('app-will-quit', () => {
    if (fscsService) {
      fscsService.cancel();
      fscsService = null;
    }
    if (optimizerService) {
      optimizerService.cancel();
      optimizerService = null;
    }
  });
}

// Export for testing
export { fscsService, optimizerService };