import * as path from 'path';
import * as fs from 'fs';
import { TestDatabase } from '../helpers/TestDatabase';
import { OrchestrationService, PipelineOptions, PipelineStage } from '@cash-mgmt/pipeline';
// Create a simplified product interface for testing
export interface TestProduct {
  // Core product identification
  bankName: string;
  platform: string;
  source: string;
  accountType: string;

  // Rates and terms
  aerRate: number;
  grossRate: number | null;
  termMonths: number | null;
  noticePeriodDays: number | null;

  // Limits
  minDeposit: number | null;
  maxDeposit: number | null;

  // Features
  fscsProtected: boolean;
  interestPaymentFrequency: string | null;
  applyByDate: string | null;
  specialFeatures: string | null;

  // FRN data
  frn: string | null;

  // Test metadata
  id?: number;
  batchId?: string;
  scrapedAt?: string;
}

/**
 * PipelineTestHelper for Happy Path Tests
 *
 * Provides utilities for testing the complete JSON pipeline flow
 * with special focus on platform/source handling and cross-platform deduplication.
 */

export interface PipelineResult {
  batchId: string;
  products: TestProduct[];
  processingTime: number;
  stats: {
    totalProducts: number;
    platformDistribution: Record<string, number>;
    sourceDistribution: Record<string, number>;
    frnMatches: number;
    dedupGroups: number;
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface PlatformSourceValidation extends ValidationResult {
  platformConsistency: boolean;
  sourceConsistency: boolean;
  crossPlatformProducts: Array<{
    bankName: string;
    platforms: string[];
    frn: string | null;
  }>;
}

// Database result interface that matches actual schema
interface DatabaseProduct {
  id: number;
  platform: string;
  source: string;
  bank_name: string;
  frn: string | null;
  account_type: string;
  aer_rate: number;
  gross_rate: number | null;
  term_months: number | null;
  notice_period_days: number | null;
  min_deposit: number | null;
  max_deposit: number | null;
  fscs_protected: boolean;
  interest_payment_frequency: string | null;
  apply_by_date: string | null;
  special_features: string | null;
  scrape_date: string;
  confidence_score: number;
  business_key: string | null;
  raw_platform: string | null;
}

export interface DeduplicationResult extends ValidationResult {
  totalGroups: number;
  crossPlatformGroups: number;
  preservedPlatforms: Array<{
    bankName: string;
    directPlatform: boolean;
    aggregatorPlatforms: string[];
  }>;
}

export class PipelineTestHelper {
  private testDb: TestDatabase;
  private orchestrator: OrchestrationService;
  private fixturesPath: string;

  constructor(testDb: TestDatabase) {
    this.testDb = testDb;
    this.orchestrator = new OrchestrationService(
      testDb.getConnection(),
      testDb.getPath()
    );
    this.fixturesPath = path.resolve(process.cwd(), 'src/tests/integration/fixtures');
  }

  /**
   * Setup test environment with fresh audit tables
   */
  async setupTestEnvironment(options?: {
    productionLikeFiltering?: boolean;
    minRateThreshold?: number;
    focusOnDeduplication?: boolean;
  }): Promise<void> {
    // Clear audit tables for fresh test runs
    this.testDb.clearAuditTables();

    // Test database now has complete production configuration (171 parameters)
    // No additional configuration needed - everything should be in the database

    // Rebuild FRN lookup helper cache for tests
    await this.rebuildFRNLookupCache();

    // Verify database integrity
    const validation = this.testDb.validateDatabase();
    if (!validation.valid) {
      throw new Error(`Test database invalid: ${validation.errors.join(', ')}`);
    }

    console.log(`✓ Test environment ready: ${validation.frnDataCount} FRN entries available`);
  }

  /**
   * Rebuild FRN lookup helper cache
   */
  private async rebuildFRNLookupCache(): Promise<void> {
    const { FRNMatchingService } = await import('../../../shared/services/FRNMatchingService');
    const frnService = new FRNMatchingService(this.testDb.getConnection());
    await frnService.loadConfiguration();
    // Force rebuild for tests (don't check if config changed)
    await frnService.rebuildLookupHelperCache();
    console.log('✓ FRN lookup helper cache rebuilt for tests');
  }

  /**
   * Execute pipeline with a specific test fixture
   */
  async executePipelineWithTracking(fixtureName: string, options?: PipelineOptions): Promise<PipelineResult> {
    const startTime = Date.now();

    // Get fixture path
    const fixturePath = path.join(this.fixturesPath, fixtureName);
    if (!fs.existsSync(fixturePath)) {
      throw new Error(`Test fixture not found: ${fixturePath}`);
    }

    console.log(`🔄 Processing fixture: ${fixtureName}`);

    try {
      // Create a fresh OrchestrationService instance for each file to avoid state conflicts
      const freshOrchestrator = new OrchestrationService(
        this.testDb.getConnection(),
        this.testDb.getPath()
      );

      // Initialize the orchestrator to load configuration
      await freshOrchestrator.initialize();

      // Execute the pipeline (single file)
      const result = await freshOrchestrator.processFile(fixturePath, options);
      const processingTime = Date.now() - startTime;

      // Get final products from database using requestId
      const products = options?.stopAfterStage === PipelineStage.JSON_INGESTION
        ? this.getRawProducts(result.requestId)
        : this.getFinalProducts(result.requestId);

      // Calculate statistics
      const stats = this.calculateStats(products);

      console.log(`✓ Pipeline completed in ${processingTime}ms: ${products.length} products`);

      return {
        batchId: result.requestId,
        products,
        processingTime,
        stats
      };

    } catch (error) {
      throw new Error(`Pipeline execution failed: ${error}`);
    }
  }

  /**
   * Execute pipeline with ALL test fixtures combined into a single batch
   * This enables standalone cross-platform deduplication testing
   */
  async executeCombinedPipelineWithTracking(fixtureNames: string[], options?: PipelineOptions): Promise<PipelineResult> {
    const startTime = Date.now();

    // Validate all fixture files exist
    const fixturePaths: string[] = [];
    for (const fixtureName of fixtureNames) {
      const fixturePath = path.join(this.fixturesPath, fixtureName);
      if (!fs.existsSync(fixturePath)) {
        throw new Error(`Test fixture not found: ${fixturePath}`);
      }
      fixturePaths.push(fixturePath);
    }

    console.log(`🔄 Processing ${fixtureNames.length} fixtures in single combined batch...`);

    try {
      // Read and combine all fixture data
      const combinedData: any[] = [];
      for (let i = 0; i < fixturePaths.length; i++) {
        const fixturePath = fixturePaths[i];
        const fixtureName = fixtureNames[i];

        console.log(`  📁 Loading ${fixtureName}...`);
        const fixtureData = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

        // Add all products from this fixture
        if (Array.isArray(fixtureData)) {
          combinedData.push(...fixtureData);
        } else {
          // Handle case where fixture is an object with products array
          throw new Error(`Fixture ${fixtureName} is not an array of products`);
        }
      }

      console.log(`  ✓ Combined ${combinedData.length} total products from all fixtures`);

      // Create temporary combined fixture file
      const tempCombinedPath = path.join(this.fixturesPath, 'temp-combined-fixtures.json');
      fs.writeFileSync(tempCombinedPath, JSON.stringify(combinedData, null, 2));

      try {
        // Create a fresh OrchestrationService instance
        const freshOrchestrator = new OrchestrationService(
          this.testDb.getConnection(),
          this.testDb.getPath()
        );

        // Execute the pipeline with combined data
        const result = await freshOrchestrator.processFile(tempCombinedPath, options);
        const processingTime = Date.now() - startTime;

        // Get final products from database using requestId
        const products = options?.stopAfterStage === PipelineStage.JSON_INGESTION
          ? this.getRawProducts(result.requestId)
          : this.getFinalProducts(result.requestId);

        // Calculate statistics
        const stats = this.calculateStats(products);

        console.log(`✓ Combined pipeline completed in ${processingTime}ms: ${products.length} products`);

        return {
          batchId: result.requestId,
          products,
          processingTime,
          stats
        };

      } finally {
        // Clean up temporary file
        if (fs.existsSync(tempCombinedPath)) {
          fs.unlinkSync(tempCombinedPath);
        }
      }

    } catch (error) {
      throw new Error(`Combined pipeline execution failed: ${error}`);
    }
  }

  /**
   * Validate platform and source field handling
   */
  async validatePlatformSourceHandling(batchId: string): Promise<PlatformSourceValidation> {
    const products = this.getFinalProducts(batchId);
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check that all products have required fields
    const missingPlatform = products.filter(p => !p.platform);
    const missingSource = products.filter(p => !p.source);

    if (missingPlatform.length > 0) {
      errors.push(`${missingPlatform.length} products missing platform field`);
    }

    if (missingSource.length > 0) {
      errors.push(`${missingSource.length} products missing source field`);
    }

    // Check platform consistency (within same source)
    const sourceGroups = this.groupBy(products, 'source');
    let platformConsistency = true;

    for (const [source, sourceProducts] of Object.entries(sourceGroups)) {
      if (source === 'flagstone') {
        // For Flagstone, platform should equal source (both lowercase)
        const wrongPlatform = sourceProducts.filter(p => p.platform !== 'flagstone');
        if (wrongPlatform.length > 0) {
          errors.push(`Flagstone products should have platform="flagstone", found: ${wrongPlatform.length} with different platforms`);
          platformConsistency = false;
        }
      } else if (source === 'moneyfacts') {
        // For Moneyfacts, should have multiple platforms but consistent source
        const platforms = new Set(sourceProducts.map(p => p.platform));
        if (platforms.size < 2) {
          warnings.push(`Moneyfacts should have multiple platforms, found only: ${Array.from(platforms).join(', ')}`);
        }
      }
    }

    // Find cross-platform products (same bank on different platforms)
    const crossPlatformProducts = this.findCrossPlatformProducts(products);

    // Check source consistency within platforms
    const platformGroups = this.groupBy(products, 'platform');
    let sourceConsistency = true;

    for (const [platform, platformProducts] of Object.entries(platformGroups)) {
      const sources = new Set(platformProducts.map(p => p.source));
      if (sources.size > 1 && platform !== 'direct') {
        // Direct platform might legitimately have products from different sources
        warnings.push(`Platform "${platform}" has products from multiple sources: ${Array.from(sources).join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      platformConsistency,
      sourceConsistency,
      crossPlatformProducts
    };
  }

  /**
   * Validate cross-platform deduplication logic
   */
  async validateCrossPlatformDedup(batchId: string): Promise<DeduplicationResult> {
    const products = this.getFinalProducts(batchId);
    const errors: string[] = [];
    const warnings: string[] = [];

    // Get deduplication groups from database
    const dedupGroups = this.testDb.getConnection()
      .prepare('SELECT * FROM deduplication_groups WHERE batch_id = ?')
      .all(batchId) as any[];

    // Analyze cross-platform scenarios
    const bankGroups = this.groupBy(products, 'bankName');
    const crossPlatformGroups = Object.entries(bankGroups)
      .filter(([_, bankProducts]) => {
        const platforms = new Set(bankProducts.map(p => p.platform));
        return platforms.size > 1;
      });

    // Check that cross-platform products are preserved
    const preservedPlatforms: Array<{
      bankName: string;
      directPlatform: boolean;
      aggregatorPlatforms: string[];
    }> = [];

    for (const [bankName, bankProducts] of crossPlatformGroups) {
      const platforms = bankProducts.map(p => p.platform);
      const directPlatform = platforms.includes('direct');
      const aggregatorPlatforms = platforms.filter(p => p !== 'direct');

      // Check FRN consistency across platforms
      const frns = new Set(bankProducts.map(p => p.frn).filter(f => f !== null));
      if (frns.size > 1) {
        errors.push(`Bank "${bankName}" has inconsistent FRNs across platforms: ${Array.from(frns).join(', ')}`);
      }

      // Verify that products on different platforms are kept separate
      if (bankProducts.length < platforms.length) {
        errors.push(`Bank "${bankName}" missing products for some platforms`);
      }

      preservedPlatforms.push({
        bankName,
        directPlatform,
        aggregatorPlatforms
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      totalGroups: dedupGroups.length,
      crossPlatformGroups: crossPlatformGroups.length,
      preservedPlatforms
    };
  }

  /**
   * Validate audit trail completeness and JSON structure
   */
  validateAuditTrail(batchId: string): ValidationResult {
    const auditTrail = this.testDb.getAuditTrail(batchId);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!auditTrail) {
      errors.push('No audit trail found');
      return { valid: false, errors, warnings };
    }

    // Check JSON ingestion audit
    if (!auditTrail.jsonIngestion || auditTrail.jsonIngestion.length === 0) {
      errors.push('No JSON ingestion audit entries');
    } else {
      // Validate JSON structure in metadata
      for (const entry of auditTrail.jsonIngestion) {
        if (!this.isValidJSON(entry.validation_details)) {
          errors.push('JSON ingestion validation_details is not valid JSON');
        }
        if (!this.isValidJSON(entry.platform_source_metadata)) {
          errors.push('JSON ingestion platform_source_metadata is not valid JSON');
        }
      }
    }

    // Check FRN matching audit
    if (!auditTrail.frnMatching || auditTrail.frnMatching.length === 0) {
      warnings.push('No FRN matching audit entries');
    } else {
      for (const entry of auditTrail.frnMatching) {
        if (!this.isValidJSON(entry.matching_details)) {
          errors.push('FRN matching matching_details is not valid JSON');
        }
      }
    }

    // Check deduplication audit
    if (!auditTrail.deduplication) {
      errors.push('No deduplication audit entry');
    } else {
      if (!this.isValidJSON(auditTrail.deduplication.platform_analysis)) {
        errors.push('Deduplication platform_analysis is not valid JSON');
      }
      if (!this.isValidJSON(auditTrail.deduplication.rejected_products_metadata)) {
        errors.push('Deduplication rejected_products_metadata is not valid JSON');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get final products from database after pipeline execution
   */
  private getFinalProducts(batchId: string): TestProduct[] {
    try {
      // Get all current products since they replace previous ones in available_products table
      const products = this.testDb.getConnection()
        .prepare(`
          SELECT * FROM available_products
          ORDER BY bank_name, platform
        `)
        .all() as DatabaseProduct[];

      // Convert database format to test format
      return products.map(p => ({
        // Core product info
        bankName: p.bank_name,
        platform: p.platform,
        source: p.source || 'unknown',
        accountType: p.account_type,

        // Rates and terms
        aerRate: p.aer_rate,
        grossRate: p.gross_rate,
        termMonths: p.term_months,
        noticePeriodDays: p.notice_period_days,

        // Limits
        minDeposit: p.min_deposit,
        maxDeposit: p.max_deposit,

        // Features
        fscsProtected: p.fscs_protected,
        interestPaymentFrequency: p.interest_payment_frequency,
        applyByDate: p.apply_by_date,
        specialFeatures: p.special_features,

        // FRN data
        frn: p.frn,

        // Test metadata
        id: p.id,
        batchId: batchId,
        scrapedAt: p.scrape_date
      })) as TestProduct[];
    } catch (error) {
      throw new Error(`Failed to get final products: ${error}`);
    }
  }

  /**
   * Get raw products from database after JSON ingestion (for stopAfterStage: JSON_INGESTION)
   */
  private getRawProducts(batchId: string): TestProduct[] {
    try {
      // Get all raw products (filtered during JSON ingestion)
      const products = this.testDb.getConnection()
        .prepare(`
          SELECT * FROM available_products_raw
          ORDER BY bank_name, platform
        `)
        .all() as DatabaseProduct[];

      // Convert database format to test format
      return products.map(p => ({
        // Core product info
        bankName: p.bank_name,
        platform: p.platform,
        source: p.source || 'unknown',
        accountType: p.account_type,

        // Rates and terms
        aerRate: p.aer_rate,
        grossRate: p.gross_rate,
        termMonths: p.term_months,
        noticePeriodDays: p.notice_period_days,

        // Limits
        minDeposit: p.min_deposit,
        maxDeposit: p.max_deposit,

        // Features
        fscsProtected: p.fscs_protected,
        interestPaymentFrequency: p.interest_payment_frequency,
        applyByDate: p.apply_by_date,
        specialFeatures: p.special_features,

        // FRN data (null in raw table since FRN matching hasn't run yet)
        frn: null,

        // Test metadata
        id: p.id,
        batchId: batchId,
        scrapedAt: p.scrape_date
      })) as TestProduct[];
    } catch (error) {
      throw new Error(`Failed to get raw products: ${error}`);
    }
  }

  /**
   * Calculate pipeline statistics
   */
  private calculateStats(products: TestProduct[]): PipelineResult['stats'] {
    const platformDistribution = this.countBy(products, 'platform');
    const sourceDistribution = this.countBy(products, 'source');
    const frnMatches = products.filter(p => p.frn !== null).length;

    // Count deduplication groups
    const bankGroups = this.groupBy(products, 'bankName');
    const dedupGroups = Object.keys(bankGroups).length;

    return {
      totalProducts: products.length,
      platformDistribution,
      sourceDistribution,
      frnMatches,
      dedupGroups
    };
  }

  /**
   * Find products from same bank on different platforms
   */
  private findCrossPlatformProducts(products: TestProduct[]): Array<{
    bankName: string;
    platforms: string[];
    frn: string | null;
  }> {
    const bankGroups = this.groupBy(products, 'bankName');

    return Object.entries(bankGroups)
      .filter(([_, bankProducts]) => {
        const platforms = new Set(bankProducts.map(p => p.platform));
        return platforms.size > 1;
      })
      .map(([bankName, bankProducts]) => ({
        bankName,
        platforms: Array.from(new Set(bankProducts.map(p => p.platform))),
        frn: bankProducts[0].frn || null // Should be consistent across platforms
      }));
  }

  /**
   * Utility: Group array by key
   */
  private groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
    return array.reduce((groups, item) => {
      const value = String(item[key]);
      if (!groups[value]) {
        groups[value] = [];
      }
      groups[value].push(item);
      return groups;
    }, {} as Record<string, T[]>);
  }

  /**
   * Utility: Count occurrences by key
   */
  private countBy<T>(array: T[], key: keyof T): Record<string, number> {
    return array.reduce((counts, item) => {
      const value = String(item[key]);
      counts[value] = (counts[value] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
  }

  /**
   * Utility: Check if string is valid JSON
   */
  private isValidJSON(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate test report
   */
  generateTestReport(results: PipelineResult[], validations: any[]): string {
    const report = [`# Happy Path Tests Report - ${new Date().toISOString()}`];

    report.push('\n## Test Results Summary\n');

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const validation = validations[i];

      report.push(`### Test ${i + 1}: ${result.batchId}`);
      report.push(`- **Products Processed**: ${result.stats.totalProducts}`);
      report.push(`- **Processing Time**: ${result.processingTime}ms`);
      report.push(`- **FRN Matches**: ${result.stats.frnMatches}`);
      report.push(`- **Platform Distribution**: ${JSON.stringify(result.stats.platformDistribution, null, 2)}`);
      report.push(`- **Source Distribution**: ${JSON.stringify(result.stats.sourceDistribution, null, 2)}`);

      if (validation && !validation.valid) {
        report.push(`- **❌ Validation Errors**: ${validation.errors.join(', ')}`);
      } else {
        report.push(`- **✅ Validation**: Passed`);
      }

      report.push('');
    }

    return report.join('\n');
  }

  /**
   * Create a temporary fixture file for testing
   * Useful for creating custom test scenarios without modifying permanent fixtures
   *
   * @param testData - Object with metadata and products array
   * @returns Path to the temporary fixture file
   *
   * Example:
   * ```typescript
   * const fixturePath = await helper.createTemporaryFixture({
   *   metadata: { source: 'test', method: 'test-method' },
   *   products: [{ bankName: 'Test Bank', ... }]
   * });
   * await helper.executePipelineWithTracking(fixturePath, { stopAfterStage: ... });
   * ```
   */
  createTemporaryFixture(testData: { metadata: any; products: any[] }): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const tempFileName = `temp-test-fixture-${timestamp}-${random}.json`;
    const tempPath = path.join(this.fixturesPath, tempFileName);

    // Write the test data to a temporary fixture file
    fs.writeFileSync(tempPath, JSON.stringify(testData, null, 2), 'utf8');

    return tempFileName; // Return just the filename, not full path
  }

  /**
   * Clean up temporary fixture files created during testing
   * Call this in afterEach or afterAll to remove test fixtures
   */
  cleanupTemporaryFixtures(): void {
    const files = fs.readdirSync(this.fixturesPath);
    const tempFiles = files.filter(f => f.startsWith('temp-test-fixture-') || f.startsWith('temp-combined-fixtures'));

    for (const file of tempFiles) {
      const filePath = path.join(this.fixturesPath, file);
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.warn(`Warning: Could not delete temporary fixture ${file}:`, err);
      }
    }

    if (tempFiles.length > 0) {
      console.log(`✓ Cleaned up ${tempFiles.length} temporary fixture file(s)`);
    }
  }
}