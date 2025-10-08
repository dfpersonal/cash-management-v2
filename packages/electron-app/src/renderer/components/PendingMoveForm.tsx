import React from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Grid,
  FormHelperText,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  RadioGroup,
  Radio,
  Paper,
  Autocomplete,
  CircularProgress,
  Switch,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  SwapHoriz as SwapIcon,
  AccountBalance as AccountIcon,
  Security as SecurityIcon,
  TrendingUp as ExternalIcon,
  CompareArrows as TransferIcon,
  Search as SearchIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { DuplicateDetectionDialog } from './DuplicateDetectionDialog';

interface PendingMove {
  id?: number;
  bank: string;
  frn: string;
  type: string;
  sub_type: string;
  balance: number;
  aer: number;
  status: string;
  expected_funding_date: string;
  source_account_id: number | null;
  source_platform?: string | null;
  source_account_name?: string | null;
  destination_account_id: number | null;
  is_active: boolean;
  is_isa: boolean;
  liquidity_tier: string;
  earliest_withdrawal_date: string;
  platform: string;
  term_months?: number;
  notice_period_days?: number;
  metadata?: string | null;
}

interface PendingMoveFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (pendingMove: PendingMove) => Promise<void>;
  editingMove?: PendingMove | null;
  validationErrors: Record<string, string>;
  onFieldChange: (field: string, value: any) => void;
  viewMode?: 'edit' | 'view' | 'create';
}

interface SourceAccount {
  id: number;
  bank: string;
  account_name: string;
  balance: number;
  type: string;
  sub_type: string;
  term_months?: number;
  notice_period_days?: number;
}

// Generate meaningful account name when account_name is null
const generateAccountName = (account: SourceAccount): string => {
  if (account.account_name) {
    return account.account_name;
  }
  
  // Current accounts - prioritize account type over sub_type
  if (account.type === 'Current') {
    return 'Current Account';
  }
  
  // Savings accounts with terms
  if (account.sub_type === 'Term' && account.term_months) {
    if (account.term_months === 12) return 'Term Deposit (12m)';
    if (account.term_months === 24) return 'Term Deposit (24m)';
    if (account.term_months === 36) return 'Term Deposit (36m)';
    return `Term Deposit (${account.term_months}m)`;
  }
  
  // Notice accounts
  if (account.sub_type === 'Notice' && account.notice_period_days) {
    if (account.notice_period_days === 30) return 'Notice Account (30d)';
    if (account.notice_period_days === 60) return 'Notice Account (60d)';
    if (account.notice_period_days === 90) return 'Notice Account (90d)';
    return `Notice Account (${account.notice_period_days}d)`;
  }
  
  // Easy Access
  if (account.sub_type === 'Easy Access') {
    return 'Easy Access Saver';
  }
  
  // Fallback to sub_type or generic
  return account.sub_type || 'Savings Account';
};

// Liquidity tier options will be loaded from database

