/**
 * Action Item Lifecycle Types
 * Based on action-item-lifecycle-design.md
 */

export enum ActionItemStatus {
  PENDING = 'pending',
  PENDING_DEPOSIT_CREATED = 'pending_deposit_created',
  COMPLETED = 'completed',
  DISMISSED = 'dismissed'
}

export interface ActionItem {
  id: number;
  action_id: string;
  module: 'fscs-compliance' | 'rate-optimizer';
  title: string;
  description?: string;
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'COMPLIANCE' | 'OPTIMIZATION' | 'REBALANCING' | 'REVIEW';
  timeline?: string;
  deposit_id?: number;
  bank?: string;
  amount_affected?: number;
  expected_benefit?: number;
  source_data?: string | object; // JSON string or parsed object
  status: ActionItemStatus;
  
  // Lifecycle tracking fields
  pending_deposit_id?: number;
  completed_date?: string;
  dismissed_date?: string;
  dismissed_reason?: string;
  
  // Standard timestamps
  created_at: string;
  updated_at: string;
}

export interface ActionItemUpdateRequest {
  actionId: string;
  status: ActionItemStatus;
  pendingDepositId?: number;
  dismissalReason?: string;
}

export interface ActionItemService {
  updateActionItemStatus(
    actionId: string, 
    status: ActionItemStatus,
    pendingDepositId?: number,
    reason?: string
  ): Promise<{ success: boolean; error?: string }>;
  
  getActionItems(includeActedUpon?: boolean): Promise<ActionItem[]>;
  
  markAsCompletedFromPendingDeposit(
    pendingDepositId: number
  ): Promise<{ success: boolean; error?: string }>;
}

// Status display helpers
export const getStatusDisplayText = (status: ActionItemStatus): string => {
  switch (status) {
    case ActionItemStatus.PENDING:
      return '';
    case ActionItemStatus.PENDING_DEPOSIT_CREATED:
      return ' → Pending Deposit Created';
    case ActionItemStatus.COMPLETED:
      return ' → Completed';
    case ActionItemStatus.DISMISSED:
      return ' → Dismissed';
    default:
      return '';
  }
};

export const getStatusIcon = (item: ActionItem): string => {
  switch (item.status) {
    case ActionItemStatus.PENDING:
      return item.priority === 'URGENT' ? '🔴' : '🟡';
    case ActionItemStatus.PENDING_DEPOSIT_CREATED:
      return '⏳';
    case ActionItemStatus.COMPLETED:
      return '✅';
    case ActionItemStatus.DISMISSED:
      return '❌';
    default:
      return '🟡';
  }
};

export const getStatusColor = (status: ActionItemStatus) => {
  switch (status) {
    case ActionItemStatus.PENDING:
      return 'default';
    case ActionItemStatus.PENDING_DEPOSIT_CREATED:
      return 'warning';
    case ActionItemStatus.COMPLETED:
      return 'success';
    case ActionItemStatus.DISMISSED:
      return 'error';
    default:
      return 'default';
  }
};