import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import { useDemoMode } from './demoMode';

const App: React.FC = () => {
  const loc = useLocation();
  const { isDemoMode } = useDemoMode();
  return (
    <div className="app">
      <Sidebar />
      <div className="content">
        <Topbar title={
          loc.pathname === '/' ? 'Dashboard'
            : loc.pathname.includes('users') ? 'Gestión de Usuarios'
            : loc.pathname.includes('recipes') ? 'Gestión de Recetas'
            : loc.pathname.includes('business') ? 'Modelo de Negocio'
            : loc.pathname.includes('reports') ? 'Reportes'
            : ''
        } />
        {isDemoMode && (
          <div className="fl-demo-banner" role="status">
            <strong>Modo demo activo</strong>
            <span>Estás viendo datos sintéticos de los últimos 12 meses. Todas las acciones de escritura están bloqueadas.</span>
          </div>
        )}
        <div className="page">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default App;
