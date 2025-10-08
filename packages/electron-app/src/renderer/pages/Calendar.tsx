import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Container,
  Paper,
  Typography,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  Fab,
  Chip,
  Stack,
  Tooltip,
  Button,
  IconButton,
} from '@mui/material';
import {
  Add as AddIcon,
  CalendarToday as CalendarIcon,
  List as ListIcon,
  Timeline as TimelineIcon,
  TrendingUp as CashFlowIcon,
  TrendingUp as RateIcon,
  NotificationsActive as NoticeIcon,
  EventNote as ReminderIcon,
  CheckCircle as CompleteIcon,
  Warning as OverdueIcon,
  Assignment as ReportsIcon,
  Schedule as SnoozeIcon,
  Close as DismissIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, { DateClickArg } from '@fullcalendar/interaction';
import { EventInput, EventClickArg } from '@fullcalendar/core';
import { RateChangeDialog, NoticeGivenDialog, CustomReminderDialog, EventDetailsDialog } from '../components/dialogs/EventDialogs';
import { SnoozeDialog } from '../components/dialogs/SnoozeDialog';

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

interface CalendarProps {
  // Props will be added as needed
}

export const Calendar: React.FC<CalendarProps> = () => {
  const [searchParams] = useSearchParams();
  const [currentView, setCurrentView] = useState<string>('list');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Dialog states
  const [rateChangeDialogOpen, setRateChangeDialogOpen] = useState(false);
  const [noticeDialogOpen, setNoticeDialogOpen] = useState(false);
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | undefined>();
  
  // Event details dialog state
  const [eventDetailsDialogOpen, setEventDetailsDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  
  // Snooze dialog state
  const [snoozeDialogOpen, setSnoozeDialogOpen] = useState(false);
  const [snoozeEventId, setSnoozeEventId] = useState<string>('');
  const [snoozeEventTitle, setSnoozeEventTitle] = useState<string>('');
  const [snoozeConfig, setSnoozeConfig] = useState<any>({});
  
  // FAB menu state
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  
  // Account data for dialogs
  const [accounts, setAccounts] = useState<any[]>([]);

  // Load calendar events, accounts, and snooze config from database
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [eventsResult, accountsResult, configResult] = await Promise.all([
          window.electronAPI.getUpcomingActions(),
          window.electronAPI.getAllAccounts(),
          window.electronAPI.getSnoozeConfig()
        ]);
        setEvents(eventsResult);
        setAccounts(accountsResult);
        setSnoozeConfig(configResult || {});
        setError(null);
      } catch (err) {
        console.error('Failed to load calendar data:', err);
        setError('Failed to load calendar data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleViewChange = (event: React.SyntheticEvent, newValue: string) => {
    setCurrentView(newValue);
    // Save preference to localStorage
    localStorage.setItem('calendar_view_preference', newValue);
  };

  // Load saved view preference and handle URL tab parameter
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['list', 'month', 'timeline', 'cashflow'].includes(tabParam)) {
      setCurrentView(tabParam);
    } else {
      const savedView = localStorage.getItem('calendar_view_preference');
      if (savedView && ['list', 'month', 'timeline', 'cashflow'].includes(savedView)) {
        setCurrentView(savedView);
      }
    }
  }, [searchParams]);

  // Handle Escape key to close FAB menu
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && fabMenuOpen) {
        setFabMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [fabMenuOpen]);

  // Dialog handlers
  const handleCreateRateChange = async (rateChange: any) => {
    try {
      await window.electronAPI.createRateChange(rateChange);
      // Reload events to show the new rate change
      const eventsResult = await window.electronAPI.getUpcomingActions();
      setEvents(eventsResult);
    } catch (error) {
      console.error('Failed to create rate change:', error);
      throw error;
    }
  };

  const handleCreateNoticeEvent = async (noticeEvent: any) => {
    try {
      await window.electronAPI.createNoticeEvent(noticeEvent);
      // Reload events to show the new notice event
      const eventsResult = await window.electronAPI.getUpcomingActions();
      setEvents(eventsResult);
    } catch (error) {
      console.error('Failed to create notice event:', error);
      throw error;
    }
  };

  const handleCreateReminder = async (reminder: any) => {
    try {
      await window.electronAPI.createReminder(reminder);
      // Reload events to show the new reminder
      const eventsResult = await window.electronAPI.getUpcomingActions();
      setEvents(eventsResult);
    } catch (error) {
      console.error('Failed to create reminder:', error);
      throw error;
    }
  };

  const openRateChangeDialog = (date?: string) => {
    setSelectedDate(date);
    setRateChangeDialogOpen(true);
  };

  const openNoticeDialog = (date?: string) => {
    setSelectedDate(date);
    setNoticeDialogOpen(true);
  };

  const openReminderDialog = (date?: string) => {
    setSelectedDate(date);
    setReminderDialogOpen(true);
  };

  const handleEventClickFromMonthView = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setEventDetailsDialogOpen(true);
  };

  const handleMarkRateChangeCompleted = async (eventId: string) => {
    try {
      // Extract rate change ID from the event ID (format: rate_change_reminder_123)
      const rateChangeId = parseInt(eventId.split('_').pop() || '0');
      if (rateChangeId > 0) {
        await window.electronAPI.markRateChangeReminderCompleted(rateChangeId);
        // Reload events to reflect the change
        const eventsResult = await window.electronAPI.getUpcomingActions();
        setEvents(eventsResult);
      }
    } catch (error) {
      console.error('Failed to mark rate change reminder as completed:', error);
      // Could add a toast notification here
    }
  };

  // Parse event ID to extract type and actual ID
  const parseEventId = (eventId: string) => {
    const parts = eventId.split('_');
    // Format is typically: "type_id_date" or "type_subtype_id_date"
    // We need to handle both cases
    const datePattern = /\d{4}-\d{2}-\d{2}/;
    const lastPart = parts[parts.length - 1];
    const hasDate = datePattern.test(lastPart);
    
    if (hasDate) {
      const date = parts.pop();
      const id = parseInt(parts.pop() || '0');
      const type = parts.join('_');
      return { type, id, date };
    } else {
      // No date in ID, just type and id
      const id = parseInt(parts.pop() || '0');
      const type = parts.join('_');
      return { type, id, date: null };
    }
  };

  const handleSnoozeEvent = async (eventId: string, customDuration?: string) => {
    try {
      const { type, id } = parseEventId(eventId);
      
      if (!customDuration) {
        // Quick snooze - use default from config
        const defaultDays = snoozeConfig.defaultSnoozeDays || 3;
        const snoozedUntil = new Date();
        snoozedUntil.setDate(snoozedUntil.getDate() + defaultDays);
        customDuration = snoozedUntil.toISOString();
      }
      
      await window.electronAPI.snoozeCalendarEvent(type, id, customDuration);
      
      // Reload events to reflect the change
      const eventsResult = await window.electronAPI.getUpcomingActions();
      setEvents(eventsResult);
    } catch (error) {
      console.error('Failed to snooze event:', error);
    }
  };

  const handleDismissEvent = async (eventId: string) => {
    try {
      const { type, id } = parseEventId(eventId);
      await window.electronAPI.dismissCalendarEvent(type, id);
      
      // Reload events to reflect the change
      const eventsResult = await window.electronAPI.getUpcomingActions();
      setEvents(eventsResult);
    } catch (error) {
      console.error('Failed to dismiss event:', error);
    }
  };
  
  const handleCompleteEvent = async (eventId: string) => {
    try {
      const { type, id } = parseEventId(eventId);
      
      if (type === 'rate_change_reminder') {
        // Use existing method for rate changes
        await window.electronAPI.markRateChangeReminderCompleted(id);
      } else {
        // Use new generic complete method
        await window.electronAPI.completeCalendarEvent(type, id);
      }
      
      // Reload events to reflect the change
      const eventsResult = await window.electronAPI.getUpcomingActions();
      setEvents(eventsResult);
    } catch (error) {
      console.error('Failed to complete event:', error);
    }
  };
  
  const openSnoozeDialog = (event: CalendarEvent) => {
    setSnoozeEventId(event.id);
    setSnoozeEventTitle(event.title);
    setSnoozeDialogOpen(true);
  };

  const renderCurrentView = () => {
    if (loading) {
      return (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
          <CircularProgress />
        </Box>
      );
    }

    if (error) {
      return (
        <Alert severity="error" sx={{ my: 2 }}>
          {error}
        </Alert>
      );
    }

    switch (currentView) {
      case 'list':
        return <ListView 
          events={events} 
          onMarkRateChangeCompleted={handleMarkRateChangeCompleted}
          onSnoozeEvent={handleSnoozeEvent}
          onDismissEvent={handleDismissEvent}
          onCompleteEvent={handleCompleteEvent}
          snoozeConfig={snoozeConfig}
          onOpenSnoozeDialog={openSnoozeDialog}
        />;
      case 'month':
        return <MonthView events={events} onDateClick={openReminderDialog} onEventClick={handleEventClickFromMonthView} />;
      case 'timeline':
        return <TimelineView events={events} />;
      case 'cashflow':
        return <CashFlowView events={events} />;
      default:
        return <ListView 
          events={events} 
          onMarkRateChangeCompleted={handleMarkRateChangeCompleted}
          onSnoozeEvent={handleSnoozeEvent}
          onDismissEvent={handleDismissEvent}
          onCompleteEvent={handleCompleteEvent}
          snoozeConfig={snoozeConfig}
          onOpenSnoozeDialog={openSnoozeDialog}
        />;
    }
  };

  return (
    <Container maxWidth={false} sx={{ py: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Calendar & Reminders
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Manage deposit maturities, rate changes, and portfolio actions
        </Typography>
      </Box>

      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={currentView}
          onChange={handleViewChange}
          aria-label="calendar view tabs"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab
            icon={<ListIcon />}
            iconPosition="start"
            label="List View"
            value="list"
          />
          <Tab
            icon={<CalendarIcon />}
            iconPosition="start"
            label="Month View"
            value="month"
          />
          <Tab
            icon={<TimelineIcon />}
            iconPosition="start"
            label="Timeline"
            value="timeline"
          />
          <Tab
            icon={<CashFlowIcon />}
            iconPosition="start"
            label="Cash Flow"
            value="cashflow"
          />
        </Tabs>

        <Box sx={{ p: 3 }}>
          {renderCurrentView()}
        </Box>
      </Paper>

      {/* Overlay for FAB menu */}
      {fabMenuOpen && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            zIndex: 999,
          }}
          onClick={() => setFabMenuOpen(false)}
        />
      )}

      {/* Event Creation FAB with Speed Dial */}
      <Box
        sx={{
          position: 'fixed',
          bottom: 32,
          right: 32,
          display: 'flex',
          flexDirection: 'column-reverse',
          alignItems: 'center',
          gap: 1,
          zIndex: 1000,
        }}
      >
        {/* Speed Dial Menu Items */}
        {fabMenuOpen && (
          <>
            <Tooltip title="Record Rate Change" placement="left">
              <Fab
                color="secondary"
                size="small"
                aria-label="rate change"
                onClick={() => {
                  openRateChangeDialog();
                  setFabMenuOpen(false);
                }}
                sx={{
                  animation: 'slideInUp 0.2s ease-out',
                  '@keyframes slideInUp': {
                    from: {
                      opacity: 0,
                      transform: 'translateY(20px) scale(0.8)',
                    },
                    to: {
                      opacity: 1,
                      transform: 'translateY(0) scale(1)',
                    },
                  },
                }}
              >
                <RateIcon />
              </Fab>
            </Tooltip>
            
            <Tooltip title="Give Notice" placement="left">
              <Fab
                color="warning"
                size="small"
                aria-label="notice given"
                onClick={() => {
                  openNoticeDialog();
                  setFabMenuOpen(false);
                }}
                sx={{
                  animation: 'slideInUp 0.15s ease-out',
                  '@keyframes slideInUp': {
                    from: {
                      opacity: 0,
                      transform: 'translateY(20px) scale(0.8)',
                    },
                    to: {
                      opacity: 1,
                      transform: 'translateY(0) scale(1)',
                    },
                  },
                }}
              >
                <NoticeIcon />
              </Fab>
            </Tooltip>
            
            <Tooltip title="Create Reminder" placement="left">
              <Fab
                color="primary"
                size="small"
                aria-label="create reminder"
                onClick={() => {
                  openReminderDialog();
                  setFabMenuOpen(false);
                }}
                sx={{
                  animation: 'slideInUp 0.1s ease-out',
                  '@keyframes slideInUp': {
                    from: {
                      opacity: 0,
                      transform: 'translateY(20px) scale(0.8)',
                    },
                    to: {
                      opacity: 1,
                      transform: 'translateY(0) scale(1)',
                    },
                  },
                }}
              >
                <ReminderIcon />
              </Fab>
            </Tooltip>
          </>
        )}
        
        {/* Main FAB */}
        <Fab
          color="primary"
          aria-label="add event"
          onClick={() => setFabMenuOpen(!fabMenuOpen)}
          sx={{
            transform: fabMenuOpen ? 'rotate(45deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease-in-out',
            zIndex: 1,
          }}
        >
          {fabMenuOpen ? <DismissIcon /> : <AddIcon />}
        </Fab>
      </Box>

      {/* Event Creation Dialogs */}
      <RateChangeDialog
        open={rateChangeDialogOpen}
        onClose={() => setRateChangeDialogOpen(false)}
        onSubmit={handleCreateRateChange}
        accounts={accounts}
        selectedDate={selectedDate}
      />
      
      <NoticeGivenDialog
        open={noticeDialogOpen}
        onClose={() => setNoticeDialogOpen(false)}
        onSubmit={handleCreateNoticeEvent}
        accounts={accounts}
        selectedDate={selectedDate}
      />
      
      <CustomReminderDialog
        open={reminderDialogOpen}
        onClose={() => setReminderDialogOpen(false)}
        onSubmit={handleCreateReminder}
        accounts={accounts}
        selectedDate={selectedDate}
      />
      
      <EventDetailsDialog
        open={eventDetailsDialogOpen}
        onClose={() => setEventDetailsDialogOpen(false)}
        event={selectedEvent}
        onSnoozeEvent={handleSnoozeEvent}
        onMarkRateChangeCompleted={handleMarkRateChangeCompleted}
        onDismissEvent={handleDismissEvent}
      />
      
      <SnoozeDialog
        open={snoozeDialogOpen}
        onClose={() => setSnoozeDialogOpen(false)}
        onSnooze={(snoozedUntil) => {
          handleSnoozeEvent(snoozeEventId, snoozedUntil);
          setSnoozeDialogOpen(false);
        }}
        eventTitle={snoozeEventTitle}
        presets={snoozeConfig.snoozePresets}
      />
    </Container>
  );
};

