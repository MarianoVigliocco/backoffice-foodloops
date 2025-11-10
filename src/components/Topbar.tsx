import React from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import '../styles/topbar.css';

type TopbarProps = {
  title: string;
};

const Topbar: React.FC<TopbarProps> = ({ title }) => {
  const nav = useNavigate();

  const logout = async () => {
    await supabase.auth.signOut();
    nav('/login', { replace: true });
  };

  return (
    <div className="fl-topbar">
      <div className="fl-topbar-left">
        <h2 className="fl-topbar-title">{title}</h2>
      </div>

      <div className="fl-topbar-right">
        <button className="fl-topbar-btn-logout" onClick={logout}>
          Salir
        </button>
      </div>
    </div>
  );
};

export default Topbar;
