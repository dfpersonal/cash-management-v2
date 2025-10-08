/**
 * Configuration loader tests
 */

import { ConfigurationLoader } from '../configuration/loader';
import { SQLiteConnection } from '../database/connection';
import { Money, Percentage } from '../utils/money';

// Use test database
const TEST_DB_PATH = '/Users/david/Websites/cash-management-v2/packages/optimization/data/test/databases/cash_savings_test_phase4.db';

describe('ConfigurationLoader', () => {
  let configLoader: ConfigurationLoader;
  let db: SQLiteConnection;

  beforeAll(async () => {
    db = new SQLiteConnection(TEST_DB_PATH);
    await db.connect();
    configLoader = new ConfigurationLoader(db);
  });

  afterAll(async () => {
    await db.close();
  });

  describe('loadComplianceConfig', () => {
    it('should load compliance configuration with correct types', async () => {
      const config = await configLoader.loadComplianceConfig();

      expect(config.fscsStandardLimit).toBeInstanceOf(Money);
      expect(config.fscsStandardLimit.amount).toBe(85000);
      
      expect(config.fscsToleranceThreshold).toBeInstanceOf(Money);
      expect(config.fscsToleranceThreshold.amount).toBe(500);
      
      expect(config.meaningfulRateThreshold).toBeInstanceOf(Percentage);
      expect(config.meaningfulRateThreshold.value).toBe(0.2);

      // Test new enhanced configuration
      expect(config.includePendingDepositsInFSCS).toBe(true);
      expect(config.allowShariaBanks).toBe(true);
    });

    it('should cache configuration results', async () => {
      const config1 = await configLoader.loadComplianceConfig();
      const config2 = await configLoader.loadComplianceConfig();
      
      expect(config1).toBe(config2); // Should be same object due to caching
    });
  });

  describe('loadShariaBankRegistry', () => {
    it('should load Sharia bank registry', async () => {
      const shariaBanks = await configLoader.loadShariaBankRegistry();

      expect(shariaBanks).toHaveLength(2); // We inserted 2 banks
      
      const alRayan = shariaBanks.find(bank => bank.frn === '204677');
      expect(alRayan).toBeDefined();
      expect(alRayan!.bankName).toBe('Al Rayan Bank');
      expect(alRayan!.isShariaCompliant).toBe(true);
      
      const gatehouse = shariaBanks.find(bank => bank.frn === '302885');
      expect(gatehouse).toBeDefined();
      expect(gatehouse!.bankName).toBe('Gatehouse Bank');
      expect(gatehouse!.isShariaCompliant).toBe(true);
    });

    it('should provide utility methods for Sharia bank checking', async () => {
      const shariaFRNs = await configLoader.getShariaBankFRNs();
      expect(shariaFRNs).toContain('204677');
      expect(shariaFRNs).toContain('302885');
      
      const isAlRayanSharia = await configLoader.isShariaBankFRN('204677');
      expect(isAlRayanSharia).toBe(true);
      
      const isNSISharia = await configLoader.isShariaBankFRN('845350'); // NS&I
      expect(isNSISharia).toBe(false);
    });
  });

  describe('loadInstitutionPreferences', () => {
    it('should load institution preferences', async () => {
      const preferences = await configLoader.loadInstitutionPreferences();

      expect(preferences.length).toBeGreaterThanOrEqual(2); // NS&I and Goldman Sachs
      
      const nsiPreference = preferences.find(pref => pref.frn === '845350');
      expect(nsiPreference).toBeDefined();
      expect(nsiPreference!.bankName).toBe('NS&I');
      expect(nsiPreference!.personalLimit.amount).toBe(2000000);
      expect(nsiPreference!.easyAccessRequiredAboveFSCS).toBe(false);
      expect(nsiPreference!.trustLevel).toBe('high');
      
      const goldmanPreference = preferences.find(pref => pref.frn === '124659');
      expect(goldmanPreference).toBeDefined();
      expect(goldmanPreference!.bankName).toBe('Goldman Sachs International Bank');
      expect(goldmanPreference!.personalLimit.amount).toBe(120000);
      expect(goldmanPreference!.easyAccessRequiredAboveFSCS).toBe(true);
    });

    it('should provide utility method for getting preference by FRN', async () => {
      const nsiPreference = await configLoader.getInstitutionPreferenceByFRN('845350');
      expect(nsiPreference).toBeDefined();
      expect(nsiPreference!.bankName).toBe('NS&I');
      
      const unknownPreference = await configLoader.getInstitutionPreferenceByFRN('999999');
      expect(unknownPreference).toBeNull();
    });
  });

  describe('loadRateOutlookConfig', () => {
    it('should load rate outlook configuration', async () => {
      const config = await configLoader.loadRateOutlookConfig();
      
      expect(Array.isArray(config)).toBe(true);
      expect(config.length).toBeGreaterThan(0);
      
      const firstConfig = config[0];
      expect(typeof firstConfig?.id).toBe('number');
      expect(typeof firstConfig?.timeHorizonMonths).toBe('number');
      expect(typeof firstConfig?.expectedBaseRate).toBe('number');
      expect(['HIGH', 'MEDIUM', 'LOW']).toContain(firstConfig?.confidenceLevel);
      expect(typeof firstConfig?.scenario).toBe('string');
      expect(firstConfig?.effectiveDate).toBeInstanceOf(Date);
      expect(firstConfig?.createdAt).toBeInstanceOf(Date);
      expect(firstConfig?.updatedAt).toBeInstanceOf(Date);
    });

    it('should load rate outlook configurations in order by time horizon', async () => {
      const config = await configLoader.loadRateOutlookConfig();
      
      expect(config.length).toBeGreaterThanOrEqual(2);
      
      // Should be ordered by time horizon months
      for (let i = 1; i < config.length; i++) {
        expect(config[i]!.timeHorizonMonths).toBeGreaterThanOrEqual(config[i-1]!.timeHorizonMonths);
      }
    });
  });

  describe('cache functionality', () => {
    it('should clear cache and reload configuration', async () => {
      const config1 = await configLoader.loadComplianceConfig();
      configLoader.clearCache();
      const config2 = await configLoader.loadComplianceConfig();
      
      expect(config1).not.toBe(config2); // Different objects after cache clear
      expect(config1.fscsStandardLimit.amount).toBe(config2.fscsStandardLimit.amount); // Same values
    });

    it('should support hot reload', async () => {
      await expect(configLoader.hotReload()).resolves.not.toThrow();
    });
  });
});