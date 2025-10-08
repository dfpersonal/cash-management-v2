/**
 * Transaction Tracking System Type Definitions
 * Comprehensive types for transaction management, reconciliation, and interest tracking
 */

// ============================================
// CORE TRANSACTION TYPES
// ============================================

export type TransactionType = 
  | 'account_opened'
  | 'deposit'
  | 'withdrawal'
  | 'interest'
  | 'fee'
  | 'adjustment'
  | 'account_closed';

export type TransactionSource = 'manual' | 'import' | 'audit_log' | 'system';

export interface Transaction {
  id?: number;
  account_id: number;
  
  // Dual date tracking
  transaction_date: string;  // ISO date string - when we recorded it
  bank_date?: string;        // ISO date string - when bank processed it
  value_date?: string;       // ISO date string - when interest starts accruing
  
  // Transaction details
  transaction_type: TransactionType;
  debit?: number;            // Money out
  credit?: number;           // Money in
  balance_after?: number;    // Running balance after transaction
  
  // Interest tracking
  estimated_amount?: number; // Expected interest amount
  variance_notes?: string;   // Explanation for variance
  
  // Reference and notes
  reference?: string;        // Bank's transaction reference
  optional_notes?: string;   // Additional context (includes audit log notes)
  
  // Tracking
  source: TransactionSource;
  reconciled: boolean;
  reconciled_date?: string;
  reconciliation_session_id?: number;
  
  // Audit fields
  audit_log_id?: number;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
}

// Transaction form for user input
export interface TransactionForm {
  account_id: number;
  transaction_date: Date;
  bank_date?: Date;
  transaction_type: TransactionType;
  amount: number;
  is_debit: boolean;
  reference?: string;
  optional_notes?: string;
}

// Transaction with account details for display
export interface TransactionWithAccount extends Transaction {
  bank_name: string;
  account_name?: string;
  account_type: string;
}

// ============================================
// RECONCILIATION TYPES
// ============================================

export type ReconciliationStatus = 'in_progress' | 'completed' | 'discrepancy';

export interface ReconciliationSession {
  id?: number;
  account_id: number;
  
  // Statement details
  statement_date: string;
  statement_balance: number;
  
  // Calculated values
  calculated_balance?: number;
  discrepancy?: number;
  
  // Status tracking
  status: ReconciliationStatus;
  completed_at?: string;
  completed_by?: string;
  
  // Documentation
  notes?: string;
  adjustments_made?: string; // JSON string of adjustments
  
  created_at?: string;
  created_by?: string;
}

export interface ReconciliationSummary {
  account_id: number;
  bank_name: string;
  account_name?: string;
  last_reconciled_date?: string;
  reconciliation_count: number;
  unreconciled_transactions: number;
  days_since_reconciliation?: number;
  current_balance: number;
}

export interface ReconciliationWizardState {
  session?: ReconciliationSession;
  unreconciled_transactions: Transaction[];
  matched_transaction_ids: number[];
  discrepancy_amount: number;
  adjustments: TransactionForm[];
}

// ============================================
// INTEREST PAYMENT TYPES
// ============================================

export type InterestPaymentType = 'Monthly' | 'Annually' | 'Fixed_Date' | 'At_Maturity';
export type InterestPaymentDestination = 'Same_Account' | 'Other_Account_Same_Bank' | 'Designated_Account';

export interface InterestConfiguration {
  // Payment schedule
  interest_payment_type?: InterestPaymentType;
  interest_next_payment_date?: string;
  interest_fixed_payment_day?: number;    // 1-31
  interest_fixed_payment_month?: number;  // 1-12
  
  // Payment destination
  interest_payment_destination?: InterestPaymentDestination;
  interest_payment_account_id?: number;   // For Other_Account_Same_Bank
  designated_account_id?: number;         // For Designated_Account
}

export interface InterestPaymentAnalysis {
  account_id: number;
  bank_name: string;
  account_name?: string;
  payment_date: string;
  actual_amount: number;
  estimated_amount?: number;
  variance?: number;
  variance_percentage?: number;
  variance_notes?: string;
  current_rate: number;
}

