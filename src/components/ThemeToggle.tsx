import React from 'react';
import { useTheme } from '../theme';

const SunIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
  </svg>
);

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20.4 15.3A8.5 8.5 0 0 1 8.7 3.6 8.5 8.5 0 1 0 20.4 15.3Z" />
  </svg>
);

const ThemeToggle: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === 'dark' ? 'claro' : 'oscuro';

  return (
    <button
      className={`theme-toggle${compact ? ' theme-toggle--compact' : ''}`}
      type="button"
      onClick={toggleTheme}
      aria-label={`Cambiar a modo ${nextTheme}`}
      title={`Cambiar a modo ${nextTheme}`}
    >
      <span className="theme-toggle__icon">
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </span>
      {!compact && <span>{theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>}
    </button>
  );
};

export default ThemeToggle;
