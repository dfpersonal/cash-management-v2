/**
 * FSCS (Financial Services Compensation Scheme) Compliance Engine
 * 
 * FSCS compliance checking using institution_preferences for override limits.
 * Handles easy_access_required_above_fscs constraints for personal limits.
 * 
 * Key features:
 * - Uses institution_preferences for personal/override limits
 * - Respects easy_access_required_above_fscs field
 * - All configuration from compliance_config table (no hardcoded values)
 * - Government institution support (e.g., NS&I with £2M limit)
 * - JSON output for subprocess integration
 */

import * as sqlite3 from 'sqlite3';

// Types
export interface Account {
  id: string;
  institutionFRN: string;
  bankName: string;
  balance: number;
  accountType: string; // 'Easy Access', 'Notice', 'Term', etc.
  isJointAccount: boolean;
  isActive: boolean;
}

export interface InstitutionPreference {
  frn: string;
  bankName: string;
  personalLimit: number;
  easyAccessRequiredAboveFSCS: boolean;
  trustLevel: string | null;
  riskNotes: string | null;
}

export interface ComplianceConfig {
  fscsStandardLimit: number;
  fscsJointMultiplier: number;
  fscsTolerance: number;
  fscsNearLimitThreshold: number;
  fscsWarningThreshold: number;
  personalFSCSOverrideEnabled: boolean;
}

export interface FRNExposure {
  frn: string;
  institutions: Set<string>;
  totalExposure: number;
  easyAccessBalance: number;
  otherBalance: number;
  accounts: string[];
  effectiveLimit: number;
  effectiveExposure: number;
  isJointAccount: boolean;
  institutionPreference?: InstitutionPreference;
}

export interface ComplianceBreach {
  frn: string;
  institutions: string[];
  totalExposure: number;
  effectiveLimit: number;
  effectiveExposure: number;
  excessAmount: number;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  accountIds: string[];
  protectionType: string;
  riskNotes?: string;
}

export interface ComplianceWarning {
  frn: string;
  institutions: string[];
  totalExposure: number;
  effectiveLimit: number;
  percentageOfLimit: number;
  message: string;
}

export interface RiskMetrics {
  fscsUtilization: number;
  concentrationRisk: number;
  numberOfBreaches: number;
  amountAtRisk: number;
  averageExposurePerFRN: number;
  statusBreakdown: {
    violation: number;
    tolerance: number;
    warning: number;
    nearLimit: number;
    compliant: number;
  };
}

export interface ComplianceReport {
  version: string;
  timestamp: string;
  status: 'COMPLIANT' | 'WARNING' | 'BREACH';
  summary: {
    totalAccounts: number;
    totalValue: number;
    breachCount: number;
    warningCount: number;
    totalAtRisk: number;
    institutionCount: number;
  };
  breaches: ComplianceBreach[];
  warnings: ComplianceWarning[];
  exposures: Array<{
    frn: string;
    institutions: string[];
    totalExposure: number;
    effectiveLimit: number;
    effectiveExposure: number;
    utilizationPercentage: number;
    protectionType: string;
    complianceStatus: 'VIOLATION' | 'TOLERANCE' | 'WARNING' | 'NEAR_LIMIT' | 'COMPLIANT';
    amountOverLimit?: number;
  }>;
  riskMetrics: RiskMetrics;
}

export interface ComplianceOptions {
  includePendingDeposits?: boolean;
  warningThreshold?: number; // Default from config
}

export class FSCSComplianceEngine {
  private db: sqlite3.Database;
  private config: ComplianceConfig | null = null;
  private institutionPreferences: Map<string, InstitutionPreference> = new Map();
  private readonly VERSION = '2.0.0'; // Updated version with institution preferences
  
  constructor(dbPath: string) {
    this.db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
  }
  
