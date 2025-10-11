/**
 * Global type definitions for renderer process
 *
 * This file extends the Window interface to include the electronAPI
 * that is exposed via contextBridge in the preload script.
 */

declare global {
  interface Window {
    electronAPI: {
      // Portfolio data methods
      getPortfolioSummary: () => Promise<any>;
      getPortfolioHoldings: () => Promise<any>;
      getAllocationAnalysis: () => Promise<any>;

      // Income history methods
      getIncomeHistory: (period?: number, unit?: 'days' | 'weeks' | 'months') => Promise<any>;
      captureIncomeSnapshot: () => Promise<any>;
      checkAndCaptureSnapshot: () => Promise<any>;
      getIncomeComparison: () => Promise<any>;
      getProjectedAllocationAnalysis: () => Promise<any>;
      hasPendingDeposits: () => Promise<any>;
      getPendingMovesSummary: () => Promise<any>;
      getOptimizationRecommendations: (priorityFilter?: number[]) => Promise<any>;
      getRiskAssessment: () => Promise<any>;
      getMaturityCalendar: (horizonDays?: number) => Promise<any>;

      // Configuration methods
      getConfiguration: () => Promise<any>;
      updateConfiguration: (config: any) => Promise<any>;

      // CRUD methods for Portfolio Management
      getAllDeposits: () => Promise<any>;
      getAllPendingDeposits: () => Promise<any>;
      getAllAccounts: () => Promise<any>;
      getLiquidityTiers: () => Promise<any>;
      getPlatformsForDropdown: () => Promise<any>;
      createDeposit: (deposit: any) => Promise<any>;
      updateDeposit: (deposit: any) => Promise<any>;
      deleteDeposit: (id: number) => Promise<any>;
      createPendingDeposit: (pendingDeposit: any) => Promise<any>;
      updatePendingDeposit: (pendingDeposit: any) => Promise<any>;
      deletePendingDeposit: (id: number) => Promise<any>;
      executePendingMove: (id: number) => Promise<any>;
      findAccountsByFRN: (frn: string) => Promise<any>;
      findPotentialDuplicates: (accountDetails: any) => Promise<any>;
      getValidPlatforms: () => Promise<any>;
      validateFRN: (frn: string) => Promise<any>;
      searchFRNSuggestions: (partialFRN: string) => Promise<any>;
      searchMyDeposits: (searchTerm: string) => Promise<any>;

      // Report generation
      generateReport: (options: any) => Promise<any>;

      // Calendar & Reminder methods
      getUpcomingActions: () => Promise<any>;
      getCalendarSummary: () => Promise<any>;
      createRateChange: (rateChange: any) => Promise<any>;
      createNoticeEvent: (noticeEvent: any) => Promise<any>;
      createReminder: (reminder: any) => Promise<any>;
      getNoticeAccountStatus: () => Promise<any>;
      updateReminderStatus: (reminderId: number, updates: any) => Promise<any>;
      markRateChangeReminderCompleted: (rateChangeId: number) => Promise<any>;

      // New calendar event management methods
      dismissCalendarEvent: (eventType: string, eventId: number) => Promise<any>;
      snoozeCalendarEvent: (eventType: string, eventId: number, snoozedUntil: string) => Promise<any>;
      completeCalendarEvent: (eventType: string, eventId: number) => Promise<any>;
      getSnoozeConfig: () => Promise<any>;

      // Optimization methods (FSCS Compliance & Rate Optimizer)
      checkFSCSCompliance: (options?: any) => Promise<any>;
      generateFSCSDiversification: (options?: any) => Promise<any>;
      runRateOptimization: (options?: any) => Promise<any>;
      approveOptimization: (recommendationIds: string[]) => Promise<any>;
      rejectOptimization: (recommendationId: string, reason?: string) => Promise<any>;
      getActionItems: (filter?: { module?: string; status?: string }) => Promise<any>;
      getCalendarEvents: (filter?: { module?: string; category?: string }) => Promise<any>;

      // Dashboard notification methods
      getDashboardNotifications: () => Promise<any>;
      getDashboardActionSummary: () => Promise<any>;

      // Audit trail methods
      getRecordAuditTrail: (tableName: string, recordId: number) => Promise<any>;
      getAllAuditEntries: (filters?: any) => Promise<any>;
      getFieldChanges: (fieldName: string, limit?: number) => Promise<any>;
      getFieldChangeStats: (daysBack?: number) => Promise<any>;
      getBalanceChangeSummary: (daysBack?: number) => Promise<any>;

      // Balance Update methods
      getDepositsWithBalanceStatus: (filters?: any) => Promise<any>;
      createBalanceUpdateSession: (sessionType?: 'manual' | 'scheduled') => Promise<any>;
      updateDepositBalanceInSession: (sessionId: number, depositId: number, newBalance: number, resetSchedule?: boolean, newAer?: number) => Promise<any>;
      completeBalanceUpdateSession: (sessionId: number) => Promise<any>;
      getBalanceUpdateSessionProgress: (sessionId: number) => Promise<any>;
      getOverdueDepositsCount: () => Promise<any>;
      initializeBalanceCheckSchedules: () => Promise<any>;
      generateBalanceCheckReminders: () => Promise<any>;
      createBalanceCheckReminderForDeposit: (depositId: number, nextCheckDate: string) => Promise<any>;

      // Scraper management methods
      triggerScraper: (platform: string, options?: any) => Promise<any>;
      getScraperStatus: (processId?: string) => Promise<any>;
      getActiveScrapers: () => Promise<any>;
      killScraperProcess: (processId: string) => Promise<any>;
      getScraperPlatforms: () => Promise<any>;
      cleanupScraperProcesses: () => Promise<any>;

      // Scraper configuration methods
      getScraperConfigs: () => Promise<any>;
      updateScraperConfig: (scraperId: string, updates: any) => Promise<any>;
      updateScraperConfigsBulk: (updates: any[]) => Promise<any>;
      resetScraperConfigs: () => Promise<any>;
      getAvailableJsonFiles: () => Promise<{ success: boolean; data: string[]; error?: string }>;

      // Pipeline/Orchestrator methods
      executePipeline: (inputFiles: string[]) => Promise<any>;
      getPipelineStatus: () => Promise<any>;
      getOrchestratorHealth: () => Promise<any>;
      updatePipelineConfig: (configUpdates: Record<string, string | number | boolean>) => Promise<any>;
      validatePipelineConfig: () => Promise<any>;

      // Pipeline event listeners
      onPipelineStarted: (callback: (data: any) => void) => () => void;
      onPipelineStageStarted: (callback: (data: any) => void) => () => void;
      onPipelineStageCompleted: (callback: (data: any) => void) => () => void;
      onPipelineCompleted: (callback: (data: any) => void) => () => void;
      onPipelineFailed: (callback: (data: any) => void) => () => void;
      onPipelineProgress: (callback: (data: any) => void) => () => void;

      // File system methods
      openPath: (filePath: string) => Promise<any>;

      // Scraper event listeners
      onScraperProgress: (callback: (data: any) => void) => () => void;
      onScraperOutput: (callback: (data: any) => void) => () => void;
      onScraperCompleted: (callback: (data: any) => void) => () => void;
      onScraperStarted: (callback: (data: any) => void) => () => void;
      onScraperError: (callback: (data: any) => void) => () => void;

      // Optimization event listeners
      onOptimizationProgress: (callback: (data: any) => void) => () => void;
      onFSCSProgress: (callback: (data: any) => void) => () => void;

      // Application methods
      getAppVersion: () => Promise<any>;
      quitApp: () => Promise<any>;

      // Action Item Lifecycle methods
      updateActionItemStatus: (actionId: string, status: string, pendingDepositId?: number, dismissalReason?: string) => Promise<any>;
      updateActionItemsWithPendingDeposit: (pendingDepositId: number, updates: any) => Promise<any>;

      // Configuration methods
      getConfigValue: (key: string) => Promise<any>;

      // Logging methods
      logError: (error: any) => Promise<any>;

      // FRN Management methods
      getFRNStatistics: () => Promise<any>;
      getFRNRecentActivity: (limit?: number) => Promise<any>;
      getFRNManualOverrides: (filters?: any) => Promise<any>;
      createFRNOverride: (override: any) => Promise<any>;
      updateFRNOverride: (id: number, updates: any) => Promise<any>;
      deleteFRNOverride: (id: number) => Promise<any>;
      getFRNResearchQueue: (filters?: any) => Promise<any>;
      completeFRNResearch: (rowId: number, frn: string, firmName: string, notes?: string) => Promise<any>;
      dismissFRNResearch: (rowId: number) => Promise<any>;
      getFRNLookupHelper: (filters?: any) => Promise<any>;
      getBOEInstitutions: (filters?: any) => Promise<any>;
      getBankStatsByName: (bankName: string) => Promise<any>;

      // Transaction Management methods
      getAccountTransactions: (accountId: number, filters?: any) => Promise<any>;
      createTransaction: (transaction: any) => Promise<any>;
      updateTransaction: (id: number, updates: any) => Promise<any>;
      deleteTransaction: (id: number) => Promise<any>;
      recalculateBalances: (accountId: number, fromDate?: string) => Promise<any>;
      verifyBalanceConsistency: (accountId: number) => Promise<any>;
      getTransactionSummary: (accountId: number, startDate?: string, endDate?: string) => Promise<any>;
      createTransactionFromBalanceChange: (accountId: number, oldBalance: number, newBalance: number, context: string, notes?: string) => Promise<any>;
      createTransactionFromAudit: (auditEntry: any) => Promise<any>;
      seedTransactionsFromAudit: () => Promise<any>;
      getUnreconciledTransactions: (accountId: number) => Promise<any>;

      // Reconciliation methods
      startReconciliation: (accountId: number, statementDate: string, statementBalance: number, createdBy?: string) => Promise<any>;
      getCurrentReconciliation: (accountId: number) => Promise<any>;
      reconcileTransactions: (sessionId: number, transactionIds: number[]) => Promise<any>;
      completeReconciliation: (sessionId: number, notes?: string, completedBy?: string) => Promise<any>;
      cancelReconciliation: (sessionId: number) => Promise<any>;
      getReconciliationHistory: (accountId: number, limit?: number) => Promise<any>;
      getReconciliationSummary: () => Promise<any>;
      getReconciliationWizardState: (sessionId: number) => Promise<any>;
      addReconciliationAdjustment: (sessionId: number, adjustment: any) => Promise<any>;
      autoMatchTransactions: (sessionId: number, tolerance?: number) => Promise<any>;

      // Interest Payment methods
      calculateEstimatedInterest: (account: any) => Promise<any>;
      calculateNextPaymentDate: (account: any) => Promise<any>;
      processInterestPayment: (account: any, interestAmount: number) => Promise<any>;
      getInterestPaymentAnalysis: (accountId: number) => Promise<any>;
      analyzeVariancePattern: (accountId: number) => Promise<any>;
      updateInterestConfiguration: (accountId: number, config: any) => Promise<any>;
      checkInterestDue: (account: any) => Promise<any>;
      getUpcomingInterestPayments: (daysAhead?: number) => Promise<any>;

      // Interest Event methods
      getInterestEventConfig: () => Promise<any>;
      updateInterestEventConfig: (key: string, value: string) => Promise<any>;
      generateInterestEvent: (account: any) => Promise<any>;
      checkMissedPayments: () => Promise<any>;
      createMissedPaymentAlert: (account: any) => Promise<any>;
      getPendingInterestEvents: (daysAhead?: number) => Promise<any>;
      processInterestEvents: () => Promise<any>;

      // Document management namespace
      documents: {
        // Document types
        getTypes: () => Promise<any>;
        createType: (typeForm: any) => Promise<any>;
        updateType: (id: number, updates: any) => Promise<any>;
        deleteType: (id: number) => Promise<any>;

        // Document CRUD
        list: (accountId: number, filters?: any) => Promise<any>;
        listTrash: (accountId?: number) => Promise<any>;
        get: (documentId: number) => Promise<any>;
        update: (documentId: number, updates: any) => Promise<any>;
        softDelete: (documentId: number) => Promise<any>;
        restore: (documentId: number) => Promise<any>;
        permanentDelete: (documentId: number) => Promise<any>;

        // File operations
        selectFile: () => Promise<any>;
        upload: (uploadData: { filePath: string; formData: any }) => Promise<any>;
        view: (documentId: number) => Promise<any>;
        download: (documentId: number) => Promise<any>;
        downloadAll: (accountId: number) => Promise<any>;
        openInSystem: (documentId: number) => Promise<any>;

        // Utility
        getCounts: () => Promise<any>;
        checkStorage: () => Promise<any>;
        getStorageUsage: () => Promise<any>;
        cleanupTrash: () => Promise<any>;
      };
    };
  }
}

export {};
