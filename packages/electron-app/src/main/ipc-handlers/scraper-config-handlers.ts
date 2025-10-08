import { ipcMain } from 'electron';
import { ScraperProcessManager } from '../services/ScraperProcessManager';
import { ScraperConfig } from '@cash-mgmt/shared';

export function registerScraperConfigHandlers(scraperManager: ScraperProcessManager) {
  
  // Get all scraper configurations
  ipcMain.handle('scraper:get-configs', async () => {
    try {
      const configs = await scraperManager.getScraperConfigs();
      const platforms = scraperManager.getAllPlatforms();
      
      // Merge platform info with configs
      const mergedConfigs = platforms.map(platform => {
        const config = configs.find(c => c.scraper_id === platform.id);
        return {
          ...platform,
          config: config || {
            scraper_id: platform.id,
            is_enabled: true,
            display_order: 999,
            custom_name: null,
            description: null
          }
        };
      });
      
      return {
        success: true,
        data: mergedConfigs
      };
    } catch (error) {
      console.error('Failed to get scraper configs:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });
  
  // Update a scraper configuration
  ipcMain.handle('scraper:update-config', async (event, scraperId: string, updates: Partial<ScraperConfig>) => {
    try {
      const success = await scraperManager.updateScraperConfig(scraperId, updates);
      
      if (success) {
        // Emit event to notify renderer about config change
        event.sender.send('scraper:config-updated', scraperId);
      }
      
      return {
        success,
        message: success ? 'Configuration updated successfully' : 'Failed to update configuration'
      };
    } catch (error) {
      console.error('Failed to update scraper config:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });
  
  // Update multiple scraper configurations (for reordering)
  ipcMain.handle('scraper:update-configs-bulk', async (event, updates: Array<{scraperId: string, updates: Partial<ScraperConfig>}>) => {
    try {
      let allSuccess = true;
      
      for (const update of updates) {
        const success = await scraperManager.updateScraperConfig(update.scraperId, update.updates);
        if (!success) {
          allSuccess = false;
        }
      }
      
      if (allSuccess) {
        // Emit event to notify renderer about config changes
        event.sender.send('scraper:configs-updated');
      }
      
      return {
        success: allSuccess,
        message: allSuccess ? 'All configurations updated successfully' : 'Some configurations failed to update'
      };
    } catch (error) {
      console.error('Failed to update scraper configs:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });
  
  // Reset all scraper configurations to defaults
  ipcMain.handle('scraper:reset-configs', async (event) => {
    try {
      const success = await scraperManager.resetScraperConfigs();
      
      if (success) {
        // Emit event to notify renderer about reset
        event.sender.send('scraper:configs-reset');
      }
      
      return {
        success,
        message: success ? 'Configurations reset to defaults' : 'Failed to reset configurations'
      };
    } catch (error) {
      console.error('Failed to reset scraper configs:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });
}