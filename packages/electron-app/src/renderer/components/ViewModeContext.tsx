import React, { createContext, useContext } from 'react';

interface ViewModeContextType {
  viewMode: 'edit' | 'view' | 'create';
}

const ViewModeContext = createContext<ViewModeContextType | undefined>(undefined);

export const ViewModeProvider: React.FC<{
  viewMode: 'edit' | 'view' | 'create';
  children: React.ReactNode;
}> = ({ viewMode, children }) => {
  return (
    <ViewModeContext.Provider value={{ viewMode }}>
      {children}
    </ViewModeContext.Provider>
  );
};

export const useViewMode = () => {
  const context = useContext(ViewModeContext);
  if (!context) {
    throw new Error('useViewMode must be used within ViewModeProvider');
  }
  return context;
};