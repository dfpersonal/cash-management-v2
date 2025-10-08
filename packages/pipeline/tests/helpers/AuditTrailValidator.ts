import * as Database from 'better-sqlite3';

/**
 * AuditTrailValidator for Phase 4 Integration Tests
 *
 * Comprehensive JSON structure validation for audit trail data
 * ensuring audit logs are not just present but genuinely useful
 * for debugging, compliance, and monitoring.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  details?: any;
}

export interface AuditTrailCompleteness {
  jsonIngestionCount: number;
  frnMatchingCount: number;
  deduplicationExists: boolean;
  deduplicationGroupsCount: number;
  totalRecords: number;
}

export interface PerformanceMetricsValidation {
  valid: boolean;
  totalProcessingTime: number;
  sumOfParts: number;
  difference: number;
  withinTolerance: boolean;
  errors: string[];
}

/**
 * AuditTrailValidator Class
 *
 * Validates that JSON stored in audit trail metadata columns
 * is correctly structured and contains expected data for:
 * - Debugging failures with complete rejection metadata
 * - Compliance reporting with structured audit data
 * - Performance monitoring with accurate timing metrics
 * - Historical analysis through queryable JSON structures
 */
export class AuditTrailValidator {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Validate JSON Ingestion Audit Trail
   * Ensures validation_details, normalization_applied, and rejection_reasons are well-formed
   */
  validateJSONIngestionAudit(batchId: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const audits = this.db
        .prepare('SELECT * FROM json_ingestion_audit WHERE batch_id = ?')
        .all(batchId);

      if (audits.length === 0) {
        warnings.push('No JSON ingestion audit entries found');
        return { valid: true, errors, warnings };
      }

      for (const audit of audits as any[]) {
        // Validate raw_product_json is valid JSON
        try {
          const rawProduct = JSON.parse(audit.raw_product_json);
          if (typeof rawProduct !== 'object' || rawProduct === null) {
            errors.push(`Invalid raw_product_json structure for product ${audit.product_id}`);
          }
        } catch (error) {
          errors.push(`Invalid raw_product_json JSON for product ${audit.product_id}: ${error}`);
        }

        // Validate validation_details JSON array structure
        try {
          const validationDetails = JSON.parse(audit.validation_details);
          if (!Array.isArray(validationDetails)) {
            errors.push(`validation_details must be array for product ${audit.product_id}`);
          } else {
            for (const detail of validationDetails) {
              if (!detail.field || !detail.rule || typeof detail.passed !== 'boolean') {
                errors.push(`Invalid validation_details structure for product ${audit.product_id}`);
                break;
              }
              if (!detail.passed && !detail.message) {
                errors.push(`Missing error message for failed validation in product ${audit.product_id}`);
              }
            }
          }
        } catch (error) {
          errors.push(`Invalid validation_details JSON for product ${audit.product_id}: ${error}`);
        }

        // Validate normalization_applied JSON object
        try {
          const normalization = JSON.parse(audit.normalization_applied);
          if (typeof normalization !== 'object' || normalization === null) {
            errors.push(`normalization_applied must be object for product ${audit.product_id}`);
          } else if (normalization.bankName) {
            if (!normalization.bankName.original || !normalization.bankName.normalized) {
              errors.push(`Invalid bankName normalization structure for product ${audit.product_id}`);
            }
          }
        } catch (error) {
          errors.push(`Invalid normalization_applied JSON for product ${audit.product_id}: ${error}`);
        }

        // If rejected, validate rejection_reasons JSON
        if (audit.validation_status === 'invalid') {
          try {
            const reasons = JSON.parse(audit.rejection_reasons);
            if (!Array.isArray(reasons) || reasons.length === 0) {
              errors.push(`Invalid or empty rejection_reasons for rejected product ${audit.product_id}`);
            }
          } catch (error) {
            errors.push(`Invalid rejection_reasons JSON for product ${audit.product_id}: ${error}`);
          }
        }
      }

      return { valid: errors.length === 0, errors, warnings, details: { auditCount: audits.length } };
    } catch (error) {
      return {
        valid: false,
        errors: [`Failed to validate JSON ingestion audit: ${error}`],
        warnings
      };
    }
  }

  /**
   * Validate FRN Matching Audit Trail
   * Ensures candidate_frns includes confidence scores and normalization_steps are tracked
   */
  validateFRNMatchingAudit(batchId: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const audits = this.db
        .prepare('SELECT * FROM frn_matching_audit WHERE batch_id = ?')
        .all(batchId);

      if (audits.length === 0) {
        warnings.push('No FRN matching audit entries found');
        return { valid: true, errors, warnings };
      }

      for (const audit of audits as any[]) {
        // Validate normalization_steps JSON array
        try {
          const normSteps = JSON.parse(audit.normalization_steps);
          if (!Array.isArray(normSteps)) {
            errors.push(`normalization_steps must be array for product ${audit.product_id}`);
          } else {
            for (const step of normSteps) {
              if (!step.action || !step.before || !step.after) {
                errors.push(`Invalid normalization step structure for product ${audit.product_id}`);
                break;
              }
            }
          }
        } catch (error) {
          errors.push(`Invalid normalization_steps JSON for product ${audit.product_id}: ${error}`);
        }

        // Validate candidate_frns JSON array with confidence scores
        try {
          const candidates = JSON.parse(audit.candidate_frns);
          if (!Array.isArray(candidates)) {
            errors.push(`candidate_frns must be array for product ${audit.product_id}`);
          } else {
            for (const candidate of candidates) {
              // Check required fields
              if (!candidate.frn || !candidate.bankName) {
                errors.push(`Missing required candidate fields for product ${audit.product_id}`);
                break;
              }

              // Check confidence score
              if (typeof candidate.confidence !== 'number' ||
                  candidate.confidence < 0 || candidate.confidence > 1) {
                errors.push(`Invalid confidence score for product ${audit.product_id}`);
                break;
              }

              // Check match type
              if (!['exact', 'fuzzy', 'alias'].includes(candidate.matchType)) {
                errors.push(`Invalid matchType for product ${audit.product_id}: ${candidate.matchType}`);
                break;
              }
            }
          }
        } catch (error) {
          errors.push(`Invalid candidate_frns JSON for product ${audit.product_id}: ${error}`);
        }

        // Validate decision routing
        if (!['auto_assigned', 'research_queue', 'default_assigned'].includes(audit.decision_routing)) {
          errors.push(`Invalid decision_routing for product ${audit.product_id}: ${audit.decision_routing}`);
        }
      }

      return { valid: errors.length === 0, errors, warnings, details: { auditCount: audits.length } };
    } catch (error) {
      return {
        valid: false,
        errors: [`Failed to validate FRN matching audit: ${error}`],
        warnings
      };
    }
  }

  /**
   * Validate Deduplication Audit Trail
   * Ensures business_key_fields and quality_score_distribution are properly structured
   */
  validateDeduplicationAudit(batchId: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const audit = this.db
        .prepare('SELECT * FROM deduplication_audit WHERE batch_id = ?')
        .get(batchId) as any;

      if (!audit) {
        warnings.push('No deduplication audit entry found');
        return { valid: true, errors, warnings };
      }

      // Validate core fields exist
      if (audit.batch_id !== batchId) {
        errors.push('Batch ID mismatch in deduplication audit');
      }
      if (!audit.input_products_count || audit.input_products_count <= 0) {
        errors.push('Invalid input_products_count in deduplication audit');
      }

      // Validate business_key_fields JSON array
      try {
        const businessKeyFields = JSON.parse(audit.business_key_fields);
        if (!Array.isArray(businessKeyFields)) {
          errors.push('business_key_fields must be array');
        } else if (!businessKeyFields.includes('bankName')) {
          warnings.push('bankName not included in business key fields');
        }
      } catch (error) {
        errors.push(`Invalid business_key_fields JSON: ${error}`);
      }

      // Validate quality_score_distribution JSON object
      try {
        const qualityDistribution = JSON.parse(audit.quality_score_distribution);
        if (typeof qualityDistribution !== 'object' || qualityDistribution === null) {
          errors.push('quality_score_distribution must be object');
        } else {
          const requiredFields = ['mean', 'median', 'min', 'max', 'count'];
          for (const field of requiredFields) {
            if (!(field in qualityDistribution)) {
              errors.push(`Missing ${field} in quality_score_distribution`);
            }
          }
        }
      } catch (error) {
        errors.push(`Invalid quality_score_distribution JSON: ${error}`);
      }

      // Validate selection_criteria JSON
      if (audit.selection_criteria) {
        try {
          const criteria = JSON.parse(audit.selection_criteria);
          if (typeof criteria !== 'object' || criteria === null) {
            errors.push('selection_criteria must be object');
          }
        } catch (error) {
          errors.push(`Invalid selection_criteria JSON: ${error}`);
        }
      }

      // Validate FSCS violations JSON array if present
      if (audit.fscs_violations) {
        try {
          const violations = JSON.parse(audit.fscs_violations);
          if (!Array.isArray(violations)) {
            errors.push('fscs_violations must be array');
          }
        } catch (error) {
          errors.push(`Invalid fscs_violations JSON: ${error}`);
        }
      }

      return { valid: errors.length === 0, errors, warnings, details: audit };
    } catch (error) {
      return {
        valid: false,
        errors: [`Failed to validate deduplication audit: ${error}`],
        warnings
      };
    }
  }

  /**
   * Validate Deduplication Groups with Rejected Products Metadata
   * Ensures rejected products contain complete comparison metadata
   */
  validateDeduplicationGroups(batchId: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const groups = this.db
        .prepare('SELECT * FROM deduplication_groups WHERE batch_id = ?')
        .all(batchId);

      if (groups.length === 0) {
        warnings.push('No deduplication groups found');
        return { valid: true, errors, warnings };
      }

      for (const group of groups as any[]) {
        // Validate platforms_in_group JSON array
        try {
          const platforms = JSON.parse(group.platforms_in_group);
          if (!Array.isArray(platforms) || platforms.length === 0) {
            errors.push(`Invalid platforms_in_group for business key ${group.business_key}`);
          }
        } catch (error) {
          errors.push(`Invalid platforms_in_group JSON for business key ${group.business_key}: ${error}`);
        }

        // Validate sources_in_group JSON array
        try {
          const sources = JSON.parse(group.sources_in_group);
          if (!Array.isArray(sources)) {
            errors.push(`Invalid sources_in_group for business key ${group.business_key}`);
          }
        } catch (error) {
          errors.push(`Invalid sources_in_group JSON for business key ${group.business_key}: ${error}`);
        }

        // Validate quality_scores JSON object
        try {
          const scores = JSON.parse(group.quality_scores);
          if (typeof scores !== 'object' || scores === null) {
            errors.push(`Invalid quality_scores for business key ${group.business_key}`);
          } else {
            for (const productId in scores) {
              const score = scores[productId];
              if (typeof score !== 'number' || score < 0 || score > 1) {
                errors.push(`Invalid quality score for product ${productId} in business key ${group.business_key}`);
                break;
              }
            }
          }
        } catch (error) {
          errors.push(`Invalid quality_scores JSON for business key ${group.business_key}: ${error}`);
        }

        // Validate rejected_products JSON structure with complete metadata
        if (group.rejected_products) {
          try {
            const rejected = JSON.parse(group.rejected_products);
            if (!Array.isArray(rejected)) {
              errors.push(`rejected_products must be array for business key ${group.business_key}`);
            } else {
              for (const product of rejected) {
                // Check required fields for complete comparison metadata
                const requiredFields = [
                  'productId', 'platform', 'bankName', 'aerRate',
                  'rejectionReason', 'qualityScore', 'comparedTo', 'comparisonMetrics'
                ];

                for (const field of requiredFields) {
                  if (!(field in product)) {
                    errors.push(`Missing ${field} in rejected product for business key ${group.business_key}`);
                    break;
                  }
                }

                // Validate comparison metrics structure
                if (product.comparisonMetrics && typeof product.comparisonMetrics === 'object') {
                  if (!product.comparisonMetrics.reason) {
                    errors.push(`Missing comparison reason for rejected product in business key ${group.business_key}`);
                  }
                } else {
                  errors.push(`Invalid comparisonMetrics structure for rejected product in business key ${group.business_key}`);
                }
              }
            }
          } catch (error) {
            errors.push(`Invalid rejected_products JSON for business key ${group.business_key}: ${error}`);
          }
        }
      }

      return { valid: errors.length === 0, errors, warnings, details: { groupCount: groups.length } };
    } catch (error) {
      return {
        valid: false,
        errors: [`Failed to validate deduplication groups: ${error}`],
        warnings
      };
    }
  }

  /**
   * Validate Complete Audit Trail for a Batch
   * Comprehensive validation across all audit tables
   */
  validateCompleteAuditTrail(batchId: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const completeness: AuditTrailCompleteness = {
      jsonIngestionCount: 0,
      frnMatchingCount: 0,
      deduplicationExists: false,
      deduplicationGroupsCount: 0,
      totalRecords: 0
    };

    // Validate each audit stage
    const jsonResult = this.validateJSONIngestionAudit(batchId);
    errors.push(...jsonResult.errors);
    warnings.push(...jsonResult.warnings);
    if (jsonResult.details) {
      completeness.jsonIngestionCount = jsonResult.details.auditCount;
    }

    const frnResult = this.validateFRNMatchingAudit(batchId);
    errors.push(...frnResult.errors);
    warnings.push(...frnResult.warnings);
    if (frnResult.details) {
      completeness.frnMatchingCount = frnResult.details.auditCount;
    }

    const dedupResult = this.validateDeduplicationAudit(batchId);
    errors.push(...dedupResult.errors);
    warnings.push(...dedupResult.warnings);
    if (dedupResult.details) {
      completeness.deduplicationExists = true;
    }

    const groupsResult = this.validateDeduplicationGroups(batchId);
    errors.push(...groupsResult.errors);
    warnings.push(...groupsResult.warnings);
    if (groupsResult.details) {
      completeness.deduplicationGroupsCount = groupsResult.details.groupCount;
    }

    completeness.totalRecords = completeness.jsonIngestionCount +
                              completeness.frnMatchingCount +
                              (completeness.deduplicationExists ? 1 : 0) +
                              completeness.deduplicationGroupsCount;

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      details: completeness
    };
  }

  /**
   * Validate Performance Metrics Accuracy
   * Ensures timing metrics are consistent and reasonable
   */
  validatePerformanceMetrics(batchId: string): PerformanceMetricsValidation {
    const errors: string[] = [];

    try {
      const audit = this.db
        .prepare('SELECT * FROM deduplication_audit WHERE batch_id = ?')
        .get(batchId) as any;

      if (!audit) {
        return {
          valid: false,
          totalProcessingTime: 0,
          sumOfParts: 0,
          difference: 0,
          withinTolerance: false,
          errors: ['No deduplication audit found for performance validation']
        };
      }

      // Validate timing metrics are present and reasonable
      if (!audit.processing_time_ms || audit.processing_time_ms <= 0) {
        errors.push('Invalid or missing processing_time_ms');
      }
      if (!audit.business_key_generation_time_ms || audit.business_key_generation_time_ms < 0) {
        errors.push('Invalid business_key_generation_time_ms');
      }
      if (!audit.quality_scoring_time_ms || audit.quality_scoring_time_ms < 0) {
        errors.push('Invalid quality_scoring_time_ms');
      }
      if (!audit.selection_time_ms || audit.selection_time_ms < 0) {
        errors.push('Invalid selection_time_ms');
      }

      // Check if sum of parts approximately equals total (within 100ms tolerance)
      const totalProcessingTime = audit.processing_time_ms;
      const sumOfParts = audit.business_key_generation_time_ms +
                        audit.quality_scoring_time_ms +
                        audit.selection_time_ms;
      const difference = Math.abs(sumOfParts - totalProcessingTime);
      const withinTolerance = difference <= 100;

      if (!withinTolerance) {
        errors.push(`Performance metrics inconsistent: total=${totalProcessingTime}ms, sum=${sumOfParts}ms, diff=${difference}ms`);
      }

      return {
        valid: errors.length === 0,
        totalProcessingTime,
        sumOfParts,
        difference,
        withinTolerance,
        errors
      };
    } catch (error) {
      return {
        valid: false,
        totalProcessingTime: 0,
        sumOfParts: 0,
        difference: 0,
        withinTolerance: false,
        errors: [`Failed to validate performance metrics: ${error}`]
      };
    }
  }

  /**
   * Test SQL JSON Function Queryability
   * Demonstrates that audit trail can be queried using SQL JSON functions
   */
  testJSONQueryability(batchId: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const queryResults: any = {};

    try {
      // Test FRN confidence score queries
      try {
        const highConfidenceFRNs = this.db
          .prepare(`
            SELECT COUNT(*) as count
            FROM frn_matching_audit
            WHERE batch_id = ?
              AND json_extract(candidate_frns, '$[0].confidence') > 0.8
          `)
          .get(batchId) as any;

        queryResults.highConfidenceFRNs = highConfidenceFRNs?.count || 0;
      } catch (error) {
        errors.push(`Failed to query FRN confidence scores: ${error}`);
      }

      // Test rejected products queries
      try {
        const platformPriorityRejections = this.db
          .prepare(`
            SELECT COUNT(*) as count
            FROM deduplication_groups
            WHERE batch_id = ?
              AND json_extract(rejected_products, '$[0].rejectionReason') = 'platform_priority'
          `)
          .get(batchId) as any;

        queryResults.platformPriorityRejections = platformPriorityRejections?.count || 0;
      } catch (error) {
        errors.push(`Failed to query rejected products: ${error}`);
      }

      // Test validation details queries
      try {
        const validationFailures = this.db
          .prepare(`
            SELECT COUNT(*) as count
            FROM json_ingestion_audit
            WHERE batch_id = ?
              AND json_extract(validation_details, '$[0].passed') = 0
          `)
          .get(batchId) as any;

        queryResults.validationFailures = validationFailures?.count || 0;
      } catch (error) {
        warnings.push(`Could not query validation details (table may not exist)`);
      }

      // Test normalization queries
      try {
        const normalizedBankNames = this.db
          .prepare(`
            SELECT COUNT(*) as count
            FROM json_ingestion_audit
            WHERE batch_id = ?
              AND json_extract(normalization_applied, '$.bankName.original') IS NOT NULL
          `)
          .get(batchId) as any;

        queryResults.normalizedBankNames = normalizedBankNames?.count || 0;
      } catch (error) {
        warnings.push(`Could not query normalization data (table may not exist)`);
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        details: queryResults
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Failed to test JSON queryability: ${error}`],
        warnings,
        details: queryResults
      };
    }
  }

  /**
   * Generate Audit Trail Summary Report
   * Provides comprehensive overview of audit trail quality and completeness
   */
  generateAuditTrailReport(batchId: string): any {
    const completeValidation = this.validateCompleteAuditTrail(batchId);
    const performanceValidation = this.validatePerformanceMetrics(batchId);
    const queryabilityTest = this.testJSONQueryability(batchId);

    return {
      batchId,
      timestamp: new Date().toISOString(),
      summary: {
        overall: completeValidation.valid && performanceValidation.valid && queryabilityTest.valid,
        totalErrors: completeValidation.errors.length + performanceValidation.errors.length + queryabilityTest.errors.length,
        totalWarnings: completeValidation.warnings.length + queryabilityTest.warnings.length,
        completeness: completeValidation.details
      },
      validation: {
        structure: {
          valid: completeValidation.valid,
          errors: completeValidation.errors,
          warnings: completeValidation.warnings
        },
        performance: performanceValidation,
        queryability: {
          valid: queryabilityTest.valid,
          errors: queryabilityTest.errors,
          warnings: queryabilityTest.warnings,
          results: queryabilityTest.details
        }
      },
      recommendations: this.generateRecommendations(completeValidation, performanceValidation, queryabilityTest)
    };
  }

  /**
   * Generate recommendations based on validation results
   */
  private generateRecommendations(
    complete: ValidationResult,
    performance: PerformanceMetricsValidation,
    queryability: ValidationResult
  ): string[] {
    const recommendations: string[] = [];

    if (!complete.valid) {
      recommendations.push('Fix JSON structure validation errors before production deployment');
    }

    if (!performance.valid) {
      recommendations.push('Review performance metric calculation logic for accuracy');
    }

    if (!queryability.valid) {
      recommendations.push('Ensure audit trail JSON fields support SQL querying for analytics');
    }

    if (complete.warnings.length > 0) {
      recommendations.push('Address audit trail warnings to improve debugging capabilities');
    }

    if (recommendations.length === 0) {
      recommendations.push('Audit trail validation passed - ready for production monitoring');
    }

    return recommendations;
  }
}