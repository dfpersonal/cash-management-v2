import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stepper,
  Step,
  StepLabel,
  Box,
  Typography,
  TextField,
  Alert,
  Divider,
  CircularProgress,
  Chip
} from '@mui/material';
import { format } from 'date-fns';
import { Deposit } from '@cash-mgmt/shared';
import { PortfolioTypes';
import { ReconciliationSession } from '@cash-mgmt/shared';
import { TransactionTypes';
import { TransactionMatching } from './TransactionMatching';
import { StatementEntry, StatementTransaction } from './StatementEntry';

interface ReconciliationWizardState {
  currentSession?: ReconciliationSession;
  lastReconciliation?: any;
  unreconciledTransactions?: any[];
}

interface ReconciliationWizardProps {
  open: boolean;
  onClose: () => void;
  account: Deposit;
  onComplete?: () => void;
  refreshTrigger?: number;
}

const steps = ['Statement Details', 'Match Transactions', 'Add Missing', 'Review & Complete'];

export const ReconciliationWizard: React.FC<ReconciliationWizardProps> = ({
  open,
  onClose,
  account,
  onComplete,
  refreshTrigger
}) => {
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wizardState, setWizardState] = useState<ReconciliationWizardState | null>(null);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  
  // Step 1: Statement details
  const [statementDate, setStatementDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [statementBalance, setStatementBalance] = useState('');
  
  // Load wizard state when opening or when refresh trigger changes
  useEffect(() => {
    if (open && account) {
      loadWizardState();
    }
  }, [open, account, refreshTrigger]);

  const loadWizardState = async () => {
    setLoading(true);
    setError(null);
    try {
      const state = await window.electronAPI.getReconciliationWizardState(account.id!);
      setWizardState(state);
      
      // Load last reconciliation info
      if (state.lastReconciliation) {
        // Set default statement date to today
        setStatementDate(format(new Date(), 'yyyy-MM-dd'));
      }
    } catch (err) {
      setError('Failed to load reconciliation state');
      console.error('Error loading wizard state:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartReconciliation = async () => {
    if (!statementBalance || parseFloat(statementBalance) < 0) {
      setError('Please enter a valid statement balance');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const sessionId = await window.electronAPI.startReconciliation(
        account.id!,
        statementDate,
        parseFloat(statementBalance)
      );
      
      // Reload wizard state with new session
      await loadWizardState();
      setActiveStep(1);
    } catch (err) {
      setError('Failed to start reconciliation session');
      console.error('Error starting reconciliation:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkReconciled = async (transactionIds: number[]) => {
    if (!wizardState?.currentSession) return;

    setLoading(true);
    setError(null);
    try {
      if (wizardState?.currentSession?.id) {
        await window.electronAPI.reconcileTransactions(
          wizardState.currentSession.id,
          transactionIds
        );
      }
      
      // Reload wizard state
      await loadWizardState();
    } catch (err) {
      setError('Failed to mark transactions as reconciled');
      console.error('Error marking reconciled:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteReconciliation = async () => {
    if (!wizardState?.currentSession) return;

    setLoading(true);
    setError(null);
    try {
      if (wizardState?.currentSession?.id) {
        await window.electronAPI.completeReconciliation(wizardState.currentSession.id);
      }
      
      if (onComplete) {
        onComplete();
      }
      
      handleClose();
    } catch (err) {
      setError('Failed to complete reconciliation');
      console.error('Error completing reconciliation:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setActiveStep(0);
    setStatementDate(format(new Date(), 'yyyy-MM-dd'));
    setStatementBalance('');
    setWizardState(null);
    setError(null);
    onClose();
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP'
    }).format(amount);
  };

  const formatDate = (date: string | Date): string => {
    if (!date) return '';
    return format(new Date(date), 'dd/MM/yyyy');
  };

  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        // Step 1: Statement Details
        return (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body1" gutterBottom>
              Enter your bank statement details for reconciliation
            </Typography>
            
            {wizardState?.lastReconciliation && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Last reconciliation: {formatDate(wizardState.lastReconciliation.statement_date)} 
                {' '}(Balance: {formatCurrency(wizardState.lastReconciliation.statement_balance)})
              </Alert>
            )}
            
            <TextField
              label="Statement Date"
              type="date"
              value={statementDate}
              onChange={(e) => setStatementDate(e.target.value)}
              fullWidth
              margin="normal"
              InputLabelProps={{ shrink: true }}
            />
            
            <TextField
              label="Statement Balance"
              type="number"
              value={statementBalance}
              onChange={(e) => setStatementBalance(e.target.value)}
              fullWidth
              margin="normal"
              inputProps={{ step: 0.01, min: 0 }}
              InputProps={{
                startAdornment: <Typography sx={{ mr: 0.5 }}>£</Typography>
              }}
            />
            
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Current System Balance: {formatCurrency(account.balance || 0)}
              </Typography>
              {statementBalance && (
                <Typography 
                  variant="body2" 
                  color={Math.abs((account.balance || 0) - parseFloat(statementBalance)) < 0.01 ? 'success.main' : 'warning.main'}
                >
                  Difference: {formatCurrency(Math.abs((account.balance || 0) - parseFloat(statementBalance)))}
                </Typography>
              )}
            </Box>
          </Box>
        );

      case 1:
        // Step 2: Match Transactions
        return (
          <Box sx={{ mt: 2 }}>
            {wizardState?.currentSession ? (
              <TransactionMatching
                accountId={account.id || 0}
                sessionId={wizardState.currentSession?.id || 0}
                statementBalance={wizardState.currentSession.statement_balance}
                onTransactionsReconciled={async () => {
                  await loadWizardState();
                }}
                onTransactionAdded={async () => {
                  await loadWizardState();
                }}
              />
            ) : (
              <Alert severity="error">
                No active reconciliation session. Please go back and start a new session.
              </Alert>
            )}
          </Box>
        );

      case 2:
        // Step 3: Add Missing Transactions
        return (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body1" gutterBottom>
              Add any transactions that are on your statement but missing from the system
            </Typography>
            
            <Box sx={{ mt: 3, textAlign: 'center' }}>
              <Button
                variant="outlined"
                size="large"
                onClick={() => setShowAddTransaction(true)}
                sx={{ py: 2, px: 4 }}
              >
                Add Missing Transaction
              </Button>
            </Box>
            
            {wizardState?.currentSession && (
              <Box sx={{ mt: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Current Status
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">Statement Balance:</Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {formatCurrency(wizardState.currentSession.statement_balance)}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">Calculated Balance:</Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {formatCurrency(wizardState.currentSession.calculated_balance || account.balance || 0)}
                  </Typography>
                </Box>
                <Divider sx={{ my: 1 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2">Discrepancy:</Typography>
                  <Chip
                    label={formatCurrency(Math.abs(wizardState.currentSession.discrepancy || 0))}
                    color={Math.abs(wizardState.currentSession.discrepancy || 0) < 0.01 ? 'success' : 'warning'}
                    size="small"
                  />
                </Box>
              </Box>
            )}
            
            {wizardState?.currentSession?.discrepancy && Math.abs(wizardState.currentSession.discrepancy) > 0.01 ? (
              <Alert severity="warning" sx={{ mt: 2 }}>
                There is still a discrepancy of {formatCurrency(Math.abs(wizardState.currentSession.discrepancy))}.
                Please add any missing transactions or verify your statement balance.
              </Alert>
            ) : (
              <Alert severity="success" sx={{ mt: 2 }}>
                Reconciliation is balanced! You can proceed to complete the reconciliation.
              </Alert>
            )}
            
            <StatementEntry
              open={showAddTransaction}
              onClose={() => setShowAddTransaction(false)}
              accountId={account.id!}
              onSave={async (transaction) => {
                setLoading(true);
                try {
                  await window.electronAPI.createTransaction({
                    account_id: account.id!,
                    transaction_date: format(new Date(), 'yyyy-MM-dd'),
                    bank_date: transaction.bank_date,
                    transaction_type: transaction.transaction_type,
                    debit: transaction.debit,
                    credit: transaction.credit,
                    reference: transaction.reference,
                    optional_notes: transaction.notes,
                    source: 'manual'
                  });
                  
                  // Reload wizard state to update balances
                  await loadWizardState();
                  setShowAddTransaction(false);
                } catch (err) {
                  setError('Failed to add transaction');
                  console.error('Error adding transaction:', err);
                } finally {
                  setLoading(false);
                }
              }}
            />
          </Box>
        );

      case 3:
        // Step 4: Review & Complete
        return (
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6" gutterBottom>
              Reconciliation Summary
            </Typography>
            
            {wizardState?.currentSession && (
              <Box sx={{ mt: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography>Statement Date:</Typography>
                  <Typography fontWeight="bold">
                    {formatDate(wizardState.currentSession.statement_date)}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography>Statement Balance:</Typography>
                  <Typography fontWeight="bold">
                    {formatCurrency(wizardState.currentSession.statement_balance)}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography>System Balance:</Typography>
                  <Typography fontWeight="bold">
                    {formatCurrency(wizardState.currentSession.calculated_balance || account.balance || 0)}
                  </Typography>
                </Box>
                <Divider sx={{ my: 2 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                  <Typography>Final Discrepancy:</Typography>
                  <Chip
                    label={formatCurrency(Math.abs(wizardState.currentSession.discrepancy || 0))}
                    color={Math.abs(wizardState.currentSession.discrepancy || 0) < 0.01 ? 'success' : 'error'}
                    size="small"
                  />
                </Box>
                
                {Math.abs(wizardState.currentSession.discrepancy || 0) < 0.01 ? (
                  <Alert severity="success">
                    Reconciliation balanced! You can now complete the reconciliation.
                  </Alert>
                ) : (
                  <Alert severity="warning">
                    There is still a discrepancy. You may want to review your transactions before completing.
                  </Alert>
                )}
              </Box>
            )}
          </Box>
        );

      default:
        return null;
    }
  };

  const canProceed = () => {
    switch (activeStep) {
      case 0:
        return statementBalance && parseFloat(statementBalance) >= 0;
      case 1:
      case 2:
        return true; // Allow proceeding even with discrepancies
      case 3:
        return wizardState?.currentSession !== null;
      default:
        return false;
    }
  };

  const handleNext = async () => {
    if (activeStep === 0) {
      await handleStartReconciliation();
    } else if (activeStep === steps.length - 1) {
      await handleCompleteReconciliation();
    } else {
      setActiveStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        Reconcile {account?.bank} - {account?.account_name || account?.type}
      </DialogTitle>
      
      <DialogContent>
        <Stepper activeStep={activeStep} sx={{ pt: 2, pb: 3 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
        
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          renderStepContent()
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Box sx={{ flex: '1 1 auto' }} />
        <Button
          disabled={activeStep === 0 || loading}
          onClick={handleBack}
        >
          Back
        </Button>
        <Button
          variant="contained"
          onClick={handleNext}
          disabled={!canProceed() || loading}
        >
          {activeStep === steps.length - 1 ? 'Complete' : 'Next'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};