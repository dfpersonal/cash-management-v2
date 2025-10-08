export interface ActionItem {
  action_id: string;
  module: 'fscs-compliance' | 'rate-optimizer';
  title: string;
  description: string;
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'urgent' | 'high' | 'medium' | 'low';
  category: string;
  timeline: string;
  bank?: string;
  amount_affected?: number;
  expected_benefit?: number;
  source_data?: {
    accountId?: string;
    recommendationCount?: number;
    recommendationIds?: string[];
    recommendations?: {
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
    }[];
  };
  status: 'pending' | 'pending_deposit_created' | 'in_progress' | 'completed' | 'rejected' | 'dismissed';
  pending_deposit_id?: number;
  created_at?: string;
}