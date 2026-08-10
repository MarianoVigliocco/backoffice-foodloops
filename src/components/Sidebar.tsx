import React from 'react';
import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';

const Sidebar: React.FC = () => {
  const icons = {
    dashboard: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></svg>,
    users: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
    recipes: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /><path d="M8 7h8M8 11h6" /></svg>,
    reports: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></svg>,
  };

  const item = (to: string, label: string, icon: React.ReactNode) => (
    <NavLink to={to} className={({isActive}) => clsx('navlink', isActive && 'active')}>
      <span className="navlink-icon">{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">FL</span>
        <span className="brand-copy"><strong>FoodLoops</strong><small>Backoffice</small></span>
      </div>
      <div className="sidebar-section-label">Administración</div>
      <nav className="nav">
        {item('/', 'Dashboard', icons.dashboard)}
        {item('/users', 'Usuarios', icons.users)}
        {item('/recipes', 'Recetas', icons.recipes)}
        {item('/reports', 'Reportes', icons.reports)}
      </nav>
      <div className="sidebar-footer">
        <span className="sidebar-status-dot" />
        <span>Servicios conectados</span>
      </div>
    </aside>
  );
};
export default Sidebar;