export const PendingMoveForm: React.FC<PendingMoveFormProps> = ({
  open,
  onClose,
  onSave,
  editingMove,
  validationErrors,
  onFieldChange,
  viewMode = 'create'
}) => {
  const [sourceAccounts, setSourceAccounts] = React.useState<SourceAccount[]>([]);
  const [selectedSourceBank, setSelectedSourceBank] = React.useState<string>('');
  const [selectedSourceAccount, setSelectedSourceAccount] = React.useState<string>('');
  const [liquidityTiers, setLiquidityTiers] = React.useState<any[]>([]);
  const [tiersLoaded, setTiersLoaded] = React.useState(false);
  const [existingAccountsFromFRN, setExistingAccountsFromFRN] = React.useState<any[]>([]);
  const [selectedExistingAccount, setSelectedExistingAccount] = React.useState<string>('');
  const [showDuplicateDialog, setShowDuplicateDialog] = React.useState(false);
  const [duplicateAccount, setDuplicateAccount] = React.useState<any>(null);
  const [frnLookupLoading, setFrnLookupLoading] = React.useState(false);
  const [validPlatforms, setValidPlatforms] = React.useState<{id: number, canonical_name: string, display_name: string}[]>([]);
  const [platformsLoaded, setPlatformsLoaded] = React.useState(false);
  const [frnValidation, setFrnValidation] = React.useState<{
    isValid: boolean;
    isNumeric: boolean;
    exists: boolean;
    canonicalName?: string;
    institutions?: Array<{ search_name: string; canonical_name: string }>;
    message?: string;
  } | null>(null);
  const [frnSuggestions, setFrnSuggestions] = React.useState<{frn: string, search_name: string}[]>([]);
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const [hasAttemptedSave, setHasAttemptedSave] = React.useState(false);
  const [selectedInstitution, setSelectedInstitution] = React.useState<string>('');
  
  // Transfer type state
  const [transferType, setTransferType] = React.useState<'internal' | 'external'>('internal');
  const [fundingSource, setFundingSource] = React.useState<string>('');

  // Account mode state (Existing vs New Account)
  const [accountMode, setAccountMode] = React.useState<'existing' | 'new'>('existing');
  
  // Autocomplete state for existing account search
  const [searchInputValue, setSearchInputValue] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<any[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [selectedExistingAccountFromSearch, setSelectedExistingAccountFromSearch] = React.useState<any>(null);

  // Form workflow state management
  type FormStep = 'frn-entry' | 'account-selection' | 'form-completion';
  const [formStep, setFormStep] = React.useState<FormStep>('frn-entry');
  
  const isReadOnly = viewMode === 'view';
  const isCreateMode = viewMode === 'create' && !editingMove;
  const [formData, setFormData] = React.useState<PendingMove>(editingMove || {
    bank: '',
    frn: '',
    type: '',
    sub_type: '',
    balance: 0,
    aer: 0,
    status: 'PENDING',
    expected_funding_date: '',
    source_account_id: null,
    source_platform: null,
    source_account_name: null,
    destination_account_id: null,
    is_active: true,
    is_isa: false,
    liquidity_tier: '',
    earliest_withdrawal_date: '',
    platform: '',
    term_months: undefined,
    notice_period_days: undefined,
    metadata: null,
  });

  // Update form data when editingMove changes
  React.useEffect(() => {
    if (editingMove) {
      setFormData(editingMove);
      // For editing, skip to final step
      setFormStep('form-completion');
      
      // Load transfer type and funding source from metadata if present
      if (editingMove.metadata) {
        try {
          const metadata = JSON.parse(editingMove.metadata);
          if (metadata.transfer_type) {
            setTransferType(metadata.transfer_type as 'internal' | 'external');
          }
          if (metadata.funding_source) {
            setFundingSource(metadata.funding_source);
          }
        } catch (e) {
          console.error('Error parsing metadata:', e);
        }
      }
      
      // If no source_account_id, it's an external deposit
      if (!editingMove.source_account_id) {
        setTransferType('external');
      }
    } else {
      // Reset all form state for new record - use empty values
      setFormData({
        bank: '',
        frn: '',
        type: '',
        sub_type: '',
        balance: 0,
        aer: 0,
        status: 'PENDING',
        expected_funding_date: '',
        source_account_id: null,
        source_platform: null,
        source_account_name: null,
        destination_account_id: null,
        is_active: true,
        is_isa: false,
        liquidity_tier: '',
        earliest_withdrawal_date: '',
        platform: '',
        term_months: undefined,
        notice_period_days: undefined,
        metadata: null,
      });
      // Reset source account selections and workflow state
      setSelectedSourceBank('');
      setSelectedSourceAccount('');
      setSelectedExistingAccount('');
      setExistingAccountsFromFRN([]);
      setFormStep('frn-entry');
    }
  }, [editingMove]);

  // Load source accounts and liquidity tiers when dialog opens
  React.useEffect(() => {
    if (open) {
      loadSourceAccounts();
      loadLiquidityTiers();
      loadValidPlatforms();
    }
  }, [open]);

  // Search for existing accounts (debounced)
  const searchTimeoutRef = React.useRef<NodeJS.Timeout>();
  
  const handleAccountSearch = React.useCallback(async (searchTerm: string) => {
    if (!searchTerm || searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }
    
    // Check if the API method exists
    if (!window.electronAPI?.searchMyDeposits) {
      console.error('searchMyDeposits method not available on electronAPI');
      setSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    try {
      const results = await window.electronAPI.searchMyDeposits(searchTerm);
      setSearchResults(results || []);
    } catch (error) {
      console.error('Error searching accounts:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Handle account mode change
  const handleAccountModeChange = (newMode: 'existing' | 'new') => {
    setAccountMode(newMode);
    
    // Reset relevant state when switching modes
    if (newMode === 'existing') {
      // Clear new account fields
      setFormData(prev => ({
        ...prev,
        frn: '',
        bank: '',
        type: '',
        sub_type: '',
        balance: 0,
        aer: 0,
        platform: '',
        is_isa: false,
        liquidity_tier: '',
        term_months: undefined,
        notice_period_days: undefined,
      }));
      setFormStep('form-completion'); // Go straight to form for existing account
      setSelectedExistingAccountFromSearch(null);
      setSearchInputValue('');
      setSelectedInstitution(''); // Clear institution selection
    } else {
      // Clear existing account selection
      setSelectedExistingAccountFromSearch(null);
      setSearchInputValue('');
      setSearchResults([]);
      setSelectedInstitution(''); // Clear institution selection
      setFormStep('frn-entry'); // Start with FRN for new account
    }
  };

  // Reset form step when dialog opens for create mode
  React.useEffect(() => {
    if (open && isCreateMode) {
      // Reset to existing account mode by default
      setAccountMode('existing');
      setFormStep('form-completion');
      setSelectedExistingAccount('');
      setExistingAccountsFromFRN([]);
      setHasAttemptedSave(false); // Reset save attempt flag for new records
      
      // Reset source account selections completely
      setSelectedSourceBank('');
      setSelectedSourceAccount('');
      
      // Reset FRN validation state
      setFrnValidation(null);
      setFrnSuggestions([]);
      setShowSuggestions(false);
      
      // Ensure form data is completely reset for create mode
      setFormData({
        bank: '',
        frn: '',
        type: '',
        sub_type: '',
        balance: 0,
        aer: 0,
        status: 'PENDING',
        expected_funding_date: '',
        source_account_id: null,
        destination_account_id: null,
        is_active: true,
        is_isa: false,
        liquidity_tier: '',
        earliest_withdrawal_date: '',
        platform: '',
        term_months: undefined,
        notice_period_days: undefined,
      });
      
      // Reset autocomplete state
      setSelectedExistingAccountFromSearch(null);
      setSearchInputValue('');
      setSearchResults([]);
    }
  }, [open, isCreateMode]);

  // Handle selection of an existing account from autocomplete
  const handleExistingAccountSelection = (account: any) => {
    if (!account) {
      setSelectedExistingAccountFromSearch(null);
      return;
    }
    
    setSelectedExistingAccountFromSearch(account);
    
    // Auto-populate form with existing account details
    handleFieldChange('destination_account_id', account.id);
    handleFieldChange('frn', account.frn || '');
    handleFieldChange('bank', account.bank);
    handleFieldChange('type', account.type);
    
    // Handle sub_type based on account type
    if (account.type === 'Current') {
      handleFieldChange('sub_type', 'Easy Access');
    } else {
      handleFieldChange('sub_type', account.sub_type);
    }
    
    // Set platform
    if (account.platform) {
      const matchingPlatform = validPlatforms.find(p => 
        p.display_name === account.platform || 
        p.canonical_name === account.platform
      );
      handleFieldChange('platform', matchingPlatform?.canonical_name || account.platform);
    }
    
    handleFieldChange('is_isa', account.is_isa || false);
    handleFieldChange('aer', account.aer || 0);
    
    // Set liquidity tier
    if (account.type === 'Current' || account.sub_type === 'Easy Access') {
      handleFieldChange('liquidity_tier', 'easy_access');
    } else if (account.liquidity_tier) {
      handleFieldChange('liquidity_tier', account.liquidity_tier);
    }
    
    // Set term/notice period if applicable
    if (account.term_months) {
      handleFieldChange('term_months', account.term_months);
    }
    if (account.notice_period_days) {
      handleFieldChange('notice_period_days', account.notice_period_days);
    }
  };

  const loadLiquidityTiers = async () => {
    try {
      const tiers = await window.electronAPI.getLiquidityTiers();
      setLiquidityTiers(tiers || []);
      setTiersLoaded(true);
    } catch (error) {
      console.error('Error loading liquidity tiers:', error);
      setTiersLoaded(true); // Still set to true to avoid infinite loading
    }
  };

  const loadValidPlatforms = async () => {
    try {
      const platforms = await window.electronAPI.getValidPlatforms();
      setValidPlatforms(platforms || []);
      setPlatformsLoaded(true);
    } catch (error) {
      console.error('Error loading valid platforms:', error);
      setPlatformsLoaded(true); // Still set to true to avoid infinite loading
    }
  };

  // Initialize selections if editing existing move
  React.useEffect(() => {
    if (editingMove && sourceAccounts.length > 0) {
      const sourceAccount = sourceAccounts.find(acc => acc.id === editingMove.source_account_id);
      if (sourceAccount) {
        setSelectedSourceBank(sourceAccount.bank);
        const accountName = generateAccountName(sourceAccount);
        setSelectedSourceAccount(`${accountName} - £${sourceAccount.balance.toLocaleString()}`);
      }
    }
  }, [editingMove, sourceAccounts]);

  const loadSourceAccounts = async () => {
    try {
      const accounts = await window.electronAPI.getAllAccounts();
      setSourceAccounts(accounts || []);
    } catch (error) {
      console.error('Error loading source accounts:', error);
    }
  };

  const handleSave = async () => {
    // Mark that user has attempted to save
    setHasAttemptedSave(true);
    
    // Validate form first
    const validationErrors = validateForm(formData);
    if (Object.keys(validationErrors).length > 0) {
      // Update parent with validation errors
      Object.keys(validationErrors).forEach(field => {
        onFieldChange(field, formData[field as keyof PendingMove]);
      });
      return; // Stop save due to validation errors
    }

    // Prepare data based on transfer type
    let saveData = { ...formData };
    
    if (transferType === 'external') {
      // For external deposits, set source_account_id to null
      // and store funding source in metadata
      saveData.source_account_id = null;
      saveData.source_platform = null;
      saveData.source_account_name = null;
      
      // Store funding source and transfer type in metadata
      const metadata = saveData.metadata ? JSON.parse(saveData.metadata) : {};
      if (fundingSource) {
        metadata.funding_source = fundingSource;
      }
      metadata.transfer_type = 'external';
      saveData.metadata = JSON.stringify(metadata);
    } else {
      // For internal transfers, ensure metadata indicates the type
      const metadata = saveData.metadata ? JSON.parse(saveData.metadata) : {};
      metadata.transfer_type = 'internal';
      saveData.metadata = JSON.stringify(metadata);
    }

    // Check for duplicates before saving (only for new records)
    if (!editingMove && selectedExistingAccount === 'create_new') {
      const hasDuplicates = await checkForDuplicates();
      if (hasDuplicates) {
        return; // Stop save, show duplicate dialog
      }
    }
    
    // Add debug logging to trace monetary value
    console.log('[DEBUG: PendingMoveForm] Before onSave:', {
      balance: saveData.balance,
      type: typeof saveData.balance,
      isInteger: Number.isInteger(saveData.balance),
      preciseValue: saveData.balance?.toPrecision(20)
    });
    
    await onSave(saveData);
  };

  // Handle field changes - update local state and notify parent
  const handleFieldChange = (field: string, value: any) => {
    setFormData(prev => {
      const updated = {
        ...prev,
        [field]: value
      };
      
      // Auto-populate liquidity_tier when sub_type is Easy Access
      if (field === 'sub_type' && value === 'Easy Access') {
        updated.liquidity_tier = 'easy_access';
      }
      
      return updated;
    });
    
    // Notify parent of the primary field change
    onFieldChange(field, value);
    
    // If sub_type changed to Easy Access, also notify parent about liquidity_tier change immediately
    if (field === 'sub_type' && value === 'Easy Access') {
      onFieldChange('liquidity_tier', 'easy_access');
    }
  };

  // Get unique banks from source accounts
  const sourceBanks = Array.from(new Set(sourceAccounts.map(acc => acc.bank))).sort();

  // Get accounts for selected bank
  const availableAccounts = sourceAccounts.filter(acc => acc.bank === selectedSourceBank);

  const handleSourceBankChange = (bank: string) => {
    setSelectedSourceBank(bank);
    setSelectedSourceAccount(''); // Reset account selection
    handleFieldChange('source_account_id', null); // Clear the ID
  };

  const handleSourceAccountChange = (accountDisplay: string) => {
    setSelectedSourceAccount(accountDisplay);
    // Find the account and set the ID
    const account = availableAccounts.find(acc => {
      const accountName = generateAccountName(acc);
      return `${accountName} - £${acc.balance.toLocaleString()}` === accountDisplay;
    });
    if (account) {
      handleFieldChange('source_account_id', account.id);
    }
  };

  // FRN-based account lookup with validation
  const handleFRNChange = async (frn: string) => {
    // Filter out non-numeric characters for display
    const numericFRN = frn.replace(/[^\d]/g, '');
    handleFieldChange('frn', numericFRN);
    
    // Clear previous validation
    setFrnValidation(null);
    
    if (numericFRN.length === 0) {
      // Empty FRN - reset form step
      setFormStep('frn-entry');
      setExistingAccountsFromFRN([]);
      return;
    }
    
    // Validate FRN format first
    try {
      const validation = await window.electronAPI.validateFRN(numericFRN);
      setFrnValidation(validation);
      
      if (!validation.isValid) {
        // Invalid FRN format - stay on entry step
        setFormStep('frn-entry');
        setExistingAccountsFromFRN([]);
        setSelectedInstitution('');
        return;
      }
      
      // If we have institutions, check if we need to show selector
      if (validation.institutions && validation.institutions.length > 1) {
        // Multiple institutions found - user needs to select one
        setSelectedInstitution(''); // Clear previous selection
      } else if (validation.institutions && validation.institutions.length === 1) {
        // Single institution - auto-select it
        setSelectedInstitution(validation.institutions[0].canonical_name);
        handleFieldChange('bank', validation.institutions[0].canonical_name);
      }
      
      // Valid FRN format - proceed with account lookup
      if (numericFRN.length >= 6) {
        try {
          setFrnLookupLoading(true);
          const accounts = await window.electronAPI.findAccountsByFRN(numericFRN);
          setExistingAccountsFromFRN(accounts || []);
          
          // Advance workflow step based on results
          if (accounts && accounts.length > 0) {
            setFormStep('account-selection'); // Show account selection
            setShowSuggestions(false); // Hide suggestions if accounts found
          } else {
            // No existing accounts found - try to get suggestions from FRN lookup
            try {
              const suggestions = await window.electronAPI.searchFRNSuggestions(numericFRN);
              setFrnSuggestions(suggestions || []);
              setShowSuggestions(suggestions && suggestions.length > 0);
            } catch (suggestionError) {
              console.error('Error fetching FRN suggestions:', suggestionError);
              setFrnSuggestions([]);
              setShowSuggestions(false);
            }
            
            // Go to form completion
            setFormStep('form-completion');
            // Clear form fields except FRN for fresh data entry
            setFormData(prev => ({
              ...prev,
              bank: '',
              type: '',
              sub_type: '',
              balance: 0,
              aer: 0,
              platform: '',
              is_isa: false,
              liquidity_tier: '',
              term_months: undefined,
              notice_period_days: undefined,
            }));
          }
        } catch (accountError) {
          console.error('Error looking up accounts by FRN:', accountError);
          setExistingAccountsFromFRN([]);
          setFormStep('form-completion');
          setShowSuggestions(false);
        } finally {
          setFrnLookupLoading(false);
        }
      }
    } catch (error) {
      console.error('Error validating or looking up FRN:', error);
      setFrnValidation({
        isValid: false,
        isNumeric: /^\d+$/.test(numericFRN),
        exists: false,
        message: 'Error validating FRN'
      });
      setExistingAccountsFromFRN([]);
      setFormStep('frn-entry');
      setFrnLookupLoading(false);
    }
  };

  // Handle existing account selection from FRN lookup
  const handleExistingAccountSelectionFromFRN = (accountValue: string) => {
    setSelectedExistingAccount(accountValue);
    
    if (accountValue === 'create_new') {
      // User chose to create new account - clear existing account data and proceed to form
      handleFieldChange('destination_account_id', null);
      setFormStep('form-completion');
      return;
    }
    
    // Find selected account and populate form
    const account = existingAccountsFromFRN.find(acc => 
      `${acc.id}` === accountValue
    );
    
    if (account) {
      // Store the destination account ID for adding to existing account
      handleFieldChange('destination_account_id', account.id);
      
      // Auto-populate form with existing account details
      handleFieldChange('bank', account.bank);
      handleFieldChange('type', account.type);
      
      // For current accounts, set sub_type based on account type, not database sub_type
      if (account.type === 'Current') {
        handleFieldChange('sub_type', 'Easy Access'); // Current accounts are typically easy access
      } else {
        handleFieldChange('sub_type', account.sub_type);
      }
      
      
      // Find matching platform by display name or canonical name
      const matchingPlatform = validPlatforms.find(p => 
        p.display_name === account.platform || 
        p.canonical_name === account.platform ||
        p.display_name?.includes(account.platform) ||
        account.platform?.includes(p.display_name)
      );
      
      if (matchingPlatform) {
        handleFieldChange('platform', matchingPlatform.canonical_name);
      } else {
        // Set the raw value anyway, user can correct if needed
        handleFieldChange('platform', account.platform);
      }
      handleFieldChange('is_isa', account.is_isa);
      handleFieldChange('aer', account.aer);
      
      // Handle liquidity_tier - ensure Easy Access accounts get "easy_access"
      if (account.type === 'Current' || account.sub_type === 'Easy Access') {
        handleFieldChange('liquidity_tier', 'easy_access');
      } else if (account.liquidity_tier) {
        handleFieldChange('liquidity_tier', account.liquidity_tier);
      }
      if (account.term_months) {
        handleFieldChange('term_months', account.term_months);
      }
      if (account.notice_period_days) {
        handleFieldChange('notice_period_days', account.notice_period_days);
      }
    }
    
    // Advance to form completion step
    setFormStep('form-completion');
  };

  // Enhanced validation for all form fields
  const validateForm = (data: PendingMove): Record<string, string> => {
    const errors: Record<string, string> = {};

    // FRN validation - only required for new accounts mode
    if (isCreateMode && accountMode === 'new') {
      if (!data.frn || data.frn.trim() === '') {
        errors.frn = 'FRN is required for new accounts';
      } else if (data.frn.length !== 6) {
        errors.frn = 'FRN must be exactly 6 digits';
      } else if (!/^\d+$/.test(data.frn)) {
        errors.frn = 'FRN must contain only numeric characters';
      }
    }
    // For existing accounts, FRN is trusted from the database (optional validation)
    else if (data.frn && data.frn.trim() !== '') {
      if (data.frn.length !== 6) {
        errors.frn = 'FRN must be exactly 6 digits';
      } else if (!/^\d+$/.test(data.frn)) {
        errors.frn = 'FRN must contain only numeric characters';
      }
    }

    // Bank name validation
    if (!data.bank || data.bank.trim() === '') {
      errors.bank = 'Bank name is required';
    }

    // Account type validation
    if (!data.type || data.type.trim() === '') {
      errors.type = 'Account type is required';
    }

    // Sub-type validation
    if (!data.sub_type || data.sub_type.trim() === '') {
      errors.sub_type = 'Account sub-type is required';
    }

    // Balance validation
    const balanceNumber = Number(data.balance);
    if (data.balance === null || data.balance === undefined || data.balance === 0 || String(data.balance) === '' || isNaN(balanceNumber) || balanceNumber <= 0) {
      errors.balance = 'Amount must be greater than 0';
    } else if (balanceNumber > 10000000) { // £10M limit
      errors.balance = 'Amount cannot exceed £10,000,000';
    }

    // AER validation
    if (data.aer !== undefined && data.aer !== null) {
      if (data.aer < 0) {
        errors.aer = 'AER cannot be negative';
      } else if (data.aer > 20) {
        errors.aer = 'AER seems unusually high (>20%)';
      }
    }

    // Platform validation
    if (!data.platform || data.platform.trim() === '') {
      errors.platform = 'Platform is required';
    }

    // Conditional validation for Term deposits
    if (data.sub_type === 'Term') {
      if (!data.term_months || data.term_months <= 0) {
        errors.term_months = 'Term length is required for term deposits';
      } else if (data.term_months > 120) { // 10 years max
        errors.term_months = 'Term length cannot exceed 120 months';
      }
    }

    // Conditional validation for Notice accounts
    if (data.sub_type === 'Notice') {
      if (!data.notice_period_days || data.notice_period_days <= 0) {
        errors.notice_period_days = 'Notice period is required for notice accounts';
      } else if (data.notice_period_days > 365) { // 1 year max
        errors.notice_period_days = 'Notice period cannot exceed 365 days';
      }
    }

    // Date validation
    if (data.expected_funding_date) {
      const fundingDate = new Date(data.expected_funding_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (fundingDate < today) {
        errors.expected_funding_date = 'Expected funding date cannot be in the past';
      }
    }

    if (data.earliest_withdrawal_date) {
      const withdrawalDate = new Date(data.earliest_withdrawal_date);
      if (data.expected_funding_date) {
        const fundingDate = new Date(data.expected_funding_date);
        if (withdrawalDate < fundingDate) {
          errors.earliest_withdrawal_date = 'Withdrawal date cannot be before funding date';
        }
      }
    }

    return errors;
  };

  // Update validation when form data changes
  React.useEffect(() => {
    if (Object.keys(formData).length > 0) {
      const errors = validateForm(formData);
      onFieldChange('validation', errors); // Notify parent of validation state
    }
  }, [formData]);

  // Trigger validation when form reaches completion step
  React.useEffect(() => {
    if (formStep === 'form-completion' && isCreateMode) {
      const errors = validateForm(formData);
      onFieldChange('validation', errors);
    }
  }, [formStep]);

  // Duplicate detection before save
  const checkForDuplicates = async () => {
    if (!formData.frn || !formData.bank || !formData.type || !formData.sub_type) {
      return false; // Not enough data to check
    }

    try {
      const accountDetails = {
        frn: formData.frn,
        bank: formData.bank,
        type: formData.type,
        sub_type: formData.sub_type,
        term_months: formData.term_months,
        notice_period_days: formData.notice_period_days,
        is_isa: formData.is_isa,
        platform: formData.platform,
      };

      const duplicates = await window.electronAPI.findPotentialDuplicates(accountDetails);
      
      if (duplicates && duplicates.length > 0) {
        setDuplicateAccount(duplicates[0]); // Show first match
        setShowDuplicateDialog(true);
        return true; // Duplicate found
      }
      
      return false; // No duplicates
    } catch (error) {
      console.error('Error checking for duplicates:', error);
      return false;
    }
  };

  return (
    <>
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SwapIcon />
          {viewMode === 'view' ? 'View Pending Move' : (editingMove ? 'Edit Pending Move' : 'Add New Pending Move')}
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ mt: 2 }}>
          
          {/* Account Mode Toggle - Only show in create mode */}
          {isCreateMode && (
            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <SearchIcon color={accountMode === 'existing' ? 'primary' : 'disabled'} />
                <FormControlLabel
                  control={
                    <Switch
                      checked={accountMode === 'new'}
                      onChange={(e) => handleAccountModeChange(e.target.checked ? 'new' : 'existing')}
                      color="primary"
                    />
                  }
                  label={accountMode === 'new' ? 'New Account' : 'Existing Account'}
                  sx={{ mx: 2 }}
                />
                <AddIcon color={accountMode === 'new' ? 'primary' : 'disabled'} />
              </Box>
            </Box>
          )}
          
          {/* Help text based on mode */}
          {isCreateMode && (
            <Box sx={{ mb: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="body2" color="text.secondary">
                {accountMode === 'existing' 
                  ? "Search for an existing account to add funds to. Start typing the bank name or account name."
                  : "Create a new account by entering the FRN (Financial Services Register Number) first."}
              </Typography>
            </Box>
          )}
          
          {/* Validation Summary */}
          {hasAttemptedSave && Object.keys(validationErrors).length > 0 && (
            <Box 
              sx={{ 
                mb: 3, 
                p: 2, 
                bgcolor: 'error.light', 
                color: 'error.contrastText',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'error.main'
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                Please fix the following issues before saving:
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2 }}>
                {Object.entries(validationErrors).map(([field, message]) => (
                  <Typography component="li" key={field} variant="body2">
                    {message}
                  </Typography>
                ))}
              </Box>
            </Box>
          )}
          
          {/* Destination Account Details */}
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AccountIcon fontSize="small" />
                <Typography variant="h6">Destination Account</Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={3}>
                
                {/* Autocomplete for Existing Account Mode */}
                {isCreateMode && accountMode === 'existing' && (
                  <Grid item xs={12}>
                    <Autocomplete
                      value={selectedExistingAccountFromSearch}
                      onChange={(_, newValue) => handleExistingAccountSelection(newValue)}
                      inputValue={searchInputValue}
                      onInputChange={(_, newInputValue) => {
                        setSearchInputValue(newInputValue);
                        // Debounce search
                        if (searchTimeoutRef.current) {
                          clearTimeout(searchTimeoutRef.current);
                        }
                        searchTimeoutRef.current = setTimeout(() => {
                          handleAccountSearch(newInputValue);
                        }, 300);
                      }}
                      options={searchResults}
                      getOptionLabel={(option) => {
                        if (!option) return '';
                        const accountName = option.account_name || 
                          (option.type === 'Current' ? 'Current Account' : 
                           option.sub_type === 'Term' && option.term_months ? `Term Deposit (${option.term_months}m)` :
                           option.sub_type === 'Notice' && option.notice_period_days ? `Notice Account (${option.notice_period_days}d)` :
                           option.sub_type || 'Savings Account');
                        return `${option.bank} - ${accountName} - £${(option.balance || 0).toLocaleString()}`;
                      }}
                      loading={isSearching}
                      loadingText="Searching..."
                      noOptionsText={searchInputValue.length < 2 ? "Type at least 2 characters to search" : "No accounts found"}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Search Existing Account"
                          placeholder="Type bank name or account name..."
                          fullWidth
                          helperText="Select an existing account to add funds to"
                          InputProps={{
                            ...params.InputProps,
                            endAdornment: (
                              <>
                                {isSearching ? <CircularProgress color="inherit" size={20} /> : null}
                                {params.InputProps.endAdornment}
                              </>
                            ),
                          }}
                        />
                      )}
                      renderOption={(props, option) => (
                        <Box component="li" {...props}>
                          <Box sx={{ width: '100%' }}>
                            <Typography variant="body1">
                              {option.bank}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {option.account_name || 
                               (option.type === 'Current' ? 'Current Account' : 
                                option.sub_type === 'Term' && option.term_months ? `Term Deposit (${option.term_months}m)` :
                                option.sub_type === 'Notice' && option.notice_period_days ? `Notice Account (${option.notice_period_days}d)` :
                                option.sub_type || 'Savings Account')} 
                              {' • '}
                              £{(option.balance || 0).toLocaleString()}
                              {' • '}
                              {option.aer || 0}% AER
                            </Typography>
                          </Box>
                        </Box>
                      )}
                      fullWidth
                      autoHighlight
                      clearOnBlur={false}
                      sx={{ mb: 2 }}
                    />
                  </Grid>
                )}
                
                {/* FRN Field - Show for new account mode or when not in create mode */}
                {(accountMode === 'new' || !isCreateMode) && (
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="FRN (Financial Services Register Number)"
                      value={formData.frn}
                      onChange={(e) => handleFRNChange(e.target.value)}
                      fullWidth
                      required={viewMode !== 'view' && accountMode === 'new'}
                      error={!!validationErrors.frn || (frnValidation ? !frnValidation.isValid : false)}
                      helperText={
                        validationErrors.frn || 
                        (frnValidation?.message) ||
                        (formStep === 'frn-entry' && isCreateMode ? "Enter FRN (6 digits only)" : 
                         frnLookupLoading ? "Validating FRN..." : 
                         frnValidation?.exists ? `✓ Found: ${frnValidation.canonicalName}` : undefined)
                      }
                      InputLabelProps={{ shrink: true }}
                      InputProps={{ readOnly: viewMode === 'view' }}
                      inputProps={{ maxLength: 6 }}
                    />
                  </Grid>
                )}

                {/* Institution Selector (shows when multiple institutions found for FRN) */}
                {accountMode === 'new' && frnValidation?.institutions && frnValidation.institutions.length > 1 && (
                  <Grid item xs={12} md={6}>
                    <FormControl fullWidth required>
                      <InputLabel id="institution-selector-label" shrink>Select Institution</InputLabel>
                      <Select
                        labelId="institution-selector-label"
                        label="Select Institution"
                        value={selectedInstitution}
                        onChange={(e) => {
                          const selected = e.target.value as string;
                          setSelectedInstitution(selected);
                          if (selected && selected !== 'none') {
                            // Find the institution and set the bank name
                            const institution = frnValidation.institutions?.find(
                              inst => inst.canonical_name === selected
                            );
                            if (institution) {
                              handleFieldChange('bank', institution.canonical_name);
                            }
                          } else if (selected === 'none') {
                            // User wants to create a new institution
                            handleFieldChange('bank', '');
                          }
                        }}
                        notched
                        displayEmpty
                      >
                        <MenuItem value="">
                          <em>Choose an institution...</em>
                        </MenuItem>
                        {frnValidation.institutions.map((institution, index) => (
                          <MenuItem key={`${institution.canonical_name}-${index}`} value={institution.canonical_name}>
                            {institution.search_name || institution.canonical_name}
                          </MenuItem>
                        ))}
                        <MenuItem value="none">
                          <em>None of these - I'll enter manually</em>
                        </MenuItem>
                      </Select>
                      <FormHelperText>
                        {frnValidation.institutions.length} institutions found with FRN {formData.frn}
                      </FormHelperText>
                    </FormControl>
                  </Grid>
                )}

                {/* FRN Suggestions (shows when FRN is valid but not in my_deposits) */}
                {showSuggestions && frnSuggestions.length > 0 && (
                  <Grid item xs={12}>
                    <Box sx={{ mt: 2, p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
                      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                        Did you mean one of these institutions?
                      </Typography>
                      <FormControl fullWidth>
                        <InputLabel id="frn-suggestions-label" shrink>Select Institution</InputLabel>
                        <Select
                          labelId="frn-suggestions-label"
                          label="Select Institution"
                          value=""
                          onChange={(e) => {
                            const selectedValue = e.target.value as string;
                            if (selectedValue) {
                              // Parse the selected value which is in format "frn|search_name"
                              const [selectedFRN, selectedBankName] = selectedValue.split('|');
                              if (selectedFRN && selectedBankName) {
                                // Update FRN and populate bank name
                                handleFieldChange('frn', selectedFRN);
                                handleFieldChange('bank', selectedBankName);
                              }
                            }
                            // Always hide suggestions after any selection (including "Continue with current FRN")
                            setShowSuggestions(false);
                          }}
                          displayEmpty
                        >
                          <MenuItem value="">
                            <em>Continue with current FRN</em>
                          </MenuItem>
                          {frnSuggestions.map((suggestion, index) => (
                            <MenuItem key={`${suggestion.frn}-${index}`} value={`${suggestion.frn}|${suggestion.search_name}`}>
                              {suggestion.frn} - {suggestion.search_name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Box>
                  </Grid>
                )}

                {/* Existing Account Selection (shows in account-selection step) */}
                {formStep === 'account-selection' && existingAccountsFromFRN.length > 0 && isCreateMode && (
                  <Grid item xs={12} md={6}>
                    <FormControl fullWidth>
                      <InputLabel id="existing-account-label" shrink>Select Account or Create New</InputLabel>
                      <Select
                        labelId="existing-account-label"
                        label="Select Account or Create New"
                        value={selectedExistingAccount}
                        onChange={(e) => handleExistingAccountSelectionFromFRN(e.target.value as string)}
                        notched
                        displayEmpty
                      >
                        <MenuItem value="">
                          <em>Choose an option...</em>
                        </MenuItem>
                        <MenuItem value="create_new">
                          <em>+ Create new account with this FRN</em>
                        </MenuItem>
                        {existingAccountsFromFRN.map(account => {
                          // Use account type for current accounts, sub_type for others
                          const displayType = account.type === 'Current' ? account.type : account.sub_type;
                          return (
                            <MenuItem key={account.id} value={`${account.id}`}>
                              {account.bank} - {displayType} ({account.platform}) - £{account.balance.toLocaleString()}
                            </MenuItem>
                          );
                        })}
                      </Select>
                    </FormControl>
                  </Grid>
                )}

                {/* Show progress message for account selection step */}
                {formStep === 'account-selection' && existingAccountsFromFRN.length > 0 && isCreateMode && (
                  <Grid item xs={12}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      We found {existingAccountsFromFRN.length} existing account{existingAccountsFromFRN.length > 1 ? 's' : ''} with this FRN. 
                      Choose to add funds to an existing account or create a new one.
                    </Typography>
                  </Grid>
                )}

                {/* Show helpful message when in FRN entry step */}
                {formStep === 'frn-entry' && isCreateMode && (
                  <Grid item xs={12}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', textAlign: 'center', py: 2 }}>
                      Start by entering the FRN (Financial Services Register Number) to begin creating your pending move.
                    </Typography>
                  </Grid>
                )}

                {/* Remaining fields - show for existing account mode, form-completion step, or non-create modes */}
                {(!isCreateMode || (accountMode === 'existing' && selectedExistingAccountFromSearch) || (accountMode === 'new' && formStep === 'form-completion')) && (
                  <>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Bank"
                        value={formData.bank}
                        onChange={(e) => handleFieldChange('bank', e.target.value)}
                        fullWidth
                        required={viewMode !== 'view'}
                        error={!!validationErrors.bank}
                        helperText={validationErrors.bank}
                        InputLabelProps={{ shrink: true }}
                        InputProps={{ readOnly: viewMode === 'view' }}
                      />
                    </Grid>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth required={!isReadOnly} error={!!validationErrors.platform}>
                    <InputLabel id="platform-label" shrink>Platform</InputLabel>
                    <Select
                      labelId="platform-label"
                      label="Platform"
                      value={formData.platform}
                      onChange={(e) => handleFieldChange('platform', e.target.value)}
                      disabled={isReadOnly}
                      displayEmpty
                    >
                      <MenuItem value="">
                        <em>Select Platform</em>
                      </MenuItem>
                      {validPlatforms.map((platform) => (
                        <MenuItem key={platform.id} value={platform.canonical_name}>
                          {platform.display_name}
                        </MenuItem>
                      ))}
                    </Select>
                    {validationErrors.platform && (
                      <FormHelperText>{validationErrors.platform}</FormHelperText>
                    )}
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth required>
                    <InputLabel id="type-label" shrink>Account Type</InputLabel>
                    <Select
                      labelId="type-label"
                      label="Account Type"
                      value={formData.type}
                      onChange={(e) => handleFieldChange('type', e.target.value)}
                      notched
                      readOnly={isReadOnly}
                    >
                      <MenuItem value="Current">Current</MenuItem>
                      <MenuItem value="Savings">Savings</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth required>
                    <InputLabel id="sub-type-label" shrink>Sub Type</InputLabel>
                    <Select
                      labelId="sub-type-label"
                      label="Sub Type"
                      value={formData.sub_type}
                      onChange={(e) => handleFieldChange('sub_type', e.target.value)}
                      notched
                    >
                      <MenuItem value="Easy Access">Easy Access</MenuItem>
                      <MenuItem value="Notice">Notice</MenuItem>
                      <MenuItem value="Term">Term</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                
                {/* Conditional Term Months Field */}
                {formData.sub_type === 'Term' && (
                  <Grid item xs={12} md={6}>
                    <FormControl fullWidth required={!isReadOnly} error={!!validationErrors.term_months}>
                      <InputLabel id="term-months-label" shrink>Term Length</InputLabel>
                      <Select
                        labelId="term-months-label"
                        label="Term Length"
                        value={formData.term_months || ''}
                        onChange={(e) => handleFieldChange('term_months', Number(e.target.value))}
                        notched
                        disabled={isReadOnly}
                      >
                        <MenuItem value={6}>6 months</MenuItem>
                        <MenuItem value={9}>9 months</MenuItem>
                        <MenuItem value={12}>12 months</MenuItem>
                        <MenuItem value={15}>15 months</MenuItem>
                        <MenuItem value={18}>18 months</MenuItem>
                        <MenuItem value={24}>24 months</MenuItem>
                        <MenuItem value={36}>36 months</MenuItem>
                        <MenuItem value={60}>60 months</MenuItem>
                      </Select>
                      {validationErrors.term_months && (
                        <FormHelperText>{validationErrors.term_months}</FormHelperText>
                      )}
                    </FormControl>
                  </Grid>
                )}
                
                {/* Conditional Notice Period Field */}
                {formData.sub_type === 'Notice' && (
                  <Grid item xs={12} md={6}>
                    <FormControl fullWidth required={!isReadOnly} error={!!validationErrors.notice_period_days}>
                      <InputLabel id="notice-period-label" shrink>Notice Period</InputLabel>
                      <Select
                        labelId="notice-period-label"
                        label="Notice Period"
                        value={formData.notice_period_days || ''}
                        onChange={(e) => handleFieldChange('notice_period_days', Number(e.target.value))}
                        notched
                        disabled={isReadOnly}
                      >
                        <MenuItem value={30}>30 days</MenuItem>
                        <MenuItem value={60}>60 days</MenuItem>
                        <MenuItem value={90}>90 days</MenuItem>
                        <MenuItem value={120}>120 days</MenuItem>
                      </Select>
                      {validationErrors.notice_period_days && (
                        <FormHelperText>{validationErrors.notice_period_days}</FormHelperText>
                      )}
                    </FormControl>
                  </Grid>
                )}
                
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel id="liquidity-tier-label" shrink>Liquidity Tier</InputLabel>
                    <Select
                      labelId="liquidity-tier-label"
                      label="Liquidity Tier"
                      value={formData.liquidity_tier}
                      onChange={(e) => handleFieldChange('liquidity_tier', e.target.value)}
                      notched
                    >
                      {tiersLoaded && liquidityTiers.map(tier => (
                        <MenuItem key={tier.liquidity_tier} value={tier.liquidity_tier}>
                          {tier.tier_short_name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                  </>
                )}
              </Grid>
            </AccordionDetails>
          </Accordion>

          {/* Financial Details - only show in form-completion step or non-create modes */}
          {(!isCreateMode || formStep === 'form-completion') && (
            <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <SecurityIcon fontSize="small" />
                <Typography variant="h6">Financial Details</Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Amount"
                    type="number"
                    value={formData.balance || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Allow empty string or valid numbers
                      if (value === '' || !isNaN(Number(value))) {
                        handleFieldChange('balance', value === '' ? 0 : Number(value));
                      }
                    }}
                    fullWidth
                    required={!isReadOnly}
                    error={!!validationErrors.balance}
                    helperText={validationErrors.balance}
                    InputLabelProps={{ shrink: true }}
                    InputProps={{ readOnly: isReadOnly }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="AER %"
                    type="number"
                    value={formData.aer || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Allow empty string or valid numbers
                      if (value === '' || !isNaN(Number(value))) {
                        handleFieldChange('aer', value === '' ? 0 : Number(value));
                      }
                    }}
                    fullWidth
                    inputProps={{ step: 0.01, min: 0 }}
                    error={!!validationErrors.aer}
                    helperText={
                      validationErrors.aer || 
                      (isCreateMode && accountMode === 'existing' && selectedExistingAccountFromSearch 
                        ? 'AER from existing account' 
                        : undefined)
                    }
                    InputLabelProps={{ shrink: true }}
                    InputProps={{ 
                      readOnly: isReadOnly || (isCreateMode && accountMode === 'existing' && selectedExistingAccountFromSearch !== null)
                    }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={Boolean(formData.is_isa)}
                        onChange={(e) => handleFieldChange('is_isa', e.target.checked)}
                      />
                    }
                    label="ISA Account"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={Boolean(formData.is_active)}
                        onChange={(e) => handleFieldChange('is_active', e.target.checked)}
                      />
                    }
                    label="Active"
                  />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
          )}

          {/* Move Details - only show in form-completion step or non-create modes */}
          {(!isCreateMode || formStep === 'form-completion') && (
            <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <SwapIcon fontSize="small" />
                <Typography variant="h6">Move Details</Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={3}>
                {/* Transfer Type Selection */}
                <Grid item xs={12}>
                  <Paper sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}>
                    <FormControl component="fieldset">
                      <Typography variant="body1" sx={{ mb: 1, fontWeight: 500 }}>
                        Transfer Type
                      </Typography>
                      <RadioGroup
                        row
                        value={transferType}
                        onChange={(e) => {
                          setTransferType(e.target.value as 'internal' | 'external');
                          // Reset source account selections when changing type
                          if (e.target.value === 'external') {
                            setSelectedSourceBank('');
                            setSelectedSourceAccount('');
                            handleFieldChange('source_account_id', null);
                          }
                        }}
                      >
                        <FormControlLabel
                          value="internal"
                          control={<Radio disabled={isReadOnly} />}
                          label={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <TransferIcon fontSize="small" />
                              <span>Internal Transfer</span>
                            </Box>
                          }
                        />
                        <FormControlLabel
                          value="external"
                          control={<Radio disabled={isReadOnly} />}
                          label={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <ExternalIcon fontSize="small" />
                              <span>External Deposit</span>
                            </Box>
                          }
                        />
                      </RadioGroup>
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                        {transferType === 'internal' 
                          ? 'Move funds between your existing accounts'
                          : 'Add new money to your portfolio'}
                      </Typography>
                    </FormControl>
                  </Paper>
                </Grid>

                {/* Source Account Fields - Only show for internal transfers */}
                {transferType === 'internal' && (
                  <>
                    <Grid item xs={12} md={6}>
                      <FormControl fullWidth>
                        <InputLabel id="source-bank-label" shrink>Source Bank</InputLabel>
                    <Select
                      labelId="source-bank-label"
                      label="Source Bank"
                      value={selectedSourceBank}
                      onChange={(e) => handleSourceBankChange(e.target.value as string)}
                      notched
                      displayEmpty
                    >
                      <MenuItem value="">
                        <em>Select source bank...</em>
                      </MenuItem>
                      {sourceBanks.map(bank => (
                        <MenuItem key={bank} value={bank}>
                          {bank}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth disabled={!selectedSourceBank}>
                    <InputLabel id="source-account-label" shrink>Source Account</InputLabel>
                    <Select
                      labelId="source-account-label"
                      label="Source Account"
                      value={selectedSourceAccount}
                      onChange={(e) => handleSourceAccountChange(e.target.value as string)}
                      notched
                      displayEmpty
                    >
                      <MenuItem value="">
                        <em>{selectedSourceBank ? 'Select account...' : 'Select bank first'}</em>
                      </MenuItem>
                      {availableAccounts.map(account => {
                        const accountName = generateAccountName(account);
                        const displayText = `${accountName} - £${account.balance.toLocaleString()}`;
                        return (
                          <MenuItem key={account.id} value={displayText}>
                            {displayText}
                          </MenuItem>
                        );
                      })}
                    </Select>
                  </FormControl>
                </Grid>
                  </>
                )}

                {/* Funding Source Field - Only show for external deposits */}
                {transferType === 'external' && (
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Funding Source"
                      value={fundingSource}
                      onChange={(e) => setFundingSource(e.target.value)}
                      placeholder="e.g., Salary, Gift, Investment Sale, Savings"
                      helperText="Describe where this new money is coming from"
                      variant="outlined"
                      disabled={isReadOnly}
                    />
                  </Grid>
                )}
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel id="status-label" shrink>Status</InputLabel>
                    <Select
                      labelId="status-label"
                      label="Status"
                      value={formData.status}
                      onChange={(e) => handleFieldChange('status', e.target.value)}
                      disabled={isCreateMode || isReadOnly}
                      notched
                    >
                      <MenuItem value="PENDING">Pending</MenuItem>
                      <MenuItem value="FUNDED">Funded</MenuItem>
                      <MenuItem value="CANCELLED">Cancelled</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Expected Funding Date"
                    type="date"
                    value={formData.expected_funding_date}
                    onChange={(e) => handleFieldChange('expected_funding_date', e.target.value)}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    helperText="When this deposit is expected to be funded"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Earliest Withdrawal Date"
                    type="date"
                    value={formData.earliest_withdrawal_date}
                    onChange={(e) => handleFieldChange('earliest_withdrawal_date', e.target.value)}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    helperText="When funds can first be withdrawn"
                  />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
          )}

        </Box>
      </DialogContent>
      
      <DialogActions sx={{ p: 3 }}>
        <Button onClick={onClose} size="large">
          {viewMode === 'view' ? 'Close' : 'Cancel'}
        </Button>
        {viewMode !== 'view' && (
          <Button 
            onClick={handleSave} 
            variant="contained" 
            size="large"
            disabled={
              Object.keys(validationErrors).length > 0 || 
              (isCreateMode && accountMode === 'new' && formStep !== 'form-completion') ||
              (isCreateMode && accountMode === 'existing' && !selectedExistingAccountFromSearch)
            }
          >
            {editingMove ? 'Update Pending Move' : 'Create Pending Move'}
          </Button>
        )}
      </DialogActions>
    </Dialog>

    {/* Duplicate Detection Dialog */}
    {showDuplicateDialog && duplicateAccount && (
      <DuplicateDetectionDialog
        open={showDuplicateDialog}
        onClose={() => setShowDuplicateDialog(false)}
        onAddToExisting={(existingAccountId) => {
          // Modify the pending move to add to existing account
          const updatedFormData = {
            ...formData,
            source_account_id: existingAccountId,
            // Keep the amount but mark this as adding to existing
          };
          onSave(updatedFormData);
          setShowDuplicateDialog(false);
        }}
        onCreateNew={() => {
          // Proceed with creating new account as planned
          onSave(formData);
          setShowDuplicateDialog(false);
        }}
        existingAccount={duplicateAccount}
        newAccount={formData}
      />
    )}
  </>);
};