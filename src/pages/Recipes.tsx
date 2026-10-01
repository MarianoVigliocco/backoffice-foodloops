import React from 'react';
import Card from '../components/Card';
import { apiRecipesList, apiRecipeDelete, apiRecipeUpdate } from '../lib/api';
import '../styles/recipes.css';
import { useDemoMode } from '../demoMode';

const pageSize = 20;
const MAX_TITLE_LENGTH = 160;
const MAX_CALORIES_PER_SERVING = 10_000;
const DIFFICULTIES = ['Fácil', 'Intermedio', 'Avanzado'] as const;

type RecipeEditorErrors = Partial<Record<'title' | 'difficulty' | 'calories', string>>;

function validateRecipeEditor(recipe: any): RecipeEditorErrors {
  const errors: RecipeEditorErrors = {};
  const title = String(recipe?.title ?? '').trim();
  const difficulty = String(recipe?.difficulty ?? '').trim();
  const rawCalories = String(recipe?.calories_per_serving_kcal ?? '').trim();

  if (!title) errors.title = 'El título es obligatorio.';
  else if (title.length > MAX_TITLE_LENGTH) {
    errors.title = `El título no puede superar ${MAX_TITLE_LENGTH} caracteres.`;
  }

  if (!DIFFICULTIES.includes(difficulty as (typeof DIFFICULTIES)[number])) {
    errors.difficulty = 'Seleccioná una dificultad válida.';
  }

  if (rawCalories) {
    if (!/^\d+$/.test(rawCalories)) {
      errors.calories = 'Ingresá un número entero sin signo.';
    } else {
      const calories = Number(rawCalories);
      if (!Number.isSafeInteger(calories) || calories > MAX_CALORIES_PER_SERVING) {
        errors.calories = `El valor debe estar entre 0 y ${MAX_CALORIES_PER_SERVING.toLocaleString('es-AR')}.`;
      }
    }
  }

  return errors;
}

