import React from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';

const Topbar: React.FC<{title: string}> = ({ title }) => {
  const nav = useNavigate();
  const logout = async () => {
    await supabase.auth.signOut();
    nav('/login', { replace: true });
  };
  return (
    <div className="topbar">
      <h2 style={{margin:0, fontSize:16, fontWeight:700}}>{title}</h2>
      <button className="btn" onClick={logout}>Salir</button>
    </div>
  );
};
export default Topbar;
