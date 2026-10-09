import React from 'react';
import {
  apiAgreementCreate,
  apiAgreementDelete,
  apiAgreementUpdate,
  apiBusiness,
  type AgreementPartnerType,
  type AgreementStatus,
  type BusinessResponse,
  type CommercialAgreement,
  type CommercialAgreementInput,
} from '../lib/api';
import { useDemoMode } from '../demoMode';
import '../styles/business.css';

const numberFormatter = new Intl.NumberFormat('es-AR');
const creatorsPageSize = 10;
const localDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Cordoba',
});
const currencyFormatter = (currency: string) => new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency,
  maximumFractionDigits: 2,
});

const partnerLabels: Record<AgreementPartnerType, string> = {
  brand: 'Marca',
  supermarket: 'Supermercado',
  creator: 'Creador/a',
  other: 'Otro',
};

const statusLabels: Record<AgreementStatus, string> = {
  planned: 'Planificado',
  active: 'Activo',
  completed: 'Finalizado',
  cancelled: 'Cancelado',
};

const emptyForm = (): CommercialAgreementInput => ({
  partner_name: '',
  partner_type: 'brand',
  source_username: null,
  source_platform: null,
  starts_on: localDateFormatter.format(new Date()),
  ends_on: null,
  status: 'planned',
  agreed_amount: null,
  target_reached_users: null,
  target_saves: null,
  currency: 'ARS',
  notes: null,
});

function agreementToForm(agreement: CommercialAgreement): CommercialAgreementInput {
  return {
    partner_name: agreement.partner_name,
    partner_type: agreement.partner_type,
    source_username: agreement.source_username,
    source_platform: agreement.source_platform,
    starts_on: agreement.starts_on,
    ends_on: agreement.ends_on,
    status: agreement.status,
    agreed_amount: agreement.agreed_amount,
    target_reached_users: agreement.target_reached_users,
    target_saves: agreement.target_saves,
    currency: agreement.currency,
    notes: agreement.notes,
  };
}

