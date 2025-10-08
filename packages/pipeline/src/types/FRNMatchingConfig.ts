/**
 * FRN Matching Configuration Interface
 *
 * Defines the configuration structure loaded from unified_config database table.
 * All parameters are loaded from category 'frn_matching'.
 */

export interface FRNMatchingConfig {
  // Core matching parameters
  enabled: boolean;
  fuzzyThreshold: number;
  maxEditDistance: number;
  batchSize: number;

  // Confidence levels
  exactMatchConfidence: number;
  aliasMatchConfidence: number;
  fuzzyMatchConfidence: number;
  confidenceThresholdHigh: number;
  confidenceThresholdLow: number;

  // Feature toggles
  enableFuzzy: boolean;
  enableAlias: boolean;
  enableAuditTrail: boolean;
  enableResearchQueue: boolean;

  // Normalization rules
  normalizationEnabled: boolean;
  normalizationPrefixes: string[];
  normalizationSuffixes: string[];
  normalizationAbbreviations: Record<string, string>;

  // Research queue settings
  researchQueueMaxSize: number;
  autoFlagUnmatched: boolean;

  // Performance settings
  timeoutMs: number;
  maxConcurrentLookups: number;

  // Logging
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}


/**
 * Configuration validation errors
 */
export class FRNConfigurationError extends Error {
  constructor(message: string, public parameter?: string) {
    super(message);
    this.name = 'FRNConfigurationError';
  }
}