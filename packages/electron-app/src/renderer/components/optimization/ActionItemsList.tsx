/**
 * ActionItemsList Component - Displays and manages action items from both modules
 */

import React, { useState, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  IconButton,
  Button,
  Menu,
  MenuItem,
  Checkbox,
  FormControlLabel,
  TextField,
  InputAdornment,
  Divider,
  Alert,
  Tooltip,
  Badge,
  Grid,
} from '@mui/material';
import {
  PriorityHigh as UrgentIcon,
  Warning as HighIcon,
  Info as MediumIcon,
  Info as InfoIcon,
  LowPriority as LowIcon,
  CheckCircle as CompleteIcon,
  RadioButtonUnchecked as PendingIcon,
  MoreVert as MoreIcon,
  FilterList as FilterIcon,
  Search as SearchIcon,
  Security as FSCSIcon,
  TrendingUp as OptimizerIcon,
  CheckBox as ApproveIcon,
  Cancel as RejectIcon,
  Sort as SortIcon,
  Visibility as ViewIcon,
  AccountBalanceWallet as ActionedIcon,
} from '@mui/icons-material';
import { ActionItemDetailModal } from './ActionItemDetailModal';
import { PendingDepositService } from '../../services/pendingDepositService';
import { ActionItem } from '../../types/actionItem';

interface ActionItemsListProps {
  items: ActionItem[];
  onUpdateStatus: (actionId: string, status: string) => Promise<void>;
  onApprove?: (actionIds: string[]) => Promise<void>;
  onReject?: (actionId: string, reason?: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
  showModuleFilter?: boolean;
  showStatusFilter?: boolean;
}

const ActionItemsList: React.FC<ActionItemsListProps> = ({
  items,
  onUpdateStatus,
  onApprove,
  onReject,
  onRefresh,
  showModuleFilter = true,
  showStatusFilter = true,
}) => {
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [filterModule, setFilterModule] = useState<'all' | 'fscs-compliance' | 'rate-optimizer'>('all');
  const [filterPriority, setFilterPriority] = useState<'all' | 'urgent' | 'high' | 'medium' | 'low'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'actioned' | 'in_progress' | 'completed' | 'rejected'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'priority' | 'date' | 'module'>('priority');
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedActionItem, setSelectedActionItem] = useState<ActionItem | null>(null);

  const getPriorityIcon = (priority: string) => {
    const normalizedPriority = priority.toLowerCase();
    switch (normalizedPriority) {
      case 'urgent':
        return <UrgentIcon sx={{ color: '#f44336' }} />;
      case 'high':
        return <HighIcon sx={{ color: '#ff9800' }} />;
      case 'medium':
        return <MediumIcon sx={{ color: '#2196f3' }} />;
      case 'low':
        return <LowIcon sx={{ color: '#9e9e9e' }} />;
      default:
        return <InfoIcon />;
    }
  };

