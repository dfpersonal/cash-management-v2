/**
 * Core type definitions for the Cash Management Recommendation Engine
 * Supports joint accounts, pending deposits, and Sharia bank filtering
 */

// Import Decimal for use in utility classes

// ===== BASIC TYPES =====

export type LiquidityTier = 
  | 'easy_access'
  | 'notice_1_30'
  | 'notice_31_60' 
  | 'notice_61_90'
  | 'notice_90+'
  | 'fixed_9m'
  | 'fixed_12m'
  | 'fixed_24m'
  | 'fixed_36m'
  | 'fixed_60m';

export type AccountType = 'Current' | 'Savings';
export type AccountSubType = 'Easy Access' | 'Notice' | 'Term' | 'n/a';
export type ComplianceStatus = 'COMPLIANT' | 'NEAR_LIMIT' | 'WARNING' | 'CRITICAL';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TrustLevel = 'high' | 'medium' | 'low';
export type PendingDepositStatus = 'PENDING' | 'APPROVED' | 'FUNDED' | 'CANCELLED';
export type RecommendationType = 'rate_optimization' | 'compliance' | 'rebalancing' | 'diversification';

// ===== MONEY AND PERCENTAGE TYPES =====

export interface Money {
  readonly amount: number;
  readonly currency: 'GBP';
  toString(): string;
  add(other: Money): Money;
  subtract(other: Money): Money;
  multiply(factor: number): Money;
  equals(other: Money): boolean;
  greaterThan(other: Money): boolean;
  lessThan(other: Money): boolean;
}

export interface Percentage {
  readonly value: number; // 0-100
  toString(): string;
  toDecimal(): number; // 0-1
}

// ===== CORE DOMAIN MODELS =====

export interface Account {
  id: string;
  institutionFRN: string;
  bankName: string;
  accountType: AccountType;
  accountSubType: AccountSubType;
  platform?: string;
  balance: Money;
  rate: number; // AER as percentage
  liquidityTier: LiquidityTier;
  canWithdrawImmediately: boolean;
  earliestWithdrawalDate?: Date;
  
  // Joint account support (NEW)
  isJointAccount: boolean;
  numAccountHolders?: number; // Default 2 for joint accounts
  
  // Minimum balance requirement (for current accounts)
  minimumBalance?: number;
  
  // Metadata
  isActive: boolean;
  isISA: boolean;
  lastUpdated: Date;
  notes?: string;
}

export interface PendingDeposit {
  id: string;
  institutionFRN: string;
  bankName: string;
  accountType: AccountType;
  accountSubType: AccountSubType;
  platform?: string;
  balance: Money;
  rate?: number; // AER as percentage
  liquidityTier: LiquidityTier;
  
  // Pending-specific fields
  status: PendingDepositStatus;
  expectedFundingDate?: Date;
  sourceAccountId?: string;
  
  // Joint account support (NEW)
  isJointAccount: boolean;
  numAccountHolders?: number;
  
  // Metadata
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Portfolio {
  accounts: Account[];
  pendingDeposits: PendingDeposit[];
  totalValue: Money;
  lastUpdated: Date;
  
  // Calculated properties
  institutionCount: number;
  liquidityBreakdown: Record<LiquidityTier, Money>;
  averageRate: number;
}

// ===== INSTITUTION AND PREFERENCES =====

export interface Institution {
  frn: string;
  firmName: string;
  isActive: boolean;
  
