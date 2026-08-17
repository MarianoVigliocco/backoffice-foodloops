import React from 'react';
import Card from '../components/Card';
import { apiRecipesList, apiRecipeUpdate } from '../lib/api';
import '../styles/recipes.css';

const pageSize = 20;

const Recipes: React.FC = () => {
  const [rows, setRows] = React.useState<any[]>([]);
  const q = '';
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [editing, setEditing] = React.useState<any | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadRecipes = React.useCallback(
    async (qValue: string, pageValue: number) => {
      try {
        setLoading(true);
        setError(null);

        const res = await apiRecipesList({ q: qValue, page: pageValue, pageSize });
        setRows(res.data ?? []);
        setTotal(res.total ?? 0);
      } catch (loadError: any) {
        console.error('Recipes load error', loadError);
        setError('No se pudieron cargar las recetas');
        setRows([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    loadRecipes(q, page);
  }, [q, page, loadRecipes]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const startEdit = (recipe: any) => {
    if (editing?.id_recipe === recipe.id_recipe) {
      setEditing(null);
      return;
    }

    setEditing({
      ...recipe,
      calories_per_serving_kcal:
        recipe.calories_per_serving_kcal ?? recipe.calories ?? recipe.kcal ?? null,
    });
  };

  const save = async () => {
    if (!editing) return;

    try {
      setSaving(true);
      setError(null);

      await apiRecipeUpdate({
        id_recipe: editing.id_recipe,
        title: editing.title?.trim() || null,
        difficulty: editing.difficulty || null,
        macros: {
          calories: editing.calories_per_serving_kcal
            ? Number(editing.calories_per_serving_kcal)
            : null,
        },
      });

      setEditing(null);
      await loadRecipes(q, page);
    } catch (saveError: any) {
      console.error('Recipe save error', saveError);
      setError('No se pudo guardar la receta. Revisá los datos e intentá nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  const inlineEditor = editing && (
    <div className="fl-recipes-inline-editor">
      <div className="fl-recipes-inline-header">
        <div>
          <span className="fl-recipes-inline-kicker">Edición rápida</span>
          <h3>Editar receta #{editing.id_recipe}</h3>
        </div>
        <button
          type="button"
          className="fl-recipes-inline-close"
          onClick={() => setEditing(null)}
          aria-label="Cerrar editor"
          disabled={saving}
        >
          ×
        </button>
      </div>

      <div className="fl-recipes-edit-grid">
        <div className="fl-recipes-edit-field">
          <label className="fl-recipes-label" htmlFor={`recipe-title-${editing.id_recipe}`}>
            Título
          </label>
          <input
            id={`recipe-title-${editing.id_recipe}`}
            className="fl-recipes-input"
            value={editing.title ?? ''}
            onChange={(event) => setEditing({ ...editing, title: event.target.value })}
            placeholder="Título de la receta"
          />
        </div>

        <div className="fl-recipes-edit-field">
          <label className="fl-recipes-label" htmlFor={`recipe-difficulty-${editing.id_recipe}`}>
            Dificultad
          </label>
          <input
            id={`recipe-difficulty-${editing.id_recipe}`}
            className="fl-recipes-input"
            value={editing.difficulty ?? ''}
            onChange={(event) => setEditing({ ...editing, difficulty: event.target.value })}
            placeholder="Ej: Fácil, Media, Difícil"
          />
        </div>

        <div className="fl-recipes-edit-field">
          <label className="fl-recipes-label" htmlFor={`recipe-kcal-${editing.id_recipe}`}>
            Kcal/porción
          </label>
          <input
            id={`recipe-kcal-${editing.id_recipe}`}
            className="fl-recipes-input"
            type="number"
            value={editing.calories_per_serving_kcal ?? ''}
            onChange={(event) => setEditing({
              ...editing,
              calories_per_serving_kcal: event.target.value ? Number(event.target.value) : null,
            })}
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
    </div>
  );

  return (
    <div className="fl-recipes-root">
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

      <Card className="fl-card fl-recipes-table-card" title="Listado de recetas">
        {error && <div className="fl-recipes-alert fl-recipes-alert-error">{error}</div>}

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
                  <td colSpan={7} className="fl-recipes-table-empty">Cargando recetas...</td>
                </tr>
              )}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="fl-recipes-table-empty">
                    No se encontraron recetas con los filtros actuales.
                  </td>
                </tr>
              )}

              {rows.map((recipe) => {
                const isEditing = editing?.id_recipe === recipe.id_recipe;

                return (
                  <React.Fragment key={recipe.id_recipe}>
                    <tr className={isEditing ? 'fl-recipes-row-is-editing' : undefined}>
                      <td className="fl-recipes-col-id">{recipe.id_recipe}</td>
                      <td className="fl-recipes-col-title">{recipe.title || '-'}</td>
                      <td className="fl-recipes-col-kcal">{recipe.calories_per_serving_kcal ?? '-'}</td>
                      <td className="fl-recipes-col-diff">{recipe.difficulty || '-'}</td>
                      <td className="fl-recipes-col-source">
                        {recipe.source_platform || recipe.source_username
                          ? [recipe.source_platform, recipe.source_username].filter(Boolean).join(' · ')
                          : '-'}
                      </td>
                      <td className="fl-recipes-col-date">
                        {recipe.created_at ? String(recipe.created_at).slice(0, 10) : '-'}
                      </td>
                      <td className="fl-recipes-col-actions">
                        <button
                          className="fl-recipes-btn fl-recipes-btn-ghost"
                          onClick={() => startEdit(recipe)}
                        >
                          {isEditing ? 'Cerrar' : 'Editar'}
                        </button>
                      </td>
                    </tr>
                    {isEditing && (
                      <tr className="fl-recipes-editor-row">
                        <td colSpan={7}>{inlineEditor}</td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="fl-recipes-pagination">
          <span className="fl-recipes-pagination-info">Página {page} de {totalPages}</span>
          <div className="fl-recipes-pagination-actions">
            <button
              className="fl-recipes-btn fl-recipes-btn-outline"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Anterior
            </button>
            <button
              className="fl-recipes-btn fl-recipes-btn-outline"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              Siguiente
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Recipes;