  /**
   * Generate compliance report using institution_preferences for override limits
   */
  async generateComplianceReport(options: ComplianceOptions = {}): Promise<ComplianceReport> {
    // Load configuration and preferences
    await this.loadConfiguration();
    await this.loadInstitutionPreferences();
    
    const accounts = await this.loadAccounts();
    const pendingDeposits = options.includePendingDeposits ? await this.loadPendingDeposits() : [];
    
    const frnExposures = await this.calculateFRNExposures(accounts, pendingDeposits);
    const breaches = this.detectBreaches(frnExposures);
    const warnings = this.detectWarnings(
      frnExposures, 
      options.warningThreshold || this.config!.fscsWarningThreshold
    );
    const riskMetrics = this.calculateRiskMetrics(frnExposures, breaches);
    
    const totalValue = Array.from(frnExposures.values()).reduce((sum, exp) => sum + exp.totalExposure, 0);
    const totalAtRisk = breaches.reduce((sum, breach) => sum + breach.excessAmount, 0);
    
    return {
      version: this.VERSION,
      timestamp: new Date().toISOString(),
      status: this.determineOverallStatus(breaches, warnings),
      summary: {
        totalAccounts: accounts.length,
        totalValue,
        breachCount: breaches.length,
        warningCount: warnings.length,
        totalAtRisk,
        institutionCount: frnExposures.size
      },
      breaches,
      warnings,
      exposures: Array.from(frnExposures.values()).map(exp => {
        const result: any = {
          frn: exp.frn,
          institutions: Array.from(exp.institutions),
          totalExposure: exp.totalExposure,
          effectiveLimit: exp.effectiveLimit,
          effectiveExposure: exp.effectiveExposure,
          utilizationPercentage: exp.effectiveLimit > 0 ? (exp.effectiveExposure / exp.effectiveLimit) * 100 : 0,
          protectionType: this.getProtectionType(exp),
          complianceStatus: this.getComplianceStatus(exp)
        };
        
        if (exp.effectiveExposure > exp.effectiveLimit) {
          result.amountOverLimit = exp.effectiveExposure - exp.effectiveLimit;
        }
        
        return result;
      }),
      riskMetrics
    };
  }
  
  private async loadConfiguration(): Promise<void> {
    const query = `
      SELECT config_key, config_value, config_type
      FROM compliance_config
      WHERE config_key IN (
        'fscs_standard_limit',
        'fscs_joint_multiplier',
        'fscs_tolerance_threshold',
        'fscs_near_limit_threshold',
        'fscs_warning_threshold',
        'personal_fscs_override_enabled'
      )
    `;
    
    return new Promise((resolve, reject) => {
      this.db.all(query, [], (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        
        const config: any = {};
        for (const row of rows) {
          const value = row.config_type === 'number' 
            ? parseFloat(row.config_value)
            : row.config_type === 'boolean'
            ? row.config_value === 'true'
            : row.config_value;
          
          // Convert snake_case to camelCase
          const key = row.config_key.replace(/_([a-z])/g, (_g: string, p1: string) => p1.toUpperCase());
          config[key] = value;
        }
        
        this.config = {
          fscsStandardLimit: config.fscsStandardLimit || 85000,
          fscsJointMultiplier: config.fscsJointMultiplier || 2,
          fscsTolerance: config.fscsToleranceThreshold || 500,
          fscsNearLimitThreshold: config.fscsNearLimitThreshold || 80000,
          fscsWarningThreshold: config.fscsWarningThreshold || 0.9,
          personalFSCSOverrideEnabled: config.personalFscsOverrideEnabled !== false
        };
        
        resolve();
      });
    });
  }
  
  private async loadInstitutionPreferences(): Promise<void> {
    const query = `
      SELECT 
        frn,
        bank_name as bankName,
        personal_limit as personalLimit,
        easy_access_required_above_fscs as easyAccessRequired,
        trust_level as trustLevel,
        risk_notes as riskNotes
      FROM institution_preferences
    `;
    
    return new Promise((resolve, reject) => {
      this.db.all(query, [], (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        
        this.institutionPreferences.clear();
        for (const row of rows) {
          this.institutionPreferences.set(row.frn, {
            frn: row.frn,
            bankName: row.bankName,
            personalLimit: row.personalLimit,
            easyAccessRequiredAboveFSCS: row.easyAccessRequired === 1,
            trustLevel: row.trustLevel,
            riskNotes: row.riskNotes
          });
        }
        
        resolve();
      });
    });
  }
  
