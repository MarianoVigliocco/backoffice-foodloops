import React from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import '../styles/topbar.css';
import ThemeToggle from './ThemeToggle';
import { useDemoMode } from '../demoMode';

type TopbarProps = {
  title: string;
};

const Topbar: React.FC<TopbarProps> = ({ title }) => {
  const nav = useNavigate();
  const { isDemoMode, setDemoMode, toggleDemoMode } = useDemoMode();

  const logout = async () => {
    setDemoMode(false);
    await supabase.auth.signOut();
    nav('/login', { replace: true });
  };

  return (
    <div className="fl-topbar">
      <div className="fl-topbar-left">
        <span className="fl-topbar-eyebrow">FoodLoops</span>
        <h2 className="fl-topbar-title">{title}</h2>
      </div>

      <div className="fl-topbar-right">
        <button
          type="button"
          className={`fl-demo-switch ${isDemoMode ? 'is-active' : ''}`}
          role="switch"
          aria-checked={isDemoMode}
          onClick={toggleDemoMode}
        >
          <span className="fl-demo-switch-copy">
            <strong>{isDemoMode ? 'Modo demo' : 'Datos reales'}</strong>
            <small>{isDemoMode ? 'Datos sintéticos' : 'Producción'}</small>
          </span>
          <span className="fl-demo-switch-track" aria-hidden="true"><span /></span>
        </button>
        <ThemeToggle />
        <button className="fl-topbar-btn-logout" onClick={logout}>
          Salir
        </button>
      </div>
    </div>
  );
};

export default Topbar;
