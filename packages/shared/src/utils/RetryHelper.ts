/**
 * RetryHelper - Utility for handling retries with exponential backoff
 * Uses configuration from unified_config table
 */

import { getConfigurationService } from '../services/ConfigurationService';
import { LogCategory } from '../types/LoggingTypes';

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  onRetry?: (attempt: number, error: any) => void;
  shouldRetry?: (error: any) => boolean;
}

export class RetryHelper {
  /**
   * Execute a function with retry logic
   */
  static async withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    // Get default values from configuration
    const configService = getConfigurationService();
    let defaultAttempts = 3;
    let defaultDelay = 1000;
    
    try {
      const config = await configService.getOptimizationConfig();
      defaultAttempts = config.optimization_retry_attempts;
      defaultDelay = config.optimization_retry_delay_ms;
    } catch (error) {
      console.warn(`${LogCategory.WARNING} Could not load retry config, using defaults:`, error);
    }
    
    const maxAttempts = options.maxAttempts ?? defaultAttempts;
    const initialDelayMs = options.initialDelayMs ?? defaultDelay;
    const maxDelayMs = options.maxDelayMs ?? 10000;
    const backoffMultiplier = options.backoffMultiplier ?? 2;
    const shouldRetry = options.shouldRetry ?? ((error) => true);
    
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        // Check if we should retry this error
        if (!shouldRetry(error)) {
          throw error;
        }
        
        // Don't retry if this was the last attempt
        if (attempt === maxAttempts) {
          break;
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          initialDelayMs * Math.pow(backoffMultiplier, attempt - 1),
          maxDelayMs
        );
        
        // Call the retry callback if provided
        if (options.onRetry) {
          options.onRetry(attempt, error);
        }
        
        console.log(`${LogCategory.INFO} Retry attempt ${attempt}/${maxAttempts} after ${delay}ms delay`);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // If we get here, all attempts failed
    throw new Error(
      `Operation failed after ${maxAttempts} attempts. Last error: ${
        lastError?.message || lastError
      }`
    );
  }
  
  /**
   * Determine if an error is retryable
   */
  static isRetryableError(error: any): boolean {
    // Don't retry validation errors
    if (error.code === 'VALIDATION_ERROR') {
      return false;
    }
    
    // Don't retry authentication errors
    if (error.code === 'AUTH_ERROR' || error.code === 'UNAUTHORIZED') {
      return false;
    }
    
    // Retry network errors
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      return true;
    }
    
    // Retry database lock errors
    if (error.message?.includes('SQLITE_BUSY') || error.message?.includes('database is locked')) {
      return true;
    }
    
    // Retry rate limit errors
    if (error.code === 'RATE_LIMIT' || error.status === 429) {
      return true;
    }
    
    // Default to retryable for unknown errors
    return true;
  }
  
  /**
   * Create a retry wrapper for a class method
   */
  static retryable(options: RetryOptions = {}) {
    return function (
      target: any,
      propertyKey: string,
      descriptor: PropertyDescriptor
    ) {
      const originalMethod = descriptor.value;
      
      descriptor.value = async function (...args: any[]) {
        return RetryHelper.withRetry(
          () => originalMethod.apply(this, args),
          options
        );
      };
      
      return descriptor;
    };
  }
}