const Recipes: React.FC = () => {
  const { isDemoMode } = useDemoMode();
  const [rows, setRows] = React.useState<any[]>([]);
  const q = '';
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [editing, setEditing] = React.useState<any | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [recipeToDelete, setRecipeToDelete] = React.useState<any | null>(null);
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
    [isDemoMode],
  );

  React.useEffect(() => {
    loadRecipes(q, page);
  }, [q, page, loadRecipes]);

  React.useEffect(() => {
    setPage(1);
    setEditing(null);
  }, [isDemoMode]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const startEdit = (recipe: any) => {
    if (editing?.id_recipe === recipe.id_recipe) {
      setEditing(null);
      return;
    }

    setEditing({
      ...recipe,
      calories_per_serving_kcal:
        recipe.calories_per_serving_kcal ?? recipe.calories ?? recipe.kcal ?? '',
    });
  };

  const editingErrors = editing ? validateRecipeEditor(editing) : {};
  const canSave = Boolean(editing) && Object.keys(editingErrors).length === 0 && !saving;

  const save = async () => {
    if (!editing) return;

    const validationErrors = validateRecipeEditor(editing);
    if (Object.keys(validationErrors).length > 0) {
      setError('Revisá los campos marcados antes de guardar.');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await apiRecipeUpdate({
        id_recipe: editing.id_recipe,
        title: editing.title.trim(),
        difficulty: editing.difficulty,
        macros: {
          calories: String(editing.calories_per_serving_kcal).trim()
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

  const confirmDelete = async () => {
    if (!recipeToDelete || deleting) return;

    try {
      setDeleting(true);
      setError(null);
      await apiRecipeDelete(Number(recipeToDelete.id_recipe));
      if (editing?.id_recipe === recipeToDelete.id_recipe) setEditing(null);
      setRecipeToDelete(null);

      if (rows.length === 1 && page > 1) {
        setPage((current) => Math.max(1, current - 1));
      } else {
        await loadRecipes(q, page);
      }
    } catch (deleteError: any) {
      console.error('Recipe delete error', deleteError);
      setError(deleteError?.message || 'No se pudo eliminar la receta. Intentá nuevamente.');
    } finally {
      setDeleting(false);
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
            maxLength={MAX_TITLE_LENGTH}
            aria-invalid={Boolean(editingErrors.title)}
          />
          {editingErrors.title && <span className="fl-recipes-field-error">{editingErrors.title}</span>}
        </div>

        <div className="fl-recipes-edit-field">
          <label className="fl-recipes-label" htmlFor={`recipe-difficulty-${editing.id_recipe}`}>
            Dificultad
          </label>
          <select
            id={`recipe-difficulty-${editing.id_recipe}`}
            className="fl-recipes-input"
            value={editing.difficulty ?? ''}
            onChange={(event) => setEditing({ ...editing, difficulty: event.target.value })}
            aria-invalid={Boolean(editingErrors.difficulty)}
          >
            <option value="" disabled>Seleccionar</option>
            {DIFFICULTIES.map((difficulty) => (
              <option key={difficulty} value={difficulty}>{difficulty}</option>
            ))}
          </select>
          {editingErrors.difficulty && <span className="fl-recipes-field-error">{editingErrors.difficulty}</span>}
        </div>

        <div className="fl-recipes-edit-field">
          <label className="fl-recipes-label" htmlFor={`recipe-kcal-${editing.id_recipe}`}>
            Kcal/porción
          </label>
          <input
            id={`recipe-kcal-${editing.id_recipe}`}
            className="fl-recipes-input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={editing.calories_per_serving_kcal ?? ''}
            onChange={(event) => {
              const nextValue = event.target.value.replace(/\D/g, '').slice(0, 6);
              setEditing({ ...editing, calories_per_serving_kcal: nextValue });
            }}
            placeholder="Ej: 420"
            maxLength={6}
            aria-invalid={Boolean(editingErrors.calories)}
          />
          <span className="fl-recipes-field-hint">0–{MAX_CALORIES_PER_SERVING.toLocaleString('es-AR')} kcal</span>
          {editingErrors.calories && <span className="fl-recipes-field-error">{editingErrors.calories}</span>}
        </div>
      </div>

      <div className="fl-recipes-edit-actions">
        <button
          className="fl-recipes-btn fl-recipes-btn-primary"
          onClick={save}
          disabled={!canSave}
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
            Explorá, revisá y ajustá las recetas transcriptas desde links de Instagram o TikTok.
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
                <th>Transcripta</th>
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
                        <div className="fl-recipes-row-actions">
                        <button
                          className="fl-recipes-btn fl-recipes-btn-ghost"
                          onClick={() => startEdit(recipe)}
                          disabled={isDemoMode}
                          title={isDemoMode ? 'El modo demo es de sólo lectura' : undefined}
                        >
                          {isDemoMode ? 'Sólo lectura' : isEditing ? 'Cerrar' : 'Editar'}
                        </button>
                        {!isDemoMode && (
                          <button
                            className="fl-recipes-btn fl-recipes-btn-danger-ghost"
                            onClick={() => setRecipeToDelete(recipe)}
                            disabled={deleting}
                            aria-label={`Eliminar ${recipe.title || `receta ${recipe.id_recipe}`}`}
                          >
                            Eliminar
                          </button>
                        )}
                        </div>
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

      {recipeToDelete && (
        <div className="fl-recipes-dialog-backdrop" role="presentation">
          <div
            className="fl-recipes-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-recipe-title"
            aria-describedby="delete-recipe-description"
          >
            <span className="fl-recipes-dialog-kicker">Acción irreversible</span>
            <h2 id="delete-recipe-title">Eliminar receta</h2>
            <p id="delete-recipe-description">
              Vas a eliminar <strong>{recipeToDelete.title || `la receta #${recipeToDelete.id_recipe}`}</strong> y
              sus guardados, apariciones en menús y conversaciones asociadas.
            </p>
            <div className="fl-recipes-dialog-actions">
              <button
                className="fl-recipes-btn fl-recipes-btn-cancel"
                onClick={() => setRecipeToDelete(null)}
                disabled={deleting}
                autoFocus
              >
                Cancelar
              </button>
              <button
                className="fl-recipes-btn fl-recipes-btn-danger"
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? 'Eliminando...' : 'Eliminar definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Recipes;
