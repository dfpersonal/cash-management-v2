import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Stack,
  Chip,
} from '@mui/material';
import { DataGrid, GridColDef, GridRowsProp, GridRenderCellParams } from '@mui/x-data-grid';
import {
  Close as CloseIcon,
  AccountBalance as TransactionsIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { PortfolioHolding, AppState, Deposit } from '@cash-mgmt/shared';
import { Transaction, TransactionForm, InterestConfiguration } from '@cash-mgmt/shared';
import { TransactionList } from '../components/transactions/TransactionList';
import { TransactionEntry } from '../components/transactions/TransactionEntry';
import { InterestConfiguration as InterestConfigurationComponent } from '../components/transactions/InterestConfiguration';

interface HoldingsProps {
  appState: AppState;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

export const Holdings: React.FC<HoldingsProps> = ({ appState }) => {
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Account detail dialog state
  const [selectedAccount, setSelectedAccount] = useState<Deposit | null>(null);
  const [accountDetailOpen, setAccountDetailOpen] = useState(false);
  const [accountDetailTab, setAccountDetailTab] = useState(0);
  
  // Transaction entry dialog state
  const [transactionEntryOpen, setTransactionEntryOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Load portfolio holdings
        const holdingsData = await window.electronAPI.getPortfolioHoldings();
        setHoldings(holdingsData);
        
        // Load full deposit details for transactions
        const depositsData = await window.electronAPI.getAllDeposits();
        setDeposits(depositsData);
      } catch (err) {
        console.error('Failed to load data:', err);
        setError('Failed to load portfolio data.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [appState.lastRefresh]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  // Open account detail dialog
  const handleOpenAccountDetail = (accountId: number) => {
    const account = deposits.find(d => d.id === accountId);
    if (account) {
      setSelectedAccount(account);
      setAccountDetailOpen(true);
      setAccountDetailTab(0);
    }
  };

  // Handle transaction save
  const handleSaveTransaction = async (transaction: TransactionForm) => {
    try {
      if (editingTransaction && editingTransaction.id !== undefined) {
        await window.electronAPI.updateTransaction(editingTransaction.id, transaction);
      } else {
        await window.electronAPI.createTransaction(transaction);
      }
      
      // Refresh transactions (will be handled by TransactionList component)
      setTransactionEntryOpen(false);
      setEditingTransaction(null);
    } catch (err: any) {
      throw new Error(err.message || 'Failed to save transaction');
    }
  };

  // Handle interest configuration save
  const handleSaveInterestConfig = async (config: InterestConfiguration) => {
    if (!selectedAccount || selectedAccount.id === undefined) return;
    
    try {
      await window.electronAPI.updateInterestConfiguration(selectedAccount.id, config);
      
      // Refresh account data
      const updatedDeposits = await window.electronAPI.getAllDeposits();
      setDeposits(updatedDeposits);
      
      // Update selected account
      const updatedAccount = updatedDeposits.find((d: Deposit) => d.id === selectedAccount.id);
      if (updatedAccount) {
        setSelectedAccount(updatedAccount);
      }
    } catch (err: any) {
      throw new Error(err.message || 'Failed to save interest configuration');
    }
  };

  const columns: GridColDef[] = [
    { field: 'bank', headerName: 'Bank', width: 150 },
    { field: 'accountType', headerName: 'Account Type', width: 150 },
    { 
      field: 'balance', 
      headerName: 'Balance', 
      width: 120,
      valueFormatter: (value) => formatCurrency(value),
    },
    { 
      field: 'rate', 
      headerName: 'Rate', 
      width: 80,
      valueFormatter: (value) => formatPercentage(value),
    },
    { field: 'platform', headerName: 'Platform', width: 120 },
    { field: 'liquidityTier', headerName: 'Tier', width: 80 },
    { 
      field: 'maturityDate', 
      headerName: 'Maturity', 
      width: 120,
      valueFormatter: (value) => value ? new Date(value).toLocaleDateString() : 'N/A',
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 150,
      renderCell: (params: GridRenderCellParams) => (
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            startIcon={<TransactionsIcon />}
            onClick={() => {
              // Find the deposit that matches this holding
              const holding = holdings[params.row.id];
              const deposit = deposits.find(d => 
                d.bank === holding.bank && 
                d.balance === holding.balance &&
                d.aer === holding.rate
              );
              if (deposit?.id) {
                handleOpenAccountDetail(deposit.id);
              }
            }}
          >
            Transactions
          </Button>
        </Stack>
      ),
    },
  ];

  const rows: GridRowsProp = holdings.map((holding, index) => ({
    id: index,
    ...holding,
  }));

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="400px">
        <CircularProgress size={60} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 3 }}>
        {error}
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Portfolio Holdings
      </Typography>
      
      <Card>
        <CardContent>
          <Box sx={{ height: 600, width: '100%' }}>
            <DataGrid
              rows={rows}
              columns={columns}
              initialState={{
                pagination: {
                  paginationModel: {
                    pageSize: 25,
                  },
                },
              }}
              pageSizeOptions={[25, 50, 100]}
              disableRowSelectionOnClick
            />
          </Box>
        </CardContent>
      </Card>

      {/* Account Detail Dialog */}
      <Dialog
        open={accountDetailOpen}
        onClose={() => setAccountDetailOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">
              {selectedAccount?.bank} - {selectedAccount?.account_name || selectedAccount?.type}
            </Typography>
            <IconButton onClick={() => setAccountDetailOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Stack>
        </DialogTitle>
        
        <DialogContent>
          {selectedAccount && (
            <>
              <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs value={accountDetailTab} onChange={(_, newValue) => setAccountDetailTab(newValue)}>
                  <Tab label="Account Info" />
                  <Tab label="Transactions" />
                  <Tab label="Interest Configuration" />
                </Tabs>
              </Box>

              <TabPanel value={accountDetailTab} index={0}>
                <Stack spacing={2}>
                  <Typography variant="subtitle1">Account Details</Typography>
                  
                  <Box display="grid" gridTemplateColumns="repeat(2, 1fr)" gap={2}>
                    <Box>
                      <Typography variant="body2" color="textSecondary">Bank</Typography>
                      <Typography variant="body1">{selectedAccount.bank}</Typography>
                    </Box>
                    
                    <Box>
                      <Typography variant="body2" color="textSecondary">Account Type</Typography>
                      <Typography variant="body1">{selectedAccount.type} - {selectedAccount.sub_type}</Typography>
                    </Box>
                    
                    <Box>
                      <Typography variant="body2" color="textSecondary">Current Balance</Typography>
                      <Typography variant="body1">{formatCurrency(selectedAccount.balance || 0)}</Typography>
                    </Box>
                    
                    <Box>
                      <Typography variant="body2" color="textSecondary">Interest Rate</Typography>
                      <Typography variant="body1">{selectedAccount.aer}% AER</Typography>
                    </Box>
                    
                    {selectedAccount.term_months && (
                      <Box>
                        <Typography variant="body2" color="textSecondary">Term</Typography>
                        <Typography variant="body1">{selectedAccount.term_months} months</Typography>
                      </Box>
                    )}
                    
                    {selectedAccount.term_ends && (
                      <Box>
                        <Typography variant="body2" color="textSecondary">Term Ends</Typography>
                        <Typography variant="body1">
                          {new Date(selectedAccount.term_ends).toLocaleDateString('en-GB')}
                        </Typography>
                      </Box>
                    )}
                    
                    {selectedAccount.notice_period_days && (
                      <Box>
                        <Typography variant="body2" color="textSecondary">Notice Period</Typography>
                        <Typography variant="body1">{selectedAccount.notice_period_days} days</Typography>
                      </Box>
                    )}
                    
                    <Box>
                      <Typography variant="body2" color="textSecondary">Platform</Typography>
                      <Typography variant="body1">{selectedAccount.platform}</Typography>
                    </Box>
                    
                    <Box>
                      <Typography variant="body2" color="textSecondary">Liquidity Tier</Typography>
                      <Chip 
                        label={`Tier ${selectedAccount.liquidity_tier}`}
                        size="small"
                        color={selectedAccount.liquidity_tier === '1' ? 'success' : 
                               selectedAccount.liquidity_tier === '2' ? 'warning' : 'default'}
                      />
                    </Box>
                  </Box>

                  {selectedAccount.notes && (
                    <Box>
                      <Typography variant="body2" color="textSecondary">Notes</Typography>
                      <Typography variant="body1">{selectedAccount.notes}</Typography>
                    </Box>
                  )}
                </Stack>
              </TabPanel>

              <TabPanel value={accountDetailTab} index={1}>
                {selectedAccount.id !== undefined && (
                  <TransactionList
                    accountId={selectedAccount.id}
                    accountName={selectedAccount.account_name || selectedAccount.type}
                    bankName={selectedAccount.bank}
                    onAddTransaction={() => {
                      setEditingTransaction(null);
                      setTransactionEntryOpen(true);
                    }}
                    onEditTransaction={(transaction) => {
                      setEditingTransaction(transaction);
                      setTransactionEntryOpen(true);
                    }}
                  />
                )}
              </TabPanel>

              <TabPanel value={accountDetailTab} index={2}>
                <InterestConfigurationComponent
                  account={selectedAccount as any}
                  onSave={handleSaveInterestConfig}
                  allAccounts={deposits}
                />
              </TabPanel>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Transaction Entry Dialog */}
      {selectedAccount && selectedAccount.id !== undefined && (
        <TransactionEntry
          open={transactionEntryOpen}
          onClose={() => {
            setTransactionEntryOpen(false);
            setEditingTransaction(null);
          }}
          onSave={handleSaveTransaction}
          transaction={editingTransaction}
          accountId={selectedAccount.id}
          currentBalance={selectedAccount.balance || 0}
        />
      )}
    </Box>
  );
};