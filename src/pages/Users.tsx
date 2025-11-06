import React from 'react';
import Card from '../components/Card';
import { apiUsersList, apiUserToggle } from '../lib/api';

const pageSize = 20;

const Users: React.FC = () => {
  const [rows, setRows] = React.useState<any[]>([]);
  const [q, setQ] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await apiUsersList({ q, page, pageSize });

      // la edge function devuelve { ok, data, total, ... }
      setRows(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch (err: any) {
      console.error('Error cargando usuarios', err);
      setRows([]);
      setTotal(0);
      setError(err?.message || 'No se pudieron cargar los usuarios');
    } finally {
      setLoading(false);
    }
  }, [q, page]);

  React.useEffect(() => {
    load();
  }, [load]);

  const onSearch = () => {
    setPage(1); // el useEffect vuelve a disparar load()
  };

  const toggle = async (id_user: number, enabled: boolean) => {
    try {
      await apiUserToggle(id_user, enabled);
      await load();
    } catch (err) {
      console.error('Error toggling user', err);
      alert('No se pudo actualizar el usuario');
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="grid">
      <Card title="Búsqueda">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            placeholder="Buscar por nombre, email..."
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <button className="btn" onClick={onSearch}>
            Buscar
          </button>
        </div>
      </Card>

      <Card title="Usuarios">
        {error && (
          <div className="badge" style={{ background: '#fee2e2', color: '#b91c1c', marginBottom: 8 }}>
            {error}
          </div>
        )}

        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nombre</th>
              <th>Email</th>
              <th>País</th>
              <th>Creado</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 16, textAlign: 'center', color: '#6b7280' }}>
                  Cargando usuarios...
                </td>
              </tr>
            )}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 16, textAlign: 'center', color: '#6b7280' }}>
                  No se encontraron usuarios.
                </td>
              </tr>
            )}

            {rows.map((u) => (
              <tr key={u.id_user}>
                <td>{u.id_user}</td>
                <td>{[u.name, u.last_name].filter(Boolean).join(' ') || '-'}</td>
                <td>{u.email}</td>
                <td>{u.country ?? '-'}</td>
                <td>{u.created_at ? String(u.created_at).slice(0, 10) : '-'}</td>
                <td>
                  {/* Si todavía no tenés columna enabled en la tabla, esto va a ser siempre "Activo" */}
                  <span className="badge">
                    {u.enabled ?? true ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td>
                  <button
                    className="btn"
                    onClick={() => toggle(u.id_user, !(u.enabled ?? true))}
                  >
                    {u.enabled ?? true ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            marginTop: 10,
            alignItems: 'center',
          }}
        >
          <span className="badge">Total: {total}</span>
          <button
            className="btn"
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <button
            className="btn"
            disabled={page >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      </Card>
    </div>
  );
};

export default Users;
