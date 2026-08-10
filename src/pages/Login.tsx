import React from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';

const Login: React.FC = () => {
  const [email, setEmail] = React.useState('');
  const [pass, setPass] = React.useState('');
  const [err, setErr] = React.useState<string | null>(null);
  const nav = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) return setErr(error.message);
    if (data.session) nav('/', { replace: true });
  };

  return (
    <div className="login-shell">
      <div className="login-theme-toggle"><ThemeToggle /></div>
      <div className="login-ambient login-ambient--one" />
      <div className="login-ambient login-ambient--two" />

      <main className="login-card">
        <div className="login-brand">
          <span className="brand-mark brand-mark--large">FL</span>
          <div><strong>FoodLoops</strong><small>Backoffice</small></div>
        </div>
        <div className="login-heading">
          <h1>Bienvenido</h1>
          <p>Ingresá con tu cuenta administrativa para continuar.</p>
        </div>
        <form onSubmit={submit} className="login-form">
          <label htmlFor="login-email">Email</label>
          <input id="login-email" className="input" type="email" placeholder="nombre@empresa.com" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required />
          <label htmlFor="login-password">Contraseña</label>
          <input id="login-password" className="input" type="password" placeholder="Ingresá tu contraseña" value={pass} onChange={e=>setPass(e.target.value)} autoComplete="current-password" required />
          {err && <div className="form-alert" role="alert">{err}</div>}
          <button className="btn login-submit" type="submit">Iniciar sesión</button>
        </form>
        <p className="login-security">Acceso seguro gestionado por Supabase</p>
      </main>
    </div>
  );
};
export default Login;
