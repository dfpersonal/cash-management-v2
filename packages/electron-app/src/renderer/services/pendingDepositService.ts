interface PendingDepositData {
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
}

interface CreatePendingDepositRequest {
  bank: string;
  frn: string;
  platform: string;
  type: string;
  sub_type: string;
  balance: number;
  aer: number;
  source_account_id?: number;
  destination_account_id?: number;
  expected_funding_date?: string;
  liquidity_tier?: string;
  earliest_withdrawal_date?: string;
  term_months?: number;
  notice_period_days?: number;
  metadata?: any;
}

export class PendingDepositService {
  /**
   * Create a pending deposit from a rate optimization recommendation
   */
  static async createFromRecommendation(
    recommendation: PendingDepositData,
    sourceAccountId?: number
  ): Promise<{ success: boolean; id?: number; error?: string }> {
    try {
      console.log('🐛 [PendingDepositService] Creating from recommendation:', JSON.stringify(recommendation, null, 2));
      console.log('🐛 [PendingDepositService] Source account ID:', sourceAccountId);
      
      // Validate required fields
      if (!recommendation.targetBank || !recommendation.amount) {
        console.error('🚨 Missing required fields - targetBank:', recommendation.targetBank, 'amount:', recommendation.amount);
        return {
          success: false,
          error: `Missing required fields: targetBank (${recommendation.targetBank}) or amount (${recommendation.amount})`
        };
      }
      
      // Get funding days from configuration (default to 7 if not available)
      let fundingDays = 7;
      try {
        const configValue = await window.electronAPI.getConfigValue('optimization_funding_days');
        if (configValue && configValue.value) {
          fundingDays = parseInt(configValue.value, 10) || 7;
        }
      } catch (error) {
        console.warn('Could not fetch optimization_funding_days from config, using default:', error);
      }
      
      // Determine expected funding date based on config
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + fundingDays);

      // Determine the sub_type for the account
      const subType = this.determineSubType(recommendation);
      
      // Check if a matching destination account already exists
      const destinationAccountId = await this.findMatchingDestinationAccount(
        recommendation.targetBank,
        recommendation.institutionFRN,
        'Savings', // Default type for rate optimization moves
        subType
      );

      // Map recommendation to pending deposit structure
      console.log('🔍 [PendingDepositService] Building deposit data with sourceAccountId:', sourceAccountId, 'destinationAccountId:', destinationAccountId);
      const depositData: CreatePendingDepositRequest = {
        bank: recommendation.targetBank,
        frn: recommendation.institutionFRN,
        platform: recommendation.platform,
        type: 'Savings', // Default type for rate optimization moves - Title Case
        sub_type: subType, // Dynamically determined - Title Case
        balance: recommendation.amount,
        aer: recommendation.targetRate,
        source_account_id: sourceAccountId, // Keep as undefined if not provided
        destination_account_id: destinationAccountId || undefined, // Set if existing account found
        expected_funding_date: expectedDate.toISOString().split('T')[0],
        liquidity_tier: this.determineLiquidityTier(recommendation),
        metadata: JSON.stringify({
          optimization_source: 'rate-optimizer',
          recommendation_id: recommendation.id,
          rate_improvement: recommendation.rateImprovement,
          annual_benefit: recommendation.annualBenefit,
          confidence: recommendation.confidence,
          original_bank: recommendation.sourceBank,
          implementation_notes: recommendation.implementationNotes,
          reason: recommendation.reason
        })
      };

      // Call the main process to create the pending deposit
      console.log('🐛 [PendingDepositService] Calling electronAPI with depositData:', JSON.stringify(depositData, null, 2));
      const result = await window.electronAPI.createPendingDeposit(depositData);
      console.log('🐛 [PendingDepositService] ElectronAPI result:', JSON.stringify(result, null, 2));
      
      // If successful and no destination account exists, create a calendar reminder
      if (result.success && !destinationAccountId) {
        try {
          await this.createAccountOpeningReminder(
            recommendation,
            sourceAccountId,
            result.id!,
            expectedDate,
            subType
          );
          console.log('📅 Created calendar reminder for new account opening');
        } catch (reminderError) {
          // Don't fail the whole operation if reminder creation fails
          console.error('Failed to create calendar reminder:', reminderError);
        }
      }
      
      return result;
    } catch (error) {
      console.error('Error creating pending deposit:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Create multiple pending deposits from recommendations
   */
  static async createMultipleFromRecommendations(
    recommendations: PendingDepositData[],
    sourceAccountId?: number
  ): Promise<{ 
    successful: number; 
    failed: number; 
    results: Array<{ id: string; success: boolean; depositId?: number; error?: string }> 
  }> {
    const results = [];
    let successful = 0;
    let failed = 0;

    for (const recommendation of recommendations) {
      const result = await this.createFromRecommendation(recommendation, sourceAccountId);
      
      results.push({
        id: recommendation.id,
        success: result.success,
        depositId: result.id,
        error: result.error
      });

      if (result.success) {
        successful++;
      } else {
        failed++;
      }
    }

    return { successful, failed, results };
  }

  /**
   * Determine liquidity tier based on recommendation details
   */
  private static determineLiquidityTier(recommendation: PendingDepositData): string {
    // Logic to determine liquidity tier based on the product characteristics
    // This would be enhanced based on the actual product data structure
    
    if (recommendation.displayMode === 'NOTICE' || 
        recommendation.implementationNotes?.some(note => note.toLowerCase().includes('notice'))) {
      return 'notice';
    }
    
    if (recommendation.implementationNotes?.some(note => note.toLowerCase().includes('fixed'))) {
      return 'fixed_term';
    }
    
    return 'easy_access'; // Default for most savings accounts
  }
  
  /**
   * Determine sub_type based on recommendation details (Title Case for consistency)
   */
  private static determineSubType(recommendation: PendingDepositData): string {
    if (recommendation.displayMode === 'NOTICE' || 
        recommendation.implementationNotes?.some(note => note.toLowerCase().includes('notice'))) {
      return 'Notice';
    }
    
    if (recommendation.implementationNotes?.some(note => note.toLowerCase().includes('fixed')) ||
        recommendation.implementationNotes?.some(note => note.toLowerCase().includes('term'))) {
      return 'Term';
    }
    
    return 'Easy Access'; // Default for most savings accounts
  }

  /**
   * Find an existing account that matches the destination criteria
   * Returns the account ID if found, null otherwise
   */
  private static async findMatchingDestinationAccount(
    bank: string,
    frn: string | undefined,
    type: string,
    subType: string
  ): Promise<number | null> {
    try {
      console.log('🔍 Searching for existing destination account:', { bank, frn, type, subType });
      
      // Get all existing accounts
      const allAccounts = await window.electronAPI.getAllAccounts();
      
      // Find matching account
      const matchingAccount = allAccounts.find((account: any) => {
        // Match by bank name (required)
        if (account.bank !== bank) return false;
        
        // Match by type (required)
        if (account.type !== type) return false;
        
        // Match by sub_type (required)
        if (account.sub_type !== subType) return false;
        
        // If FRN is provided, it should match (optional)
        if (frn && account.frn && account.frn !== frn) return false;
        
        // Account should be active
        if (account.is_active === false || account.is_active === 0) return false;
        
        return true;
      });
      
      if (matchingAccount) {
        console.log('✅ Found matching destination account:', matchingAccount.id, matchingAccount.bank);
        return matchingAccount.id;
      } else {
        console.log('ℹ️ No matching destination account found - new account will be created');
        return null;
      }
    } catch (error) {
      console.error('Error finding matching destination account:', error);
      // On error, default to creating new account
      return null;
    }
  }

  /**
   * Create a calendar reminder for opening a new account
   */
  private static async createAccountOpeningReminder(
    recommendation: PendingDepositData,
    sourceAccountId: number | undefined,
    pendingDepositId: number,
    expectedDate: Date,
    subType: string
  ): Promise<void> {
    try {
      // Get source account details if available
      let sourceBank = recommendation.sourceBank || 'Unknown';
      let sourceType = 'Savings'; // Default
      
      if (sourceAccountId) {
        try {
          const accounts = await window.electronAPI.getAllAccounts();
          const sourceAccount = accounts.find((acc: any) => acc.id === sourceAccountId);
          if (sourceAccount) {
            sourceBank = sourceAccount.bank;
            sourceType = sourceAccount.sub_type || sourceAccount.type;
          }
        } catch (error) {
          console.warn('Could not fetch source account details:', error);
        }
      }
      
      // Create reminder data matching the calendar_events table structure
      const reminderData = {
        deposit_id: null, // Not linked to a deposit yet since it doesn't exist
        reminder_type: 'custom',
        lead_days: 0, // Same day
        reminder_date: expectedDate.toISOString().split('T')[0],
        title: `Open an [${subType}] account with [${recommendation.targetBank}]`,
        description: `Relates to recommended move from [${sourceBank}, ${sourceType}] to [${recommendation.targetBank}, ${subType}]`,
        priority: recommendation.annualBenefit > 100 ? 'high' : 'medium',
        // Store pending deposit ID in metadata for reference
        metadata: JSON.stringify({
          pending_deposit_id: pendingDepositId,
          source_account_id: sourceAccountId,
          expected_amount: recommendation.amount,
          expected_rate: recommendation.targetRate,
          recommendation_id: recommendation.id
        })
      };
      
      console.log('📅 Creating calendar reminder:', reminderData);
      await window.electronAPI.createReminder(reminderData);
    } catch (error) {
      console.error('Error creating account opening reminder:', error);
      throw error;
    }
  }

  /**
   * Get pending deposits created from optimization recommendations
   * Note: This method is currently not implemented as DatabaseService doesn't have a generic query method
   */
  static async getOptimizationPendingDeposits(): Promise<any[]> {
    try {
      // This would need a specific method in DatabaseService to implement
      console.warn('getOptimizationPendingDeposits not implemented - need specific DatabaseService method');
      return [];
    } catch (error) {
      console.error('Error fetching optimization pending deposits:', error);
      return [];
    }
  }
}

// Note: electronAPI interface is already declared in preload.ts