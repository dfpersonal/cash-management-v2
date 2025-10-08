// Enhanced results interface - flexible for current reality
export interface ScrapingResults {
  processId: string;
  platform: string;
  success: boolean;
  
  // Basic counts (parsed from output)
  recordCount?: number;
  processedCount?: number;
  
  // Flexible file structure - store what's actually available
  files: {
    [key: string]: string;  // Key-value for flexibility
  };
  
  // Optional deduplication info (only for AJ Bell currently)
  duplicatesRemoved?: number;
  
  // Raw parsing results
  completionMessage?: string;
  errorMessage?: string;
}

export interface ScrapingProcess {
  id: string;
  platform: string;
  command: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  startTime?: Date;
  endTime?: Date;
  pid?: number;
  output: string[];
  filteredOutput?: string[];  // Clean output for display
  exitCode?: number;
  options?: ScrapingOptions;
  results?: ScrapingResults;
}

export interface ScrapingOptions {
  visible?: boolean;
  accountTypes?: string[]; // For MoneyFacts modular processing
  timeout?: number;
  excludeTypes?: string[]; // For MoneyFacts exclusion
  verbose?: boolean;  // For debug output control
  
  // Internal options
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'none';
  enableFileLogging?: boolean;
}

export interface Platform {
  id: string;
  name: string;
  accountTypes?: string[];
  supportsModular: boolean;
  supportsVisible: boolean;
  status?: 'available' | 'running' | 'error';
  lastRun?: Date;
}

export interface ScraperConfig {
  id: number;
  scraper_id: string;
  is_enabled: boolean;
  display_order: number;
  custom_name?: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface ProgressData {
  processId: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  timestamp: Date;
  details?: any;
}

export interface OutputData {
  processId: string;
  output: string;
  type: 'stdout' | 'stderr';
  timestamp: Date;
}

export interface CompletionData {
  processId: string;
  success: boolean;
  exitCode: number;
  duration: number;
  results?: ScrapingResults;
  timestamp: Date;
}

export interface ScraperStats {
  totalProcesses: number;
  activeProcesses: number;
  completedToday: number;
  failedToday: number;
  lastRunTime?: Date;
}

// API response types
export interface TriggerScraperResponse {
  success: boolean;
  processId?: string;
  error?: string;
}

export interface ScraperStatusResponse {
  processes: ScrapingProcess[];
  stats: ScraperStats;
}