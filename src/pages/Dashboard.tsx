import React from 'react';
import dayjs from 'dayjs';
import Card from '../components/Card';
import { apiMetrics, type MetricResponse } from '../lib/api';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import '../styles/dashboard.css';

type DateSelection = { from: string; to: string };
type RangePreset = 7 | 30 | 90 | 'custom';

const today = () => dayjs().format('YYYY-MM-DD');
const rangeForDays = (days: number): DateSelection => ({
  from: dayjs().subtract(days - 1, 'day').format('YYYY-MM-DD'),
  to: today(),
});

const Dashboard: React.FC = () => {
  const [data, setData] = React.useState<MetricResponse | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [preset, setPreset] = React.useState<RangePreset>(30);
  const [draftRange, setDraftRange] = React.useState<DateSelection>(() => rangeForDays(30));
  const [appliedRange, setAppliedRange] = React.useState<DateSelection>(() => rangeForDays(30));

  const loadMetrics = React.useCallback(async (selection: DateSelection, initial = false) => {
    try {
      setErr(null);
      if (initial) setLoading(true);
      else setRefreshing(true);

      const from = dayjs(selection.from).startOf('day').toDate().toISOString();
      const to = dayjs(selection.to).add(1, 'day').startOf('day').toDate().toISOString();
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Argentina/Cordoba';
      const res = await apiMetrics({ from, to, timezone });
      setData(res);
    } catch (e: any) {
      setErr(e.message || 'Error al cargar métricas');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    loadMetrics(appliedRange, !data);
  }, [appliedRange, loadMetrics]);

  const applyPreset = (days: 7 | 30 | 90) => {
    const next = rangeForDays(days);
    setPreset(days);
    setDraftRange(next);
    setAppliedRange(next);
  };

  const applyCustomRange = () => {
    const from = dayjs(draftRange.from);
    const to = dayjs(draftRange.to);
    if (!from.isValid() || !to.isValid() || to.isBefore(from, 'day')) {
      setErr('Seleccioná un rango de fechas válido.');
      return;
    }
    if (to.diff(from, 'day') + 1 > 366) {
      setErr('El rango máximo es de 366 días.');
      return;
    }
    setPreset('custom');
    setAppliedRange(draftRange);
  };

  if (err && !data) {
    return (
      <div className="fl-dashboard-root">
        <div className="fl-error-badge">Error al cargar métricas: {err}</div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="fl-dashboard-root">
        <div className="fl-loading">Cargando métricas...</div>
      </div>
    );
  }

  const hasRecipesPerDay =
    Array.isArray(data.recipes_per_day) && data.recipes_per_day.length > 0;
  const hasTopTags = Array.isArray(data.top_tags) && data.top_tags.length > 0;
  const hasDiets =
    Array.isArray(data.diets_distribution) && data.diets_distribution.length > 0;
  const hasAllergies =
    Array.isArray(data.allergies_distribution) &&
    data.allergies_distribution.length > 0;
  const hasTopSaved =
    Array.isArray(data.top_saved_recipes) &&
    data.top_saved_recipes.length > 0;
  const hasTopAuthors =
    Array.isArray(data.top_source_authors) && data.top_source_authors.length > 0;

  const periodDays = dayjs(appliedRange.to).diff(dayjs(appliedRange.from), 'day') + 1;
  const periodLabel = `${dayjs(appliedRange.from).format('DD/MM/YYYY')} – ${dayjs(appliedRange.to).format('DD/MM/YYYY')}`;
  const chartDay = (value: string) => dayjs(value).format('DD/MM');

  const totalDietUsers = hasDiets
    ? data.diets_distribution.reduce(
      (acc: number, d: any) => acc + (d.users || 0),
      0
    )
    : 0;

  const totalAllergyUsers = hasAllergies
    ? data.allergies_distribution.reduce(
      (acc: number, a: any) => acc + (a.users || 0),
      0
    )
    : 0;

  const formatPercent = (value: number, total: number) => {
    if (!total || !value) return '0%';
    return `${Math.round((value / total) * 100)}%`;
  };

  const tooltipContentStyle: React.CSSProperties = {
    backgroundColor: 'var(--surface-elevated)',
    borderRadius: 10,
    border: '1px solid var(--border-strong)',
    boxShadow: 'var(--shadow-md)',
    padding: 9,
  };
  const tooltipLabelStyle: React.CSSProperties = {
    color: 'var(--text)',
    fontSize: 10,
    fontWeight: 700,
  };
  const tooltipItemStyle: React.CSSProperties = {
    color: 'var(--text-secondary)',
    fontSize: 10,
  };

  return (
    <div className="fl-dashboard-root">
      <header className="fl-dashboard-header">
        <div>
          <h1 className="fl-dashboard-title">Panel de FoodLoops</h1>
          <p className="fl-dashboard-subtitle">
            Visión general del uso, creación de recetas y comportamientos de la comunidad.
          </p>
        </div>
        <div className="fl-dashboard-header-actions">
          <div className="fl-dashboard-meta">
            <span className="fl-dashboard-meta-label">Última actualización</span>
            <span className="fl-dashboard-meta-value">
              {new Date(data.now).toLocaleString('es-AR', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </span>
          </div>
        </div>
      </header>

      <section className="fl-date-filter" aria-label="Rango de fechas de las estadísticas">
        <div className="fl-date-filter-copy">
          <span className="fl-date-filter-label">Período analizado</span>
          <strong>{periodLabel}</strong>
          {refreshing && <span className="fl-date-filter-loading">Actualizando…</span>}
        </div>
        <div className="fl-date-presets" aria-label="Rangos rápidos">
          {([7, 30, 90] as const).map((days) => (
            <button
              key={days}
              type="button"
              className={`fl-date-preset ${preset === days ? 'active' : ''}`}
              onClick={() => applyPreset(days)}
              disabled={refreshing}
            >
              {days} días
            </button>
          ))}
        </div>
        <div className="fl-date-custom">
          <label>
            Desde
            <input
              type="date"
              value={draftRange.from}
              max={draftRange.to || today()}
              onChange={(event) => {
                setPreset('custom');
                setDraftRange((current) => ({ ...current, from: event.target.value }));
              }}
            />
          </label>
          <label>
            Hasta
            <input
              type="date"
              value={draftRange.to}
              min={draftRange.from}
              max={today()}
              onChange={(event) => {
                setPreset('custom');
                setDraftRange((current) => ({ ...current, to: event.target.value }));
              }}
            />
          </label>
          <button type="button" className="fl-date-apply" onClick={applyCustomRange} disabled={refreshing}>
            Aplicar
          </button>
        </div>
      </section>

      {err && <div className="fl-error-badge fl-dashboard-inline-error">{err}</div>}

      <div className="fl-dashboard-grid">
        {/* KPIs */}
        <Card className="fl-card fl-kpi span-3" title="Usuarios activos">
          <div className="fl-kpi-value">{data.active_users}</div>
          <div className="fl-kpi-label">
            Usuarios únicos con actividad en los {periodDays} días seleccionados
          </div>
        </Card>

        <Card className="fl-card fl-kpi span-3" title="Usuarios nuevos">
          <div className="fl-kpi-value">{data.new_users}</div>
          <div className="fl-kpi-label">
            Registros creados durante el período seleccionado
          </div>
        </Card>

        <Card className="fl-card fl-kpi span-3" title="Recetas creadas">
          <div className="fl-kpi-value">{data.recipes_created}</div>
          <div className="fl-kpi-label">Recetas incorporadas durante el período seleccionado</div>
        </Card>

        <Card className="fl-card fl-kpi span-3" title="Recetas guardadas">
          <div className="fl-kpi-value">{data.recipes_saved}</div>
          <div className="fl-kpi-label">
            Guardados realizados durante el período seleccionado
          </div>
        </Card>

        {/* Recetas por día (14d) */}
        <Card
          className="fl-card span-8"
          title="Recetas creadas por día"
        >
          <div className="fl-chart-wrapper">
            {hasRecipesPerDay ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.recipes_per_day}>
                  <XAxis dataKey="day" tickFormatter={chartDay} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                  />
                  <Tooltip
                    labelFormatter={(value) => dayjs(String(value)).format('DD/MM/YYYY')}
                    contentStyle={tooltipContentStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                    cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="fl-empty">
                Sin datos de recetas creadas en el período seleccionado.
              </div>
            )}
          </div>
        </Card>

        {/* Top tags */}
        <Card className="fl-card span-4" title="Top tags por uso">
          <div className="fl-chart-wrapper">
            {hasTopTags ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.top_tags}
                  margin={{ top: 4, right: 8, left: -10, bottom: 24 }}
                >
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                  />
                  <Tooltip
                    contentStyle={tooltipContentStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                    cursor={{ fill: 'var(--surface-hover)' }}
                  />
                  <Bar
                    dataKey="uses"
                    radius={[4, 4, 0, 0]}
                    fill="var(--accent)"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="fl-empty">
                Todavía no hay suficientes tags para mostrar.
              </div>
            )}
          </div>
        </Card>

        <Card className="fl-card fl-table-card span-12" title="Top autores originales de TikTok e Instagram">
          {hasTopAuthors ? (
            <table className="fl-table fl-authors-table">
              <thead>
                <tr>
                  <th className="fl-authors-rank">#</th>
                  <th>Autor</th>
                  <th>Plataforma</th>
                  <th className="fl-table-cell-right">Recetas</th>
                  <th className="fl-table-cell-right">Guardados</th>
                </tr>
              </thead>
              <tbody>
                {data.top_source_authors.map((author, index) => (
                  <tr key={`${author.platform}-${author.username.toLowerCase()}`}>
                    <td className="fl-authors-rank">{index + 1}</td>
                    <td className="fl-table-title-cell">@{author.username}</td>
                    <td><span className={`fl-platform-badge fl-platform-${author.platform.toLowerCase()}`}>{author.platform}</span></td>
                    <td className="fl-table-cell-right">{author.recipes}</td>
                    <td className="fl-table-number-cell">{author.saves}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="fl-empty fl-empty-compact">
              No hay autores identificados de TikTok o Instagram en este período.
            </div>
          )}
        </Card>

        {/* Estilos de alimentación - tabla */}
        <Card
          className="fl-card fl-table-card span-4"
          title="Estilos de alimentación declarados · Estado actual"
        >
          {hasDiets ? (
            <table className="fl-table fl-table-compact-1">
              <thead>
                <tr>
                  <th>Estilo</th>
                  <th className="fl-table-cell-right">Usuarios</th>
                  <th className="fl-table-cell-right">% usuarios</th>
                </tr>
              </thead>
              <tbody>
                {data.diets_distribution.map((d: any) => (
                  <tr key={d.name}>
                    <td className="fl-table-title-cell">{d.name}</td>
                    <td className="fl-table-cell-right">{d.users}</td>
                    <td className="fl-table-cell-right">
                      {formatPercent(d.users, totalDietUsers)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="fl-empty">
              Sin preferencias de alimentación configuradas aún.
            </div>
          )}
        </Card>

        {/* Alergias - tabla */}
        <Card
          className="fl-card fl-table-card span-4"
          title="Alergias reportadas por usuarios · Estado actual"
        >
          {hasAllergies ? (
            <table className="fl-table fl-table-compact">
              <thead>
                <tr>
                  <th>Alergia</th>
                  <th className="fl-table-cell-right">Usuarios</th>
                  <th className="fl-table-cell-right">% usuarios</th>
                </tr>
              </thead>
              <tbody>
                {data.allergies_distribution.map((a: any) => (
                  <tr key={a.name}>
                    <td className="fl-table-title-cell">{a.name}</td>
                    <td className="fl-table-cell-right">{a.users}</td>
                    <td className="fl-table-cell-right">
                      {formatPercent(a.users, totalAllergyUsers)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="fl-empty">
              Sin datos suficientes de alergias por ahora.
            </div>
          )}
        </Card>

        {/* Recetas más guardadas */}
        <Card className="fl-card fl-table-card span-4" title="Recetas más guardadas">
          {hasTopSaved ? (
            <table className="fl-table">
              <thead>
                <tr>
                  <th>Receta</th>
                  <th className="fl-table-cell-right">Guardados</th>
                </tr>
              </thead>
              <tbody>
                {data.top_saved_recipes.map((r: any) => (
                  <tr key={r.id_recipe}>
                    <td className="fl-table-title-cell">{r.title}</td>
                    <td className="fl-table-number-cell">{r.saves}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="fl-empty">
              Cuando haya suficientes recetas guardadas, las vas a ver acá.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
