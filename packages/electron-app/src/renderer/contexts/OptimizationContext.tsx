/**
 * OptimizationContext - Manages state and operations for FSCS and Rate Optimizer modules
 */

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

// Types matching the ModuleResult interface from backend
interface ModuleResult {
  version: string;
  timestamp: string;
  status: 'SUCCESS' | 'WARNING' | 'ERROR';
  module: 'fscs-compliance' | 'rate-optimizer';
  summary: {
    totalAccounts?: number;
    portfolioValue?: number;
    breachCount?: number;
    complianceStatus?: string;
    recommendationCount?: number;
    totalBenefit?: number;
    executionTime?: number;
  };
  recommendations: any[];
  calendarEvents?: any[];
  actionItems?: any[];
  metadata: {
    processingTime?: number;
    dataSource?: string;
    configVersion?: string;
  };
}

interface Progress {
  percent: number;
  message: string;
  module?: 'fscs-compliance' | 'rate-optimizer';
}

interface OptimizationState {
  // FSCS State
  fscsResult: ModuleResult | null;
  fscsProgress: Progress | null;
  isFSCSRunning: boolean;
  fscsError: string | null;
  
  // Rate Optimizer State
  optimizerResult: ModuleResult | null;
  optimizerProgress: Progress | null;
  isOptimizerRunning: boolean;
  optimizerError: string | null;
  
  // Combined State
  actionItems: any[];
  calendarEvents: any[];
  lastUpdated: Date | null;
}

interface OptimizationContextType extends OptimizationState {
  // FSCS Methods
  checkFSCSCompliance: (options?: any) => Promise<void>;
  generateFSCSDiversification: (options?: any) => Promise<void>;
  cancelFSCS: () => void;
  
  // Rate Optimizer Methods
  runRateOptimization: (options?: any) => Promise<void>;
  analyzePortfolio: (options?: any) => Promise<void>;
  cancelOptimizer: () => void;
  
  // Shared Methods
  approveRecommendations: (recommendationIds: string[]) => Promise<void>;
  rejectRecommendation: (recommendationId: string, reason?: string) => Promise<void>;
  refreshActionItems: () => Promise<void>;
  refreshCalendarEvents: () => Promise<void>;
  updateActionItemStatus: (actionId: string, status: string) => Promise<void>;
  clearResults: () => void;
}

const OptimizationContext = createContext<OptimizationContextType | undefined>(undefined);

export const useOptimization = () => {
  const context = useContext(OptimizationContext);
  if (!context) {
    throw new Error('useOptimization must be used within OptimizationProvider');
  }
  return context;
};

interface OptimizationProviderProps {
  children: ReactNode;
}

