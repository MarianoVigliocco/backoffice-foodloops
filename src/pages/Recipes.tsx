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
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiRecipesList({ q, page, pageSize });
      // La edge devuelve: { ok, data, total, page, pageSize }
      setRows(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch (e: any) {
      console.error('Recipes load error', e);
      setError('No se pudieron cargar las recetas');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [q, page, pageSize]);

  React.useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!editing) return;
    try {
      setSaving(true);
      setError(null);

      // Mandamos solo lo que la edge sabe manejar de forma segura
      const payload: any = {
        id_recipe: editing.id_recipe,
        title: editing.title,
        difficulty: editing.difficulty || null,
        // si querés editar macros, usamos el campo existente
        macros: {
          calories: editing.calories_per_serving_kcal
            ? Number(editing.calories_per_serving_kcal)
            : null,
        },
      };

      await apiRecipeUpdate(payload);
      setEditing(null);
      await load();
    } catch (e: any) {
      console.error('Recipe save error', e);
      setError('No se pudo guardar la receta');
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="grid">
      <Card title="Búsqueda">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            placeholder="Título, descripción..."
            value={q}
            onChange={e => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
          <button className="btn" onClick={load}>
            Buscar
          </button>
        </div>
      </Card>

      <Card title="Recetas">
        {loading && <div>Cargando recetas...</div>}
        {error && <div style={{ color: '#f87171', marginBottom: 8 }}>{error}</div>}

        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Título</th>
              <th>Cal/Porción</th>
              <th>Dif.</th>
              <th>Creada</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: 16 }}>
                  Sin resultados
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id_recipe}>
                <td>{r.id_recipe}</td>
                <td>{r.title}</td>
                <td>{r.calories_per_serving_kcal ?? '-'}</td>
                <td>{r.difficulty ?? '-'}</td>
                <td>{r.created_at ? String(r.created_at).slice(0, 10) : '-'}</td>
                <td>
                  <button className="btn" onClick={() => setEditing(r)}>
                    Editar
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
          <span className="badge">
            Página {page} / {totalPages}
          </span>
          <button
            className="btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Prev
          </button>
          <button
            className="btn"
            onClick={() => setPage((p) => (p < totalPages ? p + 1 : p))}
            disabled={page >= totalPages}
          >
            Next
          </button>
        </div>
      </Card>

      {editing && (
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h3>Editar receta #{editing.id_recipe}</h3>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 10,
              marginTop: 8,
            }}
          >
            <div>
              <label className="label">Título</label>
              <input
                className="input"
                value={editing.title ?? ''}
                onChange={(e) =>
                  setEditing({ ...editing, title: e.target.value })
                }
                placeholder="Título"
              />
            </div>

            <div>
              <label className="label">Dificultad</label>
              <input
                className="input"
                value={editing.difficulty ?? ''}
                onChange={(e) =>
                  setEditing({ ...editing, difficulty: e.target.value })
                }
                placeholder="Dificultad"
              />
            </div>

            <div>
              <label className="label">Kcal/porción</label>
              <input
                className="input"
                type="number"
                value={editing.calories_per_serving_kcal ?? ''}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    calories_per_serving_kcal: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
                placeholder="Kcal/porción"
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn" onClick={save} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
            <button
              className="btn"
              onClick={() => setEditing(null)}
              style={{ background: '#283147' }}
              disabled={saving}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Recipes;
