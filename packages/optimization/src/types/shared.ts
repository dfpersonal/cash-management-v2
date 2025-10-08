/**
 * Shared types for unified integration between FSCS Compliance and Rate Optimizer modules
 * Based on UNIFIED_INTEGRATION_SPECIFICATION.md
 */

// Common result structure for both modules
export interface ModuleResult {
  version: string;
  timestamp: string;
  status: 'SUCCESS' | 'WARNING' | 'ERROR';
  module: 'fscs-compliance' | 'rate-optimizer';
  summary: {
    totalAccounts: number;
    totalValue: number;
    recommendationCount: number;
    urgentActions: number;
    totalBenefit?: number;  // Rate optimizer
    totalAtRisk?: number;   // FSCS
    breachCount?: number;   // FSCS
  };
  recommendations: any[];
  calendarEvents?: CalendarEvent[];
  actionItems?: ActionItem[];
  metadata: {
    executionTime: number;
    configVersion: string;
    [key: string]: any;
  };
}

export interface CalendarEvent {
  event_id?: string;
  module: 'fscs-compliance' | 'rate-optimizer';
  action_type: string;
  deposit_id?: number | null;
  bank: string;
  account_type?: string;
  amount: number | null;
  action_date: string;
  days_until?: number;
  title: string;
  description: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  category: 'COMPLIANCE' | 'OPTIMIZATION' | 'MATURITY' | 'RATE_CHANGE' | 'REVIEW';
  current_rate?: number | null;
  new_rate?: number | null;
  metadata?: Record<string, any>;
}

export interface ActionItem {
  action_id: string;
  module: 'fscs-compliance' | 'rate-optimizer';
  title: string;
  description: string;
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'COMPLIANCE' | 'OPTIMIZATION' | 'REBALANCING' | 'REVIEW';
  timeline: string;
  deposit_id?: number | null;
  bank?: string | null;
  amount_affected?: number | null;
  expected_benefit?: number | null;
  source_data?: Record<string, any>;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  created_at?: string;
}

export interface SubprocessOptions {
  database: string;
  format: 'json' | 'text';
  includeCalendarEvents?: boolean;
  includeActionItems?: boolean;
  outputFile?: string;
  progressCallback?: (progress: ProgressUpdate) => void;
  // Module-specific options
  [key: string]: any;
}

export interface ProgressUpdate {
  percent: number;
  message: string;
  stage?: string;
  details?: Record<string, any>;
}