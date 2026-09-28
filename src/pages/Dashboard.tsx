import React from 'react';
import dayjs from 'dayjs';
import Card from '../components/Card';
import {
  apiMetrics,
  type CohortMetric,
  type MetricPoint,
  type MetricResponse,
} from '../lib/api';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import '../styles/dashboard.css';

type DateSelection = { from: string; to: string };
type RangePreset = 7 | 30 | 90 | 'custom';
type TrendGranularity = 'weekly' | 'monthly';

const today = () => dayjs().format('YYYY-MM-DD');
const rangeForDays = (days: number): DateSelection => ({
  from: dayjs().subtract(days - 1, 'day').format('YYYY-MM-DD'),
  to: today(),
});

const numberFormatter = new Intl.NumberFormat('es-AR');

const formatValue = (value: number | null, suffix = '') =>
  value == null ? '—' : `${numberFormatter.format(value)}${suffix}`;

const formatPercent = (value: number | null) =>
  value == null ? '—' : `${numberFormatter.format(value)}%`;

const formatTrendPeriod = (value: string) =>
  value.length === 7
    ? dayjs(`${value}-01`).format('MMM YY')
    : dayjs(value).format('DD/MM');

const DeltaBadge: React.FC<{
  point: MetricPoint;
  label: string;
  inverse?: boolean;
  compact?: boolean;
}> = ({ point, label, inverse = false, compact = false }) => {
  if (!point.comparison_available || point.change_percent == null) {
    return <span className="fl-delta fl-delta-muted">{compact ? 'Sin base' : 'Sin base comparable'}</span>;
  }

  const isPositive = point.change_percent > 0;
  const isNegative = point.change_percent < 0;
  const tone = isPositive
    ? (inverse ? 'negative' : 'positive')
    : isNegative
      ? (inverse ? 'positive' : 'negative')
      : 'neutral';
  const prefix = isPositive ? '+' : '';

  return (
    <span className={`fl-delta fl-delta-${tone}`}>
      {prefix}{numberFormatter.format(point.change_percent)}% {label}
    </span>
  );
};

const CohortStat: React.FC<{
  label: string;
  metric: CohortMetric;
}> = ({ label, metric }) => (
  <div className="fl-cohort-stat">
    <div className="fl-cohort-label">{label}</div>
    <div className="fl-cohort-value">{formatPercent(metric.value)}</div>
    <div className="fl-cohort-sample">
      {metric.denominator > 0
        ? `${metric.numerator} de ${metric.denominator} usuarios elegibles`
        : 'Todavía no hay usuarios elegibles'}
    </div>
    <DeltaBadge point={metric} label="MoM" />
  </div>
);

