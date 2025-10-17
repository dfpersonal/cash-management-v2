// Portfolio Summary Types
export interface PortfolioSummary {
  totalValue: number;
  totalAccounts: number;
  institutionCount: number;
  weightedAverageRate: number;
  activeValue: number;
  liquidValue: number;
  annualIncome: number;
  liquidityPercentage: number;
  lastUpdated: Date;
  // Enhanced income tracking
  projectedAnnualIncome: number;
  projectedTotalValue: number;
  projectedWeightedAverageRate: number;
  pendingDepositCount: number;
  pendingDepositValue: number;
}

// Historical Income Tracking Types
export interface AnnualIncomeSnapshot {
  id?: number;
  snapshot_date: string;
  current_annual_income: number;
  projected_annual_income: number;
  current_portfolio_value: number;
  projected_portfolio_value: number;
  current_weighted_rate: number;
  projected_weighted_rate: number;
  active_deposit_count: number;
  pending_deposit_count: number;
  created_at?: string;
}

export interface IncomeHistoryPoint {
  date: string;
  currentIncome: number;
  projectedIncome: number;
  portfolioValue: number;
  weightedRate: number;
}

// Portfolio Holdings Types
export interface PortfolioHolding {
  bank: string;
  accountType: string;
  balance: number;
  rate: number;
  termMonths?: number;
  noticePeriodDays?: number;
  maturityDate?: Date;
  liquidityTier: number;
  platform: string;
  frn: string;
  isActive: boolean;
  canWithdrawImmediately: boolean;
  upcomingMaturity: boolean;
}

// Complete Deposit Interface for CRUD Operations
export interface Deposit {
  id?: number;
  bank: string;
  type: 'Current' | 'Savings' | '';
  sub_type: 'Easy Access' | 'Notice' | 'Term' | 'n/a' | '';
  is_isa: boolean;
  platform?: string;
  frn?: string;
  account_name?: string;
  sort_code?: string;
  account_number?: string;
  reference?: string;
  designated_account?: string;
  aer?: number;
  notice_period_days?: number;
  term_months?: number;
  deposit_date?: string;
  term_ends?: string;
  balance?: number;
  min_deposit?: number;
  max_deposit?: number;
  liquidity_tier?: string;
  can_withdraw_immediately?: boolean;
  earliest_withdrawal_date?: string;
  is_active: boolean;
  notes?: string;
  last_updated?: string;
  created_at?: string;
}

// Strategic Allocation Types
export interface AllocationAnalysis {
  liquidityTier: number;
  tierDescription: string;
  tierShortName: string;
  targetPercentage: number;
  currentPercentage: number;
  currentBalance: number;
  availableBalance: number;
  lockedBalance: number;
  allocationGap: number;
  allocationStatus: 'WITHIN_TARGET' | 'UNDER_ALLOCATED' | 'OVER_ALLOCATED';
  targetBalance: number;
  rebalancingAmount: number;
  accountCount: number;
}


// Configuration Types
export interface Configuration {
  allocationTargets: {
    emergency: number;
    shortTerm: number;
    mediumTerm: number;
    longTerm: number;
    strategic: number;
  };
  riskTolerances: {
    fscsLimit: number;
    concentrationThreshold: number;
    minimumLiquidity: number;
  };
  reportSettings: {
    defaultPriorities: number[];
    maturityHorizon: number;
    optimizationThreshold: number;
  };
  // Audit configuration properties
  audit_enabled?: boolean;
  audit_level?: 'disabled' | 'key_fields' | 'full';
  audit_include_events?: boolean;
  audit_retention_days?: number;
  audit_max_entries?: number;
  audit_auto_cleanup?: boolean;
  // Balance checking configuration properties
  balance_check_frequency?: 'weekly' | 'bi-weekly' | 'monthly' | 'quarterly';
  balance_check_reminder_days?: number;
  balance_check_reset_on_manual?: boolean;
  balance_check_auto_calendar?: boolean;
}

// Chart Data Types
export interface ChartDataPoint {
  name: string;
  value: number;
  percentage?: number;
  color?: string;
}

export interface TimeSeriesDataPoint {
  date: string;
  value: number;
  label?: string;
}

