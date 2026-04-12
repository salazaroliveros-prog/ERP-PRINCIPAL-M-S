import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeColor = {
  id: string;
  name: string;
  color: string;
  hover: string;
  light: string;
  shadow: string;
  fontFamily: string;
  headingFont: string;
  cardEffect: string;
  tableStyle: string;
  formStyle: string;
  iconStyle: string;
};

export const THEME_COLORS: ThemeColor[] = [
  { 
    id: 'sunset',
    name: 'Naranja Solar', 
    color: '#f97316', 
    hover: '#ea580c', 
    light: '#fff7ed', 
    shadow: 'rgba(249, 115, 22, 0.2)',
    fontFamily: 'Inter, sans-serif',
    headingFont: 'Montserrat, sans-serif',
    cardEffect: 'Elevado suave',
    tableStyle: 'Bandas cálidas',
    formStyle: 'Borde glow naranja',
    iconStyle: 'Stroke limpio'
  },
  { 
    id: 'ocean',
    name: 'Azul Océano', 
    color: '#3b82f6', 
    hover: '#2563eb', 
    light: '#eff6ff', 
    shadow: 'rgba(59, 130, 246, 0.2)',
    fontFamily: 'Space Grotesk, sans-serif',
    headingFont: 'Outfit, sans-serif',
    cardEffect: 'Vidrio técnico',
    tableStyle: 'Encabezado frost',
    formStyle: 'Campos suaves',
    iconStyle: 'Stroke medio'
  },
  { 
    id: 'forest',
    name: 'Esmeralda Bosque', 
    color: '#10b981', 
    hover: '#059669', 
    light: '#ecfdf5', 
    shadow: 'rgba(16, 185, 129, 0.2)',
    fontFamily: 'Montserrat, sans-serif',
    headingFont: 'Montserrat, sans-serif',
    cardEffect: 'Bordes orgánicos',
    tableStyle: 'Fila viva',
    formStyle: 'Campos redondeados',
    iconStyle: 'Stroke compacto'
  },
  { 
    id: 'aurora',
    name: 'Violeta Aurora', 
    color: '#8b5cf6', 
    hover: '#7c3aed', 
    light: '#f5f3ff', 
    shadow: 'rgba(139, 92, 246, 0.2)',
    fontFamily: 'Outfit, sans-serif',
    headingFont: 'Outfit, sans-serif',
    cardEffect: 'Sombra profunda',
    tableStyle: 'Bordes contrastados',
    formStyle: 'Inputs glass',
    iconStyle: 'Stroke fino'
  },
  { 
    id: 'ember',
    name: 'Rojo Ember', 
    color: '#ef4444', 
    hover: '#dc2626', 
    light: '#fef2f2', 
    shadow: 'rgba(239, 68, 68, 0.2)',
    fontFamily: 'JetBrains Mono, monospace',
    headingFont: 'Space Grotesk, sans-serif',
    cardEffect: 'Borde industrial',
    tableStyle: 'Alto contraste',
    formStyle: 'Recto técnico',
    iconStyle: 'Stroke robusto'
  },
  {
    id: 'graphite',
    name: 'Grafito Ejecutivo',
    color: '#334155',
    hover: '#1e293b',
    light: '#f1f5f9',
    shadow: 'rgba(51, 65, 85, 0.22)',
    fontFamily: 'Manrope, sans-serif',
    headingFont: 'Sora, sans-serif',
    cardEffect: 'Panel sobrio premium',
    tableStyle: 'Cabecera corporativa',
    formStyle: 'Campos ejecutivos',
    iconStyle: 'Stroke estructural'
  },
  {
    id: 'cobalt',
    name: 'Cobalto Corporativo',
    color: '#0f4c81',
    hover: '#0b365a',
    light: '#eef6ff',
    shadow: 'rgba(15, 76, 129, 0.22)',
    fontFamily: 'Source Sans 3, sans-serif',
    headingFont: 'Merriweather Sans, sans-serif',
    cardEffect: 'Laminado profesional',
    tableStyle: 'Filas ordenadas',
    formStyle: 'Borde técnico limpio',
    iconStyle: 'Stroke de precisión'
  },
  {
    id: 'sandstone',
    name: 'Arena Institucional',
    color: '#a16207',
    hover: '#854d0e',
    light: '#fffbeb',
    shadow: 'rgba(161, 98, 7, 0.24)',
    fontFamily: 'Lato, sans-serif',
    headingFont: 'Merriweather, serif',
    cardEffect: 'Documento premium',
    tableStyle: 'Jerarquía editorial',
    formStyle: 'Campos de alta legibilidad',
    iconStyle: 'Stroke clásico'
  },
  {
    id: 'steel',
    name: 'Acero Urbano',
    color: '#475569',
    hover: '#334155',
    light: '#f8fafc',
    shadow: 'rgba(71, 85, 105, 0.24)',
    fontFamily: 'IBM Plex Sans, sans-serif',
    headingFont: 'Barlow Condensed, sans-serif',
    cardEffect: 'Tablero industrial',
    tableStyle: 'Grid robusto',
    formStyle: 'Inputs compactos pro',
    iconStyle: 'Stroke sólido'
  }
];

interface ThemeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  currentTheme: ThemeColor;
  setTheme: (theme: ThemeColor) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const resolveTheme = (savedRaw: string | null) => {
  if (!savedRaw) return THEME_COLORS[0];
  try {
    const parsed = JSON.parse(savedRaw) as Partial<ThemeColor>;
    if (parsed?.id) {
      const byId = THEME_COLORS.find((theme) => theme.id === parsed.id);
      if (byId) return byId;
    }
    if (parsed?.name) {
      const byName = THEME_COLORS.find((theme) => theme.name === parsed.name);
      if (byName) return byName;
    }
  } catch {
    // Falls back to default when legacy/corrupt localStorage exists.
  }
  return THEME_COLORS[0];
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('dark-mode');
    return saved ? JSON.parse(saved) : false;
  });

  const [currentTheme, setCurrentTheme] = useState<ThemeColor>(() => {
    const saved = localStorage.getItem('app-theme');
    return resolveTheme(saved);
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
    const themeClassNames = THEME_COLORS.map((theme) => `app-theme-${theme.id}`);

    root.classList.remove(...themeClassNames);
    root.classList.add(`app-theme-${currentTheme.id}`);

    root.style.setProperty('--primary-color', currentTheme.color);
    root.style.setProperty('--primary-color-hover', currentTheme.hover);
    root.style.setProperty('--primary-color-light', currentTheme.light);
    root.style.setProperty('--primary-color-shadow', currentTheme.shadow);
    root.style.setProperty('--theme-font-body', currentTheme.fontFamily);
    root.style.setProperty('--theme-font-heading', currentTheme.headingFont);
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