const Dashboard: React.FC = () => {
  const [data, setData] = React.useState<MetricResponse | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [preset, setPreset] = React.useState<RangePreset>(30);
  const [draftRange, setDraftRange] = React.useState<DateSelection>(() => rangeForDays(30));
  const [appliedRange, setAppliedRange] = React.useState<DateSelection>(() => rangeForDays(30));
  const [trendGranularity, setTrendGranularity] = React.useState<TrendGranularity>('weekly');

  const loadMetrics = React.useCallback(async (selection: DateSelection, initial = false) => {
    try {
      setErr(null);
      if (initial) setLoading(true);
      else setRefreshing(true);

      const from = dayjs(selection.from).startOf('day').toDate().toISOString();
      const to = dayjs(selection.to).add(1, 'day').startOf('day').toDate().toISOString();
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Argentina/Cordoba';
      setData(await apiMetrics({ from, to, timezone }));
    } catch (error: unknown) {
      setErr(error instanceof Error ? error.message : 'Error al cargar métricas');
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

  const periodDays = dayjs(appliedRange.to).diff(dayjs(appliedRange.from), 'day') + 1;
  const periodLabel = `${dayjs(appliedRange.from).format('DD/MM/YYYY')} – ${dayjs(appliedRange.to).format('DD/MM/YYYY')}`;
  const recipeSeries = data.recipe_activity_per_day;
  const activeSeries = data.trends.active_users[trendGranularity];
  const importSeries = data.trends.import_success[trendGranularity];
  const hasRecipeActivity = recipeSeries.some((point) => point.created > 0 || point.saved > 0);
  const hasActiveTrend = activeSeries.some((point) => point.users > 0);
  const hasImportTrend = importSeries.some((point) =>
    point.instagram_attempts > 0 || point.tiktok_attempts > 0
  );
  const hasTopTags = data.top_tags.length > 0;
  const hasDiets = data.diets_distribution.length > 0;
  const hasAllergies = data.allergies_distribution.length > 0;
  const hasTopSaved = data.top_saved_recipes.length > 0;
  const hasTopAuthors = data.top_source_authors.length > 0;
  const totalUsers = data.data_quality.total_users;
  const totalMix = data.user_mix.new_users + data.user_mix.returning_users;
  const returningShare = totalMix
    ? Math.round((data.user_mix.returning_users / totalMix) * 100)
    : 0;

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

  const comparisonRows: {
    label: string;
    key: keyof Pick<
      MetricResponse['comparisons']['mom'],
      'new_users' | 'weekly_value_users' | 'recipes_created' | 'import_success_rate'
    >;
    percent?: boolean;
  }[] = [
    { label: 'Usuarios nuevos', key: 'new_users' },
    { label: 'Usuarios con valor semanal', key: 'weekly_value_users' },
    { label: 'Recetas creadas', key: 'recipes_created' },
    { label: 'Éxito de importación', key: 'import_success_rate', percent: true },
  ];

  return (
    <div className="fl-dashboard-root">
      <header className="fl-dashboard-header">
        <div>
          <h1 className="fl-dashboard-title">Panel de FoodLoops</h1>
          <p className="fl-dashboard-subtitle">
            Adquisición, valor, retención y salud del producto en una sola lectura.
          </p>
        </div>
        <div className="fl-dashboard-meta">
          <span className="fl-dashboard-meta-label">Última actualización</span>
          <span className="fl-dashboard-meta-value">
            {new Date(data.now).toLocaleString('es-AR', {
              day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </span>
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
        <div className="fl-section-heading span-12">
          <div>
            <span className="fl-section-eyebrow">Pulso del producto</span>
            <h2>Valor y adquisición</h2>
          </div>
          <p>La North Star siempre mira los últimos 7 días cerrados por la fecha final elegida.</p>
        </div>

        <Card className="fl-card fl-kpi fl-kpi-primary span-6" title="North Star · Usuarios con valor semanal">
          <div className="fl-kpi-value">{data.weekly_value_users}</div>
          <div className="fl-kpi-label">
            Usuarios únicos que crearon, importaron o guardaron una receta en 7 días.
          </div>
          <DeltaBadge point={data.comparisons.mom.weekly_value_users} label="MoM" />
        </Card>

        <Card className="fl-card fl-kpi span-3" title="Usuarios nuevos">
          <div className="fl-kpi-value">{data.new_users}</div>
          <div className="fl-kpi-label">Registros creados en el período seleccionado.</div>
          <DeltaBadge point={data.comparisons.mom.new_users} label="MoM" />
        </Card>

        <Card className="fl-card fl-kpi span-3" title="Usuarios activos">
          <div className="fl-kpi-value">{data.active_users}</div>
          <div className="fl-kpi-label">
            Usuarios únicos con actividad en los {periodDays} días seleccionados.
          </div>
        </Card>

        <Card className="fl-card span-4" title="Activación en 7 días">
          <CohortStat label="Nuevos que llegaron a su primera receta" metric={data.activation_7d} />
        </Card>

        <Card className="fl-card span-4" title="Retención de nuevos usuarios">
          <div className="fl-retention-grid">
            <CohortStat label="D1" metric={data.retention.d1} />
            <CohortStat label="D7" metric={data.retention.d7} />
            <CohortStat label="D30" metric={data.retention.d30} />
          </div>
        </Card>

        <Card className="fl-card span-4" title="Usuarios nuevos vs. recurrentes">
          <div className="fl-mix-values">
            <div><strong>{data.user_mix.new_users}</strong><span>Nuevos activos</span></div>
            <div><strong>{data.user_mix.returning_users}</strong><span>Recurrentes</span></div>
          </div>
          <div className="fl-mix-bar" aria-label={`${returningShare}% de usuarios recurrentes`}>
            <span style={{ width: `${returningShare}%` }} />
          </div>
          <div className="fl-card-footnote">{returningShare}% de la actividad viene de usuarios que vuelven.</div>
        </Card>

        <div className="fl-section-heading span-12">
          <div>
            <span className="fl-section-eyebrow">Salud del core</span>
            <h2>Recetas e importaciones</h2>
          </div>
          <p>El éxito se calcula sobre intentos resueltos; pendientes recientes no cuentan como fallas.</p>
        </div>

        <Card className="fl-card fl-kpi span-3" title="Recetas creadas">
          <div className="fl-kpi-value">{data.recipes_created}</div>
          <div className="fl-kpi-label">Recetas incorporadas durante el período.</div>
          <DeltaBadge point={data.comparisons.mom.recipes_created} label="MoM" />
        </Card>

        <Card className="fl-card fl-kpi span-3" title="Recetas guardadas">
          <div className="fl-kpi-value">{data.recipes_saved}</div>
          <div className="fl-kpi-label">Guardados realizados durante el período.</div>
        </Card>

        <Card className="fl-card fl-table-card span-6" title="Éxito de importación por plataforma">
          {data.import_performance.tracking_since ? (
            <>
              <table className="fl-table fl-import-table">
                <thead>
                  <tr>
                    <th>Plataforma</th>
                    <th className="fl-table-cell-right">Éxito</th>
                    <th className="fl-table-cell-right">Resueltos</th>
                    <th className="fl-table-cell-right">Fallas</th>
                    <th className="fl-table-cell-right">MoM</th>
                    <th className="fl-table-cell-right">YoY</th>
                  </tr>
                </thead>
                <tbody>
                  {data.import_performance.platforms.map((platform) => (
                    <tr key={platform.platform}>
                      <td>
                        <span className={`fl-platform-badge fl-platform-${platform.platform.toLowerCase()}`}>
                          {platform.platform}
                        </span>
                      </td>
                      <td className="fl-table-number-cell">{formatPercent(platform.success_rate)}</td>
                      <td className="fl-table-cell-right">{platform.resolved_attempts}</td>
                      <td className="fl-table-cell-right">{platform.failures}</td>
                      <td className="fl-table-cell-right"><DeltaBadge point={platform.mom} label="" compact /></td>
                      <td className="fl-table-cell-right"><DeltaBadge point={platform.yoy} label="" compact /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="fl-card-footnote">
                Seguimiento disponible desde {dayjs(data.import_performance.tracking_since).format('DD/MM/YYYY')}.
              </div>
            </>
          ) : (
            <div className="fl-empty fl-empty-compact">Todavía no hay intentos de importación instrumentados.</div>
          )}
        </Card>

        <Card className="fl-card span-8" title="Recetas creadas y guardadas por día">
          <div className="fl-chart-wrapper">
            {hasRecipeActivity ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={recipeSeries}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tickFormatter={(value) => dayjs(value).format('DD/MM')} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <Tooltip
                    labelFormatter={(value) => dayjs(String(value)).format('DD/MM/YYYY')}
                    contentStyle={tooltipContentStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line name="Creadas" type="monotone" dataKey="created" stroke="var(--accent)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line name="Guardadas" type="monotone" dataKey="saved" stroke="var(--success)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="fl-empty">Sin recetas creadas ni guardadas en este período.</div>
            )}
          </div>
        </Card>

        <Card className="fl-card span-4" title="Top tags por uso">
          <div className="fl-chart-wrapper">
            {hasTopTags ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.top_tags} margin={{ top: 4, right: 8, left: -10, bottom: 24 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} interval={0} angle={-25} textAnchor="end" height={50} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                  <Bar name="Usos" dataKey="uses" radius={[4, 4, 0, 0]} fill="var(--accent)" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="fl-empty">Todavía no hay tags para mostrar.</div>
            )}
          </div>
        </Card>

        <div className="fl-section-heading span-12 fl-section-heading-with-control">
          <div>
            <span className="fl-section-eyebrow">Tendencias ampliadas</span>
            <h2>Evolución sostenida</h2>
          </div>
          <div className="fl-segmented-control" aria-label="Granularidad de las tendencias">
            <button type="button" className={trendGranularity === 'weekly' ? 'active' : ''} onClick={() => setTrendGranularity('weekly')}>Semanal</button>
            <button type="button" className={trendGranularity === 'monthly' ? 'active' : ''} onClick={() => setTrendGranularity('monthly')}>Mensual</button>
          </div>
        </div>

        <Card className="fl-card span-6" title="Usuarios activos">
          <div className="fl-chart-wrapper fl-chart-wrapper-small">
            {hasActiveTrend ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={activeSeries}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="period" tickFormatter={formatTrendPeriod} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <Tooltip labelFormatter={(value) => formatTrendPeriod(String(value))} contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                  <Line name="Usuarios activos" type="monotone" dataKey="users" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="fl-empty">Sin actividad suficiente para graficar.</div>
            )}
          </div>
        </Card>

        <Card className="fl-card span-6" title="Éxito de importación">
          <div className="fl-chart-wrapper fl-chart-wrapper-small">
            {hasImportTrend ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={importSeries}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="period" tickFormatter={formatTrendPeriod} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <Tooltip labelFormatter={(value) => formatTrendPeriod(String(value))} contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line name="Instagram" type="monotone" connectNulls dataKey="instagram" stroke="#cc4e8b" strokeWidth={2} dot={{ r: 3 }} />
                  <Line name="TikTok" type="monotone" connectNulls dataKey="tiktok" stroke="var(--text-secondary)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="fl-empty">Sin importaciones en este período.</div>
            )}
          </div>
        </Card>

        <Card className="fl-card fl-table-card span-12" title="Comparación MoM y YoY">
          <div className="fl-comparison-note">
            MoM desplaza el período elegido un mes; YoY usa las mismas fechas del año anterior.
            Los porcentajes se ocultan cuando la base no llega a {data.data_quality.min_reliable_sample} observaciones.
          </div>
          <table className="fl-table fl-comparison-table">
            <thead>
              <tr>
                <th>Indicador</th>
                <th className="fl-table-cell-right">Actual</th>
                <th className="fl-table-cell-right">Base MoM</th>
                <th className="fl-table-cell-right">Cambio MoM</th>
                <th className="fl-table-cell-right">Base YoY</th>
                <th className="fl-table-cell-right">Cambio YoY</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => {
                const mom = data.comparisons.mom[row.key];
                const yoy = data.comparisons.yoy[row.key];
                const formatter = row.percent ? formatPercent : formatValue;
                return (
                  <tr key={row.key}>
                    <td className="fl-table-title-cell">{row.label}</td>
                    <td className="fl-table-number-cell">{formatter(mom.value)}</td>
                    <td className="fl-table-cell-right">{formatter(mom.previous)}</td>
                    <td className="fl-table-cell-right"><DeltaBadge point={mom} label="" /></td>
                    <td className="fl-table-cell-right">{formatter(yoy.previous)}</td>
                    <td className="fl-table-cell-right"><DeltaBadge point={yoy} label="" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <div className="fl-section-heading span-12">
          <div>
            <span className="fl-section-eyebrow">Dirección de producto</span>
            <h2>Preferencias y contenido</h2>
          </div>
          <p>Distribuciones simples para decidir qué adaptar, destacar y promocionar.</p>
        </div>

        <Card className="fl-card fl-table-card span-6" title="Preferencias declaradas · Estado actual">
          <div className="fl-preferences-grid">
            <div>
              <h4>Dietas</h4>
              {hasDiets ? (
                <table className="fl-table fl-table-compact">
                  <tbody>
                    {data.diets_distribution.slice(0, 8).map((item) => (
                      <tr key={item.name}>
                        <td className="fl-table-title-cell">{item.name}</td>
                        <td className="fl-table-cell-right">{item.users}</td>
                        <td className="fl-table-cell-right">{totalUsers ? Math.round((item.users / totalUsers) * 100) : 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="fl-empty fl-empty-compact">Sin dietas declaradas.</div>}
            </div>
            <div>
              <h4>Alergias</h4>
              {hasAllergies ? (
                <table className="fl-table fl-table-compact">
                  <tbody>
                    {data.allergies_distribution.slice(0, 8).map((item) => (
                      <tr key={item.name}>
                        <td className="fl-table-title-cell">{item.name}</td>
                        <td className="fl-table-cell-right">{item.users}</td>
                        <td className="fl-table-cell-right">{totalUsers ? Math.round((item.users / totalUsers) * 100) : 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="fl-empty fl-empty-compact">Sin alergias declaradas.</div>}
            </div>
          </div>
        </Card>

        <Card className="fl-card fl-table-card span-6" title="Recetas más guardadas">
          {hasTopSaved ? (
            <table className="fl-table">
              <thead><tr><th>Receta</th><th className="fl-table-cell-right">Guardados</th></tr></thead>
              <tbody>
                {data.top_saved_recipes.map((recipe) => (
                  <tr key={recipe.id_recipe}>
                    <td className="fl-table-title-cell">{recipe.title}</td>
                    <td className="fl-table-number-cell">{recipe.saves}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="fl-empty fl-empty-compact">Todavía no hay recetas guardadas en este período.</div>}
        </Card>

        <Card className="fl-card fl-table-card span-12" title="Top autores originales de TikTok e Instagram">
          {hasTopAuthors ? (
            <table className="fl-table fl-authors-table">
              <thead>
                <tr><th className="fl-authors-rank">#</th><th>Autor</th><th>Plataforma</th><th className="fl-table-cell-right">Recetas</th><th className="fl-table-cell-right">Guardados</th></tr>
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
          ) : <div className="fl-empty fl-empty-compact">No hay autores identificados en este período.</div>}
        </Card>

        <Card className="fl-card fl-table-card span-12" title="Lectura estacional · Hemisferio sur">
          <div className={`fl-season-status ${data.seasonality.reliable ? 'reliable' : ''}`}>
            <strong>{data.seasonality.coverage_months} meses de historia</strong>
            <span>
              {data.seasonality.reliable
                ? 'Ya hay base anual para detectar patrones; la confianza crecerá al completar un segundo año.'
                : 'Lectura inicial: hace falta al menos un año completo para separar tendencia de estacionalidad.'}
            </span>
          </div>
          {data.seasonality.seasons.length ? (
            <table className="fl-table fl-season-table">
              <thead>
                <tr><th>Estación</th><th>Período</th><th className="fl-table-cell-right">Usuarios con valor</th><th className="fl-table-cell-right">Creadas</th><th className="fl-table-cell-right">Guardadas</th><th>Tag destacado</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {data.seasonality.seasons.map((season) => (
                  <tr key={`${season.season}-${season.period}`}>
                    <td className="fl-table-title-cell">{season.season}</td>
                    <td>{season.period}</td>
                    <td className="fl-table-cell-right">{season.value_users}</td>
                    <td className="fl-table-cell-right">{season.recipes_created}</td>
                    <td className="fl-table-cell-right">{season.recipes_saved}</td>
                    <td>{season.top_tag ?? '—'}</td>
                    <td><span className={`fl-season-chip ${season.complete ? '' : 'current'}`}>{season.complete ? 'Completa' : 'En curso'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="fl-empty fl-empty-compact">Todavía no hay historia para una lectura estacional.</div>}
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
