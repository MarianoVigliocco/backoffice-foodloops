import React from 'react';
import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';

const Sidebar: React.FC = () => {
  const item = (to: string, label: string, icon: React.ReactNode) => (
    <NavLink to={to} className={({isActive}) => clsx('navlink', isActive && 'active')}>
      <span style={{display:'inline-flex', gap:10, alignItems:'center'}}>
        {icon}<span>{label}</span>
      </span>
    </NavLink>
  );
  return (
    <aside className="sidebar">
      <div className="brand">FoodLoops BackOffice</div>
      <nav className="nav" style={{display:'grid', gap:6}}>
        {item('/', 'Dashboard', <span></span>)}
        {item('/users', 'Usuarios', <span></span>)}
        {item('/recipes', 'Recetas', <span></span>)}
        {item('/reports', 'Reportes', <span></span>)}
      </nav>
    </aside>
  );
};
export default Sidebar;
