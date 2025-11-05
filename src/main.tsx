import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import App from './App';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Recipes from './pages/Recipes';
import Reports from './pages/Reports';
import './styles.css';
import { supabase } from './lib/supabaseClient';

const Protected: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [ok, setOk] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setOk(!!session);
    })();
  }, []);
  if (ok === null) return null;
  return ok ? <>{children}</> : <Navigate to="/login" replace />;
};

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  {
    path: "/",
    element: <Protected><App /></Protected>,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "users", element: <Users /> },
      { path: "recipes", element: <Recipes /> },
      { path: "reports", element: <Reports /> },
    ]
  }
]);

ReactDOM.createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />);