// UI State Types
export interface AppState {
  isLoading: boolean;
  error: string | null;
  lastRefresh: Date | null;
  selectedView: string;
}

// Priority Level Types
export type PriorityLevel = 1 | 2 | 3 | 4;

export interface PriorityFilter {
  level: PriorityLevel;
  label: string;
  color: string;
  icon: string;
}

// Calendar & Reminder Types
export interface CalendarEvent {
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

export interface RateChange {
  id?: number;
  deposit_id: number;
  change_type: 'increase' | 'decrease' | 'notification';
  current_rate?: number | null;
  new_rate?: number | null;
  effective_date: string;
  notification_date?: string;
  reminder_days_before?: number;
  reminder_date?: string;
  reminder_completed?: boolean;
  reminder_completed_at?: string;
  notification_source?: string | null;
  notes?: string | null;
  status?: 'pending' | 'confirmed' | 'applied';
  created_at?: string;
}

export interface NoticeEvent {
  id?: number;
  deposit_id: number;
  notice_given_date: string;
  planned_withdrawal_amount?: number | null;
  funds_available_date: string;
  status?: 'given' | 'cancelled' | 'completed';
  notes?: string | null;
  created_at?: string;
}

export interface Reminder {
  id?: number;
  deposit_id?: number | null;
  reminder_type: 'maturity' | 'rate_review' | 'notice_deadline' | 'custom' | 'portfolio_review' | 'balance_check';
  lead_days?: number;
  reminder_date: string;
  title: string;
  description?: string | null;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  is_sent?: boolean;
  is_snoozed?: boolean;
  snoozed_until?: string;
  created_at?: string;
}

export interface CalendarSummary {
  total_events: number;
  this_week: number;
  this_month: number;
  urgent_count: number;
  high_count: number;
  maturing_this_month: number;
  notice_periods_ending: number;
}

// Audit Trail Types
export interface AuditEntry {
  id: number;
  table_name: string;
  record_id: number;
  field_name: string;
  old_value: string;
  new_value: string;
  operation_context: string;
  timestamp: string;
  notes?: string;
}

export interface AuditFilters {
  tableName?: string;
  recordId?: number;
  fieldName?: string;
  operationContext?: string;
  daysBack?: number;
  limit?: number;
  searchText?: string;
}

export interface AuditStats {
  total_changes: number;
  total_increases: number;
  total_decreases: number;
  avg_change: number;
}

export interface FieldChangeStats {
  field_name: string;
  change_count: number;
  records_affected: number;
  first_change: string;
  last_change: string;
}

// Balance Update Types
export interface BalanceUpdateSession {
  id?: number;
  started_at: string;
  completed_at?: string;
  total_deposits: number;
  updated_count: number;
  session_type: 'manual' | 'scheduled' | 'partial';
}

export interface BalanceUpdateLog {
  id?: number;
  session_id: number;
  deposit_id: number;
  old_balance: number;
  new_balance: number;
  updated_at: string;
  status: 'updated' | 'skipped' | 'pending';
}

export interface DepositBalanceStatus {
  deposit: Deposit;
  last_balance_update?: string;
  next_balance_check?: string;
  balance_update_frequency: 'weekly' | 'bi-weekly' | 'monthly' | 'quarterly';
  is_overdue: boolean;
  days_until_due: number;
  update_status: 'pending' | 'updated' | 'overdue' | 'current';
}

export interface BalanceUpdateSessionProgress {
  session: BalanceUpdateSession;
  progress_percentage: number;
  deposits_remaining: number;
  current_deposit_index: number;
  total_deposits: number;
}

export interface BalanceUpdateFilters {
  status?: 'all' | 'pending' | 'updated' | 'overdue' | 'current';
  frequency?: 'weekly' | 'bi-weekly' | 'monthly' | 'quarterly';
  bank?: string;
  platform?: string;
}

// Export convenience types
export type AllocationStatus = AllocationAnalysis['allocationStatus'];
export type BalanceUpdateFrequency = 'weekly' | 'bi-weekly' | 'monthly' | 'quarterly';
export type BalanceUpdateStatus = 'pending' | 'updated' | 'overdue' | 'current';