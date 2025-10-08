import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Switch,
  TextField,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Alert,
  Divider,
  Tooltip,
  CircularProgress,
  Snackbar,
  Chip,
} from '@mui/material';
import {
  DragIndicator as DragIcon,
  RestartAlt as ResetIcon,
  Save as SaveIcon,
  Storage as DataIcon,
  Visibility as VisibleIcon,
  VisibilityOff as HiddenIcon,
} from '@mui/icons-material';
import { Platform, ScraperConfig } from '@cash-mgmt/shared';
import { ScraperTypes';

interface ScraperWithConfig extends Platform {
  config: ScraperConfig;
}

export const ScraperConfigSettings: React.FC = () => {
  const [scrapers, setScrapers] = useState<ScraperWithConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);

  // Load scraper configurations
  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI.getScraperConfigs();
      
      if (result.success) {
        setScrapers(result.data);
      } else {
        setError(result.error || 'Failed to load configurations');
      }
    } catch (err) {
      console.error('Error loading scraper configs:', err);
      setError('Failed to load scraper configurations');
    } finally {
      setLoading(false);
    }
  };

  // Handle enable/disable toggle
  const handleToggleEnabled = (scraperId: string) => {
    setScrapers(prev => prev.map(scraper => {
      if (scraper.id === scraperId) {
        return {
          ...scraper,
          config: {
            ...scraper.config,
            is_enabled: !scraper.config.is_enabled
          }
        };
      }
      return scraper;
    }));
    setHasChanges(true);
  };

  // Handle custom name change
  const handleNameChange = (scraperId: string, customName: string) => {
    setScrapers(prev => prev.map(scraper => {
      if (scraper.id === scraperId) {
        return {
          ...scraper,
          config: {
            ...scraper.config,
            custom_name: customName || null
          }
        } as ScraperWithConfig;
      }
      return scraper;
    }));
    setHasChanges(true);
  };

  // Handle drag start
  const handleDragStart = (e: React.DragEvent, scraperId: string) => {
    setDraggedItem(scraperId);
    e.dataTransfer.effectAllowed = 'move';
  };

  // Handle drag over
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // Handle drop
  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    
    if (!draggedItem || draggedItem === targetId) return;
    
    const draggedIndex = scrapers.findIndex(s => s.id === draggedItem);
    const targetIndex = scrapers.findIndex(s => s.id === targetId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    // Reorder scrapers
    const newScrapers = [...scrapers];
    const [draggedScraper] = newScrapers.splice(draggedIndex, 1);
    newScrapers.splice(targetIndex, 0, draggedScraper);
    
    // Update display order
    const updatedScrapers = newScrapers.map((scraper, index) => ({
      ...scraper,
      config: {
        ...scraper.config,
        display_order: index + 1
      }
    }));
    
    setScrapers(updatedScrapers);
    setHasChanges(true);
    setDraggedItem(null);
  };

  // Save changes
  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      
      // Prepare updates
      const updates = scrapers.map(scraper => ({
        scraperId: scraper.id,
        updates: {
          is_enabled: scraper.config.is_enabled,
          display_order: scraper.config.display_order,
          custom_name: scraper.config.custom_name
        }
      }));
      
      const result = await window.electronAPI.updateScraperConfigsBulk(updates);
      
      if (result.success) {
        setSuccess('Configuration saved successfully');
        setHasChanges(false);
        // Reload to ensure consistency
        await loadConfigs();
      } else {
        setError(result.error || 'Failed to save configuration');
      }
    } catch (err) {
      console.error('Error saving configs:', err);
      setError('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  // Reset to defaults
  const handleReset = async () => {
    try {
      setSaving(true);
      setError(null);
      
      const result = await window.electronAPI.resetScraperConfigs();
      
      if (result.success) {
        setSuccess('Configuration reset to defaults');
        setHasChanges(false);
        await loadConfigs();
      } else {
        setError(result.error || 'Failed to reset configuration');
      }
    } catch (err) {
      console.error('Error resetting configs:', err);
      setError('Failed to reset configuration');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

  const enabledCount = scrapers.filter(s => s.config.is_enabled).length;

  return (
    <>
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">
              Data Collection Settings
            </Typography>
            <Box display="flex" gap={1}>
              <Button
                variant="outlined"
                startIcon={<ResetIcon />}
                onClick={handleReset}
                disabled={saving}
              >
                Reset to Defaults
              </Button>
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSave}
                disabled={saving || !hasChanges}
              >
                Save Changes
              </Button>
            </Box>
          </Box>

          <Alert severity="info" sx={{ mb: 3 }}>
            Configure which data collection sources are visible in the Data Collection tab. 
            You can enable/disable scrapers, customize their names, and reorder them by dragging.
            Only enabled scrapers will appear in the Data Collection interface.
          </Alert>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {enabledCount} of {scrapers.length} scrapers enabled
          </Typography>

          <List>
            {scrapers.map((scraper, index) => (
              <React.Fragment key={scraper.id}>
                {index > 0 && <Divider />}
                <ListItem
                  draggable
                  onDragStart={(e) => handleDragStart(e, scraper.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, scraper.id)}
                  sx={{
                    cursor: 'move',
                    opacity: draggedItem === scraper.id ? 0.5 : 1,
                    backgroundColor: !scraper.config.is_enabled ? 'action.hover' : 'transparent',
                    '&:hover': {
                      backgroundColor: 'action.hover'
                    }
                  }}
                >
                  <ListItemIcon>
                    <DragIcon color="action" />
                  </ListItemIcon>
                  
                  <ListItemIcon>
                    <Tooltip title={scraper.config.is_enabled ? 'Enabled' : 'Disabled'}>
                      {scraper.config.is_enabled ? (
                        <VisibleIcon color="success" />
                      ) : (
                        <HiddenIcon color="disabled" />
                      )}
                    </Tooltip>
                  </ListItemIcon>

                  <ListItemText
                    primary={
                      <Box display="flex" alignItems="center" gap={2}>
                        <Typography 
                          variant="body1" 
                          color={scraper.config.is_enabled ? 'text.primary' : 'text.disabled'}
                        >
                          {scraper.name}
                        </Typography>
                        {scraper.supportsModular && (
                          <Chip 
                            label="Modular" 
                            size="small" 
                            variant="outlined"
                            color={scraper.config.is_enabled ? 'primary' : 'default'}
                          />
                        )}
                      </Box>
                    }
                    secondary={
                      <Box display="flex" flexDirection="column" gap={1} mt={1}>
                        <Typography variant="body2" color="text.secondary">
                          {scraper.config.description || `${scraper.name} data collection`}
                        </Typography>
                        <TextField
                          size="small"
                          label="Custom Display Name"
                          value={scraper.config.custom_name || ''}
                          onChange={(e) => handleNameChange(scraper.id, e.target.value)}
                          placeholder={scraper.name}
                          disabled={!scraper.config.is_enabled}
                          sx={{ maxWidth: 300 }}
                        />
                      </Box>
                    }
                  />

                  <ListItemSecondaryAction>
                    <Switch
                      edge="end"
                      checked={scraper.config.is_enabled}
                      onChange={() => handleToggleEnabled(scraper.id)}
                      inputProps={{
                        'aria-labelledby': `switch-list-label-${scraper.id}`,
                      }}
                    />
                  </ListItemSecondaryAction>
                </ListItem>
              </React.Fragment>
            ))}
          </List>

          {scrapers.length === 0 && (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight={100}>
              <Typography variant="body1" color="text.secondary">
                No scrapers configured
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Error Snackbar */}
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
      >
        <Alert onClose={() => setError(null)} severity="error">
          {error}
        </Alert>
      </Snackbar>

      {/* Success Snackbar */}
      <Snackbar
        open={!!success}
        autoHideDuration={3000}
        onClose={() => setSuccess(null)}
      >
        <Alert onClose={() => setSuccess(null)} severity="success">
          {success}
        </Alert>
      </Snackbar>
    </>
  );
};

export default ScraperConfigSettings;