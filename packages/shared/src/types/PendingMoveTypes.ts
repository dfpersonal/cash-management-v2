/**
 * Pending Move Classification and Management Types
 */

export enum PendingMoveSource {
  USER_CREATED = 'user-created',
  RATE_OPTIMIZER = 'rate-optimizer', 
  FSCS_COMPLIANCE = 'fscs-compliance'
}

export enum PendingMoveStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED', 
  FUNDED = 'FUNDED',
  CANCELLED = 'CANCELLED'
}

export interface PendingMove {
  id: number;
  bank: string;
  frn?: string;
  type: string;
  sub_type: string;
  balance: number;
  aer?: number;
  status: PendingMoveStatus;
  source_account_id?: number;
  source_platform?: string;
  source_account_name?: string;
  expected_funding_date?: string;
  liquidity_tier?: string;
  metadata?: string; // JSON string containing optimization_source and other data
  created_at: string;
  updated_at: string;
}

export interface ParsedMetadata {
  optimization_source?: 'rate-optimizer' | 'fscs-compliance';
  recommendation_id?: string;
  rate_improvement?: number;
  annual_benefit?: number;
  confidence?: number;
  original_bank?: string;
  implementation_notes?: string[];
  reason?: string;
}

export interface ClassifiedPendingMove extends PendingMove {
  source: PendingMoveSource;
  parsedMetadata?: ParsedMetadata;
}

export interface OptimizationConflict {
  optimizationGenerated: ClassifiedPendingMove[];
  userCreated: ClassifiedPendingMove[];
  completed: ClassifiedPendingMove[];
  hasConflicts: boolean;
  totalPending: number;
}

/**
 * Classification helper functions
 */
export class PendingMoveClassifier {
  
  /**
   * Classify a pending move based on its metadata
   */
  static classify(move: PendingMove): ClassifiedPendingMove {
    let source = PendingMoveSource.USER_CREATED;
    let parsedMetadata: ParsedMetadata | undefined;
    
    if (move.metadata) {
      try {
        parsedMetadata = JSON.parse(move.metadata);
        
        if (parsedMetadata?.optimization_source === 'rate-optimizer') {
          source = PendingMoveSource.RATE_OPTIMIZER;
        } else if (parsedMetadata?.optimization_source === 'fscs-compliance') {
          source = PendingMoveSource.FSCS_COMPLIANCE;
        }
      } catch (error) {
        console.warn('Failed to parse pending move metadata:', error);
      }
    }
    
    return {
      ...move,
      source,
      parsedMetadata
    };
  }
  
  /**
   * Classify multiple pending moves
   */
  static classifyAll(moves: PendingMove[]): ClassifiedPendingMove[] {
    return moves.map(move => this.classify(move));
  }
  
  /**
   * Check for optimization conflicts
   */
  static checkOptimizationConflicts(moves: PendingMove[]): OptimizationConflict {
    const classified = this.classifyAll(moves);
    
    const optimizationGenerated = classified.filter(move => 
      move.source !== PendingMoveSource.USER_CREATED && 
      (move.status === PendingMoveStatus.PENDING || move.status === PendingMoveStatus.APPROVED)
    );
    
    const userCreated = classified.filter(move => 
      move.source === PendingMoveSource.USER_CREATED &&
      (move.status === PendingMoveStatus.PENDING || move.status === PendingMoveStatus.APPROVED)
    );
    
    const completed = classified.filter(move => 
      move.status === PendingMoveStatus.FUNDED
    );
    
    return {
      optimizationGenerated,
      userCreated, 
      completed,
      hasConflicts: optimizationGenerated.length > 0,
      totalPending: optimizationGenerated.length + userCreated.length
    };
  }
  
  /**
   * Format pending move for display
   */
  static formatForDisplay(move: ClassifiedPendingMove): string {
    const amount = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(move.balance);
    
    const sourceLabel = move.parsedMetadata?.original_bank || 'Unknown';
    
    return `${amount} ${sourceLabel} → ${move.bank}`;
  }
  
  /**
   * Get source badge text
   */
  static getSourceBadge(move: ClassifiedPendingMove): string {
    switch (move.source) {
      case PendingMoveSource.RATE_OPTIMIZER:
        return 'Rate Optimizer';
      case PendingMoveSource.FSCS_COMPLIANCE:
        return 'FSCS Compliance';
      case PendingMoveSource.USER_CREATED:
        return 'Manual Entry';
      default:
        return 'Unknown';
    }
  }
  
  /**
   * Get source badge color
   */
  static getSourceBadgeColor(move: ClassifiedPendingMove): 'primary' | 'secondary' | 'default' {
    switch (move.source) {
      case PendingMoveSource.RATE_OPTIMIZER:
        return 'primary';
      case PendingMoveSource.FSCS_COMPLIANCE:
        return 'secondary';
      case PendingMoveSource.USER_CREATED:
        return 'default';
      default:
        return 'default';
    }
  }
}