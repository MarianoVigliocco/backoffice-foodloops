import React from 'react';
import Card from '../components/Card';
import { apiRecipesList, apiRecipeUpdate } from '../lib/api';
import '../styles/recipes.css';

const pageSize = 20;

const Recipes: React.FC = () => {
  const [rows, setRows] = React.useState<any[]>([]);
  const [q, setQ] = React.useState(''); // término que se manda a la API
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [editing, setEditing] = React.useState<any | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Función base para pedir recetas con valores explícitos
  const loadRecipes = React.useCallback(
    async (qValue: string, pageValue: number) => {
      try {
        setLoading(true);
        setError(null);

        const res = await apiRecipesList({ q: qValue, page: pageValue, pageSize });
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
    },
    []
  );

  // Carga inicial + cuando cambian q o page
  React.useEffect(() => {
    loadRecipes(q, page);
  }, [q, page, loadRecipes]);

  const onSearch = () => {
    // Si estás en otra página, solo reseteamos a 1 y el useEffect se encarga
    if (page !== 1) {
      setPage(1);
      return;
    }
    // Si ya estás en la página 1, forzamos recarga con el q actual
    loadRecipes(q, 1);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const startEdit = (recipe: any) => {
    setEditing({
      ...recipe,
      calories_per_serving_kcal:
        recipe.calories_per_serving_kcal ??
        recipe.calories ??
        recipe.kcal ??
        null,
    });
  };

  const save = async () => {
    if (!editing) return;
    try {
      setSaving(true);
      setError(null);

      const payload: any = {
        id_recipe: editing.id_recipe,
        title: editing.title?.trim() || null,
        difficulty: editing.difficulty || null,
        macros: {
          calories: editing.calories_per_serving_kcal
            ? Number(editing.calories_per_serving_kcal)
            : null,
        },
      };

      await apiRecipeUpdate(payload);
      setEditing(null);
      await loadRecipes(q, page);
    } catch (e: any) {
      console.error('Recipe save error', e);
      setError(
        'No se pudo guardar la receta. Revisá los datos e intentá nuevamente.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fl-recipes-root">
      {/* Header */}
      <header className="fl-recipes-header">
        <div>
          <h1 className="fl-recipes-title">Recetas</h1>
          <p className="fl-recipes-subtitle">
            Explorá, revisá y ajustá las recetas creadas a partir del contenido de la comunidad.
          </p>
        </div>
        <div className="fl-recipes-meta">
          <span className="fl-recipes-meta-label">Total recetas</span>
          <span className="fl-recipes-meta-value">{total}</span>
        </div>
      </header>

      {/* Tabla de recetas */}
      <Card className="fl-card fl-recipes-table-card" title="Listado de recetas">
        {error && (
          <div className="fl-recipes-alert fl-recipes-alert-error">
            {error}
          </div>
        )}

        <div className="fl-recipes-table-wrapper">
          <table className="fl-table fl-recipes-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Título</th>
                <th>Cal/porción</th>
                <th>Dificultad</th>
                <th>Origen</th>
                <th>Creada</th>
                <th className="fl-recipes-th-actions">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="fl-recipes-table-empty">
                    Cargando recetas...
                  </td>
                </tr>
              )}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="fl-recipes-table-empty">
                    No se encontraron recetas con los filtros actuales.
                  </td>
                </tr>
              )}

              {rows.map((r) => (
                <tr key={r.id_recipe}>
                  <td className="fl-recipes-col-id">{r.id_recipe}</td>
                  <td className="fl-recipes-col-title">
                    {r.title || '-'}
                  </td>
                  <td className="fl-recipes-col-kcal">
                    {r.calories_per_serving_kcal ?? '-'}
                  </td>
                  <td className="fl-recipes-col-diff">
                    {r.difficulty || '-'}
                  </td>
                  <td className="fl-recipes-col-source">
                    {r.source_platform || r.source_username
                      ? [r.source_platform, r.source_username]
                        .filter(Boolean)
                        .join(' · ')
                      : '-'}
                  </td>
                  <td className="fl-recipes-col-date">
                    {r.created_at ? String(r.created_at).slice(0, 10) : '-'}
                  </td>
                  <td className="fl-recipes-col-actions">
                    <button
                      className="fl-recipes-btn fl-recipes-btn-ghost"
                      onClick={() => startEdit(r)}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div className="fl-recipes-pagination">
          <span className="fl-recipes-pagination-info">
            Página {page} de {totalPages}
          </span>
          <div className="fl-recipes-pagination-actions">
            <button
              className="fl-recipes-btn fl-recipes-btn-outline"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              Anterior
            </button>
            <button
              className="fl-recipes-btn fl-recipes-btn-outline"
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >
              Siguiente
            </button>
          </div>
        </div>
      </Card>

      {/* Editor de receta */}
      {editing && (
        <Card
          className="fl-card fl-recipes-edit-card"
          title={`Editar receta #${editing.id_recipe}`}
        >
          <div className="fl-recipes-edit-grid">
            <div className="fl-recipes-edit-field">
              <label className="fl-recipes-label">Título</label>
              <input
                className="fl-recipes-input"
                value={editing.title ?? ''}
                onChange={(e) =>
                  setEditing({ ...editing, title: e.target.value })
                }
                placeholder="Título de la receta"
              />
            </div>

            <div className="fl-recipes-edit-field">
              <label className="fl-recipes-label">Dificultad</label>
              <input
                className="fl-recipes-input"
                value={editing.difficulty ?? ''}
                onChange={(e) =>
                  setEditing({ ...editing, difficulty: e.target.value })
                }
                placeholder="Ej: Fácil, Media, Difícil"
              />
            </div>

            <div className="fl-recipes-edit-field">
              <label className="fl-recipes-label">Kcal/porción</label>
              <input
                className="fl-recipes-input"
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
                placeholder="Ej: 420"
              />
            </div>
          </div>

          <div className="fl-recipes-edit-actions">
            <button
              className="fl-recipes-btn fl-recipes-btn-primary"
              onClick={save}
              disabled={saving}
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <button
              className="fl-recipes-btn fl-recipes-btn-cancel"
              onClick={() => setEditing(null)}
              disabled={saving}
            >
              Cancelar
            </button>
          </div>
        </Card>
      )}
    </div>
  );
};

export default Recipes;
