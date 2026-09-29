import React from 'react';

const DEMO_STORAGE_KEY = 'foodloops-backoffice-demo-mode';

type DemoModeContextValue = {
  isDemoMode: boolean;
  setDemoMode: (enabled: boolean) => void;
  toggleDemoMode: () => void;
};

const DemoModeContext = React.createContext<DemoModeContextValue | null>(null);

export function isDemoModeEnabled() {
  return typeof window !== 'undefined' && window.sessionStorage.getItem(DEMO_STORAGE_KEY) === 'true';
}

export const DemoModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDemoMode, setIsDemoMode] = React.useState(isDemoModeEnabled);

  const setDemoMode = React.useCallback((enabled: boolean) => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(DEMO_STORAGE_KEY, String(enabled));
    }
    setIsDemoMode(enabled);
  }, []);

  const toggleDemoMode = React.useCallback(() => {
    setDemoMode(!isDemoMode);
  }, [isDemoMode, setDemoMode]);

  const value = React.useMemo(() => ({ isDemoMode, setDemoMode, toggleDemoMode }), [isDemoMode, setDemoMode, toggleDemoMode]);

  return <DemoModeContext.Provider value={value}>{children}</DemoModeContext.Provider>;
};

export function useDemoMode() {
  const value = React.useContext(DemoModeContext);
  if (!value) throw new Error('useDemoMode debe usarse dentro de DemoModeProvider');
  return value;
}
