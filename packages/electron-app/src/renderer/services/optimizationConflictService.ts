/**
 * Optimization Conflict Service
 * Handles checking and resolving conflicts between existing pending moves and new optimization runs
 */

import { 
  PendingMove, 
  OptimizationConflict, 
  PendingMoveClassifier,
  ClassifiedPendingMove,
  PendingMoveSource
} from '@cash-mgmt/shared';

export interface ConflictResolutionOptions {
  deleteOptimizationGenerated: boolean;
  preserveUserCreated: boolean;
  ignoreCompleted: boolean;
}

export class OptimizationConflictService {
  
  /**
   * Check if running optimization would cause conflicts
   */
  static async checkForConflicts(): Promise<OptimizationConflict> {
    try {
      // Get all pending deposits
      const pendingMoves: PendingMove[] = await window.electronAPI.getAllPendingDeposits();
      
      // Classify and analyze conflicts
      const conflict = PendingMoveClassifier.checkOptimizationConflicts(pendingMoves);
      
      console.log('🔍 Optimization conflict check:', {
        totalMoves: pendingMoves.length,
        optimizationGenerated: conflict.optimizationGenerated.length,
        userCreated: conflict.userCreated.length,
        completed: conflict.completed.length,
        hasConflicts: conflict.hasConflicts
      });
      
      return conflict;
    } catch (error) {
      console.error('❌ Error checking optimization conflicts:', error);
      return {
        optimizationGenerated: [],
        userCreated: [],
        completed: [],
        hasConflicts: false,
        totalPending: 0
      };
    }
  }
  
  /**
   * Resolve conflicts by deleting optimization-generated pending moves
   */
  static async resolveConflicts(conflict: OptimizationConflict, options: ConflictResolutionOptions = {
    deleteOptimizationGenerated: true,
    preserveUserCreated: true,
    ignoreCompleted: true
  }): Promise<{ success: boolean; deletedCount: number; error?: string }> {
    try {
      let deletedCount = 0;
      
      if (options.deleteOptimizationGenerated && conflict.optimizationGenerated.length > 0) {
        console.log('🗑️ Deleting optimization-generated pending moves...');
        
        for (const move of conflict.optimizationGenerated) {
          try {
            const result = await window.electronAPI.deletePendingDeposit(move.id);
            if (result.success) {
              deletedCount++;
              console.log(`✅ Deleted pending move: ${PendingMoveClassifier.formatForDisplay(move)}`);
            } else {
              console.error(`❌ Failed to delete pending move ${move.id}:`, result.error);
            }
          } catch (deleteError) {
            console.error(`❌ Error deleting pending move ${move.id}:`, deleteError);
          }
        }
      }
      
      // Update linked action items to remove broken references
      if (deletedCount > 0) {
        await this.cleanupOrphanedActionItems(conflict.optimizationGenerated);
      }
      
      console.log(`✅ Conflict resolution complete: ${deletedCount} moves deleted`);
      return { success: true, deletedCount };
      
    } catch (error) {
      console.error('❌ Error resolving optimization conflicts:', error);
      return { 
        success: false, 
        deletedCount: 0, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
  
  /**
   * Clean up action items that reference deleted pending deposits
   */
  private static async cleanupOrphanedActionItems(deletedMoves: ClassifiedPendingMove[]): Promise<void> {
    try {
      const deletedIds = deletedMoves.map(move => move.id);
      
      // Reset action items that were linked to deleted pending deposits
      for (const moveId of deletedIds) {
        try {
          // Find action items linked to this pending deposit
          const result = await window.electronAPI.updateActionItemsWithPendingDeposit(moveId, {
            status: 'pending',
            pending_deposit_id: null
          });
          
          if (result.success) {
            console.log(`🔄 Reset action items linked to deleted pending deposit ${moveId}`);
          }
        } catch (cleanupError) {
          console.warn(`⚠️ Could not cleanup action items for pending deposit ${moveId}:`, cleanupError);
        }
      }
    } catch (error) {
      console.error('❌ Error cleaning up orphaned action items:', error);
    }
  }
  
  /**
   * Get conflict summary for display
   */
  static getConflictSummary(conflict: OptimizationConflict): {
    title: string;
    message: string;
    details: string[];
    canProceed: boolean;
  } {
    if (!conflict.hasConflicts) {
      return {
        title: 'No Conflicts',
        message: 'No optimization-generated pending moves found. Safe to proceed.',
        details: [],
        canProceed: true
      };
    }
    
    const details = [];
    
    if (conflict.optimizationGenerated.length > 0) {
      details.push(`${conflict.optimizationGenerated.length} optimization-generated moves will be removed:`);
      conflict.optimizationGenerated.forEach(move => {
        const badge = PendingMoveClassifier.getSourceBadge(move);
        const display = PendingMoveClassifier.formatForDisplay(move);
        details.push(`  • ${display} (${badge})`);
      });
    }
    
    if (conflict.userCreated.length > 0) {
      details.push('');
      details.push(`${conflict.userCreated.length} user-created moves will be preserved:`);
      conflict.userCreated.forEach(move => {
        const display = PendingMoveClassifier.formatForDisplay(move);
        details.push(`  • ${display} (Manual Entry)`);
      });
    }
    
    if (conflict.completed.length > 0) {
      details.push('');
      details.push(`${conflict.completed.length} completed moves will be ignored (already in portfolio)`);
    }
    
    return {
      title: 'Optimization Conflicts Detected',
      message: `Re-running optimization will affect ${conflict.optimizationGenerated.length} pending moves.`,
      details,
      canProceed: true
    };
  }
  
  /**
   * Test if the electronAPI has all required methods
   */
  static async validateAPIMethods(): Promise<{ valid: boolean; missing: string[] }> {
    const requiredMethods = [
      'getAllPendingDeposits',
      'deletePendingDeposit', 
      'updateActionItemsWithPendingDeposit'
    ];
    
    const missing: string[] = [];
    
    for (const method of requiredMethods) {
      if (typeof (window.electronAPI as any)?.[method] !== 'function') {
        missing.push(method);
      }
    }
    
    return {
      valid: missing.length === 0,
      missing
    };
  }
}