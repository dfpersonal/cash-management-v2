/**
 * Type definitions for optimization module
 */

export interface FSCSOptions {
  database?: string;
  format?: 'json' | 'text';
  includeCalendarEvents?: boolean;
  includeActionItems?: boolean;
  silent?: boolean;
  progress?: boolean;
  diversify?: boolean;
  includePending?: boolean;
  warningThreshold?: number;
}

export interface OptimizationOptions {
  database?: string;
  format?: 'json' | 'text';
  includeCalendarEvents?: boolean;
  includeActionItems?: boolean;
  silent?: boolean;
  progress?: boolean;
  excludeShariaBanks?: boolean;
  minBenefit?: number;
  minMoveAmount?: number;
}

export interface OptimizationProgress {
  percent: number;
  message: string;
  stage?: string;
  current?: number;
  total?: number;
}

export interface OptimizationResult {
  status: 'SUCCESS' | 'ERROR' | 'WARNING';
  timestamp: string;
  summary: {
    breachCount?: number;
    recommendationCount?: number;
    totalBenefit?: number;
  };
  recommendations: any[];
  errors?: string[];
}

export interface ActionItemUpdate {
  actionId: string;
  status: 'pending' | 'approved' | 'dismissed' | 'completed' | 'pending_deposit_created';
  pendingDepositId?: number;
  dismissalReason?: string;
}

export interface OptimizationError extends Error {
  code?: string;
  details?: any;
  timestamp?: string;
}

export class OptimizationServiceError extends Error implements OptimizationError {
  code?: string;
  details?: any;
  timestamp?: string;

  constructor(message: string, code?: string, details?: any) {
    super(message);
    this.name = 'OptimizationServiceError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}