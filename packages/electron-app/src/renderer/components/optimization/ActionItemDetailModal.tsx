import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Card,
  CardContent,
  Grid,
  Chip,
  Checkbox,
  FormControlLabel,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  Alert,
  Divider,
  IconButton,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  CheckCircle as CheckCircleIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { ActionItem } from '../../types/actionItem';

interface ActionItemDetailModalProps {
  actionItem: ActionItem;
  isOpen: boolean;
  onClose: () => void;
  onCreatePendingDeposit?: (recommendation: any) => void;
}

interface RecommendationData {
  id: string;
  sourceBank: string;
  targetBank: string;
  amount: number;
  currentRate: number;
  targetRate: number;
  rateImprovement: number;
  annualBenefit: number;
  platform: string;
  institutionFRN: string;
  reason: string;
  confidence: number;
  compliance: any;
  implementationNotes: string[];
  displayMode: string;
}

export const ActionItemDetailModal: React.FC<ActionItemDetailModalProps> = ({
  actionItem,
  isOpen,
  onClose,
  onCreatePendingDeposit
}) => {
  const [selectedRecommendations, setSelectedRecommendations] = useState<Set<string>>(new Set());
  const [showCreateDeposits, setShowCreateDeposits] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!isOpen) return null;
  
  // Defensive check: if actionItem is null or undefined, show error
  if (!actionItem) {
    return (
      <Dialog open={isOpen} onClose={onClose} fullWidth maxWidth="md">
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h5">Action Item Error</Typography>
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="error">
            Action item data is not available. Please try refreshing the page or running optimization again.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} color="primary">Close</Button>
        </DialogActions>
      </Dialog>
    );
  }

  // Parse recommendations from source_data, handling both parsed objects and JSON strings
  let recommendations: RecommendationData[] = [];
  
  try {
    console.log('ActionItem data:', actionItem);
    console.log('Source data:', actionItem.source_data);
    
    if (!actionItem.source_data) {
      console.warn('No source_data found in action item');
      recommendations = [];
    } else {
      // First, parse the source_data if it's a string
      let parsedSourceData = actionItem.source_data;
      if (typeof actionItem.source_data === 'string') {
        parsedSourceData = JSON.parse(actionItem.source_data);
        console.log('Parsed source_data from string:', parsedSourceData);
      }
      
      const sourceRecommendations = parsedSourceData?.recommendations;
      console.log('Source recommendations type:', typeof sourceRecommendations);
      console.log('Source recommendations value:', sourceRecommendations);
      
      if (Array.isArray(sourceRecommendations)) {
        recommendations = sourceRecommendations;
        console.log('Using array directly:', recommendations.length, 'recommendations');
      } else if (typeof sourceRecommendations === 'string') {
        recommendations = JSON.parse(sourceRecommendations);
        console.log('Parsed recommendations from string:', recommendations.length, 'recommendations');
      } else if (sourceRecommendations) {
        // Try to handle other formats
        recommendations = [sourceRecommendations];
        console.log('Wrapped single item:', recommendations.length, 'recommendations');
      } else {
        console.warn('No recommendations found in source data');
        recommendations = [];
      }
    }
  } catch (parseError) {
    console.error('Failed to parse recommendations data:', parseError);
    console.error('ActionItem source_data:', actionItem.source_data);
    const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown error';
    setError(`Failed to parse recommendation data: ${errorMessage}`);
    recommendations = [];
  }

  // Safety check - if we have an error or no recommendations, show error state
  if (error || recommendations.length === 0) {
    return (
      <Dialog
        open={isOpen}
        onClose={onClose}
        fullWidth
        maxWidth="md"
        PaperProps={{
          sx: { minHeight: '400px' }
        }}
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h5" component="h2">
              Action Item Details - Error
            </Typography>
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              Unable to Display Details
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              {error || 'No recommendation data found for this action item.'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              This may be due to corrupted data or a system error. Try running optimization again.
            </Typography>
          </Alert>
          
          {/* Debug information */}
          <Typography variant="caption" color="text.secondary">
            Action ID: {actionItem.action_id}<br/>
            Source Data Type: {typeof actionItem.source_data}<br/>
            Source Data Preview: {JSON.stringify(actionItem.source_data).substring(0, 100)}...
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    );
  }
  
  const handleRecommendationSelect = (recId: string, selected: boolean) => {
    const newSelection = new Set(selectedRecommendations);
    if (selected) {
      newSelection.add(recId);
    } else {
      newSelection.delete(recId);
    }
    setSelectedRecommendations(newSelection);
  };

  const handleCreateSelectedDeposits = () => {
    const selectedRecs = recommendations.filter(rec => selectedRecommendations.has(rec.id));
    selectedRecs.forEach(rec => {
      if (onCreatePendingDeposit) {
        onCreatePendingDeposit(rec);
      }
    });
    setShowCreateDeposits(false);
    setSelectedRecommendations(new Set());
    onClose();
  };

  const formatCurrency = (amount?: number) => {
    if (typeof amount !== 'number' || isNaN(amount)) return '£0';
    return `£${amount.toLocaleString()}`;
  };
  
  const formatPercentage = (rate?: number) => {
    if (typeof rate !== 'number' || isNaN(rate)) return '0.00%';
    return `${rate.toFixed(2)}%`;
  };

  // Add debugging log for recommendations count
  console.log(`ActionItemDetailModal: Processing ${recommendations.length} recommendations`);

  // Add safety check for too many recommendations to prevent crashes
  if (recommendations.length > 10) {
    console.warn(`Too many recommendations (${recommendations.length}), limiting to first 10`);
    recommendations = recommendations.slice(0, 10);
  }

  // Add memory usage check
  const dataSize = JSON.stringify(recommendations).length;
  console.log(`ActionItemDetailModal: Data size ${dataSize} bytes`);
  if (dataSize > 100000) { // 100KB limit
    console.error(`Data size too large (${dataSize} bytes), showing error instead`);
    setError(`Too much data to display safely (${recommendations.length} recommendations, ${Math.round(dataSize/1024)}KB)`);
    recommendations = [];
  }

  // If there's an error, show error dialog
  if (error) {
    return (
      <Dialog open={isOpen} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Error Loading Action Item Details</DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="body2">{error}</Typography>
          </Alert>
          <Typography variant="body2" color="text.secondary">
            Please check the console for more details or try refreshing the application.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>
    );
  }

  // Wrap the main content in try-catch
  try {
    return (
    <Dialog 
      open={isOpen} 
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: { maxHeight: '90vh' }
      }}
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h5" component="h2">
            {actionItem.title}
          </Typography>
        </Box>
      </DialogTitle>
      <DialogContent dividers>

        {/* Summary Section */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" color="primary" gutterBottom>
              Action Summary
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {actionItem.description}
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6} md={3}>
                <Typography variant="caption" color="primary">Total Amount:</Typography>
                <Typography variant="body2" fontWeight="medium">
                  {formatCurrency(actionItem.amount_affected)}
                </Typography>
              </Grid>
              <Grid item xs={6} md={3}>
                <Typography variant="caption" color="primary">Annual Benefit:</Typography>
                <Typography variant="body2" fontWeight="medium">
                  {formatCurrency(actionItem.expected_benefit)}
                </Typography>
              </Grid>
              <Grid item xs={6} md={3}>
                <Typography variant="caption" color="primary">Priority:</Typography>
                <Typography variant="body2" fontWeight="medium">
                  {actionItem.priority}
                </Typography>
              </Grid>
              <Grid item xs={6} md={3}>
                <Typography variant="caption" color="primary">Timeline:</Typography>
                <Typography variant="body2" fontWeight="medium">
                  {actionItem.timeline}
                </Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Recommendations Detail */}
        <Box sx={{ mb: 3 }}>
          {/* Header with Statistics */}
          <Box sx={{ mb: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="h6">
                Transfer Recommendations ({recommendations.length})
              </Typography>
              {recommendations.length > 0 && (
                <Button
                  variant="contained"
                  color="success"
                  onClick={() => setShowCreateDeposits(!showCreateDeposits)}
                >
                  {showCreateDeposits ? 'Cancel Selection' : 'Create Pending Deposits'}
                </Button>
              )}
            </Box>

            {/* Quick Stats */}
            {recommendations.length > 1 && (
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6} md={3}>
                  <Card sx={{ textAlign: 'center', bgcolor: 'primary.50' }}>
                    <CardContent sx={{ py: 2 }}>
                      <Typography variant="h6" color="primary.main" fontWeight="bold">
                        {formatCurrency(recommendations.reduce((sum, r) => sum + (r.amount || 0), 0))}
                      </Typography>
                      <Typography variant="caption" color="primary.dark">Total Amount</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Card sx={{ textAlign: 'center', bgcolor: 'success.50' }}>
                    <CardContent sx={{ py: 2 }}>
                      <Typography variant="h6" color="success.main" fontWeight="bold">
                        {formatCurrency(recommendations.reduce((sum, r) => sum + (r.annualBenefit || 0), 0))}
                      </Typography>
                      <Typography variant="caption" color="success.dark">Total Annual Benefit</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Card sx={{ textAlign: 'center', bgcolor: 'secondary.50' }}>
                    <CardContent sx={{ py: 2 }}>
                      <Typography variant="h6" color="secondary.main" fontWeight="bold">
                        {formatPercentage(recommendations.reduce((sum, r) => sum + (r.rateImprovement || 0), 0) / recommendations.length)}
                      </Typography>
                      <Typography variant="caption" color="secondary.dark">Avg. Improvement</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Card sx={{ textAlign: 'center', bgcolor: 'warning.50' }}>
                    <CardContent sx={{ py: 2 }}>
                      <Typography variant="h6" color="warning.main" fontWeight="bold">
                        {new Set(recommendations.map(r => r.targetBank || 'Unknown')).size}
                      </Typography>
                      <Typography variant="caption" color="warning.dark">Target Banks</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            )}
          </Box>

          {showCreateDeposits && (
            <Alert 
              severity="success" 
              sx={{ mb: 2 }}
              action={
                <Box>
                  <Button
                    onClick={() => {
                      if (recommendations[currentIndex]) {
                        const currentRec = recommendations[currentIndex];
                        if (onCreatePendingDeposit) {
                          onCreatePendingDeposit(currentRec);
                        }
                      }
                      setShowCreateDeposits(false);
                    }}
                    variant="contained"
                    size="small"
                    color="success"
                    sx={{ mr: 1 }}
                  >
                    Create Current
                  </Button>
                  <Button
                    onClick={handleCreateSelectedDeposits}
                    disabled={selectedRecommendations.size === 0}
                    variant="outlined"
                    size="small"
                    color="success"
                  >
                    Create Selected ({selectedRecommendations.size})
                  </Button>
                </Box>
              }
            >
              <Typography variant="body2" fontWeight="medium">Create Pending Deposits</Typography>
              <Typography variant="body2">
                Create pending deposit for the current recommendation or select multiple and create batch.
              </Typography>
            </Alert>
          )}

          {/* Single Recommendation Navigation */}
          {recommendations.length > 1 && (
            <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Button 
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex(currentIndex - 1)}
                variant="outlined"
                size="small"
              >
                Previous
              </Button>
              <Typography variant="h6" sx={{ fontWeight: 'medium' }}>
                Recommendation {currentIndex + 1} of {recommendations.length}
              </Typography>
              <Button 
                disabled={currentIndex >= recommendations.length - 1}
                onClick={() => setCurrentIndex(currentIndex + 1)}
                variant="outlined"
                size="small"
              >
                Next
              </Button>
            </Box>
          )}

          {/* Single Recommendation Display */}
          <Grid container spacing={2}>
            {recommendations.length > 0 && recommendations[currentIndex] && (() => {
              const rec = recommendations[currentIndex];
              // Add safety checks for recommendation data
              const annualBenefit = rec.annualBenefit || 0;
              const benefitLevel = annualBenefit > 500 ? 'high' : annualBenefit > 200 ? 'medium' : 'low';
              const getBenefitColor = () => {
                switch (benefitLevel) {
                  case 'high': return 'success';
                  case 'medium': return 'primary';
                  case 'low': return 'default';
                  default: return 'default';
                }
              };
              const color = getBenefitColor();
              
              return (
                <Grid item xs={12} key={rec.id || Math.random().toString()}>
                  <Card 
                    variant="outlined"
                    sx={{ 
                      borderColor: `${color}.200`,
                      bgcolor: `${color}.50`,
                      '&:hover': { boxShadow: 2 }
                    }}
                  >
                    <CardContent>
                      {/* Selection Checkbox */}
                      {showCreateDeposits && (
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={selectedRecommendations.has(rec.id || '')}
                              onChange={(e) => handleRecommendationSelect(rec.id || '', e.target.checked)}
                              color="success"
                            />
                          }
                          label="Select for pending deposit"
                          sx={{ mb: 1 }}
                        />
                      )}
                      
                      {/* Header */}
                      <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                        <Box display="flex" alignItems="center" gap={1}>
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              bgcolor: 'primary.main'
                            }}
                          />
                          <Typography variant="body2" fontWeight="medium">
                            {rec.sourceBank || 'Unknown'} → {rec.targetBank || 'Unknown'}
                          </Typography>
                        </Box>
                        <Chip
                          label={
                            benefitLevel === 'high' ? 'High Benefit' : 
                            benefitLevel === 'medium' ? 'Good Benefit' : 
                            'Low Benefit'
                          }
                          size="small"
                          color={color as any}
                          variant="filled"
                        />
                      </Box>

                      {/* Key Metrics */}
                      <Grid container spacing={1} sx={{ mb: 2 }}>
                        <Grid item xs={6}>
                          <Card sx={{ textAlign: 'center', p: 1, bgcolor: 'background.paper' }}>
                            <Typography variant="body2" fontWeight="bold">
                              {formatCurrency(rec.amount)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Transfer Amount
                            </Typography>
                          </Card>
                        </Grid>
                        <Grid item xs={6}>
                          <Card sx={{ textAlign: 'center', p: 1, bgcolor: 'background.paper' }}>
                            <Typography variant="body2" fontWeight="bold" color="success.main">
                              {formatCurrency(annualBenefit)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Annual Benefit
                            </Typography>
                          </Card>
                        </Grid>
                      </Grid>

                      {/* Rate Improvement */}
                      <Box sx={{ mb: 2 }}>
                        <Box display="flex" justifyContent="space-between" sx={{ mb: 0.5 }}>
                          <Typography variant="caption">
                            Rate: {formatPercentage(rec.currentRate)} → {formatPercentage(rec.targetRate)}
                          </Typography>
                          <Typography variant="caption" color="success.main" fontWeight="medium">
                            +{formatPercentage(rec.rateImprovement)}
                          </Typography>
                        </Box>
                        <LinearProgress 
                          variant="determinate" 
                          value={Math.min((rec.rateImprovement || 0) * 20, 100)}
                          sx={{ height: 6, borderRadius: 3 }}
                        />
                      </Box>

                      {/* Platform & Compliance */}
                      <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                        <Box display="flex" gap={1}>
                          <Chip label={rec.platform || 'Unknown'} size="small" variant="outlined" />
                          {rec.compliance?.resultingStatus === 'COMPLIANT' && (
                            <Chip 
                              label="FSCS Compliant" 
                              size="small" 
                              color="success" 
                              icon={<CheckCircleIcon />}
                            />
                          )}
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {rec.confidence || 0}% confidence
                        </Typography>
                      </Box>

                      {/* Additional Details */}
                      <Accordion sx={{ mt: 1 }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Typography variant="caption">Show details...</Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                          <List dense>
                            {rec.institutionFRN && (
                              <ListItem>
                                <ListItemText 
                                  primary="Institution FRN"
                                  secondary={rec.institutionFRN}
                                />
                              </ListItem>
                            )}
                            {rec.reason && (
                              <ListItem>
                                <ListItemText 
                                  primary="Reason"
                                  secondary={rec.reason}
                                />
                              </ListItem>
                            )}
                            {rec.implementationNotes && rec.implementationNotes.length > 0 && (
                              <ListItem>
                                <ListItemText 
                                  primary="Implementation Notes"
                                  secondary={
                                    <List component="div" disablePadding>
                                      {rec.implementationNotes.map((note, idx) => (
                                        <ListItem key={idx} sx={{ pl: 2 }}>
                                          <Typography variant="body2">• {note}</Typography>
                                        </ListItem>
                                      ))}
                                    </List>
                                  }
                                />
                              </ListItem>
                            )}
                          </List>
                        </AccordionDetails>
                      </Accordion>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })()}
          </Grid>
        </Box>

      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
  } catch (renderError) {
    console.error('Render error in ActionItemDetailModal:', renderError);
    const errorMessage = renderError instanceof Error ? renderError.message : 'Unknown rendering error';
    return (
      <Dialog open={isOpen} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Rendering Error</DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="body2">Failed to render action item details: {errorMessage}</Typography>
          </Alert>
          <Typography variant="body2" color="text.secondary">
            Please check the browser console for more details.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>
    );
  }
};