export interface InterestVarianceAnalysis {
  account_id: number;
  average_variance: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  possible_rate_change: boolean;
  recommended_action?: string;
  recent_payments: InterestPaymentAnalysis[];
}

// ============================================
// EVENT MANAGEMENT TYPES
// ============================================

export interface InterestEventConfig {
  enabled: boolean;
  include_monthly: boolean;
  include_annual: boolean;
  include_fixed_date: boolean;
  include_maturity: boolean;
  days_before: number;
  missed_payment_alert_days: number;
}

export interface InterestPaymentEvent {
  account_id: number;
  bank_name: string;
  account_name?: string;
  payment_type: InterestPaymentType;
  expected_date: string;
  estimated_amount: number;
  reminder_date: string;
  auto_generated: boolean;
  recurring: boolean;
}

// ============================================
// SERVICE INTERFACES
// ============================================

export interface TransactionFilters {
  account_id?: number;
  start_date?: string;
  end_date?: string;
  transaction_type?: TransactionType;
  reconciled?: boolean;
  min_amount?: number;
  max_amount?: number;
}

export interface TransactionSummary {
  total_deposits: number;
  total_withdrawals: number;
  total_interest: number;
  total_fees: number;
  net_change: number;
  transaction_count: number;
  unreconciled_count: number;
}

export interface BalanceRecalculationResult {
  account_id: number;
  transactions_processed: number;
  starting_balance: number;
  ending_balance: number;
  discrepancies_found: number;
  success: boolean;
  error?: string;
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface TransactionResponse {
  success: boolean;
  transaction?: Transaction;
  error?: string;
}

export interface TransactionListResponse {
  transactions: Transaction[];
  total_count: number;
  filters_applied: TransactionFilters;
}

export interface ReconciliationResponse {
  success: boolean;
  session?: ReconciliationSession;
  error?: string;
}

// ============================================
// UTILITY TYPES
// ============================================

export interface TransactionValidationError {
  field: string;
  message: string;
}

export interface TransactionImportResult {
  imported: number;
  skipped: number;
  errors: TransactionValidationError[];
}

// Helper function to determine if a transaction is a debit or credit
export function isDebitTransaction(type: TransactionType): boolean {
  return ['withdrawal', 'fee'].includes(type);
}

// Helper function to format transaction type for display
export function formatTransactionType(type: TransactionType): string {
  const typeMap: Record<TransactionType, string> = {
    'account_opened': 'Account Opened',
    'deposit': 'Deposit',
    'withdrawal': 'Withdrawal',
    'interest': 'Interest',
    'fee': 'Fee',
    'adjustment': 'Adjustment',
    'account_closed': 'Account Closed'
  };
  return typeMap[type] || type;
}

// Helper function to get transaction type color for UI
export function getTransactionTypeColor(type: TransactionType): string {
  const colorMap: Record<TransactionType, string> = {
    'account_opened': '#4CAF50',  // Green
    'deposit': '#2196F3',          // Blue
    'withdrawal': '#FF9800',       // Orange
    'interest': '#9C27B0',         // Purple
    'fee': '#F44336',              // Red
    'adjustment': '#607D8B',       // Blue Grey
    'account_closed': '#795548'    // Brown
  };
  return colorMap[type] || '#9E9E9E';
}

// Helper function to format interest payment type
export function formatInterestPaymentType(type?: InterestPaymentType): string {
  if (!type) return 'Not configured';
  
  const typeMap: Record<InterestPaymentType, string> = {
    'Monthly': 'Monthly',
    'Annually': 'Annually',
    'Fixed_Date': 'Fixed Date Each Year',
    'At_Maturity': 'At Maturity'
  };
  return typeMap[type] || type;
}

// Helper function to format payment destination
export function formatPaymentDestination(destination?: InterestPaymentDestination): string {
  if (!destination) return 'Same Account';
  
  const destMap: Record<InterestPaymentDestination, string> = {
    'Same_Account': 'Same Account',
    'Other_Account_Same_Bank': 'Another Account at Same Bank',
    'Designated_Account': 'Designated Current Account'
  };
  return destMap[destination] || destination;
}