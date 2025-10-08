/**
 * Rate Optimizer subprocess service
 */

import { SubprocessService, SubprocessOptions, ModuleResult } from './SubprocessService';

export interface OptimizationOptions extends SubprocessOptions {
  excludeShariaBanks?: boolean;
  excludedProducts?: string[];
  preferredPlatforms?: string[];
  minimumBalance?: number;
  minMoveAmount?: number;
  minBenefit?: number;
}

export class RateOptimizerService extends SubprocessService {
  protected readonly cliPath = 'src/cli/optimize-cli.ts';
  protected readonly moduleName = 'Rate Optimizer';
  
  /**
   * Run rate optimization
   */
  async optimize(options: OptimizationOptions): Promise<ModuleResult> {
    const args = this.buildModuleArgs(options);
    return this.runCommand('optimize', args, options);
  }
  
  /**
   * Analyze portfolio without generating recommendations
   */
  async analyze(options: OptimizationOptions): Promise<ModuleResult> {
    const args = [...this.buildModuleArgs(options), '--analyze-only'];
    return this.runCommand('analyze', args, options);
  }
  
  private buildModuleArgs(options: OptimizationOptions): string[] {
    const args: string[] = [];
    
    // Always use JSON format for subprocess
    args.push('--json');
    
    if (options.excludeShariaBanks) {
      args.push('--no-sharia');
    }
    
    if (options.excludedProducts && options.excludedProducts.length > 0) {
      args.push('--exclude-products', options.excludedProducts.join(','));
    }
    
    if (options.preferredPlatforms && options.preferredPlatforms.length > 0) {
      args.push('--preferred-platforms', options.preferredPlatforms.join(','));
    }
    
    if (options.minimumBalance !== undefined) {
      args.push('--minimum-balance', options.minimumBalance.toString());
    }
    
    if (options.minMoveAmount !== undefined) {
      args.push('--min-move-amount', options.minMoveAmount.toString());
    }
    
    if (options.minBenefit !== undefined) {
      args.push('--min-benefit', options.minBenefit.toString());
    }
    
    return args;
  }
  
  protected getWorkingDirectory(): string {
    return require('path').join(process.cwd(), 'recommendation-engine');
  }
}