function formatDate(value: string | null) {
  if (!value) return 'Sin vencimiento';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function agreementIsActive(agreement: CommercialAgreement) {
  const today = localDateFormatter.format(new Date());
  return agreement.status === 'active'
    && agreement.starts_on <= today
    && (!agreement.ends_on || agreement.ends_on >= today);
}

type FormErrors = Partial<Record<keyof CommercialAgreementInput, string>>;

function validateForm(form: CommercialAgreementInput): FormErrors {
  const errors: FormErrors = {};
  if (!form.partner_name.trim()) errors.partner_name = 'Ingresá la empresa, marca o creador.';
  if (!form.starts_on) errors.starts_on = 'Indicá la fecha de inicio.';
  if (form.ends_on && form.ends_on < form.starts_on) {
    errors.ends_on = 'La fecha de fin no puede ser anterior al inicio.';
  }
  if (form.agreed_amount != null && (!Number.isFinite(form.agreed_amount) || form.agreed_amount < 0)) {
    errors.agreed_amount = 'El importe debe ser un número mayor o igual a cero.';
  }
  if (form.target_reached_users != null && (!Number.isSafeInteger(form.target_reached_users) || form.target_reached_users < 0)) {
    errors.target_reached_users = 'Ingresá una cantidad entera mayor o igual a cero.';
  }
  if (form.target_saves != null && (!Number.isSafeInteger(form.target_saves) || form.target_saves < 0)) {
    errors.target_saves = 'Ingresá una cantidad entera mayor o igual a cero.';
  }
  if (!/^[A-Z]{3}$/.test(form.currency)) errors.currency = 'Usá un código de moneda de tres letras.';
  if ((form.source_username && !form.source_platform) || (!form.source_username && form.source_platform)) {
    errors.source_username = 'Para vincular un creador completá usuario y plataforma.';
  }
  return errors;
}

const Business: React.FC = () => {
  const { isDemoMode } = useDemoMode();
  const [data, setData] = React.useState<BusinessResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<CommercialAgreement | 'new' | null>(null);
  const [form, setForm] = React.useState<CommercialAgreementInput>(emptyForm);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<CommercialAgreement | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [creatorsPage, setCreatorsPage] = React.useState(1);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setData(await apiBusiness());
    } catch (loadError: any) {
      console.error('Business load error', loadError);
      setData(null);
      setError(loadError?.message || 'No se pudo cargar la información de negocio.');
    } finally {
      setLoading(false);
    }
  }, [isDemoMode]);

  React.useEffect(() => {
    load();
    setEditing(null);
    setDeleteTarget(null);
    setCreatorsPage(1);
  }, [load]);

  const openCreate = () => {
    setEditing('new');
    setForm(emptyForm());
    setFormError(null);
  };

  const openEdit = (agreement: CommercialAgreement) => {
    setEditing(agreement);
    setForm(agreementToForm(agreement));
    setFormError(null);
  };

  const closeForm = () => {
    if (saving) return;
    setEditing(null);
    setFormError(null);
  };

  const formErrors = validateForm(form);
  const canSave = Object.keys(formErrors).length === 0 && !saving;

  const saveAgreement = async () => {
    if (!editing || !canSave) return;
    try {
      setSaving(true);
      setFormError(null);
      const payload: CommercialAgreementInput = {
        ...form,
        partner_name: form.partner_name.trim(),
        source_username: form.source_username?.trim().replace(/^@+/, '') || null,
        source_platform: form.source_username ? form.source_platform : null,
        ends_on: form.ends_on || null,
        notes: form.notes?.trim() || null,
        currency: form.currency.toUpperCase(),
      };
      if (editing === 'new') await apiAgreementCreate(payload);
      else await apiAgreementUpdate(editing.id_commercial_agreement, payload);
      setEditing(null);
      await load();
    } catch (saveError: any) {
      console.error('Business save error', saveError);
      setFormError(saveError?.message || 'No se pudo guardar el acuerdo.');
    } finally {
      setSaving(false);
    }
  };

  const deleteAgreement = async () => {
    if (!deleteTarget || deleting) return;
    try {
      setDeleting(true);
      setError(null);
      await apiAgreementDelete(deleteTarget.id_commercial_agreement);
      setDeleteTarget(null);
      await load();
    } catch (deleteError: any) {
      console.error('Business delete error', deleteError);
      setError(deleteError?.message || 'No se pudo eliminar el acuerdo.');
    } finally {
      setDeleting(false);
    }
  };

  const updateForm = <K extends keyof CommercialAgreementInput>(key: K, value: CommercialAgreementInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const summary = data?.summary;
  const creatorForAgreement = (agreement: CommercialAgreement) => data?.creators.find((creator) => (
    agreement.source_platform === creator.platform
      && agreement.source_username?.replace(/^@+/, '').toLocaleLowerCase() === creator.username.toLocaleLowerCase()
  ));
  const creatorsTotalPages = Math.max(1, Math.ceil((data?.creators.length ?? 0) / creatorsPageSize));
  const visibleCreators = data?.creators.slice(
    (creatorsPage - 1) * creatorsPageSize,
    creatorsPage * creatorsPageSize,
  ) ?? [];

  React.useEffect(() => {
    setCreatorsPage((current) => Math.min(current, creatorsTotalPages));
  }, [creatorsTotalPages]);

  return (
    <div className="fl-business-root">
      <header className="fl-business-header">
        <div>
          <div className="fl-business-kicker">Negocio</div>
          <h1>Acuerdos y creadores</h1>
          <p>Información comercial y consumo atribuible respaldados por datos de FoodLoops.</p>
        </div>
        <span className={`fl-business-demo-badge${isDemoMode ? '' : ' is-live'}`}>
          <span aria-hidden="true" /> {isDemoMode ? 'Datos simulados' : 'Datos reales'}
        </span>
      </header>

      {isDemoMode && (
        <div className="fl-business-notice" role="note">
          Estás viendo el modo demo. El CRUD queda en sólo lectura hasta volver a Datos reales.
        </div>
      )}
      {error && <div className="fl-business-alert" role="alert">{error}</div>}

      <section className="fl-business-kpis" aria-label="Resumen real de negocio">
        <div><span>Acuerdos activos</span><strong>{loading ? '—' : numberFormatter.format(summary?.active_agreements ?? 0)}</strong><small>{numberFormatter.format(summary?.agreements ?? 0)} totales</small></div>
        <div><span>Creadores atribuidos</span><strong>{loading ? '—' : numberFormatter.format(summary?.creators ?? 0)}</strong><small>Instagram y TikTok</small></div>
        <div><span>Recetas atribuidas</span><strong>{loading ? '—' : numberFormatter.format(summary?.attributed_recipes ?? 0)}</strong><small>{numberFormatter.format(data?.data_quality.unattributed_recipes ?? 0)} sin atribución</small></div>
        <div><span>Usuarios alcanzados</span><strong>{loading ? '—' : numberFormatter.format(summary?.reached_users ?? 0)}</strong><small>{numberFormatter.format(summary?.saves ?? 0)} guardados reales</small></div>
      </section>

      <section className="fl-business-alliances">
        <div className="fl-business-section-heading">
          <div>
            <span>Gestión comercial</span>
            <h2>Acuerdos comerciales</h2>
          </div>
          <div className="fl-business-heading-actions">
            <div className="fl-business-alliance-total"><strong>{summary?.active_agreements ?? 0}</strong><span>activos</span></div>
            <button className="fl-business-btn fl-business-btn-primary" onClick={openCreate} disabled={isDemoMode}>{isDemoMode ? 'Sólo lectura' : 'Nuevo acuerdo'}</button>
          </div>
        </div>

        <div className="fl-business-table-wrap">
          <table className="fl-business-table">
            <thead><tr><th>Empresa o creador</th><th>Tipo</th><th>Vigencia</th><th>Estado</th><th>Importe acordado</th><th>Objetivos acordados</th><th>Creador vinculado</th><th>Acciones</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="fl-business-empty">Cargando acuerdos...</td></tr>}
              {!loading && (data?.agreements.length ?? 0) === 0 && <tr><td colSpan={8} className="fl-business-empty">Todavía no hay acuerdos comerciales registrados.</td></tr>}
              {data?.agreements.map((agreement) => {
                const creatorMetric = creatorForAgreement(agreement);
                return (
                <tr key={agreement.id_commercial_agreement}>
                  <td><strong>{agreement.partner_name}</strong></td>
                  <td>{partnerLabels[agreement.partner_type]}</td>
                  <td>{formatDate(agreement.starts_on)} – {formatDate(agreement.ends_on)}</td>
                  <td><span className={`fl-business-status fl-business-status--${agreement.status}${agreementIsActive(agreement) ? ' is-active' : ''}`}>{statusLabels[agreement.status]}</span></td>
                  <td className="fl-business-income">{agreement.agreed_amount == null ? '—' : currencyFormatter(agreement.currency).format(agreement.agreed_amount)}</td>
                  <td>
                    {agreement.target_reached_users == null && agreement.target_saves == null ? '—' : (
                      <div className="fl-business-targets">
                        {agreement.target_reached_users != null && <span>{creatorMetric && <><strong>{numberFormatter.format(creatorMetric.reached_users)}</strong> / </>}{numberFormatter.format(agreement.target_reached_users)} usuarios{!creatorMetric && ' objetivo'}</span>}
                        {agreement.target_saves != null && <span>{creatorMetric && <><strong>{numberFormatter.format(creatorMetric.saves)}</strong> / </>}{numberFormatter.format(agreement.target_saves)} guardados{!creatorMetric && ' objetivo'}</span>}
                      </div>
                    )}
                  </td>
                  <td>{agreement.source_username && agreement.source_platform ? `@${agreement.source_username} · ${agreement.source_platform}` : '—'}</td>
                  <td><div className="fl-business-row-actions"><button className="fl-business-btn fl-business-btn-ghost" onClick={() => openEdit(agreement)} disabled={isDemoMode}>Editar</button><button className="fl-business-btn fl-business-btn-danger" onClick={() => setDeleteTarget(agreement)} disabled={isDemoMode}>Eliminar</button></div></td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      </section>

      <section className="fl-business-creators">
        <div className="fl-business-section-heading fl-business-creators-heading">
          <div><span>Creadores de contenido</span><h2>Audiencia y consumo por creador</h2><p>Datos calculados desde recetas con autor identificado y usuarios que las guardaron. Un recurrente guardó al menos dos recetas distintas del mismo creador.</p></div>
          <div className="fl-business-creator-summary" aria-label="Resumen de creadores"><div><strong>{numberFormatter.format(summary?.reached_users ?? 0)}</strong><span>usuarios únicos</span></div><div><strong>{numberFormatter.format(summary?.saves ?? 0)}</strong><span>guardados</span></div></div>
        </div>

        <div className="fl-business-table-wrap">
          <table className="fl-business-table fl-business-creators-table">
            <thead><tr><th>Creador</th><th>Plataforma</th><th>Usuarios que guardaron</th><th>Recetas atribuidas</th><th>Guardados</th><th>Usuarios recurrentes</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="fl-business-empty">Calculando consumo por creador...</td></tr>}
              {!loading && (data?.creators.length ?? 0) === 0 && <tr><td colSpan={6} className="fl-business-empty">No hay recetas con creador atribuible.</td></tr>}
              {visibleCreators.map((creator) => (
                <tr key={`${creator.platform}-${creator.username}`}>
                  <td><strong>@{creator.username}</strong></td>
                  <td><span className={`fl-business-platform fl-business-platform--${creator.platform.toLowerCase()}`}>{creator.platform}</span></td>
                  <td className="fl-business-number">{numberFormatter.format(creator.reached_users)}</td>
                  <td className="fl-business-number">{numberFormatter.format(creator.attributed_recipes)}</td>
                  <td className="fl-business-number">{numberFormatter.format(creator.saves)}</td>
                  <td><div className="fl-business-recurrence"><span><i style={{ width: `${Math.min(100, creator.recurrence_rate)}%` }} /></span><strong>{creator.recurrence_rate.toLocaleString('es-AR')} %</strong><small>{numberFormatter.format(creator.recurrent_users)}</small></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="fl-business-creators-footer">
          <div className="fl-business-table-note">Un mismo usuario puede guardar recetas de más de un creador; los usuarios de cada fila no deben sumarse entre sí.</div>
          {(data?.creators.length ?? 0) > creatorsPageSize && (
            <nav className="fl-business-pagination" aria-label="Páginas de creadores">
              <button
                type="button"
                onClick={() => setCreatorsPage((page) => Math.max(1, page - 1))}
                disabled={creatorsPage === 1}
                aria-label="Página anterior de creadores"
              >
                Anterior
              </button>
              <div className="fl-business-pagination-pages">
                {Array.from({ length: creatorsTotalPages }, (_, index) => index + 1).map((page) => (
                  <button
                    type="button"
                    key={page}
                    className={page === creatorsPage ? 'is-current' : undefined}
                    onClick={() => setCreatorsPage(page)}
                    aria-label={`Página ${page} de creadores`}
                    aria-current={page === creatorsPage ? 'page' : undefined}
                  >
                    {page}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setCreatorsPage((page) => Math.min(creatorsTotalPages, page + 1))}
                disabled={creatorsPage === creatorsTotalPages}
                aria-label="Página siguiente de creadores"
              >
                Siguiente
              </button>
            </nav>
          )}
        </div>
      </section>

      {editing && (
        <div className="fl-business-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeForm()}>
          <section className="fl-business-modal" role="dialog" aria-modal="true" aria-labelledby="business-form-title">
            <div className="fl-business-modal-header"><div><span>{editing === 'new' ? 'Alta' : 'Edición'}</span><h2 id="business-form-title">{editing === 'new' ? 'Nuevo acuerdo comercial' : `Editar ${editing.partner_name}`}</h2></div><button className="fl-business-modal-close" onClick={closeForm} disabled={saving} aria-label="Cerrar">×</button></div>
            <div className="fl-business-form-grid">
              <label className="fl-business-field fl-business-field-wide">Empresa, marca o creador<input value={form.partner_name} onChange={(event) => updateForm('partner_name', event.target.value)} maxLength={160} autoFocus />{formErrors.partner_name && <small>{formErrors.partner_name}</small>}</label>
              <label className="fl-business-field">Tipo<select value={form.partner_type} onChange={(event) => updateForm('partner_type', event.target.value as AgreementPartnerType)}>{Object.entries(partnerLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="fl-business-field">Estado<select value={form.status} onChange={(event) => updateForm('status', event.target.value as AgreementStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="fl-business-field">Inicio<input type="date" value={form.starts_on} onChange={(event) => updateForm('starts_on', event.target.value)} />{formErrors.starts_on && <small>{formErrors.starts_on}</small>}</label>
              <label className="fl-business-field">Fin<input type="date" value={form.ends_on ?? ''} onChange={(event) => updateForm('ends_on', event.target.value || null)} />{formErrors.ends_on && <small>{formErrors.ends_on}</small>}</label>
              <label className="fl-business-field">Importe acordado<input type="number" min="0" step="0.01" value={form.agreed_amount ?? ''} onChange={(event) => updateForm('agreed_amount', event.target.value === '' ? null : Number(event.target.value))} />{formErrors.agreed_amount && <small>{formErrors.agreed_amount}</small>}</label>
              <label className="fl-business-field">Moneda<input value={form.currency} onChange={(event) => updateForm('currency', event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3))} maxLength={3} />{formErrors.currency && <small>{formErrors.currency}</small>}</label>
              <div className="fl-business-form-section fl-business-field-wide"><span>Objetivos del acuerdo</span><p>Opcionales. Si vinculás un creador, el listado comparará estos objetivos con sus resultados reales.</p></div>
              <label className="fl-business-field">Usuarios alcanzados (objetivo)<input type="number" min="0" step="1" value={form.target_reached_users ?? ''} onChange={(event) => updateForm('target_reached_users', event.target.value === '' ? null : Number(event.target.value))} placeholder="Ej: 1000" />{formErrors.target_reached_users && <small>{formErrors.target_reached_users}</small>}</label>
              <label className="fl-business-field">Recetas guardadas (objetivo)<input type="number" min="0" step="1" value={form.target_saves ?? ''} onChange={(event) => updateForm('target_saves', event.target.value === '' ? null : Number(event.target.value))} placeholder="Ej: 500" />{formErrors.target_saves && <small>{formErrors.target_saves}</small>}</label>
              <label className="fl-business-field">Usuario del creador<input value={form.source_username ?? ''} onChange={(event) => updateForm('source_username', event.target.value || null)} placeholder="Ej: paulinacocina" />{formErrors.source_username && <small>{formErrors.source_username}</small>}</label>
              <label className="fl-business-field">Plataforma<select value={form.source_platform ?? ''} onChange={(event) => updateForm('source_platform', (event.target.value || null) as 'Instagram' | 'TikTok' | null)}><option value="">Sin vincular</option><option value="Instagram">Instagram</option><option value="TikTok">TikTok</option></select></label>
              <label className="fl-business-field fl-business-field-wide">Notas<textarea value={form.notes ?? ''} onChange={(event) => updateForm('notes', event.target.value || null)} maxLength={2000} rows={3} /></label>
            </div>
            {formError && <div className="fl-business-alert" role="alert">{formError}</div>}
            <div className="fl-business-modal-actions"><button className="fl-business-btn fl-business-btn-outline" onClick={closeForm} disabled={saving}>Cancelar</button><button className="fl-business-btn fl-business-btn-primary" onClick={saveAgreement} disabled={!canSave}>{saving ? 'Guardando...' : 'Guardar acuerdo'}</button></div>
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="fl-business-modal-backdrop">
          <section className="fl-business-modal fl-business-confirm" role="alertdialog" aria-modal="true" aria-labelledby="business-delete-title">
            <span>Acción irreversible</span><h2 id="business-delete-title">Eliminar acuerdo comercial</h2><p>Vas a eliminar el acuerdo con <strong>{deleteTarget.partner_name}</strong>. Las métricas de recetas y guardados no se modifican.</p>
            <div className="fl-business-modal-actions"><button className="fl-business-btn fl-business-btn-outline" onClick={() => setDeleteTarget(null)} disabled={deleting} autoFocus>Cancelar</button><button className="fl-business-btn fl-business-btn-danger-solid" onClick={deleteAgreement} disabled={deleting}>{deleting ? 'Eliminando...' : 'Eliminar definitivamente'}</button></div>
          </section>
        </div>
      )}
    </div>
  );
};

export default Business;
