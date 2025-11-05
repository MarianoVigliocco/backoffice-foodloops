import React from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';

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
    <div style={{height:'100%', display:'grid', placeItems:'center'}}>
      <form onSubmit={submit} className="card" style={{width:360}}>
        <h3>Iniciar sesión</h3>
        <div style={{display:'grid', gap:10}}>
          <input className="input" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
          <input className="input" type="password" placeholder="Contraseña" value={pass} onChange={e=>setPass(e.target.value)} />
          {err && <div className="badge" style={{color:'#ffb4a6', borderColor:'#3a1f1f'}}>⚠️ {err}</div>}
          <button className="btn" type="submit">Entrar</button>
        </div>
      </form>
    </div>
  );
};
export default Login;
