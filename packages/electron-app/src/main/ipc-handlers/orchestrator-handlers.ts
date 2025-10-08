import { ipcMain, BrowserWindow } from 'electron';
import { OrchestrationService } from '@cash-mgmt/pipeline';

/**
 * Register orchestrator IPC handlers for UI integration
 * Provides essential pipeline control and status management
 */
export function registerOrchestratorHandlers(
  orchestratorService: OrchestrationService,
  mainWindow: BrowserWindow
): void {

  // Core pipeline execution
  ipcMain.handle('orchestrator:execute-pipeline', async (event, inputFiles: string[]) => {
    try {
      // Input validation
      if (!Array.isArray(inputFiles) || inputFiles.length === 0) {
        return {
          success: false,
          error: 'Invalid input files: must be non-empty array'
        };
      }

      for (const file of inputFiles) {
        if (typeof file !== 'string' || file.trim().length === 0) {
          return {
            success: false,
            error: 'Invalid file path: must be non-empty string'
          };
        }
      }

      // Check if pipeline already running
      if (await orchestratorService.isPipelineRunning()) {
        return {
          success: false,
          error: 'Pipeline already running'
        };
      }

      const result = await orchestratorService.executePipelineWithUI(inputFiles, mainWindow);
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Configuration management (blocked during pipeline execution)
  ipcMain.handle('orchestrator:update-config', async (event, configUpdates: Record<string, string | number | boolean>) => {
    try {
      // Input validation
      if (!configUpdates || typeof configUpdates !== 'object') {
        return {
          success: false,
          error: 'Invalid configuration data: must be object'
        };
      }

      if (Object.keys(configUpdates).length === 0) {
        return {
          success: false,
          error: 'Configuration updates cannot be empty'
        };
      }

      if (await orchestratorService.isPipelineRunning()) {
        return {
          success: false,
          error: 'Cannot update configuration while pipeline is running'
        };
      }

      await orchestratorService.updateConfiguration(configUpdates);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Pipeline status
  ipcMain.handle('orchestrator:get-status', async () => {
    try {
      return await orchestratorService.getPipelineStatus();
    } catch (error) {
      return {
        isRunning: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Service health check
  ipcMain.handle('orchestrator:get-health', async () => {
    try {
      return orchestratorService.getStatus();
    } catch (error) {
      return {
        initialized: false,
        healthy: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Configuration validation
  ipcMain.handle('orchestrator:validate-config', async () => {
    try {
      return await orchestratorService.validateConfiguration();
    } catch (error) {
      return {
        valid: false,
        message: 'Configuration validation failed',
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  });

  // Simple event forwarding (no complex progress tracking)
  orchestratorService.on('pipeline:started', (data) => {
    mainWindow.webContents.send('orchestrator:pipeline-started', data);
  });

  orchestratorService.on('pipeline:stage-started', (data) => {
    mainWindow.webContents.send('orchestrator:stage-started', data);
  });

  orchestratorService.on('pipeline:stage-completed', (data) => {
    mainWindow.webContents.send('orchestrator:stage-completed', data);
  });

  orchestratorService.on('pipeline:completed', (data) => {
    mainWindow.webContents.send('orchestrator:pipeline-completed', data);
  });

  orchestratorService.on('pipeline:failed', (data) => {
    mainWindow.webContents.send('orchestrator:pipeline-failed', data);
  });

  orchestratorService.on('progress', (data) => {
    mainWindow.webContents.send('orchestrator:progress', data);
  });

  console.log('✅ Orchestrator IPC handlers registered successfully');
}

/**
 * Clean up orchestrator IPC handlers
 */
export function unregisterOrchestratorHandlers(): void {
  ipcMain.removeHandler('orchestrator:execute-pipeline');
  ipcMain.removeHandler('orchestrator:update-config');
  ipcMain.removeHandler('orchestrator:get-status');
  ipcMain.removeHandler('orchestrator:get-health');
  ipcMain.removeHandler('orchestrator:validate-config');

  console.log('🧹 Orchestrator IPC handlers unregistered');
}