// List View Component
interface ListViewProps {
  events: CalendarEvent[];
  onMarkRateChangeCompleted?: (eventId: string) => Promise<void>;
  onSnoozeEvent?: (eventId: string) => Promise<void>;
  onDismissEvent?: (eventId: string) => Promise<void>;
  onCompleteEvent?: (eventId: string) => Promise<void>;
  snoozeConfig?: any;
  onOpenSnoozeDialog?: (event: CalendarEvent) => void;
}

const ListView: React.FC<ListViewProps> = ({ 
  events, 
  onMarkRateChangeCompleted, 
  onSnoozeEvent, 
  onDismissEvent,
  onCompleteEvent,
  snoozeConfig = {},
  onOpenSnoozeDialog
}) => {
  const groupEventsByPeriod = (events: CalendarEvent[]) => {
    return {
      thisWeek: events.filter(e => e.days_until <= 7 && e.days_until >= 0),
      nextWeek: events.filter(e => e.days_until > 7 && e.days_until <= 14),
      thisMonth: events.filter(e => e.days_until > 14 && e.days_until <= 30),
      next3Months: events.filter(e => e.days_until > 30 && e.days_until <= 90),
      next6Months: events.filter(e => e.days_until > 90 && e.days_until <= 180),
      next12Months: events.filter(e => e.days_until > 180 && e.days_until <= 365),
      future: events.filter(e => e.days_until > 365),
    };
  };

  const grouped = groupEventsByPeriod(events);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'error';
      case 'high': return 'warning';
      case 'medium': return 'info';
      case 'low': return 'default';
      default: return 'default';
    }
  };

  const getEventStatusStyling = (event: CalendarEvent) => {
    const isOverdue = event.days_until < 0 && event.action_type === 'rate_change_reminder';
    const isLastChance = event.days_until >= 0 && event.days_until <= 2 && event.action_type === 'rate_change_reminder';
    
    if (isOverdue) {
      return {
        borderColor: '#f44336',
        borderWidth: '2px',
        borderStyle: 'solid',
        backgroundColor: 'rgba(244, 67, 54, 0.05)'
      };
    }
    
    if (isLastChance) {
      return {
        borderColor: '#ff9800',
        borderWidth: '2px',
        borderStyle: 'solid',
        backgroundColor: 'rgba(255, 152, 0, 0.05)'
      };
    }
    
    return {};
  };

  const canSnoozeEvent = (event: CalendarEvent) => {
    // Events that are not overdue can be snoozed
    return event.days_until >= 0;
  };

  const canCompleteEvent = (event: CalendarEvent) => {
    // Most events can be completed
    return true;
  };

  const canDismissEvent = (event: CalendarEvent) => {
    // Only maturities cannot be dismissed - all other events can be dismissed after review
    return !['maturity'].includes(event.action_type);
  };

  const renderActionButtons = (event: CalendarEvent) => {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'center',
        mt: 1,
        pt: 1,
        borderTop: '1px solid #e0e0e0'
      }}>
        {canSnoozeEvent(event) && onSnoozeEvent && (
          <Tooltip title={`Snooze for ${snoozeConfig.defaultSnoozeDays || 3} days (right-click for options)`}>
            <IconButton
              size="small"
              color="primary"
              onClick={() => onSnoozeEvent(event.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (onOpenSnoozeDialog) {
                  onOpenSnoozeDialog(event);
                }
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
                } else if (onCompleteEvent) {
                  // Use the new handleCompleteEvent for all types
                  onCompleteEvent(event.id);
                }
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
              onClick={() => onDismissEvent(event.id)}
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
    );
  };

  const renderEventGroup = (title: string, events: CalendarEvent[], icon: React.ReactNode) => {
    if (events.length === 0) return null;

    return (
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          {icon}
          <Typography variant="h6" sx={{ ml: 1, mr: 2 }}>
            {title}
          </Typography>
          <Chip 
            label={events.length} 
            size="small" 
            color={events.some(e => e.priority === 'urgent') ? 'error' : 'primary'}
          />
        </Box>

        <Stack spacing={2}>
          {events.map((event) => (
            <Paper 
              key={`${event.action_type}-${event.deposit_id}-${event.action_date}`}
              variant="outlined"
              sx={{ 
                p: 2,
                ...getEventStatusStyling(event)
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {event.title}
                    </Typography>
                    <Chip
                      label={event.priority.toUpperCase()}
                      size="small"
                      color={getPriorityColor(event.priority)}
                      sx={{ ml: 2 }}
                    />
                  </Box>
                  
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {event.description}
                  </Typography>
                  
                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    <Typography variant="caption">
                      <strong>Bank:</strong> {event.bank}
                    </Typography>
                    <Typography variant="caption">
                      <strong>Date:</strong> {new Date(event.action_date).toLocaleDateString()}
                    </Typography>
                    <Typography variant="caption">
                      <strong>Days:</strong> {event.days_until} days
                    </Typography>
                    {event.amount && (
                      <Typography variant="caption">
                        <strong>Amount:</strong> £{event.amount.toLocaleString()}
                      </Typography>
                    )}
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <Typography variant="caption" color="text.secondary">
                    {event.category}
                  </Typography>
                </Box>
              </Box>
              
              {/* Action buttons at bottom like Portfolio view */}
              {renderActionButtons(event)}
            </Paper>
          ))}
        </Stack>
      </Box>
    );
  };

  if (events.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <CalendarIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No upcoming events
        </Typography>
        <Typography variant="body2" color="text.secondary">
          All your deposits and reminders are up to date!
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {renderEventGroup('⚠️ This Week', grouped.thisWeek, <></>)}
      {renderEventGroup('📅 Next Week', grouped.nextWeek, <></>)}
      {renderEventGroup('📆 This Month', grouped.thisMonth, <></>)}
      {renderEventGroup('📈 Next 3 Months', grouped.next3Months, <></>)}
      {renderEventGroup('🗓️ Next 6 Months', grouped.next6Months, <></>)}
      {renderEventGroup('📊 Next 12 Months', grouped.next12Months, <></>)}
      {renderEventGroup('🔮 Beyond 1 Year', grouped.future, <></>)}
    </Box>
  );
};

// Month View Component with FullCalendar
const MonthView: React.FC<{ events: CalendarEvent[]; onDateClick?: (date: string) => void; onEventClick?: (event: CalendarEvent) => void }> = ({ events, onDateClick, onEventClick }) => {
  // Convert events to FullCalendar format
  const convertToFullCalendarEvents = (events: CalendarEvent[]): EventInput[] => {
    return events.map(event => ({
      id: event.id,
      title: `${getEventIcon(event.action_type)} ${event.bank}`,
      start: event.action_date,
      allDay: true,
      backgroundColor: getPriorityBackgroundColor(event.priority),
      borderColor: getPriorityBorderColor(event.priority),
      textColor: getPriorityTextColor(event.priority),
      extendedProps: {
        originalEvent: event,
        description: event.description,
        amount: event.amount,
        category: event.category,
        priority: event.priority,
        daysUntil: event.days_until
      }
    }));
  };

  const getEventIcon = (actionType: string): string => {
    switch (actionType) {
      case 'maturity': return '💰';
      case 'rate_change_reminder': return '⚠️';
      case 'rate_change_effective': return '💰';
      case 'notice_available': return '🔔';
      case 'custom_reminder': return '📝';
      case 'report_action': return '📊';
      default: return '📅';
    }
  };

  const getPriorityBackgroundColor = (priority: string): string => {
    switch (priority) {
      case 'urgent': return '#f44336';  // Red
      case 'high': return '#ff9800';    // Orange
      case 'medium': return '#2196f3';  // Blue
      case 'low': return '#4caf50';     // Green
      default: return '#9e9e9e';        // Grey
    }
  };

  const getPriorityBorderColor = (priority: string): string => {
    switch (priority) {
      case 'urgent': return '#d32f2f';
      case 'high': return '#f57c00';
      case 'medium': return '#1976d2';
      case 'low': return '#388e3c';
      default: return '#616161';
    }
  };

  const getPriorityTextColor = (priority: string): string => {
    return '#ffffff'; // White text for all colored backgrounds
  };

  const handleEventClick = (clickInfo: EventClickArg) => {
    const event = clickInfo.event.extendedProps.originalEvent as CalendarEvent;
    if (onEventClick) {
      onEventClick(event);
    }
  };

  const handleDateClick = (clickInfo: DateClickArg) => {
    if (onDateClick) {
      onDateClick(clickInfo.dateStr);
    }
  };

  const calendarEvents = convertToFullCalendarEvents(events);
  
  // Find the earliest event date to set as initial date
  const getInitialDate = (): string => {
    if (events.length === 0) return new Date().toISOString().split('T')[0];
    
    const sortedEvents = [...events].sort((a, b) => 
      new Date(a.action_date).getTime() - new Date(b.action_date).getTime()
    );
    
    return sortedEvents[0].action_date;
  };
  
  const initialDate = getInitialDate();

  if (events.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <CalendarIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No events to display
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Your calendar is clear! Click on any date to add a reminder.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      '& .fc': {
        '--fc-border-color': '#e0e0e0',
        '--fc-button-bg-color': '#1976d2',
        '--fc-button-border-color': '#1976d2',
        '--fc-button-hover-bg-color': '#1565c0',
        '--fc-button-hover-border-color': '#1565c0',
        '--fc-button-active-bg-color': '#0d47a1',
        '--fc-button-active-border-color': '#0d47a1',
        '--fc-today-bg-color': 'rgba(25, 118, 210, 0.1)',
      },
      '& .fc-toolbar': {
        marginBottom: '1rem',
      },
      '& .fc-toolbar-title': {
        fontSize: '1.5rem',
        fontWeight: 600,
        color: '#1976d2',
      },
      // Enhanced button styling with explicit CSS fixes
      '& .fc-button, & .fc-button-primary': {
        textTransform: 'none !important',
        fontSize: '0.875rem !important',
        padding: '6px 12px !important',
        borderRadius: '4px !important',
        fontWeight: '500 !important',
        border: '1px solid #1976d2 !important',
        backgroundColor: '#1976d2 !important',
        color: 'white !important',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important',
        cursor: 'pointer !important',
        display: 'inline-flex !important',
        alignItems: 'center !important',
        justifyContent: 'center !important',
        textAlign: 'center !important',
        verticalAlign: 'middle !important',
        userSelect: 'none !important',
        lineHeight: '1.4 !important',
        position: 'relative !important',
        overflow: 'visible !important',
        transition: 'all 0.15s ease !important',
        '&:hover': {
          backgroundColor: '#1565c0 !important',
          borderColor: '#1565c0 !important',
          color: 'white !important',
        },
        '&:focus, &:focus-visible': {
          backgroundColor: '#1565c0 !important',
          borderColor: '#1565c0 !important',
          outline: 'none !important',
          boxShadow: '0 0 0 2px rgba(25, 118, 210, 0.25) !important',
          color: 'white !important',
        },
        '&:active': {
          backgroundColor: '#0d47a1 !important',
          borderColor: '#0d47a1 !important',
          transform: 'translateY(1px) !important',
        },
        '&:disabled': {
          backgroundColor: '#ccc !important',
          borderColor: '#ccc !important',
          color: '#666 !important',
          cursor: 'not-allowed !important',
        }
      },
      // Specific styling for navigation buttons
      '& .fc-prev-button, & .fc-next-button': {
        minWidth: '40px !important',
        width: '40px !important',
        height: '32px !important',
        marginRight: '4px !important',
        display: 'inline-flex !important',
        alignItems: 'center !important',
        justifyContent: 'center !important',
        fontSize: '16px !important',
        fontWeight: 'bold !important',
      },
      '& .fc-today-button': {
        minWidth: '60px !important',
        height: '32px !important',
        marginLeft: '4px !important',
      },
      // Enhanced icon styling
      '& .fc-icon, & .fc-icon::before': {
        fontSize: '14px !important',
        lineHeight: '1 !important',
        color: 'white !important',
        fontWeight: 'bold !important',
        display: 'inline-block !important',
        verticalAlign: 'middle !important',
      },
      // Fallback for arrow buttons using text content
      '& .fc-prev-button .fc-icon::before': {
        content: '"‹"',
      },
      '& .fc-next-button .fc-icon::before': {
        content: '"›"',
      },
      '& .fc-event': {
        borderRadius: '4px',
        fontSize: '0.75rem',
        cursor: 'pointer',
        '&:hover': {
          opacity: 0.8,
        }
      },
      '& .fc-daygrid-day:hover': {
        backgroundColor: 'rgba(25, 118, 210, 0.04)',
      },
      '& .fc-day-today': {
        backgroundColor: 'rgba(25, 118, 210, 0.1) !important',
      }
    }}>
      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        initialDate={initialDate}
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: '' // Remove the Month button since we have tabs
        }}
        buttonText={{
          today: 'Today',
          prev: '◀',
          next: '▶'
        }}
        buttonIcons={{
          prev: 'chevron-left',
          next: 'chevron-right'
        }}
        events={calendarEvents}
        eventClick={handleEventClick}
        dateClick={handleDateClick}
        height="auto"
        aspectRatio={1.35}
        dayMaxEvents={3}
        moreLinkClick="popover"
        eventDisplay="block"
        displayEventTime={false}
        weekends={true}
        firstDay={1} // Monday
        // Custom styling
        eventClassNames={(arg) => {
          const priority = arg.event.extendedProps.priority;
          return [`priority-${priority}`];
        }}
      />
      
      {/* Legend */}
      <Box sx={{ mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <Typography variant="body2" sx={{ mr: 1 }}>
          <strong>Legend:</strong>
        </Typography>
        <Chip
          size="small"
          label="💰 Maturity"
          sx={{ fontSize: '0.75rem' }}
        />
        <Chip
          size="small"
          label="⚠️ Rate Change"
          sx={{ fontSize: '0.75rem' }}
        />
        <Chip
          size="small"
          label="🔔 Notice Period"
          sx={{ fontSize: '0.75rem' }}
        />
        <Chip
          size="small"
          label="📝 Reminder"
          sx={{ fontSize: '0.75rem' }}
        />
        <Chip
          size="small"
          label="📊 Report Action"
          sx={{ fontSize: '0.75rem' }}
        />
      </Box>

      <Box sx={{ mt: 1, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <Typography variant="body2" sx={{ mr: 1 }}>
          <strong>Priority:</strong>
        </Typography>
        <Chip
          size="small"
          label="Urgent"
          sx={{ 
            backgroundColor: '#f44336', 
            color: 'white', 
            fontSize: '0.75rem' 
          }}
        />
        <Chip
          size="small"
          label="High"
          sx={{ 
            backgroundColor: '#ff9800', 
            color: 'white', 
            fontSize: '0.75rem' 
          }}
        />
        <Chip
          size="small"
          label="Medium"
          sx={{ 
            backgroundColor: '#2196f3', 
            color: 'white', 
            fontSize: '0.75rem' 
          }}
        />
        <Chip
          size="small"
          label="Low"
          sx={{ 
            backgroundColor: '#4caf50', 
            color: 'white', 
            fontSize: '0.75rem' 
          }}
        />
      </Box>
    </Box>
  );
};

const TimelineView: React.FC<{ events: CalendarEvent[] }> = ({ events }) => (
  <Box sx={{ textAlign: 'center', py: 4 }}>
    <TimelineIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
    <Typography variant="h6" color="text.secondary">
      Timeline View - Coming Soon
    </Typography>
    <Typography variant="body2" color="text.secondary">
      This view will show deposit lifecycles and overlapping events
    </Typography>
  </Box>
);

const CashFlowView: React.FC<{ events: CalendarEvent[] }> = ({ events }) => (
  <Box sx={{ textAlign: 'center', py: 4 }}>
    <CashFlowIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
    <Typography variant="h6" color="text.secondary">
      Cash Flow View - Coming Soon
    </Typography>
    <Typography variant="body2" color="text.secondary">
      This view will show liquidity forecasting and availability schedule
    </Typography>
  </Box>
);