  const getPriorityColor = (priority: string) => {
    const normalizedPriority = priority.toLowerCase();
    switch (normalizedPriority) {
      case 'urgent':
        return 'error';
      case 'high':
        return 'warning';
      case 'medium':
        return 'info';
      case 'low':
        return 'default';
      default:
        return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Tooltip title="Completed">
            <CompleteIcon sx={{ color: '#4caf50' }} />
          </Tooltip>
        );
      case 'pending_deposit_created':
        return (
          <Tooltip title="Pending deposit created">
            <ActionedIcon sx={{ color: '#4caf50' }} />
          </Tooltip>
        );
      case 'in_progress':
        return (
          <Tooltip title="In Progress">
            <PendingIcon sx={{ color: '#ff9800' }} />
          </Tooltip>
        );
      case 'rejected':
      case 'dismissed':
        return (
          <Tooltip title="Rejected/Dismissed">
            <RejectIcon sx={{ color: '#f44336' }} />
          </Tooltip>
        );
      default:
        return (
          <Tooltip title="Pending">
            <PendingIcon sx={{ color: '#9e9e9e' }} />
          </Tooltip>
        );
    }
  };

  const getModuleIcon = (module: string) => {
    return module === 'fscs-compliance' ? 
      <FSCSIcon sx={{ color: '#f44336' }} /> : 
      <OptimizerIcon sx={{ color: '#4caf50' }} />;
  };

  const formatCurrency = (amount?: number) => {
    if (!amount) return '';
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Filter and sort items
  const filteredItems = useMemo(() => {
    let filtered = items;

    // Module filter
    if (filterModule !== 'all') {
      filtered = filtered.filter(item => item.module === filterModule);
    }

    // Priority filter
    if (filterPriority !== 'all') {
      filtered = filtered.filter(item => item.priority.toLowerCase() === filterPriority);
    }

    // Status filter
    if (filterStatus !== 'all') {
      if (filterStatus === 'actioned') {
        filtered = filtered.filter(item => item.status === 'pending_deposit_created');
      } else {
        filtered = filtered.filter(item => item.status === filterStatus);
      }
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        item.title.toLowerCase().includes(term) ||
        item.description.toLowerCase().includes(term) ||
        (item.bank && item.bank.toLowerCase().includes(term))
      );
    }

    // Sort
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'priority':
          return priorityOrder[a.priority.toLowerCase() as keyof typeof priorityOrder] - priorityOrder[b.priority.toLowerCase() as keyof typeof priorityOrder];
        case 'date':
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        case 'module':
          return a.module.localeCompare(b.module);
        default:
          return 0;
      }
    });

    return filtered;
  }, [items, filterModule, filterPriority, filterStatus, searchTerm, sortBy]);

  const handleSelectAll = () => {
    if (selectedItems.length === filteredItems.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredItems.map(item => item.action_id));
    }
  };

  const handleSelectItem = (actionId: string) => {
    setSelectedItems(prev =>
      prev.includes(actionId)
        ? prev.filter(id => id !== actionId)
        : [...prev, actionId]
    );
  };

  const handleBulkApprove = async () => {
    if (onApprove && selectedItems.length > 0) {
      await onApprove(selectedItems);
      setSelectedItems([]);
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, actionId: string) => {
    setAnchorEl(event.currentTarget);
    setSelectedActionId(actionId);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedActionId(null);
  };

  const handleStatusChange = async (status: string) => {
    if (selectedActionId) {
      await onUpdateStatus(selectedActionId, status);
      handleMenuClose();
    }
  };

  const handleViewDetails = () => {
    if (selectedActionId) {
      const item = items.find(item => item.action_id === selectedActionId);
      if (item) {
        setSelectedActionItem(item);
        setDetailModalOpen(true);
      }
    }
    handleMenuClose();
  };

  const handleCreatePendingDeposit = async (recommendation: any) => {
    try {
      // Debug: Log the data we're working with
      console.log('Creating pending deposit from recommendation:', recommendation);
      console.log('Selected action item source_data:', selectedActionItem?.source_data);
      
      // Get the source account ID from the action item if available
      const sourceAccountId = selectedActionItem?.source_data?.accountId;
      console.log('🔍 Source account ID from action item:', sourceAccountId, 'Type:', typeof sourceAccountId);
      console.log('🔍 Full source_data:', JSON.stringify(selectedActionItem?.source_data, null, 2));
      
      const parsedSourceAccountId = sourceAccountId ? parseInt(sourceAccountId, 10) : undefined;
      console.log('🔍 Parsed source account ID:', parsedSourceAccountId);
      
      const result = await PendingDepositService.createFromRecommendation(
        recommendation, 
        parsedSourceAccountId
      );
      
      if (result.success) {
        // Show success notification
        console.log('Pending deposit created successfully:', result.id);
        alert(`✅ Success! Pending deposit created for ${formatCurrency(recommendation.amount)} to ${recommendation.targetBank}`);
        
        // Update the action item status to 'pending_deposit_created'
        if (selectedActionItem) {
          try {
            console.log('🔄 Updating action item status to pending_deposit_created...');
            const updateResult = await window.electronAPI.updateActionItemStatus(
              selectedActionItem.action_id,
              'pending_deposit_created',
              result.id // Link the pending deposit
            );
            
            if (updateResult.success) {
              console.log('✅ Action item status updated successfully');
            } else {
              console.error('❌ Failed to update action item status:', updateResult.error);
            }
          } catch (updateError) {
            console.error('❌ Error updating action item status:', updateError);
          }
        }
        
        // Close modal but don't clear selectedActionItem until modal is fully closed
        setDetailModalOpen(false);
        
        // Clear selectedActionItem after a brief delay to prevent race conditions
        setTimeout(() => {
          setSelectedActionItem(null);
        }, 100);
        
        // Trigger refresh of action items list to show updated status
        if (onRefresh) {
          await onRefresh();
        }
      } else {
        console.error('Failed to create pending deposit:', result.error);
        alert(`❌ Failed to create pending deposit: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error creating pending deposit:', error);
      alert(`❌ Error creating pending deposit: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const pendingCount = items.filter(item => item.status === 'pending').length;
  const urgentCount = items.filter(item => item.priority.toLowerCase() === 'urgent' && item.status === 'pending').length;

  return (
    <Card elevation={2}>
      <CardContent>
        {/* Header */}
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Box display="flex" alignItems="center" gap={1}>
            <Typography variant="h6" fontWeight="bold">
              Action Items
            </Typography>
            <Badge badgeContent={pendingCount} color="primary">
              <Box />
            </Badge>
            {urgentCount > 0 && (
              <Chip
                label={`${urgentCount} Urgent`}
                size="small"
                color="error"
                icon={<UrgentIcon />}
              />
            )}
          </Box>
          {selectedItems.length > 0 && onApprove && (
            <Button
              variant="contained"
              size="small"
              startIcon={<ApproveIcon />}
              onClick={handleBulkApprove}
            >
              Approve Selected ({selectedItems.length})
            </Button>
          )}
        </Box>

        {/* Filters */}
        <Box mb={2}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={4}>
              <TextField
                size="small"
                fullWidth
                placeholder="Search action items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            {showModuleFilter && (
              <Grid item xs={6} sm={2}>
                <TextField
                  select
                  size="small"
                  fullWidth
                  label="Module"
                  value={filterModule}
                  onChange={(e) => setFilterModule(e.target.value as any)}
                >
                  <MenuItem value="all">All Modules</MenuItem>
                  <MenuItem value="fscs-compliance">FSCS</MenuItem>
                  <MenuItem value="rate-optimizer">Optimizer</MenuItem>
                </TextField>
              </Grid>
            )}
            <Grid item xs={6} sm={2}>
              <TextField
                select
                size="small"
                fullWidth
                label="Priority"
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value as any)}
              >
                <MenuItem value="all">All Priorities</MenuItem>
                <MenuItem value="urgent">Urgent</MenuItem>
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="low">Low</MenuItem>
              </TextField>
            </Grid>
            {showStatusFilter && (
              <Grid item xs={6} sm={2}>
                <TextField
                  select
                  size="small"
                  fullWidth
                  label="Status"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                >
                  <MenuItem value="all">All Status</MenuItem>
                  <MenuItem value="pending">Pending</MenuItem>
                  <MenuItem value="actioned">Actioned</MenuItem>
                  <MenuItem value="in_progress">In Progress</MenuItem>
                  <MenuItem value="completed">Completed</MenuItem>
                  <MenuItem value="rejected">Rejected</MenuItem>
                </TextField>
              </Grid>
            )}
            <Grid item xs={6} sm={2}>
              <TextField
                select
                size="small"
                fullWidth
                label="Sort By"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
              >
                <MenuItem value="priority">Priority</MenuItem>
                <MenuItem value="date">Date</MenuItem>
                <MenuItem value="module">Module</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </Box>

        {/* Select All */}
        {filteredItems.length > 0 && (
          <FormControlLabel
            control={
              <Checkbox
                checked={selectedItems.length === filteredItems.length}
                indeterminate={selectedItems.length > 0 && selectedItems.length < filteredItems.length}
                onChange={handleSelectAll}
              />
            }
            label={`Select all (${filteredItems.length})`}
          />
        )}

        <Divider sx={{ my: 1 }} />

        {/* Items List */}
        {filteredItems.length === 0 ? (
          <Alert severity="info">
            No action items match your filters
          </Alert>
        ) : (
          <List>
            {filteredItems.map((item, index) => (
              <React.Fragment key={item.action_id}>
                <ListItem 
                  alignItems="flex-start"
                  sx={{
                    ...(item.status === 'pending_deposit_created' && {
                      backgroundColor: 'rgba(76, 175, 80, 0.05)',
                      borderLeft: '4px solid #4caf50',
                      pl: 1.5,
                    })
                  }}
                >
                  <ListItemIcon>
                    <Checkbox
                      checked={selectedItems.includes(item.action_id)}
                      onChange={() => handleSelectItem(item.action_id)}
                    />
                  </ListItemIcon>
                  <ListItemIcon>
                    {getPriorityIcon(item.priority)}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="body1" fontWeight="medium">
                          {item.title}
                        </Typography>
                        {item.status === 'pending_deposit_created' && (
                          <Chip
                            label="ACTIONED"
                            size="small"
                            color="success"
                            variant="filled"
                            sx={{ fontWeight: 'bold' }}
                          />
                        )}
                        <Chip
                          label={item.priority.toUpperCase()}
                          size="small"
                          color={getPriorityColor(item.priority) as any}
                        />
                        <Tooltip title={item.module}>
                          {getModuleIcon(item.module)}
                        </Tooltip>
                        {getStatusIcon(item.status)}
                      </Box>
                    }
                    secondary={
                      <Box mt={0.5}>
                        <Typography variant="body2" color="text.secondary">
                          {item.description}
                        </Typography>
                        <Box display="flex" gap={2} mt={0.5}>
                          {item.bank && (
                            <Typography variant="caption" color="text.secondary">
                              Bank: {item.bank}
                            </Typography>
                          )}
                          {item.amount_affected && (
                            <Typography variant="caption" color="text.secondary">
                              Amount: {formatCurrency(item.amount_affected)}
                            </Typography>
                          )}
                          {item.expected_benefit && (
                            <Typography variant="caption" color="primary">
                              Benefit: {formatCurrency(item.expected_benefit)}/year
                            </Typography>
                          )}
                          <Typography variant="caption" color="text.secondary">
                            Timeline: {item.timeline}
                          </Typography>
                          {item.pending_deposit_id && (
                            <Typography variant="caption" sx={{ color: '#4caf50', fontWeight: 'bold' }}>
                              Pending Deposit ID: #{item.pending_deposit_id}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        setSelectedActionItem(item);
                        setDetailModalOpen(true);
                      }}
                      sx={{ mr: 1 }}
                    >
                      View Details
                    </Button>
                    <IconButton
                      edge="end"
                      aria-label="more"
                      onClick={(e) => handleMenuOpen(e, item.action_id)}
                    >
                      <MoreIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
                {index < filteredItems.length - 1 && <Divider variant="inset" component="li" />}
              </React.Fragment>
            ))}
          </List>
        )}

        {/* Action Menu */}
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
        >
          <MenuItem onClick={handleViewDetails}>
            <ViewIcon sx={{ mr: 1 }} />
            View Details
          </MenuItem>
          <MenuItem onClick={() => handleStatusChange('in_progress')}>
            Mark In Progress
          </MenuItem>
          <MenuItem onClick={() => handleStatusChange('completed')}>
            Mark Completed
          </MenuItem>
          {onReject && (
            <MenuItem onClick={() => {
              if (selectedActionId && onReject) {
                onReject(selectedActionId);
                handleMenuClose();
              }
            }}>
              Reject
            </MenuItem>
          )}
        </Menu>

        {/* Detail Modal */}
        {selectedActionItem && (
          <ActionItemDetailModal
            actionItem={selectedActionItem}
            isOpen={detailModalOpen}
            onClose={() => {
              setDetailModalOpen(false);
              setSelectedActionItem(null);
            }}
            onCreatePendingDeposit={handleCreatePendingDeposit}
          />
        )}
      </CardContent>
    </Card>
  );
};

export default ActionItemsList;