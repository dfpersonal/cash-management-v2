import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  TextField,
  Box,
  Typography,
  Divider,
} from '@mui/material';
// Date picker imports removed - using native HTML input for now
import { addHours, addDays, addWeeks, format } from 'date-fns';

interface SnoozeDialogProps {
  open: boolean;
  onClose: () => void;
  onSnooze: (snoozedUntil: string) => void;
  eventTitle?: string;
  presets?: string[];
}

export const SnoozeDialog: React.FC<SnoozeDialogProps> = ({
  open,
  onClose,
  onSnooze,
  eventTitle,
  presets = ['1 hour', '4 hours', '1 day', '3 days', '1 week', '2 weeks']
}) => {
  const [customDate, setCustomDate] = useState<Date | null>(null);
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setShowCustomPicker(false);
      setCustomDate(null);
    }
  }, [open]);

  const handlePresetClick = (preset: string) => {
    let snoozedUntil = new Date();
    
    // Parse preset and calculate snooze until date
    if (preset.includes('hour')) {
      const hours = parseInt(preset);
      snoozedUntil = addHours(snoozedUntil, hours);
    } else if (preset.includes('day')) {
      const days = parseInt(preset);
      snoozedUntil = addDays(snoozedUntil, days);
    } else if (preset.includes('week')) {
      const weeks = parseInt(preset);
      snoozedUntil = addWeeks(snoozedUntil, weeks);
    }
    
    onSnooze(snoozedUntil.toISOString());
    onClose();
  };

  const handleCustomSnooze = () => {
    if (customDate) {
      onSnooze(customDate.toISOString());
      onClose();
    }
  };

  const formatPresetDate = (preset: string): string => {
    let targetDate = new Date();
    
    if (preset.includes('hour')) {
      const hours = parseInt(preset);
      targetDate = addHours(targetDate, hours);
    } else if (preset.includes('day')) {
      const days = parseInt(preset);
      targetDate = addDays(targetDate, days);
    } else if (preset.includes('week')) {
      const weeks = parseInt(preset);
      targetDate = addWeeks(targetDate, weeks);
    }
    
    return format(targetDate, 'EEE, MMM d, h:mm a');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        Snooze Reminder
        {eventTitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {eventTitle}
          </Typography>
        )}
      </DialogTitle>
      
      <DialogContent sx={{ p: 0 }}>
        {!showCustomPicker ? (
          <>
            <List>
              {presets.map((preset) => (
                <ListItem key={preset} disablePadding>
                  <ListItemButton onClick={() => handlePresetClick(preset)}>
                    <ListItemText
                      primary={preset}
                      secondary={formatPresetDate(preset)}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
              <Divider />
              <ListItem disablePadding>
                <ListItemButton onClick={() => setShowCustomPicker(true)}>
                  <ListItemText
                    primary="Custom date & time..."
                    secondary="Choose a specific time"
                  />
                </ListItemButton>
              </ListItem>
            </List>
          </>
        ) : (
          <Box sx={{ p: 3 }}>
            <TextField
              label="Snooze until"
              type="datetime-local"
              value={customDate ? format(customDate, "yyyy-MM-dd'T'HH:mm") : ''}
              onChange={(e) => setCustomDate(e.target.value ? new Date(e.target.value) : null)}
              fullWidth
              InputLabelProps={{
                shrink: true,
              }}
              inputProps={{
                min: format(new Date(), "yyyy-MM-dd'T'HH:mm")
              }}
            />
            
            <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
              <Button
                variant="text"
                onClick={() => {
                  setShowCustomPicker(false);
                  setCustomDate(null);
                }}
              >
                Back to presets
              </Button>
            </Box>
          </Box>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose} color="primary">
          Cancel
        </Button>
        {showCustomPicker && (
          <Button
            onClick={handleCustomSnooze}
            color="primary"
            variant="contained"
            disabled={!customDate}
          >
            Snooze
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default SnoozeDialog;