  private async loadAccounts(): Promise<Account[]> {
    const query = `
      SELECT 
        id,
        frn as institutionFRN,
        bank as bankName,
        balance,
        sub_type as accountType,
        is_joint_account as isJointAccount,
        is_active as isActive
      FROM my_deposits
      WHERE is_active = 1 AND balance > 0
    `;
    
    return new Promise((resolve, reject) => {
      this.db.all(query, [], (err, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows.map(row => ({
          id: row.id,
          institutionFRN: row.institutionFRN,
          bankName: row.bankName,
          balance: row.balance,
          accountType: row.accountType,
          isJointAccount: row.isJointAccount === 1,
          isActive: row.isActive === 1
        })));
      });
    });
  }
  
  private async loadPendingDeposits(): Promise<Account[]> {
    const query = `
      SELECT 
        id,
        frn as institutionFRN,
        bank as bankName,
        balance,
        sub_type as accountType,
        is_joint_account as isJointAccount,
        is_active as isActive
      FROM my_pending_deposits
      WHERE is_active = 1 AND status IN ('PENDING', 'APPROVED', 'FUNDED')
    `;
    
    return new Promise((resolve, reject) => {
      this.db.all(query, [], (err, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows.map(row => ({
          id: 'pending_' + row.id,
          institutionFRN: row.institutionFRN,
          bankName: row.bankName,
          balance: row.balance,
          accountType: row.accountType,
          isJointAccount: row.isJointAccount === 1,
          isActive: row.isActive === 1
        })));
      });
    });
  }
  
  private async calculateFRNExposures(
    accounts: Account[],
    pendingDeposits: Account[]
  ): Promise<Map<string, FRNExposure>> {
    const exposureMap = new Map<string, FRNExposure>();
    const allAccounts = [...accounts, ...pendingDeposits];
    
    // Aggregate accounts by FRN
    for (const account of allAccounts) {
      if (!account.institutionFRN) continue;
      
      if (!exposureMap.has(account.institutionFRN)) {
        const institutionPref = this.institutionPreferences.get(account.institutionFRN);
        
        const newExposure: FRNExposure = {
          frn: account.institutionFRN,
          institutions: new Set<string>(),
          totalExposure: 0,
          easyAccessBalance: 0,
          otherBalance: 0,
          accounts: [],
          effectiveLimit: 0, // Will be calculated later
          effectiveExposure: 0, // Will be calculated later
          isJointAccount: false
        };
        
        if (institutionPref) {
          newExposure.institutionPreference = institutionPref;
        }
        
        exposureMap.set(account.institutionFRN, newExposure);
      }
      
      const exposure = exposureMap.get(account.institutionFRN)!;
      exposure.institutions.add(account.bankName);
      exposure.totalExposure += account.balance;
      
      // Track easy access vs other balances
      if (account.accountType === 'Easy Access') {
        exposure.easyAccessBalance += account.balance;
      } else {
        exposure.otherBalance += account.balance;
      }
      
      exposure.accounts.push(account.id);
      
      // Update joint account status
      if (account.isJointAccount) {
        exposure.isJointAccount = true;
      }
    }
    
    // Calculate effective limits and exposures
    for (const exposure of exposureMap.values()) {
      this.calculateEffectiveLimits(exposure);
    }
    
    return exposureMap;
  }
  
  private calculateEffectiveLimits(exposure: FRNExposure): void {
    const config = this.config!;
    const baseLimit = exposure.isJointAccount 
      ? config.fscsStandardLimit * config.fscsJointMultiplier
      : config.fscsStandardLimit;
    
    // Check for institution preference override
    if (exposure.institutionPreference && config.personalFSCSOverrideEnabled) {
      const pref = exposure.institutionPreference;
      const personalLimit = exposure.isJointAccount
        ? pref.personalLimit * config.fscsJointMultiplier
        : pref.personalLimit;
      
      if (personalLimit > baseLimit) {
        // Personal limit is higher than standard FSCS
        if (pref.easyAccessRequiredAboveFSCS) {
          // Easy access required for amounts over FSCS limit
          if (exposure.easyAccessBalance <= personalLimit) {
            // Easy access within personal limit
            exposure.effectiveLimit = personalLimit;
            exposure.effectiveExposure = exposure.totalExposure;
          } else {
            // Easy access exceeds personal limit
            exposure.effectiveLimit = personalLimit;
            exposure.effectiveExposure = exposure.totalExposure;
          }
          
          // Check if non-easy-access funds exceed standard FSCS
          if (exposure.otherBalance > baseLimit) {
            // Non-easy-access funds exceed standard FSCS protection
            // The excess is at risk
            const protectedOther = Math.min(exposure.otherBalance, baseLimit);
            const protectedEasy = Math.min(exposure.easyAccessBalance, personalLimit);
            const totalProtected = protectedOther + protectedEasy;
            
            exposure.effectiveLimit = Math.min(personalLimit, totalProtected);
            exposure.effectiveExposure = exposure.totalExposure;
          }
        } else {
          // No easy access requirement - all funds count toward personal limit
          exposure.effectiveLimit = personalLimit;
          exposure.effectiveExposure = exposure.totalExposure;
        }
      } else {
        // Personal limit is same or lower than standard FSCS
        exposure.effectiveLimit = personalLimit;
        exposure.effectiveExposure = exposure.totalExposure;
      }
    } else {
      // No institution preference - use standard FSCS limit
      exposure.effectiveLimit = baseLimit;
      exposure.effectiveExposure = exposure.totalExposure;
    }
  }
  
  private detectBreaches(exposures: Map<string, FRNExposure>): ComplianceBreach[] {
    const breaches: ComplianceBreach[] = [];
    const config = this.config!;
    
    for (const exposure of exposures.values()) {
      // Check if there's a breach considering tolerance
      const excessAmount = exposure.effectiveExposure - (exposure.effectiveLimit + config.fscsTolerance);
      
      if (excessAmount > 0) {
        const severity = this.calculateSeverity(excessAmount, exposure.effectiveLimit);
        
        const breach: ComplianceBreach = {
          frn: exposure.frn,
          institutions: Array.from(exposure.institutions),
          totalExposure: exposure.totalExposure,
          effectiveLimit: exposure.effectiveLimit,
          effectiveExposure: exposure.effectiveExposure,
          excessAmount,
          severity,
          accountIds: exposure.accounts,
          protectionType: this.getProtectionType(exposure)
        };
        
        if (exposure.institutionPreference?.riskNotes) {
          breach.riskNotes = exposure.institutionPreference.riskNotes;
        }
        
        breaches.push(breach);
      }
    }
    
    // Sort by excess amount (largest first) - priority algorithm
    return breaches.sort((a, b) => b.excessAmount - a.excessAmount);
  }
  
  private calculateSeverity(excessAmount: number, limit: number): 'CRITICAL' | 'HIGH' | 'MEDIUM' {
    const excessPercentage = (excessAmount / limit) * 100;
    
    if (excessPercentage > 50) return 'CRITICAL';
    if (excessPercentage > 20) return 'HIGH';
    return 'MEDIUM';
  }
  
  private detectWarnings(
    exposures: Map<string, FRNExposure>,
    warningThreshold: number
  ): ComplianceWarning[] {
    const warnings: ComplianceWarning[] = [];
    const config = this.config!;
    
    for (const exposure of exposures.values()) {
      const utilizationPercentage = exposure.effectiveLimit > 0 
        ? (exposure.effectiveExposure / exposure.effectiveLimit) * 100 
        : 0;
      
      // Warning if within tolerance but over limit
      const overLimit = exposure.effectiveExposure > exposure.effectiveLimit;
      const withinTolerance = exposure.effectiveExposure <= (exposure.effectiveLimit + config.fscsTolerance);
      
      if (overLimit && withinTolerance) {
        warnings.push({
          frn: exposure.frn,
          institutions: Array.from(exposure.institutions),
          totalExposure: exposure.totalExposure,
          effectiveLimit: exposure.effectiveLimit,
          percentageOfLimit: utilizationPercentage,
          message: `Within tolerance threshold (£${config.fscsTolerance})`
        });
      }
      // Warning if approaching limit
      else if (!overLimit && exposure.effectiveExposure > exposure.effectiveLimit * warningThreshold) {
        warnings.push({
          frn: exposure.frn,
          institutions: Array.from(exposure.institutions),
          totalExposure: exposure.totalExposure,
          effectiveLimit: exposure.effectiveLimit,
          percentageOfLimit: utilizationPercentage,
          message: `Exposure at ${utilizationPercentage.toFixed(1)}% of limit`
        });
      }
    }
    
    return warnings;
  }
  
  private getProtectionType(exposure: FRNExposure): string {
    if (!exposure.institutionPreference) {
      return 'standard_fscs';
    }
    
    const pref = exposure.institutionPreference;
    
    // Check for government backing (e.g., NS&I)
    if (pref.trustLevel === 'high' && pref.personalLimit >= 1000000) {
      return 'government_protected';
    }
    
    // Check for personal override
    if (pref.personalLimit !== this.config!.fscsStandardLimit) {
      return 'personal_override';
    }
    
    return 'standard_fscs';
  }
  
  private getComplianceStatus(exposure: FRNExposure): 'VIOLATION' | 'TOLERANCE' | 'WARNING' | 'NEAR_LIMIT' | 'COMPLIANT' {
    const config = this.config!;
    const utilizationPercentage = exposure.effectiveLimit > 0 
      ? (exposure.effectiveExposure / exposure.effectiveLimit) * 100 
      : 0;
    
    // VIOLATION: Over limit + tolerance
    if (exposure.effectiveExposure > exposure.effectiveLimit + config.fscsTolerance) {
      return 'VIOLATION';
    }
    
    // TOLERANCE: Over limit but within tolerance
    if (exposure.effectiveExposure > exposure.effectiveLimit && 
        exposure.effectiveExposure <= exposure.effectiveLimit + config.fscsTolerance) {
      return 'TOLERANCE';
    }
    
    // WARNING: At or very close to limit (95-100%)
    if (utilizationPercentage >= 95 && utilizationPercentage <= 100) {
      return 'WARNING';
    }
    
    // NEAR_LIMIT: Approaching limit (80-95%)
    if (utilizationPercentage >= 80 && utilizationPercentage < 95) {
      return 'NEAR_LIMIT';
    }
    
    // COMPLIANT: Well below limit (<80%)
    return 'COMPLIANT';
  }
  
  private calculateRiskMetrics(
    exposures: Map<string, FRNExposure>,
    breaches: ComplianceBreach[]
  ): RiskMetrics {
    const exposureValues = Array.from(exposures.values());
    const totalExposure = exposureValues.reduce((sum, exp) => sum + exp.totalExposure, 0);
    const totalLimits = exposureValues.reduce((sum, exp) => sum + exp.effectiveLimit, 0);
    
    // Calculate concentration risk (Herfindahl index)
    let concentrationRisk = 0;
    if (totalExposure > 0) {
      for (const exposure of exposureValues) {
        const marketShare = exposure.totalExposure / totalExposure;
        concentrationRisk += marketShare * marketShare;
      }
      concentrationRisk = concentrationRisk * 10000; // Scale to 0-10000
    }
    
    // Calculate status breakdown
    const statusBreakdown = {
      violation: 0,
      tolerance: 0,
      warning: 0,
      nearLimit: 0,
      compliant: 0
    };
    
    for (const exposure of exposureValues) {
      const status = this.getComplianceStatus(exposure);
      switch (status) {
        case 'VIOLATION':
          statusBreakdown.violation++;
          break;
        case 'TOLERANCE':
          statusBreakdown.tolerance++;
          break;
        case 'WARNING':
          statusBreakdown.warning++;
          break;
        case 'NEAR_LIMIT':
          statusBreakdown.nearLimit++;
          break;
        case 'COMPLIANT':
          statusBreakdown.compliant++;
          break;
      }
    }
    
    return {
      fscsUtilization: totalLimits > 0 ? (totalExposure / totalLimits) * 100 : 0,
      concentrationRisk,
      numberOfBreaches: breaches.length,
      amountAtRisk: breaches.reduce((sum, breach) => sum + breach.excessAmount, 0),
      averageExposurePerFRN: exposures.size > 0 ? totalExposure / exposures.size : 0,
      statusBreakdown
    };
  }
  
  private determineOverallStatus(
    breaches: ComplianceBreach[],
    warnings: ComplianceWarning[]
  ): 'COMPLIANT' | 'WARNING' | 'BREACH' {
    if (breaches.length > 0) return 'BREACH';
    if (warnings.length > 0) return 'WARNING';
    return 'COMPLIANT';
  }
  
  close() {
    this.db.close();
  }
}