export const OptimizationProvider: React.FC<OptimizationProviderProps> = ({ children }) => {
  const [state, setState] = useState<OptimizationState>({
    fscsResult: null,
    fscsProgress: null,
    isFSCSRunning: false,
    fscsError: null,
    optimizerResult: null,
    optimizerProgress: null,
    isOptimizerRunning: false,
    optimizerError: null,
    actionItems: [],
    calendarEvents: [],
    lastUpdated: null,
  });

  // Set up progress listeners
  useEffect(() => {
    // FSCS progress listener
    const handleFSCSProgress = (data: Progress) => {
      setState(prev => ({
        ...prev,
        fscsProgress: { ...data, module: 'fscs-compliance' },
      }));
    };

    // Optimizer progress listener
    const handleOptimizationProgress = (data: Progress) => {
      setState(prev => ({
        ...prev,
        optimizerProgress: { ...data, module: 'rate-optimizer' },
      }));
    };

    // Register listeners
    const unsubscribeFSCS = window.electronAPI.onFSCSProgress(handleFSCSProgress);
    const unsubscribeOptimizer = window.electronAPI.onOptimizationProgress(handleOptimizationProgress);

    // Cleanup
    return () => {
      if (unsubscribeFSCS) unsubscribeFSCS();
      if (unsubscribeOptimizer) unsubscribeOptimizer();
    };
  }, []);

  // FSCS Methods
  const checkFSCSCompliance = useCallback(async (options?: any) => {
    setState(prev => ({
      ...prev,
      isFSCSRunning: true,
      fscsError: null,
      fscsProgress: { percent: 0, message: 'Starting FSCS compliance check...' },
    }));

    try {
      const result = await window.electronAPI.checkFSCSCompliance(options);
      
      if (result.success && result.data) {
        setState(prev => ({
          ...prev,
          fscsResult: result.data,
          isFSCSRunning: false,
          fscsProgress: { percent: 100, message: 'Complete' },
          lastUpdated: new Date(),
        }));
        
        // Refresh action items and calendar events if they were included
        if (result.data.actionItems) {
          await refreshActionItems();
        }
        if (result.data.calendarEvents) {
          await refreshCalendarEvents();
        }
      } else {
        throw new Error(result.error || 'FSCS check failed');
      }
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isFSCSRunning: false,
        fscsError: error.message,
        fscsProgress: null,
      }));
    }
  }, []);

  const generateFSCSDiversification = useCallback(async (options?: any) => {
    setState(prev => ({
      ...prev,
      isFSCSRunning: true,
      fscsError: null,
      fscsProgress: { percent: 0, message: 'Generating diversification recommendations...' },
    }));

    try {
      const result = await window.electronAPI.generateFSCSDiversification(options);
      
      if (result.success && result.data) {
        setState(prev => ({
          ...prev,
          fscsResult: result.data,
          isFSCSRunning: false,
          fscsProgress: { percent: 100, message: 'Complete' },
          lastUpdated: new Date(),
        }));
        
        // Refresh action items and calendar events
        if (result.data.actionItems) {
          await refreshActionItems();
        }
        if (result.data.calendarEvents) {
          await refreshCalendarEvents();
        }
      } else {
        throw new Error(result.error || 'Diversification generation failed');
      }
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isFSCSRunning: false,
        fscsError: error.message,
        fscsProgress: null,
      }));
    }
  }, []);

  const cancelFSCS = useCallback(() => {
    // TODO: Implement cancel via IPC
    setState(prev => ({
      ...prev,
      isFSCSRunning: false,
      fscsProgress: null,
    }));
  }, []);

  // Rate Optimizer Methods
  const runRateOptimization = useCallback(async (options?: any) => {
    setState(prev => ({
      ...prev,
      isOptimizerRunning: true,
      optimizerError: null,
      optimizerProgress: { percent: 0, message: 'Starting rate optimization...' },
    }));

    try {
      const result = await window.electronAPI.runRateOptimization(options);
      
      if (result.success && result.data) {
        setState(prev => ({
          ...prev,
          optimizerResult: result.data,
          isOptimizerRunning: false,
          optimizerProgress: { percent: 100, message: 'Complete' },
          lastUpdated: new Date(),
        }));
        
        // Refresh action items and calendar events
        if (result.data.actionItems) {
          await refreshActionItems();
        }
        if (result.data.calendarEvents) {
          await refreshCalendarEvents();
        }
      } else {
        throw new Error(result.error || 'Rate optimization failed');
      }
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isOptimizerRunning: false,
        optimizerError: error.message,
        optimizerProgress: null,
      }));
    }
  }, []);

  const analyzePortfolio = useCallback(async (options?: any) => {
    // Similar to runRateOptimization but analyze-only mode
    setState(prev => ({
      ...prev,
      isOptimizerRunning: true,
      optimizerError: null,
      optimizerProgress: { percent: 0, message: 'Analyzing portfolio...' },
    }));

    try {
      const result = await window.electronAPI.runRateOptimization({ 
        ...options, 
        analyzeOnly: true 
      });
      
      if (result.success && result.data) {
        setState(prev => ({
          ...prev,
          optimizerResult: result.data,
          isOptimizerRunning: false,
          optimizerProgress: { percent: 100, message: 'Analysis complete' },
          lastUpdated: new Date(),
        }));
      } else {
        throw new Error(result.error || 'Portfolio analysis failed');
      }
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isOptimizerRunning: false,
        optimizerError: error.message,
        optimizerProgress: null,
      }));
    }
  }, []);

  const cancelOptimizer = useCallback(() => {
    // TODO: Implement cancel via IPC
    setState(prev => ({
      ...prev,
      isOptimizerRunning: false,
      optimizerProgress: null,
    }));
  }, []);

  // Shared Methods
  const approveRecommendations = useCallback(async (recommendationIds: string[]) => {
    try {
      const result = await window.electronAPI.approveOptimization(recommendationIds);
      if (result.success) {
        // Refresh to get updated status
        await refreshActionItems();
      } else {
        throw new Error(result.error || 'Approval failed');
      }
    } catch (error: any) {
      console.error('Error approving recommendations:', error);
      throw error;
    }
  }, []);

  const rejectRecommendation = useCallback(async (recommendationId: string, reason?: string) => {
    try {
      const result = await window.electronAPI.rejectOptimization(recommendationId, reason);
      if (result.success) {
        // Refresh to get updated status
        await refreshActionItems();
      } else {
        throw new Error(result.error || 'Rejection failed');
      }
    } catch (error: any) {
      console.error('Error rejecting recommendation:', error);
      throw error;
    }
  }, []);

  const refreshActionItems = useCallback(async () => {
    try {
      const items = await window.electronAPI.getActionItems();
      setState(prev => ({
        ...prev,
        actionItems: items || [],
      }));
    } catch (error) {
      console.error('Error refreshing action items:', error);
    }
  }, []);

  const refreshCalendarEvents = useCallback(async () => {
    try {
      const events = await window.electronAPI.getCalendarEvents({ 
        category: 'OPTIMIZATION' 
      });
      setState(prev => ({
        ...prev,
        calendarEvents: events || [],
      }));
    } catch (error) {
      console.error('Error refreshing calendar events:', error);
    }
  }, []);

  const updateActionItemStatus = useCallback(async (actionId: string, status: string) => {
    try {
      await window.electronAPI.updateActionItemStatus(actionId, status);
      // Refresh to show updated status
      await refreshActionItems();
    } catch (error) {
      console.error('Error updating action item status:', error);
      throw error;
    }
  }, []);

  const clearResults = useCallback(() => {
    setState({
      fscsResult: null,
      fscsProgress: null,
      isFSCSRunning: false,
      fscsError: null,
      optimizerResult: null,
      optimizerProgress: null,
      isOptimizerRunning: false,
      optimizerError: null,
      actionItems: [],
      calendarEvents: [],
      lastUpdated: null,
    });
  }, []);

  // Load initial data
  useEffect(() => {
    refreshActionItems();
    refreshCalendarEvents();
  }, [refreshActionItems, refreshCalendarEvents]);

  const value: OptimizationContextType = {
    ...state,
    checkFSCSCompliance,
    generateFSCSDiversification,
    cancelFSCS,
    runRateOptimization,
    analyzePortfolio,
    cancelOptimizer,
    approveRecommendations,
    rejectRecommendation,
    refreshActionItems,
    refreshCalendarEvents,
    updateActionItemStatus,
    clearResults,
  };

  return (
    <OptimizationContext.Provider value={value}>
      {children}
    </OptimizationContext.Provider>
  );
};

export default OptimizationContext;