  // Enhanced with preferences integration
  personalLimit?: Money;
  easyAccessRequiredAboveFSCS?: boolean;
  trustLevel?: TrustLevel;
  riskNotes?: string;
}

export interface InstitutionPreference {
  id: number;
  frn: string;
  bankName: string;
  personalLimit: Money;
  easyAccessRequiredAboveFSCS: boolean;
  riskNotes?: string;
  trustLevel: TrustLevel;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShariaBankRegistry {
  id: number;
  frn: string;
  bankName: string;
  isShariaCompliant: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PreferredPlatform {
  id: number;
  platformName: string;
  priority: number;
  rateTolerance: number;  // Accept up to X% lower rate
  isActive: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ===== COMPLIANCE AND FSCS =====

export interface ComplianceOptions {
  includePendingDeposits?: boolean;    // Default: true for safety
  allowShariaBanks?: boolean;          // From config or override
  pendingDepositStatuses?: PendingDepositStatus[]; // Which statuses to include
  includeProductsWithoutFRN?: boolean; // Default: false for safety
}

export interface FSCSCompliance {
  frn: string;
  bank: string;
  totalExposure: Money;
  accountCount: number;
  effectiveLimit: Money;          // May be higher for joint accounts or institution preferences
  regulatoryLimit: Money;         // Standard £85,000
  protectionType: 'standard_fscs' | 'personal_preference' | 'government_protected';
  trustLevel?: TrustLevel | undefined;
  amountOverLimit: Money;
  personalComplianceStatus: string;
  fscsComplianceStatus: ComplianceStatus;
  finalStatus: string;
  actionPriority: number;         // 1=urgent, 10=no action needed
  riskNotes?: string | undefined;
}

export interface ComplianceBreach {
  institutionFRN: string;
  bankName: string;
  currentExposure: Money;
  effectiveLimit: Money;
  amountOverLimit: Money;
  status: ComplianceStatus;
  includesPendingDeposits: boolean;
  recommendedAction: string;
  urgency: Priority;
}

export interface ComplianceReport {
  overall: ComplianceStatus;
  institutions: FSCSCompliance[];
  breaches: ComplianceBreach[];
  warnings: ComplianceWarning[];
  summary: ComplianceSummary;
  
  // Enhanced with new features
  jointAccountsCount: number;
  pendingDepositsIncluded: boolean;
  shariaFilteringApplied: boolean;
  generatedAt: Date;
}

export interface ComplianceWarning {
  type: 'NEAR_LIMIT' | 'PENDING_DEPOSIT_IMPACT' | 'SHARIA_BANK_EXCLUDED' | 'JOINT_ACCOUNT_OPPORTUNITY';
  institutionFRN?: string;
  bankName?: string;
  message: string;
  impact?: Money;
  recommendedAction?: string;
}

export interface ComplianceSummary {
  totalInstitutions: number;
  compliantInstitutions: number;
  violatingInstitutions: number;
  totalExposure: Money;
  totalHeadroom: Money;
  averageExposurePerInstitution: Money;
  
  // Enhanced metrics
  jointAccountInstitutions: number;
  pendingDepositValue: Money;
  excludedShariaBanks: number;
}

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
  maxSafeAmount?: Money;
  resultingExposure?: Money;
  resultingStatus?: ComplianceStatus;
  
  // Enhanced with joint account awareness
  jointAccountImpact?: boolean;
  pendingDepositImpact?: Money;
  shariaFilteringImpact?: boolean;
}

// ===== RECOMMENDATIONS =====

export interface RecommendationSource {
  accountId: string;
  bankName: string;
  accountName?: string; // Account name for better identification
  currentRate: number;
  amount: Money;
  originalAccountBalance?: Money; // Total balance of source account (for chunked recommendations)
  liquidityTier: LiquidityTier;
  canWithdrawImmediately: boolean;
}

export interface RecommendationTarget {
  institutionFRN: string;
  bankName: string;
  accountType: AccountType;
  accountSubType: AccountSubType;
  targetRate: number;
  platform?: string;
  liquidityTier: LiquidityTier;
  minimumDeposit?: Money;
  maximumDeposit?: Money;
}

export interface RecommendationBenefits {
  annualBenefit: Money;
  rateImprovement: Percentage;
  paybackPeriod?: number; // Days
  cumulativeBenefit: Money; // Over expected holding period
}

export interface RecommendationCompliance {
  fscsImpact: string;
  resultingExposure: Money;
  resultingStatus: ComplianceStatus;
  jointAccountConsidered: boolean;
  pendingDepositsConsidered: boolean;
  shariaCompliant?: boolean;
}

export interface Recommendation {
  id: string;
  type: 'rate_optimization' | 'compliance' | 'rebalancing' | 'joint_account_opportunity';
  priority: Priority;
  
  source: RecommendationSource;
  target: RecommendationTarget;
  benefits: RecommendationBenefits;
  compliance: RecommendationCompliance;
  
  confidence: number; // 0-100
  implementationNotes: string[];
  risks: string[];
  
  // Enhanced metadata
  generatedAt: Date;
  validUntil?: Date;
  requiresJointAccount?: boolean;
  excludedDueToSharia?: boolean;
  
  // Best vs Recommended tracking
  bestAlternative?: {
    bankName: string;
    rate: number;
    marginalBenefit: number;
    annualBenefit: number;
  };
  recommendationReason?: string;
  
  // Dual-mode display logic
  displayMode?: 'OR' | 'AND';      // OR = alternatives (pick one), AND = complementary (execute all)
  displayNotes?: string[];         // Additional display guidance
  
  // FRN risk indication
  missingFRN?: boolean;            // Target product has no FRN (FSCS protection uncertain)
}

// ===== OPTIMIZATION AND OPPORTUNITIES =====

export interface RateOpportunity {
  currentAccount: Account | PendingDeposit;
  targetInstitution: Institution;
  targetProduct: AvailableProduct;
  rateImprovement: Percentage;
  annualBenefit: Money;
  safeTransferAmount: Money;
  
  // FSCS compliance check results
  wouldViolateFSCS: boolean;
  resultingExposure: Money;
  headroomRemaining: Money;
  
  // Enhanced fields
  requiresJointAccount: boolean;
  shariaCompliant: boolean;
  pendingDepositConsidered: boolean;
}

export interface AvailableProduct {
  id: string;
  platform: string;
  source: string;
  bankName: string;
  frn?: string;
  accountType: string;
  aerRate: number;
  grossRate: number;
  termMonths?: number;
  noticePeriodDays?: number;
  minDeposit?: Money;
  maxDeposit?: Money;
  fscsProtected: boolean;
  interestPaymentFrequency?: string;
  applyByDate?: Date;
  specialFeatures?: string[];
  
  // Enhanced fields
  liquidityTier: LiquidityTier;
  confidenceScore: number;
  scrapeDate: Date;
  
  // FRN handling
  missingFRN?: boolean;  // Flag to indicate product has no FRN (FSCS risk)
}

// ===== CONFIGURATION =====

export interface ComplianceConfig {
  fscsStandardLimit: Money;
  fscsToleranceThreshold: Money;
  fscsNearLimitThreshold: Money;
  meaningfulRateThreshold: Percentage;
  personalFSCSOverrideEnabled: boolean;
  personalFSCSMaxExposure: Money;
  overrideRequiresEasyAccess: boolean;
  
  // NEW: Enhanced configuration
  includePendingDepositsInFSCS: boolean;
  allowShariaBanks: boolean;
  includeProductsWithoutFRN: boolean;
}

export interface RiskToleranceConfig {
  meaningfulRateThreshold: Percentage;
  minMoveAmount: Money;
  minRebalancingBenefit: Money;
  rebalancingMinTransferSize: Money;
  rebalancingMaxTransferSize: Money;
  crossTierThreshold: Percentage;
  maxAccountsPreference: number;
  allocationTolerance: Percentage;
  fscsToleranceThreshold: Money;
  maxRecommendationsPerAccount: number;
}

export interface LiquidityAllocationConfig {
  liquidityTier: LiquidityTier;
  targetPercentage: Percentage;
  minPercentage?: Percentage | undefined;
  maxPercentage?: Percentage | undefined;
  tierDescription: string;
  tierShortName: string;
  tierOrder: number;
  isActive: boolean;
}

export interface RateOutlookConfig {
  id: number;
  timeHorizonMonths: number;
  expectedBaseRate: number;
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  scenario: string;
  notes?: string | undefined;
  effectiveDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ===== TRANSFER AND SCENARIOS =====

export interface TransferProposal {
  fromAccountId: string;
  toInstitutionFRN: string;
  amount: Money;
  targetAccountType: AccountType;
  targetAccountSubType: AccountSubType;
  expectedRate?: number;
  
  // Enhanced fields
  isJointAccountTransfer?: boolean;
  considerPendingDeposits?: boolean;
  allowShariaBanks?: boolean;
}

export interface TransferScenario {
  name: string;
  description: string;
  transfers: TransferProposal[];
  expectedBenefit: Money;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  
  // Enhanced scenario data
  affectsJointAccounts: boolean;
  includesPendingDeposits: boolean;
  excludesShariaBanks: boolean;
}

export interface ComplianceImpact {
  scenarioName: string;
  beforeCompliance: ComplianceReport;
  afterCompliance: ComplianceReport;
  impactSummary: {
    institutionsAffected: number;
    complianceImprovement: boolean;
    newViolations: number;
    resolvedViolations: number;
    netBenefit: Money;
  };
  
  // Enhanced impact analysis
  jointAccountImpacts: number;
  pendingDepositImpacts: Money;
  shariaFilteringImpacts: number;
}

// ===== UTILITY TYPES =====

export interface DatabaseConnection {
  readonly databasePath: string;
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>;
  execute(sql: string, params?: any[]): Promise<number>;
  close(): Promise<void>;
}

export interface LogEntry {
  timestamp: Date;
  level: 'DEBUG' | 'INFO' | 'PROGRESS' | 'WARNING' | 'ERROR';
  category: string;
  message: string;
  data?: any;
  error?: Error;
}

export interface BenefitAnalysis {
  totalAnnualBenefit: Money;
  averageBenefit: Money;
  bestOpportunity: Recommendation;
  opportunityCount: number;
  
  // Risk analysis
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  complianceIssues: number;
  
  // Enhanced analysis
  jointAccountOpportunities: number;
  excludedShariaBankOpportunities: number;
  pendingDepositImpact: Money;
}

// ===== ERROR TYPES =====

export class FSCSComplianceError extends Error {
  constructor(
    message: string,
    public readonly institutionFRN: string,
    public readonly currentExposure: Money,
    public readonly limit: Money
  ) {
    super(message);
    this.name = 'FSCSComplianceError';
  }
}

export class ConfigurationError extends Error {
  constructor(message: string, public readonly configKey: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class DatabaseError extends Error {
  constructor(message: string, public readonly query?: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

// ===== RULES ENGINE TYPES =====

export interface RuleCondition {
  fact: string;
  operator: string;
  value: any;
  path?: string;
}

export interface RuleConditions {
  all?: RuleCondition[];
  any?: RuleCondition[];
}

export interface RuleEvent {
  type: string;
  params?: Record<string, any>;
}

export interface OptimizationRule {
  conditions: RuleConditions;
  event: RuleEvent;
  priority?: number;
}

export interface RuleFacts {
  rateImprovement?: number;
  transferAmount?: number;
  annualBenefit?: number;
  institutionConcentration?: number;
  currentRate?: number;
  targetRate?: number;
  sourceInstitutionFRN?: string;
  targetInstitutionFRN?: string;
  accountBalance?: number;
  fscsCompliant?: boolean;
  shariaBankAllowed?: boolean;
  
  // Additional facts for rules engine
  targetFRN?: string;
  cumulativeExposure?: number;
  hasMultipleOpportunities?: boolean;
  useCumulativeTracking?: boolean;
  productFRN?: string;
  productRate?: number;
  
  // Marginal benefit and convenience bonus facts
  marginalBenefit?: number;
  effectiveMarginalBenefit?: number;
  isExistingAccount?: boolean;
  hasHeadroom?: number;
  rateGapFromBest?: number;
  isPreferredPlatform?: boolean;
  rateWithinPlatformTolerance?: boolean;
}

export interface RuleExecutionResult {
  facts: RuleFacts;
  events: RuleEvent[];
  successful: boolean;
}

export interface RuleEngineConfig {
  enabledRules: string[];
  customOperators?: Record<string, Function>;
  debugMode?: boolean;
}

// ===== OPTIMIZATION TYPES =====


export interface ValidatedRecommendation {
  opportunity: RateOpportunity;
  validation: {
    // Note: fscsCompliant removed - FSCS compliance checked separately
    rulesValid: boolean;
    validationEvents: RuleEvent[];
    maxSafeAmount?: Money;
    warnings: string[];
  };
}

export interface BenefitAnalysis {
  totalAnnualBenefit: Money;
  averageRateImprovement: Percentage;
  recommendationCount: number;
  riskAssessment: {
    fscsRisk: 'LOW' | 'MEDIUM' | 'HIGH';
    institutionConcentrationRisk: 'LOW' | 'MEDIUM' | 'HIGH';
    liquidityRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  };
}

// ===== MISSING FRN DETECTION =====

export interface MissingFRNAlert {
  bankName: string;
  aerRate: number;
  platform: string;
  potentialBenefit: Money;
  affectedAccounts: string[]; // Account names that could benefit
  actionRequired: string;
  sqlCommand: string; // Pre-formatted SQL for user to run
}