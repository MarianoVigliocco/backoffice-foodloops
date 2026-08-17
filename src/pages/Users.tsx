import React from 'react';
import Card from '../components/Card';
import {
  apiUsersList,
  apiUserToggle,
  type SortDirection,
  type UserSortKey,
} from '../lib/api';
import type { UserRow } from '../types';
import '../styles/users.css';

const pageSize = 20;

type PendingToggle = {
  user: UserRow;
  nextEnabled: boolean;
};

const Users: React.FC = () => {
  const [rows, setRows] = React.useState<UserRow[]>([]);
  const [q, setQ] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sortBy, setSortBy] = React.useState<UserSortKey>('created_at');
  const [sortDirection, setSortDirection] = React.useState<SortDirection>('desc');
  const [pendingToggle, setPendingToggle] = React.useState<PendingToggle | null>(null);
  const [updating, setUpdating] = React.useState(false);
  const [toggleError, setToggleError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await apiUsersList({
        q,
        page,
        pageSize,
        sortBy,
        sortDirection,
      });

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
  }, [page, q, sortBy, sortDirection]);

  React.useEffect(() => {
    load();
  }, [load]);

  const onSearch = () => setPage(1);

  const changeSort = (column: UserSortKey) => {
    setPage(1);
    if (sortBy === column) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(column);
    setSortDirection(column === 'created_at' ? 'desc' : 'asc');
  };

  const openToggleConfirmation = (user: UserRow) => {
    setToggleError(null);
    setPendingToggle({ user, nextEnabled: user.enabled === false });
  };

  const closeToggleConfirmation = () => {
    if (updating) return;
    setPendingToggle(null);
    setToggleError(null);
  };

  const confirmToggle = async () => {
    if (!pendingToggle) return;

    try {
      setUpdating(true);
      setToggleError(null);
      await apiUserToggle(pendingToggle.user.id_user, pendingToggle.nextEnabled);
      setRows((currentRows) => currentRows.map((user) => (
        user.id_user === pendingToggle.user.id_user
          ? { ...user, enabled: pendingToggle.nextEnabled }
          : user
      )));
      setPendingToggle(null);
    } catch (err: any) {
      console.error('Error actualizando usuario', err);
      setToggleError(err?.message || 'No se pudo actualizar el usuario');
    } finally {
      setUpdating(false);
    }
  };

  const sortableHeader = (label: string, column: UserSortKey) => {
    const isCurrent = sortBy === column;
    const ariaSort = isCurrent
      ? (sortDirection === 'asc' ? 'ascending' : 'descending')
      : 'none';

    return (
      <th aria-sort={ariaSort}>
        <button
          type="button"
          className={`fl-users-sort${isCurrent ? ' fl-users-sort-active' : ''}`}
          onClick={() => changeSort(column)}
        >
          <span>{label}</span>
          <span className="fl-users-sort-icon" aria-hidden="true">
            {isCurrent ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
          </span>
        </button>
      </th>
    );
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pendingName = pendingToggle
    ? [pendingToggle.user.name, pendingToggle.user.last_name].filter(Boolean).join(' ') || pendingToggle.user.email
    : '';

  return (
    <div className="fl-users-root">
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

      <div className="fl-users-search-wrapper">
        <Card className="fl-card fl-users-search-card" title="">
          <div className="fl-users-search-bar">
            <input
              className="fl-users-input"
              placeholder="Buscar por nombre, apellido o email"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onSearch();
              }}
            />
            <button className="fl-users-btn fl-users-btn-primary" onClick={onSearch}>
              Buscar
            </button>
          </div>
        </Card>
      </div>

      <Card className="fl-card fl-users-table-card" title="Listado de usuarios">
        {error && <div className="fl-users-alert fl-users-alert-error">{error}</div>}

        <div className="fl-users-table-wrapper">
          <table className="fl-table fl-users-table">
            <thead>
              <tr>
                {sortableHeader('ID', 'id_user')}
                {sortableHeader('Nombre', 'name')}
                {sortableHeader('Email', 'email')}
                {sortableHeader('País', 'country')}
                {sortableHeader('Creado', 'created_at')}
                {sortableHeader('Estado', 'enabled')}
                <th className="fl-users-th-actions">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="fl-users-table-empty">Cargando usuarios...</td>
                </tr>
              )}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="fl-users-table-empty">
                    No se encontraron usuarios con los filtros actuales.
                  </td>
                </tr>
              )}

              {rows.map((user) => {
                const enabled = user.enabled !== false;
                return (
                  <tr key={user.id_user}>
                    <td className="fl-users-col-id">{user.id_user}</td>
                    <td className="fl-users-col-name">
                      {[user.name, user.last_name].filter(Boolean).join(' ') || '-'}
                    </td>
                    <td className="fl-users-col-email">{user.email}</td>
                    <td className="fl-users-col-country">{user.country ?? '-'}</td>
                    <td className="fl-users-col-date">
                      {user.created_at ? String(user.created_at).slice(0, 10) : '-'}
                    </td>
                    <td className="fl-users-col-status">
                      <span className={`fl-users-badge ${enabled ? 'fl-users-badge-active' : 'fl-users-badge-inactive'}`}>
                        {enabled ? 'Activo' : 'Desactivado'}
                      </span>
                    </td>
                    <td className="fl-users-col-actions">
                      <button
                        className="fl-users-btn fl-users-btn-ghost"
                        onClick={() => openToggleConfirmation(user)}
                      >
                        {enabled ? 'Desactivar' : 'Reactivar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="fl-users-pagination">
          <span className="fl-users-pagination-info">Página {page} de {totalPages}</span>
          <div className="fl-users-pagination-actions">
            <button
              className="fl-users-btn fl-users-btn-outline"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Anterior
            </button>
            <button
              className="fl-users-btn fl-users-btn-outline"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              Siguiente
            </button>
          </div>
        </div>
      </Card>

      {pendingToggle && (
        <div
          className="fl-users-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeToggleConfirmation();
          }}
        >
          <section
            className="fl-users-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fl-users-confirm-title"
            aria-describedby="fl-users-confirm-description"
          >
            <div className={`fl-users-modal-icon ${pendingToggle.nextEnabled ? 'fl-users-modal-icon-success' : 'fl-users-modal-icon-danger'}`}>
              {pendingToggle.nextEnabled ? '✓' : '!'}
            </div>
            <h2 id="fl-users-confirm-title">
              {pendingToggle.nextEnabled ? '¿Reactivar usuario?' : '¿Desactivar usuario?'}
            </h2>
            <p id="fl-users-confirm-description">
              {pendingToggle.nextEnabled
                ? `${pendingName} podrá volver a iniciar sesión en FoodLoops.`
                : `${pendingName} no podrá volver a iniciar sesión hasta que lo reactives.`}
            </p>
            {toggleError && <div className="fl-users-modal-error" role="alert">{toggleError}</div>}
            <div className="fl-users-modal-actions">
              <button
                className="fl-users-btn fl-users-btn-cancel"
                onClick={closeToggleConfirmation}
                disabled={updating}
              >
                Cancelar
              </button>
              <button
                className={`fl-users-btn ${pendingToggle.nextEnabled ? 'fl-users-btn-primary' : 'fl-users-btn-danger'}`}
                onClick={confirmToggle}
                disabled={updating}
                autoFocus
              >
                {updating
                  ? 'Actualizando...'
                  : pendingToggle.nextEnabled ? 'Sí, reactivar' : 'Sí, desactivar'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default Users;
