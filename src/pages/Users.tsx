import React from 'react';
import Card from '../components/Card';
import { apiUsersList, apiUserToggle } from '../lib/api';
import '../styles/users.css';

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
    setPage(1);
    // El useEffect con load (que depende de q y page) se encarga de recargar
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
    <div className="fl-users-root">
      {/* Header */}
      <header className="fl-users-header">
        <div>
          <h1 className="fl-users-title">Usuarios</h1>
          <p className="fl-users-subtitle">
            Gestión de la base de usuarios de FoodLoops: estado, origen y actividad.
          </p>
        </div>
        <div className="fl-users-meta">
          <span className="fl-users-meta-label">Total usuarios</span>
          <span className="fl-users-meta-value">{total}</span>
        </div>
      </header>

      {/* Search bar arriba, full width */}
      <div className="fl-users-search-wrapper">
        <Card className="fl-card fl-users-search-card" title="">
          <div className="fl-users-search-bar">
            <input
              className="fl-users-input"
              placeholder="Buscar por nombre, apellido o email"
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') onSearch();
              }}
            />
            <button
              className="fl-users-btn fl-users-btn-primary"
              onClick={onSearch}
            >
              Buscar
            </button>
          </div>
        </Card>
      </div>

      {/* Tabla de usuarios */}
      <Card className="fl-card fl-users-table-card" title="Listado de usuarios">
        {error && (
          <div className="fl-users-alert fl-users-alert-error">
            {error}
          </div>
        )}

        <div className="fl-users-table-wrapper">
          <table className="fl-table fl-users-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Email</th>
                <th>País</th>
                <th>Creado</th>
                <th>Estado</th>
                <th className="fl-users-th-actions">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="fl-users-table-empty">
                    Cargando usuarios...
                  </td>
                </tr>
              )}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="fl-users-table-empty">
                    No se encontraron usuarios con los filtros actuales.
                  </td>
                </tr>
              )}

              {rows.map((u) => (
                <tr key={u.id_user}>
                  <td className="fl-users-col-id">{u.id_user}</td>
                  <td className="fl-users-col-name">
                    {[u.name, u.last_name].filter(Boolean).join(' ') || '-'}
                  </td>
                  <td className="fl-users-col-email">{u.email}</td>
                  <td className="fl-users-col-country">
                    {u.country ?? '-'}
                  </td>
                  <td className="fl-users-col-date">
                    {u.created_at ? String(u.created_at).slice(0, 10) : '-'}
                  </td>
                  <td className="fl-users-col-status">
                    <span
                      className={
                        (u.enabled ?? true)
                          ? 'fl-users-badge fl-users-badge-active'
                          : 'fl-users-badge fl-users-badge-inactive'
                      }
                    >
                      {u.enabled ?? true ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="fl-users-col-actions">
                    <button
                      className="fl-users-btn fl-users-btn-ghost"
                      onClick={() => toggle(u.id_user, !(u.enabled ?? true))}
                    >
                      {u.enabled ?? true ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginación alineada a la derecha, simétrica */}
        <div className="fl-users-pagination">
          <span className="fl-users-pagination-info">
            Página {page} de {totalPages}
          </span>
          <div className="fl-users-pagination-actions">
            <button
              className="fl-users-btn fl-users-btn-outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </button>
            <button
              className="fl-users-btn fl-users-btn-outline"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Siguiente
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Users;
