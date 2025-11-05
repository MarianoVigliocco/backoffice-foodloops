import React from 'react';
import Card from '../components/Card';
import { apiRecipesList, apiRecipeUpdate } from '../lib/api';

const Recipes: React.FC = () => {
  const [rows, setRows] = React.useState<any[]>([]);
  const [q, setQ] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;
  const [editing, setEditing] = React.useState<any | null>(null);

  const load = React.useCallback(async () => {
    const data = await apiRecipesList({ q, page, pageSize });
    setRows(data.items);
    setTotal(data.total);
  }, [q, page]);

  React.useEffect(()=>{ load(); }, [load]);

  const save = async () => {
    if (!editing) return;
    await apiRecipeUpdate(editing);
    setEditing(null);
    await load();
  };

  return (
    <div className="grid">
      <Card title="Búsqueda">
        <div style={{display:'flex', gap:8}}>
          <input className="input" placeholder="Título, tag, creador..." value={q} onChange={e=>setQ(e.target.value)} />
          <button className="btn" onClick={()=>{ setPage(1); load(); }}>Buscar</button>
        </div>
      </Card>

      <Card title="Recetas">
        <table className="table">
          <thead>
            <tr><th>ID</th><th>Título</th><th>Cal/Porción</th><th>Dif.</th><th>Creada</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map(r=>(
              <tr key={r.id_recipe}>
                <td>{r.id_recipe}</td>
                <td>{r.title}</td>
                <td>{r.calories_per_serving_kcal ?? '-'}</td>
                <td>{r.difficulty ?? '-'}</td>
                <td>{String(r.created_at).slice(0,10)}</td>
                <td><button className="btn" onClick={()=>setEditing(r)}>Editar</button></td>
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

      {editing && (
        <div className="card" style={{gridColumn:'1 / -1'}}>
          <h3>Editar receta #{editing.id_recipe}</h3>
          <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10}}>
            <input className="input" value={editing.title ?? ''} onChange={e=>setEditing({...editing, title:e.target.value})} placeholder="Título" />
            <input className="input" value={editing.difficulty ?? ''} onChange={e=>setEditing({...editing, difficulty:e.target.value})} placeholder="Dificultad" />
            <input className="input" type="number" value={editing.calories_per_serving_kcal ?? ''} onChange={e=>setEditing({...editing, calories_per_serving_kcal:Number(e.target.value)})} placeholder="Kcal/porción" />
          </div>
          <div style={{display:'flex', gap:8, marginTop:10}}>
            <button className="btn" onClick={save}>Guardar</button>
            <button className="btn" onClick={()=>setEditing(null)} style={{background:'#283147'}}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
};
export default Recipes;
