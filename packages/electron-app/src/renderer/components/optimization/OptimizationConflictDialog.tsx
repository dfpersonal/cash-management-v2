/**
 * Optimization Conflict Warning Dialog
 * Shows warning when running optimization would conflict with existing pending moves
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Alert,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  CircularProgress,
} from '@mui/material';
import {
  Warning as WarningIcon,
  TrendingUp as OptimizerIcon,
  Security as FSCSIcon,
  Person as UserIcon,
  CheckCircle as CompletedIcon,
  Schedule as PendingIcon,
} from '@mui/icons-material';

import { 
  OptimizationConflict,
  ClassifiedPendingMove,
  PendingMoveClassifier,
  PendingMoveSource 
} from '@cash-mgmt/shared';
import { PendingMoveTypes';

interface OptimizationConflictDialogProps {
  open: boolean;
  conflict: OptimizationConflict;
  onClose: () => void;
  onContinue: () => void;
  onCancel: () => void;
  isResolving?: boolean;
}

const OptimizationConflictDialog: React.FC<OptimizationConflictDialogProps> = ({
  open,
  conflict,
  onClose,
  onContinue,
  onCancel,
  isResolving = false
}) => {
  const [showDetails, setShowDetails] = useState(false);

  const getSourceIcon = (move: ClassifiedPendingMove) => {
    switch (move.source) {
      case PendingMoveSource.RATE_OPTIMIZER:
        return <OptimizerIcon sx={{ color: '#4caf50' }} />;
      case PendingMoveSource.FSCS_COMPLIANCE:
        return <FSCSIcon sx={{ color: '#f44336' }} />;
      case PendingMoveSource.USER_CREATED:
        return <UserIcon sx={{ color: '#ff9800' }} />;
      default:
        return <PendingIcon />;
    }
  };

  const renderMoveList = (moves: ClassifiedPendingMove[], title: string, subtitle?: string) => {
    if (moves.length === 0) return null;

    return (
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {subtitle}
          </Typography>
        )}
        <List dense>
          {moves.map((move, index) => (
            <ListItem key={move.id}>
              <ListItemIcon>
                {getSourceIcon(move)}
              </ListItemIcon>
              <ListItemText
                primary={PendingMoveClassifier.formatForDisplay(move)}
                secondary={
                  <Box display="flex" alignItems="center" gap={1} sx={{ mt: 0.5 }}>
                    <Chip
                      label={PendingMoveClassifier.getSourceBadge(move)}
                      size="small"
                      color={PendingMoveClassifier.getSourceBadgeColor(move)}
                      variant="outlined"
                    />
                    <Chip
                      label={move.status}
                      size="small"
                      color="default"
                      variant="outlined"
                    />
                  </Box>
                }
              />
            </ListItem>
          ))}
        </List>
      </Box>
    );
  };

  if (!conflict.hasConflicts) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <CompletedIcon sx={{ color: '#4caf50' }} />
            No Conflicts Detected
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="success">
            No optimization-generated pending moves found. Safe to proceed with optimization.
          </Alert>
          {conflict.userCreated.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary">
                You have {conflict.userCreated.length} user-created pending move(s) that will be preserved.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button 
            onClick={onContinue} 
            variant="contained" 
            color="primary"
            disabled={isResolving}
          >
            Continue Optimization
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <WarningIcon sx={{ color: '#ff9800' }} />
          Optimization Conflict Warning
        </Box>
      </DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="body1" gutterBottom>
            <strong>Re-running optimization will affect existing pending moves.</strong>
          </Typography>
          <Typography variant="body2">
            Optimization-generated pending moves may become outdated when portfolio data changes.
            These moves will be removed to prevent inconsistencies.
          </Typography>
        </Alert>

        {/* Summary */}
        <Box sx={{ mb: 3, p: 2, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
          <Typography variant="h6" gutterBottom>Impact Summary</Typography>
          
          {conflict.optimizationGenerated.length > 0 && (
            <Typography variant="body2" color="error" gutterBottom>
              • <strong>{conflict.optimizationGenerated.length} optimization-generated moves</strong> will be removed
            </Typography>
          )}
          
          {conflict.userCreated.length > 0 && (
            <Typography variant="body2" color="success.main" gutterBottom>
              • <strong>{conflict.userCreated.length} user-created moves</strong> will be preserved
            </Typography>
          )}
          
          {conflict.completed.length > 0 && (
            <Typography variant="body2" color="text.secondary" gutterBottom>
              • <strong>{conflict.completed.length} completed moves</strong> will be ignored (already in portfolio)
            </Typography>
          )}
        </Box>

        {/* Show Details Toggle */}
        <Box textAlign="center" sx={{ mb: 2 }}>
          <Button
            onClick={() => setShowDetails(!showDetails)}
            size="small"
            variant="outlined"
          >
            {showDetails ? 'Hide Details' : 'Show Details'}
          </Button>
        </Box>

        {/* Detailed Breakdown */}
        {showDetails && (
          <Box>
            <Divider sx={{ mb: 2 }} />
            
            {renderMoveList(
              conflict.optimizationGenerated,
              'Moves to be Removed',
              'These optimization-generated moves will be deleted:'
            )}
            
            {renderMoveList(
              conflict.userCreated,
              'Moves to be Preserved',
              'These user-created moves will remain unchanged:'
            )}
            
            {renderMoveList(
              conflict.completed,
              'Completed Moves (Ignored)',
              'These moves are already completed and reflected in your portfolio:'
            )}
          </Box>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onCancel} disabled={isResolving}>
          Cancel
        </Button>
        <Button 
          onClick={onClose} 
          variant="outlined"
          disabled={isResolving}
        >
          Review Pending Moves First
        </Button>
        <Button 
          onClick={onContinue} 
          variant="contained" 
          color="warning"
          disabled={isResolving}
          startIcon={isResolving ? <CircularProgress size={16} /> : undefined}
        >
          {isResolving ? 'Resolving...' : 'Continue & Update Recommendations'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default OptimizationConflictDialog;