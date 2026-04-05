import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeColor = {
  name: string;
  color: string;
  hover: string;
  light: string;
  shadow: string;
};

export const THEME_COLORS: ThemeColor[] = [
  { 
    name: 'Naranja (Default)', 
    color: '#f97316', 
    hover: '#ea580c', 
    light: '#fff7ed', 
    shadow: 'rgba(249, 115, 22, 0.2)' 
  },
  { 
    name: 'Azul', 
    color: '#3b82f6', 
    hover: '#2563eb', 
    light: '#eff6ff', 
    shadow: 'rgba(59, 130, 246, 0.2)' 
  },
  { 
    name: 'Esmeralda', 
    color: '#10b981', 
    hover: '#059669', 
    light: '#ecfdf5', 
    shadow: 'rgba(16, 185, 129, 0.2)' 
  },
  { 
    name: 'Violeta', 
    color: '#8b5cf6', 
    hover: '#7c3aed', 
    light: '#f5f3ff', 
    shadow: 'rgba(139, 92, 246, 0.2)' 
  },
  { 
    name: 'Rojo', 
    color: '#ef4444', 
    hover: '#dc2626', 
    light: '#fef2f2', 
    shadow: 'rgba(239, 68, 68, 0.2)' 
  }
];

interface ThemeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  currentTheme: ThemeColor;
  setTheme: (theme: ThemeColor) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('dark-mode');
    return saved ? JSON.parse(saved) : false;
  });

  const [currentTheme, setCurrentTheme] = useState<ThemeColor>(() => {
    const saved = localStorage.getItem('app-theme');
    return saved ? JSON.parse(saved) : THEME_COLORS[0];
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('dark-mode', JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--primary-color', currentTheme.color);
    root.style.setProperty('--primary-color-hover', currentTheme.hover);
    root.style.setProperty('--primary-color-light', currentTheme.light);
    root.style.setProperty('--primary-color-shadow', currentTheme.shadow);
    localStorage.setItem('app-theme', JSON.stringify(currentTheme));
  }, [currentTheme]);

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleDarkMode, currentTheme, setTheme: setCurrentTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
