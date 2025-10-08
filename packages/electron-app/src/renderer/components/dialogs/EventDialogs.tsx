import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Alert,
  Autocomplete,
  InputAdornment,
  Chip,
  Stack,
  IconButton,
  Tooltip,
  Divider
} from '@mui/material';
import {
  TrendingUp as RateIcon,
  NotificationsActive as NoticeIcon,
  EventNote as ReminderIcon,
  Close as CloseIcon,
  CalendarToday as CalendarIcon,
  Schedule as SnoozeIcon,
  CheckCircle as CompleteIcon,
  Close as DismissIcon,
  Warning as OverdueIcon,
  MonetizationOn as MaturityIcon
} from '@mui/icons-material';
import { RateChange, NoticeEvent, Reminder } from '@cash-mgmt/shared';

// Rate Change Dialog Component
interface RateChangeDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (rateChange: Omit<RateChange, 'id' | 'created_at'>) => Promise<void>;
  accounts?: Array<{id: number, bank: string, account_name?: string, type: string, balance: number}>;
  selectedDate?: string;
}

export const RateChangeDialog: React.FC<RateChangeDialogProps> = ({
  open,
  onClose,
  onSubmit,
  accounts = [],
  selectedDate
}) => {
  const [formData, setFormData] = useState({
    deposit_id: null as number | null,
    change_type: 'increase' as 'increase' | 'decrease' | 'notification',
    current_rate: '',
    new_rate: '',
    effective_date: selectedDate || new Date().toISOString().split('T')[0],
    notification_date: new Date().toISOString().split('T')[0],
    reminder_days_before: 7,
    notification_source: '',
    notes: '',
    status: 'pending' as 'pending' | 'confirmed' | 'applied'
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!formData.deposit_id) {
        setError('Please select an account');
        return;
      }

      await onSubmit({
        deposit_id: formData.deposit_id,
        change_type: formData.change_type,
        current_rate: formData.current_rate ? parseFloat(formData.current_rate) : null,
        new_rate: formData.new_rate ? parseFloat(formData.new_rate) : null,
        effective_date: formData.effective_date,
        notification_date: formData.notification_date,
        reminder_days_before: formData.reminder_days_before,
        notification_source: formData.notification_source || null,
        notes: formData.notes || null,
        status: formData.status
      });
      
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create rate change');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      deposit_id: null,
      change_type: 'increase',
      current_rate: '',
      new_rate: '',
      effective_date: selectedDate || new Date().toISOString().split('T')[0],
      notification_date: new Date().toISOString().split('T')[0],
      reminder_days_before: 7,
      notification_source: '',
      notes: '',
      status: 'pending'
    });
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <RateIcon color="primary" />
          Record Rate Change
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          
          <Autocomplete
            options={accounts}
            getOptionLabel={(option) => `${option.bank} - ${option.account_name || option.type} (£${option.balance.toLocaleString()})`}
            value={accounts.find(acc => acc.id === formData.deposit_id) || null}
            onChange={(_, newValue) => setFormData(prev => ({ ...prev, deposit_id: newValue?.id || null }))}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Select Account"
                required
                fullWidth
              />
            )}
          />

          <FormControl fullWidth required>
            <InputLabel>Change Type</InputLabel>
            <Select
              value={formData.change_type}
              onChange={(e) => setFormData(prev => ({ ...prev, change_type: e.target.value as any }))}
              label="Change Type"
            >
              <MenuItem value="increase">Rate Increase</MenuItem>
              <MenuItem value="decrease">Rate Decrease</MenuItem>
              <MenuItem value="notification">Rate Change Notification</MenuItem>
            </Select>
          </FormControl>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Current Rate"
              type="number"
              inputProps={{ step: 0.01, min: 0, max: 20 }}
              InputProps={{
                endAdornment: <InputAdornment position="end">%</InputAdornment>
              }}
              value={formData.current_rate}
              onChange={(e) => setFormData(prev => ({ ...prev, current_rate: e.target.value }))}
              fullWidth
            />
            <TextField
              label="New Rate"
              type="number"
              inputProps={{ step: 0.01, min: 0, max: 20 }}
              InputProps={{
                endAdornment: <InputAdornment position="end">%</InputAdornment>
              }}
              value={formData.new_rate}
              onChange={(e) => setFormData(prev => ({ ...prev, new_rate: e.target.value }))}
              fullWidth
            />
          </Box>

          <TextField
            label="Notification Date"
            type="date"
            value={formData.notification_date}
            onChange={(e) => setFormData(prev => ({ ...prev, notification_date: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            required
            fullWidth
            helperText="When you received notice of this rate change"
          />

          <TextField
            label="Effective Date"
            type="date"
            value={formData.effective_date}
            onChange={(e) => setFormData(prev => ({ ...prev, effective_date: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            required
            fullWidth
            helperText="When the rate change will take effect"
          />

          <TextField
            label="Reminder Days Before"
            type="number"
            inputProps={{ min: 0, max: 90 }}
            value={formData.reminder_days_before}
            onChange={(e) => setFormData(prev => ({ ...prev, reminder_days_before: parseInt(e.target.value) || 7 }))}
            fullWidth
            helperText="How many days before the effective date to remind you"
          />

          <TextField
            label="Notification Source"
            value={formData.notification_source}
            onChange={(e) => setFormData(prev => ({ ...prev, notification_source: e.target.value }))}
            placeholder="e.g., Email, Letter, Website"
            fullWidth
          />

          <TextField
            label="Notes"
            multiline
            rows={3}
            value={formData.notes}
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            placeholder="Additional details about the rate change..."
            fullWidth
          />

          <FormControl fullWidth>
            <InputLabel>Status</InputLabel>
            <Select
              value={formData.status}
              onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as any }))}
              label="Status"
            >
              <MenuItem value="pending">Pending Confirmation</MenuItem>
              <MenuItem value="confirmed">Confirmed</MenuItem>
              <MenuItem value="applied">Applied</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={loading || !formData.deposit_id}
        >
          {loading ? 'Creating...' : 'Create Rate Change'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Notice Given Dialog Component
interface NoticeGivenDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (noticeEvent: Omit<NoticeEvent, 'id' | 'created_at'>) => Promise<void>;
  accounts?: Array<{id: number, bank: string, account_name?: string, type: string, balance: number, notice_period_days?: number}>;
  selectedDate?: string;
}

export const NoticeGivenDialog: React.FC<NoticeGivenDialogProps> = ({
  open,
  onClose,
  onSubmit,
  accounts = [],
  selectedDate
}) => {
  const [formData, setFormData] = useState({
    deposit_id: null as number | null,
    notice_given_date: selectedDate || new Date().toISOString().split('T')[0],
    planned_withdrawal_amount: '',
    funds_available_date: '',
    status: 'given' as 'given' | 'cancelled' | 'completed',
    notes: ''
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<any>(null);

  // Calculate funds available date when account or notice date changes
  useEffect(() => {
    if (selectedAccount && formData.notice_given_date) {
      const noticeDays = selectedAccount.notice_period_days || 0;
      const noticeDate = new Date(formData.notice_given_date);
      const availableDate = new Date(noticeDate);
      availableDate.setDate(availableDate.getDate() + noticeDays);
      
      setFormData(prev => ({
        ...prev,
        funds_available_date: availableDate.toISOString().split('T')[0]
      }));
    }
  }, [selectedAccount, formData.notice_given_date]);

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!formData.deposit_id) {
        setError('Please select an account');
        return;
      }

      await onSubmit({
        deposit_id: formData.deposit_id,
        notice_given_date: formData.notice_given_date,
        planned_withdrawal_amount: formData.planned_withdrawal_amount ? parseFloat(formData.planned_withdrawal_amount) : null,
        funds_available_date: formData.funds_available_date,
        status: formData.status,
        notes: formData.notes || null
      });
      
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create notice event');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      deposit_id: null,
      notice_given_date: selectedDate || new Date().toISOString().split('T')[0],
      planned_withdrawal_amount: '',
      funds_available_date: '',
      status: 'given',
      notes: ''
    });
    setSelectedAccount(null);
    setError(null);
    onClose();
  };

  const handleAccountChange = (account: any) => {
    setSelectedAccount(account);
    setFormData(prev => ({ 
      ...prev, 
      deposit_id: account?.id || null,
      planned_withdrawal_amount: account?.balance?.toString() || ''
    }));
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <NoticeIcon color="primary" />
          Record Notice Given
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          
          <Autocomplete
            options={accounts.filter(acc => acc.notice_period_days && acc.notice_period_days > 0)}
            getOptionLabel={(option) => `${option.bank} - ${option.account_name || option.type} (${option.notice_period_days} days notice)`}
            value={selectedAccount}
            onChange={(_, newValue) => handleAccountChange(newValue)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Select Notice Account"
                required
                fullWidth
                helperText="Only accounts with notice periods are shown"
              />
            )}
          />

          <TextField
            label="Notice Given Date"
            type="date"
            value={formData.notice_given_date}
            onChange={(e) => setFormData(prev => ({ ...prev, notice_given_date: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            required
            fullWidth
          />

          <TextField
            label="Planned Withdrawal Amount"
            type="number"
            inputProps={{ step: 0.01, min: 0 }}
            InputProps={{
              startAdornment: <InputAdornment position="start">£</InputAdornment>
            }}
            value={formData.planned_withdrawal_amount}
            onChange={(e) => setFormData(prev => ({ ...prev, planned_withdrawal_amount: e.target.value }))}
            fullWidth
            helperText={selectedAccount ? `Full balance: £${selectedAccount.balance?.toLocaleString()}` : ''}
          />

          <TextField
            label="Funds Available Date"
            type="date"
            value={formData.funds_available_date}
            onChange={(e) => setFormData(prev => ({ ...prev, funds_available_date: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            required
            fullWidth
            helperText={selectedAccount ? `Based on ${selectedAccount.notice_period_days} days notice period` : ''}
          />

          <FormControl fullWidth>
            <InputLabel>Status</InputLabel>
            <Select
              value={formData.status}
              onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as any }))}
              label="Status"
            >
              <MenuItem value="given">Notice Given</MenuItem>
              <MenuItem value="cancelled">Notice Cancelled</MenuItem>
              <MenuItem value="completed">Withdrawal Completed</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="Notes"
            multiline
            rows={3}
            value={formData.notes}
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            placeholder="Additional details about the notice..."
            fullWidth
          />
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={loading || !formData.deposit_id}
        >
          {loading ? 'Creating...' : 'Record Notice'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Custom Reminder Dialog Component
interface CustomReminderDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (reminder: Omit<Reminder, 'id' | 'created_at'>) => Promise<void>;
  accounts?: Array<{id: number, bank: string, account_name?: string, type: string}>;
  selectedDate?: string;
}

export const CustomReminderDialog: React.FC<CustomReminderDialogProps> = ({
  open,
  onClose,
  onSubmit,
  accounts = [],
  selectedDate
}) => {
  const [formData, setFormData] = useState({
    deposit_id: null as number | null,
    reminder_type: 'custom' as 'maturity' | 'rate_review' | 'notice_deadline' | 'custom' | 'portfolio_review',
    lead_days: 7,
    reminder_date: selectedDate || new Date().toISOString().split('T')[0],
    title: '',
    description: '',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent'
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!formData.title.trim()) {
        setError('Please enter a reminder title');
        return;
      }

      await onSubmit({
        deposit_id: formData.deposit_id,
        reminder_type: formData.reminder_type,
        lead_days: formData.lead_days,
        reminder_date: formData.reminder_date,
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        priority: formData.priority
      });
      
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create reminder');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      deposit_id: null,
      reminder_type: 'custom',
      lead_days: 7,
      reminder_date: selectedDate || new Date().toISOString().split('T')[0],
      title: '',
      description: '',
      priority: 'medium'
    });
    setError(null);
    onClose();
  };

  const reminderTypes = [
    { value: 'custom', label: 'Custom Reminder' },
    { value: 'maturity', label: 'Maturity Reminder' },
    { value: 'rate_review', label: 'Rate Review' },
    { value: 'notice_deadline', label: 'Notice Deadline' },
    { value: 'portfolio_review', label: 'Portfolio Review' }
  ];

  const priorityOptions = [
    { value: 'low', label: 'Low', color: '#4caf50' },
    { value: 'medium', label: 'Medium', color: '#2196f3' },
    { value: 'high', label: 'High', color: '#ff9800' },
    { value: 'urgent', label: 'Urgent', color: '#f44336' }
  ];

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ReminderIcon color="primary" />
          Create Custom Reminder
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          
          <TextField
            label="Reminder Title"
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            required
            fullWidth
            placeholder="e.g., Review Marcus account rate"
          />

          <FormControl fullWidth>
            <InputLabel>Reminder Type</InputLabel>
            <Select
              value={formData.reminder_type}
              onChange={(e) => setFormData(prev => ({ ...prev, reminder_type: e.target.value as any }))}
              label="Reminder Type"
            >
              {reminderTypes.map(type => (
                <MenuItem key={type.value} value={type.value}>{type.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <Autocomplete
            options={[null, ...accounts]}
            getOptionLabel={(option) => option ? `${option.bank} - ${option.account_name || option.type}` : 'No specific account'}
            value={accounts.find(acc => acc.id === formData.deposit_id) || null}
            onChange={(_, newValue) => setFormData(prev => ({ ...prev, deposit_id: newValue?.id || null }))}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Related Account (Optional)"
                fullWidth
              />
            )}
          />

          <TextField
            label="Reminder Date"
            type="date"
            value={formData.reminder_date}
            onChange={(e) => setFormData(prev => ({ ...prev, reminder_date: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            required
            fullWidth
          />

          <TextField
            label="Lead Days"
            type="number"
            inputProps={{ min: 0, max: 365 }}
            value={formData.lead_days}
            onChange={(e) => setFormData(prev => ({ ...prev, lead_days: parseInt(e.target.value) || 0 }))}
            fullWidth
            helperText="Number of days before the reminder date to show this reminder"
          />

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Priority</Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {priorityOptions.map(option => (
                <Chip
                  key={option.value}
                  label={option.label}
                  onClick={() => setFormData(prev => ({ ...prev, priority: option.value as any }))}
                  color={formData.priority === option.value ? 'primary' : 'default'}
                  variant={formData.priority === option.value ? 'filled' : 'outlined'}
                  sx={{
                    backgroundColor: formData.priority === option.value ? option.color : 'transparent',
                    color: formData.priority === option.value ? 'white' : option.color,
                    borderColor: option.color
                  }}
                />
              ))}
            </Box>
          </Box>

          <TextField
            label="Description"
            multiline
            rows={4}
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Detailed description of what needs to be done..."
            fullWidth
          />
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={loading || !formData.title.trim()}
        >
          {loading ? 'Creating...' : 'Create Reminder'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Event Details Dialog Component - for viewing events from Month view
interface CalendarEvent {
  id: string;
  action_type: string;
  deposit_id: number | null;
  bank: string;
  account_type: string;
  amount: number | null;
  action_date: string;
  days_until: number;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
  current_rate: number | null;
  new_rate: number | null;
}

interface EventDetailsDialogProps {
  open: boolean;
  onClose: () => void;
  event: CalendarEvent | null;
  onSnoozeEvent?: (eventId: string) => Promise<void>;
  onMarkRateChangeCompleted?: (eventId: string) => Promise<void>;
  onDismissEvent?: (eventId: string) => Promise<void>;
}

export const EventDetailsDialog: React.FC<EventDetailsDialogProps> = ({
  open,
  onClose,
  event,
  onSnoozeEvent,
  onMarkRateChangeCompleted,
  onDismissEvent
}) => {
  if (!event) return null;

  // Event type icon mapping
  const getEventIcon = (actionType: string) => {
    switch (actionType) {
      case 'maturity':
        return <MaturityIcon sx={{ color: '#4caf50' }} />;
      case 'rate_change_reminder':
        return <RateIcon sx={{ color: '#ff9800' }} />;
      case 'rate_change_effective':
        return <RateIcon sx={{ color: '#2196f3' }} />;
      case 'notice_available':
        return <NoticeIcon sx={{ color: '#9c27b0' }} />;
      case 'custom_reminder':
        return <ReminderIcon sx={{ color: '#3f51b5' }} />;
      case 'report_action':
        return <OverdueIcon sx={{ color: '#f44336' }} />;
      default:
        return <CalendarIcon sx={{ color: '#757575' }} />;
    }
  };

  // Priority color mapping (same as List view)
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'error';
      case 'high': return 'warning';
      case 'medium': return 'info';
      case 'low': return 'default';
      default: return 'default';
    }
  };

  // Action availability logic (same as List view)
  const canSnoozeEvent = (event: CalendarEvent) => {
    return event.days_until >= 0;
  };

  const canCompleteEvent = (event: CalendarEvent) => {
    return true;
  };

  const canDismissEvent = (event: CalendarEvent) => {
    return !['maturity'].includes(event.action_type);
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Format days until text
  const formatDaysUntil = (days: number) => {
    if (days < 0) {
      return `${Math.abs(days)} days overdue`;
    } else if (days === 0) {
      return 'Due today';
    } else if (days === 1) {
      return 'Due tomorrow';
    } else {
      return `Due in ${days} days`;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {getEventIcon(event.action_type)}
            <Typography variant="h6" component="div">
              Event Details
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {/* Event Title and Priority */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
              <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
                {event.title}
              </Typography>
              <Chip
                label={event.priority.toUpperCase()}
                size="small"
                color={getPriorityColor(event.priority)}
              />
            </Box>
            <Typography 
              variant="body2" 
              color={event.days_until < 0 ? 'error' : 'text.secondary'}
              sx={{ fontWeight: event.days_until < 0 ? 'bold' : 'normal' }}
            >
              {formatDaysUntil(event.days_until)}
            </Typography>
          </Box>

          <Divider />

          {/* Account Information */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Account Information
            </Typography>
            <Stack spacing={1}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2"><strong>Bank:</strong></Typography>
                <Typography variant="body2">{event.bank}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2"><strong>Account Type:</strong></Typography>
                <Typography variant="body2">{event.account_type}</Typography>
              </Box>
              {event.amount && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2"><strong>Amount:</strong></Typography>
                  <Typography variant="body2">£{event.amount.toLocaleString()}</Typography>
                </Box>
              )}
            </Stack>
          </Box>

          <Divider />

          {/* Event Details */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Event Details
            </Typography>
            <Stack spacing={1}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2"><strong>Due Date:</strong></Typography>
                <Typography variant="body2">{formatDate(event.action_date)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2"><strong>Category:</strong></Typography>
                <Typography variant="body2">{event.category}</Typography>
              </Box>
              {event.description && (
                <>
                  <Typography variant="body2"><strong>Description:</strong></Typography>
                  <Typography variant="body2" sx={{ pl: 2, fontStyle: 'italic' }}>
                    {event.description}
                  </Typography>
                </>
              )}
              {/* Rate change specific details */}
              {(event.current_rate || event.new_rate) && (
                <>
                  {event.current_rate && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2"><strong>Current Rate:</strong></Typography>
                      <Typography variant="body2">{event.current_rate}%</Typography>
                    </Box>
                  )}
                  {event.new_rate && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2"><strong>New Rate:</strong></Typography>
                      <Typography variant="body2">{event.new_rate}%</Typography>
                    </Box>
                  )}
                </>
              )}
            </Stack>
          </Box>

          {/* Action Buttons (same as List view) */}
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'space-between',
            alignItems: 'center',
            pt: 2,
            borderTop: '1px solid #e0e0e0'
          }}>
            {canSnoozeEvent(event) && onSnoozeEvent && (
              <Tooltip title="Snooze reminder">
                <IconButton
                  size="small"
                  color="primary"
                  onClick={() => {
                    onSnoozeEvent(event.id);
                    onClose();
                  }}
                  sx={{ 
                    padding: '4px',
                    '&:hover': {
                      backgroundColor: 'primary.main',
                      color: 'white'
                    }
                  }}
                >
                  <SnoozeIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            
            {canCompleteEvent(event) && (onMarkRateChangeCompleted || onSnoozeEvent) && (
              <Tooltip title={event.days_until < 0 ? "Mark as reviewed (overdue)" : "Mark as completed"}>
                <IconButton
                  size="small"
                  color="success"
                  onClick={() => {
                    if (event.action_type === 'rate_change_reminder' && onMarkRateChangeCompleted) {
                      onMarkRateChangeCompleted(event.id);
                    } else {
                      console.log('Completing event:', event.id);
                    }
                    onClose();
                  }}
                  sx={{ 
                    padding: '4px',
                    '&:hover': {
                      backgroundColor: 'success.main',
                      color: 'white'
                    }
                  }}
                >
                  <CompleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            
            {canDismissEvent(event) && onDismissEvent && (
              <Tooltip title="Dismiss event">
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => {
                    onDismissEvent(event.id);
                    onClose();
                  }}
                  sx={{ 
                    padding: '4px',
                    '&:hover': {
                      backgroundColor: 'error.main',
                      color: 'white'
                    }
                  }}
                >
                  <DismissIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Stack>
      </DialogContent>
    </Dialog>
  );
};