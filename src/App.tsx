import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';

const App: React.FC = () => {
  const loc = useLocation();
  return (
    <div className="app">
      <Sidebar />
      <div className="content">
        <Topbar title={
          loc.pathname === '/' ? 'Dashboard'
            : loc.pathname.includes('users') ? 'Gestión de Usuarios'
            : loc.pathname.includes('recipes') ? 'Gestión de Recetas'
            : loc.pathname.includes('reports') ? 'Reportes'
            : ''
        } />
        <div className="page">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default App;
