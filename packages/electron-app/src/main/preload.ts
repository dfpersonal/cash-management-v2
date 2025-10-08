import { contextBridge, ipcRenderer } from 'electron';

// Define the API that will be exposed to the renderer process
const electronAPI = {
  // Portfolio data methods
  getPortfolioSummary: () => ipcRenderer.invoke('get-portfolio-summary'),
  getPortfolioHoldings: () => ipcRenderer.invoke('get-portfolio-holdings'),
  getAllocationAnalysis: () => ipcRenderer.invoke('get-allocation-analysis'),
  
  // Income history methods
  getIncomeHistory: (period?: number, unit?: 'days' | 'weeks' | 'months') => ipcRenderer.invoke('get-income-history', period, unit),
  captureIncomeSnapshot: () => ipcRenderer.invoke('capture-income-snapshot'),
  checkAndCaptureSnapshot: () => ipcRenderer.invoke('check-and-capture-snapshot'),
  getIncomeComparison: () => ipcRenderer.invoke('get-income-comparison'),
  getProjectedAllocationAnalysis: () => ipcRenderer.invoke('get-projected-allocation-analysis'),
  hasPendingDeposits: () => ipcRenderer.invoke('has-pending-deposits'),
  getPendingMovesSummary: () => ipcRenderer.invoke('get-pending-moves-summary'),
  getOptimizationRecommendations: (priorityFilter?: number[]) => 
    ipcRenderer.invoke('get-optimization-recommendations', priorityFilter),
  getRiskAssessment: () => ipcRenderer.invoke('get-risk-assessment'),
  getMaturityCalendar: (horizonDays?: number) => 
    ipcRenderer.invoke('get-maturity-calendar', horizonDays),

  // Configuration methods
  getConfiguration: () => ipcRenderer.invoke('get-configuration'),
  updateConfiguration: (config: any) => ipcRenderer.invoke('update-configuration', config),

  // CRUD methods for Portfolio Management
  getAllDeposits: () => ipcRenderer.invoke('get-all-deposits'),
  getAllPendingDeposits: () => ipcRenderer.invoke('get-all-pending-deposits'),
  getAllAccounts: () => ipcRenderer.invoke('get-all-accounts'),
  getLiquidityTiers: () => ipcRenderer.invoke('get-liquidity-tiers'),
  getPlatformsForDropdown: () => ipcRenderer.invoke('get-platforms-for-dropdown'),
  createDeposit: (deposit: any) => ipcRenderer.invoke('create-deposit', deposit),
  updateDeposit: (deposit: any) => ipcRenderer.invoke('update-deposit', deposit),
  deleteDeposit: (id: number) => ipcRenderer.invoke('delete-deposit', id),
  createPendingDeposit: (pendingDeposit: any) => ipcRenderer.invoke('create-pending-deposit', pendingDeposit),
  updatePendingDeposit: (pendingDeposit: any) => ipcRenderer.invoke('update-pending-deposit', pendingDeposit),
  deletePendingDeposit: (id: number) => ipcRenderer.invoke('delete-pending-deposit', id),
  executePendingMove: (id: number) => ipcRenderer.invoke('execute-pending-move', id),
  findAccountsByFRN: (frn: string) => ipcRenderer.invoke('find-accounts-by-frn', frn),
  findPotentialDuplicates: (accountDetails: any) => ipcRenderer.invoke('find-potential-duplicates', accountDetails),
  getValidPlatforms: () => ipcRenderer.invoke('get-valid-platforms'),
  validateFRN: (frn: string) => ipcRenderer.invoke('validate-frn', frn),
  searchFRNSuggestions: (partialFRN: string) => ipcRenderer.invoke('search-frn-suggestions', partialFRN),
  searchMyDeposits: (searchTerm: string) => ipcRenderer.invoke('search-my-deposits', searchTerm),

  // Report generation
  generateReport: (options: any) => ipcRenderer.invoke('generate-report', options),

  // Calendar & Reminder methods
  getUpcomingActions: () => ipcRenderer.invoke('get-upcoming-actions'),
  getCalendarSummary: () => ipcRenderer.invoke('get-calendar-summary'),
  createRateChange: (rateChange: any) => ipcRenderer.invoke('create-rate-change', rateChange),
  createNoticeEvent: (noticeEvent: any) => ipcRenderer.invoke('create-notice-event', noticeEvent),
  createReminder: (reminder: any) => ipcRenderer.invoke('create-reminder', reminder),
  getNoticeAccountStatus: () => ipcRenderer.invoke('get-notice-account-status'),
  updateReminderStatus: (reminderId: number, updates: any) => ipcRenderer.invoke('update-reminder-status', reminderId, updates),
  markRateChangeReminderCompleted: (rateChangeId: number) => ipcRenderer.invoke('mark-rate-change-reminder-completed', rateChangeId),
  
  // New calendar event management methods
  dismissCalendarEvent: (eventType: string, eventId: number) => 
    ipcRenderer.invoke('dismiss-calendar-event', eventType, eventId),
  snoozeCalendarEvent: (eventType: string, eventId: number, snoozedUntil: string) => 
    ipcRenderer.invoke('snooze-calendar-event', eventType, eventId, snoozedUntil),
  completeCalendarEvent: (eventType: string, eventId: number) => 
    ipcRenderer.invoke('complete-calendar-event', eventType, eventId),
  getSnoozeConfig: () => ipcRenderer.invoke('get-snooze-config'),

  // Optimization methods (FSCS Compliance & Rate Optimizer)
  checkFSCSCompliance: (options?: any) => ipcRenderer.invoke('fscs:check', options),
  generateFSCSDiversification: (options?: any) => ipcRenderer.invoke('fscs:diversify', options),
  runRateOptimization: (options?: any) => ipcRenderer.invoke('optimize:generate', options),
  approveOptimization: (recommendationIds: string[]) => ipcRenderer.invoke('optimization:approve', recommendationIds),
  rejectOptimization: (recommendationId: string, reason?: string) => ipcRenderer.invoke('optimization:reject', recommendationId, reason),
  getActionItems: (filter?: { module?: string; status?: string }) => ipcRenderer.invoke('get-action-items', filter),
  getCalendarEvents: (filter?: { module?: string; category?: string }) => ipcRenderer.invoke('get-calendar-events', filter),

  // Dashboard notification methods
  getDashboardNotifications: () => ipcRenderer.invoke('get-dashboard-notifications'),
  getDashboardActionSummary: () => ipcRenderer.invoke('get-dashboard-action-summary'),

  // Audit trail methods
  getRecordAuditTrail: (tableName: string, recordId: number) => 
    ipcRenderer.invoke('get-record-audit-trail', tableName, recordId),
  getAllAuditEntries: (filters?: any) => 
    ipcRenderer.invoke('get-all-audit-entries', filters),
  getFieldChanges: (fieldName: string, limit?: number) => 
    ipcRenderer.invoke('get-field-changes', fieldName, limit),
  getFieldChangeStats: (daysBack?: number) => 
    ipcRenderer.invoke('get-field-change-stats', daysBack),
  getBalanceChangeSummary: (daysBack?: number) => 
    ipcRenderer.invoke('get-balance-change-summary', daysBack),

  // Balance Update methods
  getDepositsWithBalanceStatus: (filters?: any) => 
    ipcRenderer.invoke('get-deposits-with-balance-status', filters),
  createBalanceUpdateSession: (sessionType?: 'manual' | 'scheduled') => 
    ipcRenderer.invoke('create-balance-update-session', sessionType),
  updateDepositBalanceInSession: (sessionId: number, depositId: number, newBalance: number, resetSchedule?: boolean, newAer?: number) => 
    ipcRenderer.invoke('update-deposit-balance-in-session', sessionId, depositId, newBalance, resetSchedule, newAer),
  completeBalanceUpdateSession: (sessionId: number) => 
    ipcRenderer.invoke('complete-balance-update-session', sessionId),
  getBalanceUpdateSessionProgress: (sessionId: number) => 
    ipcRenderer.invoke('get-balance-update-session-progress', sessionId),
  getOverdueDepositsCount: () => 
    ipcRenderer.invoke('get-overdue-deposits-count'),
  initializeBalanceCheckSchedules: () => 
    ipcRenderer.invoke('initialize-balance-check-schedules'),
  generateBalanceCheckReminders: () => 
    ipcRenderer.invoke('generate-balance-check-reminders'),
  createBalanceCheckReminderForDeposit: (depositId: number, nextCheckDate: string) => 
    ipcRenderer.invoke('create-balance-check-reminder-for-deposit', depositId, nextCheckDate),

  // Scraper management methods
  triggerScraper: (platform: string, options?: any) => 
    ipcRenderer.invoke('scraper:trigger', platform, options),
  getScraperStatus: (processId?: string) => 
    ipcRenderer.invoke('scraper:status', processId),
  getActiveScrapers: () => 
    ipcRenderer.invoke('scraper:active'),
  killScraperProcess: (processId: string) => 
    ipcRenderer.invoke('scraper:kill', processId),
  getScraperPlatforms: () => 
    ipcRenderer.invoke('scraper:platforms'),
  cleanupScraperProcesses: () =>
    ipcRenderer.invoke('scraper:cleanup'),
  
  // Scraper configuration methods
  getScraperConfigs: () =>
    ipcRenderer.invoke('scraper:get-configs'),
  updateScraperConfig: (scraperId: string, updates: any) =>
    ipcRenderer.invoke('scraper:update-config', scraperId, updates),
  updateScraperConfigsBulk: (updates: any[]) =>
    ipcRenderer.invoke('scraper:update-configs-bulk', updates),
  resetScraperConfigs: () =>
    ipcRenderer.invoke('scraper:reset-configs'),

  // File system methods
  openPath: (filePath: string) => 
    ipcRenderer.invoke('open-path', filePath),

  // Scraper event listeners
  onScraperProgress: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('scraper:progress', handler);
    return () => ipcRenderer.removeListener('scraper:progress', handler);
  },
  onScraperOutput: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('scraper:output', handler);
    return () => ipcRenderer.removeListener('scraper:output', handler);
  },
  onScraperCompleted: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('scraper:completed', handler);
    return () => ipcRenderer.removeListener('scraper:completed', handler);
  },
  onScraperStarted: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('scraper:started', handler);
    return () => ipcRenderer.removeListener('scraper:started', handler);
  },
  onScraperError: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('scraper:error', handler);
    return () => ipcRenderer.removeListener('scraper:error', handler);
  },

  // Optimization event listeners
  onOptimizationProgress: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('optimization:progress', handler);
    return () => ipcRenderer.removeListener('optimization:progress', handler);
  },
  onFSCSProgress: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('fscs:progress', handler);
    return () => ipcRenderer.removeListener('fscs:progress', handler);
  },

  // Database query method - removed as not implemented in DatabaseService

  // Application methods
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  quitApp: () => ipcRenderer.invoke('quit-app'),

  // Action Item Lifecycle methods
  updateActionItemStatus: (actionId: string, status: string, pendingDepositId?: number, dismissalReason?: string) => 
    ipcRenderer.invoke('action-item:update-status', actionId, status, pendingDepositId, dismissalReason),
  updateActionItemsWithPendingDeposit: (pendingDepositId: number, updates: any) =>
    ipcRenderer.invoke('action-item:update-by-pending-deposit', pendingDepositId, updates),
  
  // Configuration methods
  getConfigValue: (key: string) => 
    ipcRenderer.invoke('get-config-value', key),
  
  // Logging methods
  logError: (error: any) =>
    ipcRenderer.invoke('log-error', error),

  // FRN Management methods
  getFRNStatistics: () => ipcRenderer.invoke('frn:get-statistics'),
  getFRNRecentActivity: (limit?: number) => ipcRenderer.invoke('frn:get-recent-activity', limit),
  getFRNManualOverrides: (filters?: any) => ipcRenderer.invoke('frn:get-manual-overrides', filters),
  createFRNOverride: (override: any) => ipcRenderer.invoke('frn:create-override', override),
  updateFRNOverride: (id: number, updates: any) => ipcRenderer.invoke('frn:update-override', id, updates),
  deleteFRNOverride: (id: number) => ipcRenderer.invoke('frn:delete-override', id),
  getFRNResearchQueue: (filters?: any) => ipcRenderer.invoke('frn:get-research-queue', filters),
  completeFRNResearch: (rowId: number, frn: string, firmName: string, notes?: string) => 
    ipcRenderer.invoke('frn:complete-research', rowId, frn, firmName, notes),
  dismissFRNResearch: (rowId: number) => ipcRenderer.invoke('frn:dismiss-research', rowId),
  getFRNLookupHelper: (filters?: any) => ipcRenderer.invoke('frn:get-lookup-helper', filters),
  getBOEInstitutions: (filters?: any) => ipcRenderer.invoke('frn:get-boe-institutions', filters),
  getBankStatsByName: (bankName: string) => ipcRenderer.invoke('frn:get-bank-stats', bankName),

  // Transaction Management methods
  getAccountTransactions: (accountId: number, filters?: any) => 
    ipcRenderer.invoke('get-account-transactions', accountId, filters),
  createTransaction: (transaction: any) => 
    ipcRenderer.invoke('create-transaction', transaction),
  updateTransaction: (id: number, updates: any) => 
    ipcRenderer.invoke('update-transaction', id, updates),
  deleteTransaction: (id: number) => 
    ipcRenderer.invoke('delete-transaction', id),
  recalculateBalances: (accountId: number, fromDate?: string) =>
    ipcRenderer.invoke('recalculate-balances', accountId, fromDate),
  verifyBalanceConsistency: (accountId: number) =>
    ipcRenderer.invoke('verify-balance-consistency', accountId),
  getTransactionSummary: (accountId: number, startDate?: string, endDate?: string) =>
    ipcRenderer.invoke('get-transaction-summary', accountId, startDate, endDate),
  createTransactionFromBalanceChange: (accountId: number, oldBalance: number, newBalance: number, context: string, notes?: string) =>
    ipcRenderer.invoke('create-transaction-from-balance-change', accountId, oldBalance, newBalance, context, notes),
  createTransactionFromAudit: (auditEntry: any) => 
    ipcRenderer.invoke('create-transaction-from-audit', auditEntry),
  seedTransactionsFromAudit: () => 
    ipcRenderer.invoke('seed-transactions-from-audit'),
  getUnreconciledTransactions: (accountId: number) => 
    ipcRenderer.invoke('get-unreconciled-transactions', accountId),

  // Reconciliation methods
  startReconciliation: (accountId: number, statementDate: string, statementBalance: number, createdBy?: string) =>
    ipcRenderer.invoke('start-reconciliation', accountId, statementDate, statementBalance, createdBy),
  getCurrentReconciliation: (accountId: number) => 
    ipcRenderer.invoke('get-current-reconciliation', accountId),
  reconcileTransactions: (sessionId: number, transactionIds: number[]) => 
    ipcRenderer.invoke('reconcile-transactions', sessionId, transactionIds),
  completeReconciliation: (sessionId: number, notes?: string, completedBy?: string) =>
    ipcRenderer.invoke('complete-reconciliation', sessionId, notes, completedBy),
  cancelReconciliation: (sessionId: number) => 
    ipcRenderer.invoke('cancel-reconciliation', sessionId),
  getReconciliationHistory: (accountId: number, limit?: number) => 
    ipcRenderer.invoke('get-reconciliation-history', accountId, limit),
  getReconciliationSummary: () => 
    ipcRenderer.invoke('get-reconciliation-summary'),
  getReconciliationWizardState: (sessionId: number) => 
    ipcRenderer.invoke('get-reconciliation-wizard-state', sessionId),
  addReconciliationAdjustment: (sessionId: number, adjustment: any) => 
    ipcRenderer.invoke('add-reconciliation-adjustment', sessionId, adjustment),
  autoMatchTransactions: (sessionId: number, tolerance?: number) => 
    ipcRenderer.invoke('auto-match-transactions', sessionId, tolerance),

  // Interest Payment methods
  calculateEstimatedInterest: (account: any) => 
    ipcRenderer.invoke('calculate-estimated-interest', account),
  calculateNextPaymentDate: (account: any) => 
    ipcRenderer.invoke('calculate-next-payment-date', account),
  processInterestPayment: (account: any, interestAmount: number) => 
    ipcRenderer.invoke('process-interest-payment', account, interestAmount),
  getInterestPaymentAnalysis: (accountId: number) => 
    ipcRenderer.invoke('get-interest-payment-analysis', accountId),
  analyzeVariancePattern: (accountId: number) => 
    ipcRenderer.invoke('analyze-variance-pattern', accountId),
  updateInterestConfiguration: (accountId: number, config: any) => 
    ipcRenderer.invoke('update-interest-configuration', accountId, config),
  checkInterestDue: (account: any) => 
    ipcRenderer.invoke('check-interest-due', account),
  getUpcomingInterestPayments: (daysAhead?: number) => 
    ipcRenderer.invoke('get-upcoming-interest-payments', daysAhead),

  // Interest Event methods
  getInterestEventConfig: () => 
    ipcRenderer.invoke('get-interest-event-config'),
  updateInterestEventConfig: (key: string, value: string) => 
    ipcRenderer.invoke('update-interest-event-config', key, value),
  generateInterestEvent: (account: any) => 
    ipcRenderer.invoke('generate-interest-event', account),
  checkMissedPayments: () => 
    ipcRenderer.invoke('check-missed-payments'),
  createMissedPaymentAlert: (account: any) => 
    ipcRenderer.invoke('create-missed-payment-alert', account),
  getPendingInterestEvents: (daysAhead?: number) => 
    ipcRenderer.invoke('get-pending-interest-events', daysAhead),
  processInterestEvents: () =>
    ipcRenderer.invoke('process-pending-interest-events'),

  // ============================================
  // DOCUMENT MANAGEMENT API
  // ============================================

  // Document management namespace
  documents: {
    // Document types
    getTypes: () => ipcRenderer.invoke('documents:getTypes'),
    createType: (typeForm: any) => ipcRenderer.invoke('documents:createType', typeForm),
    updateType: (id: number, updates: any) => ipcRenderer.invoke('documents:updateType', id, updates),
    deleteType: (id: number) => ipcRenderer.invoke('documents:deleteType', id),

    // Document CRUD
    list: (accountId: number, filters?: any) => ipcRenderer.invoke('documents:list', accountId, filters),
    listTrash: (accountId?: number) => ipcRenderer.invoke('documents:listTrash', accountId),
    get: (documentId: number) => ipcRenderer.invoke('documents:get', documentId),
    update: (documentId: number, updates: any) => ipcRenderer.invoke('documents:update', documentId, updates),
    softDelete: (documentId: number) => ipcRenderer.invoke('documents:softDelete', documentId),
    restore: (documentId: number) => ipcRenderer.invoke('documents:restore', documentId),
    permanentDelete: (documentId: number) => ipcRenderer.invoke('documents:permanentDelete', documentId),

    // File operations
    selectFile: () => ipcRenderer.invoke('documents:selectFile'),
    upload: (uploadData: { filePath: string; formData: any }) => ipcRenderer.invoke('documents:upload', uploadData),
    view: (documentId: number) => ipcRenderer.invoke('documents:view', documentId),
    download: (documentId: number) => ipcRenderer.invoke('documents:download', documentId),
    downloadAll: (accountId: number) => ipcRenderer.invoke('documents:downloadAll', accountId),
    openInSystem: (documentId: number) => ipcRenderer.invoke('documents:openInSystem', documentId),

    // Utility
    getCounts: () => ipcRenderer.invoke('documents:getCounts'),
    checkStorage: () => ipcRenderer.invoke('documents:checkStorage'),
    getStorageUsage: () => ipcRenderer.invoke('documents:getStorageUsage'),
    cleanupTrash: () => ipcRenderer.invoke('documents:cleanupTrash'),
  },
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// TypeScript declaration for the global window object
declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}