/**
 * FSCS Compliance subprocess service
 */

import { SubprocessService, SubprocessOptions, ModuleResult } from './SubprocessService';

export interface FSCSOptions extends SubprocessOptions {
  includePending?: boolean;
  maxRateLoss?: number;
  diversify?: boolean;
  warningThreshold?: number;
  excludeFrns?: string[];
  accountType?: 'easy_access' | 'notice' | 'fixed_term';
}

export class FSCSComplianceService extends SubprocessService {
  protected readonly cliPath = 'src/cli/fscs-compliance.ts';
  protected readonly moduleName = 'FSCS Compliance';
  
  /**
   * Check FSCS compliance
   */
  async checkCompliance(options: FSCSOptions): Promise<ModuleResult> {
    const args = this.buildModuleArgs(options);
    return this.runCommand('', args, options);
  }
  
  /**
   * Check compliance and generate diversification recommendations
   */
  async generateDiversification(options: FSCSOptions): Promise<ModuleResult> {
    const args = [...this.buildModuleArgs(options), '--diversify'];
    return this.runCommand('', args, options);
  }
  
  private buildModuleArgs(options: FSCSOptions): string[] {
    const args: string[] = [];
    
    if (options.includePending) {
      args.push('--include-pending');
    }
    
    if (options.maxRateLoss !== undefined) {
      args.push('--max-rate-loss', options.maxRateLoss.toString());
    }
    
    if (options.warningThreshold !== undefined) {
      args.push('--warning-threshold', options.warningThreshold.toString());
    }
    
    if (options.excludeFrns && options.excludeFrns.length > 0) {
      args.push('--exclude-frns', options.excludeFrns.join(','));
    }
    
    if (options.accountType) {
      args.push('--account-type', options.accountType);
    }
    
    return args;
  }
  
  protected getWorkingDirectory(): string {
    return require('path').join(process.cwd(), 'recommendation-engine');
  }
}