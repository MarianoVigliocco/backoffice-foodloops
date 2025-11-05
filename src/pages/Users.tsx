import React from 'react';
import Card from '../components/Card';
import { apiUsersList, apiUserToggle } from '../lib/api';

const Users: React.FC = () => {
  const [rows, setRows] = React.useState<any[]>([]);
  const [q, setQ] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  const load = React.useCallback(async () => {
    const data = await apiUsersList({ q, page, pageSize });
    setRows(data.items);
    setTotal(data.total);
  }, [q, page]);

  React.useEffect(()=>{ load(); }, [load]);

  const toggle = async (id_user:number, enabled:boolean) => {
    await apiUserToggle(id_user, enabled);
    await load();
  };

  return (
    <div className="grid">
      <Card title="Búsqueda">
        <div style={{display:'flex', gap:8}}>
          <input className="input" placeholder="Buscar por nombre, email..." value={q} onChange={e=>setQ(e.target.value)} />
          <button className="btn" onClick={()=>{ setPage(1); load(); }}>Buscar</button>
        </div>
      </Card>
      <Card title="Usuarios">
        <table className="table">
          <thead>
            <tr><th>ID</th><th>Nombre</th><th>Email</th><th>País</th><th>Creado</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map(u=>(
              <tr key={u.id_user}>
                <td>{u.id_user}</td>
                <td>{u.name} {u.last_name}</td>
                <td>{u.email}</td>
                <td>{u.country ?? '-'}</td>
                <td>{u.created_at?.slice(0,10)}</td>
                <td><span className="badge">{u.enabled ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                  <button className="btn" onClick={()=>toggle(u.id_user, !u.enabled)}>{u.enabled ? 'Desactivar' : 'Activar'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:10}}>
          <span className="badge">Total: {total}</span>
          <button className="btn" onClick={()=>setPage(p=>Math.max(1, p-1))}>Prev</button>
          <button className="btn" onClick={()=>setPage(p=>p+1)}>Next</button>
        </div>
      </Card>
    </div>
  );
};
export default Users;
