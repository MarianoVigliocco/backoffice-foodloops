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
import { useDemoMode } from '../demoMode';

type DateSelection = { from: string; to: string };
type RangePreset = 7 | 30 | 90 | 'custom';
type TrendGranularity = 'weekly' | 'monthly';
type RecipeGranularity = 'daily' | 'weekly' | 'monthly';
type RecipeActivityPoint = { day: string; created: number; saved: number };

const DASHBOARD_TOOLTIPS = {
  weeklyValueUsers: 'Cantidad de usuarios únicos que, durante los últimos 7 días cerrados por la fecha final elegida, importaron una receta desde Instagram o TikTok, o guardaron una receta.',
  newUsers: 'Cantidad de cuentas creadas dentro del período seleccionado. La variación MoM compara este valor con el mismo rango desplazado un mes.',
  activeUsers: 'Usuarios únicos que tuvieron actividad dentro del período: importaron o guardaron recetas, conversaron con FoodLoops o usaron la planificación de comidas.',
  activation: 'Porcentaje de usuarios nuevos que realizaron su primera acción de valor —importar una receta desde Instagram o TikTok, o guardar una receta— dentro de los 7 días posteriores a registrarse.',
  retention: 'Porcentaje de cada cohorte de usuarios nuevos que volvió a tener actividad 1, 7 o 30 días después de registrarse.',
  userMix: 'Compara usuarios activos registrados durante el período con usuarios activos que ya existían antes de que comenzara.',
  recipesImported: 'Cantidad de recetas incorporadas en el período mediante links de Instagram o TikTok. FoodLoops no permite crear recetas manualmente.',
  importPerformance: 'Tasa de intentos de importación resueltos correctamente por plataforma. Los intentos todavía pendientes no se cuentan como fallas.',
  recipeActivity: 'Evolución de las recetas importadas desde Instagram o TikTok y de las acciones de guardado dentro del período seleccionado. La información puede agruparse por día, semana o mes.',
  topTags: 'Etiquetas más utilizadas por las recetas visibles en el período y cantidad de apariciones de cada una.',
  activeUsersTrend: 'Evolución semanal o mensual de usuarios únicos que realizaron una acción relevante.',
  importTrend: 'Evolución semanal o mensual del porcentaje de importaciones resueltas correctamente en Instagram y TikTok.',
  comparisons: 'Compara los indicadores actuales con el mismo rango desplazado un mes (MoM) y con las mismas fechas del año anterior (YoY).',
  preferences: 'Distribución actual de dietas y alergias declaradas por los usuarios, independientemente del rango temporal elegido.',
  sourceAuthors: 'Autores originales de TikTok e Instagram con más recetas importadas y guardados asociados dentro del período.',
  seasonality: 'Agrupa la actividad por estaciones del hemisferio sur para detectar patrones anuales de uso y contenido.',
} as const;

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

const recipePeriodStart = (day: string, granularity: RecipeGranularity) => {
  const date = dayjs(day);
  if (granularity === 'monthly') return date.startOf('month').format('YYYY-MM-DD');
  if (granularity === 'weekly') {
    const daysSinceMonday = (date.day() + 6) % 7;
    return date.subtract(daysSinceMonday, 'day').format('YYYY-MM-DD');
  }
  return date.format('YYYY-MM-DD');
};

const aggregateRecipeActivity = (
  series: RecipeActivityPoint[],
  granularity: RecipeGranularity,
) => {
  if (granularity === 'daily') return series;

  const grouped = new Map<string, RecipeActivityPoint>();
  series.forEach((point) => {
    const day = recipePeriodStart(point.day, granularity);
    const current = grouped.get(day) ?? { day, created: 0, saved: 0 };
    current.created += point.created;
    current.saved += point.saved;
    grouped.set(day, current);
  });

  return Array.from(grouped.values()).sort((a, b) => a.day.localeCompare(b.day));
};

const formatRecipePeriod = (value: string, granularity: RecipeGranularity) => {
  if (granularity === 'monthly') return dayjs(value).format('MMM YY');
  if (granularity === 'weekly') {
    return `${dayjs(value).format('DD/MM')}–${dayjs(value).add(6, 'day').format('DD/MM')}`;
  }
  return dayjs(value).format('DD/MM');
};

const formatRecipeTooltipPeriod = (value: string, granularity: RecipeGranularity) => {
  if (granularity === 'monthly') return dayjs(value).format('MMMM YYYY');
  if (granularity === 'weekly') {
    return `Semana del ${dayjs(value).format('DD/MM/YYYY')} al ${dayjs(value).add(6, 'day').format('DD/MM/YYYY')}`;
  }
  return dayjs(value).format('DD/MM/YYYY');
};

const CalendarDateInput: React.FC<{
  id: string;
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}> = ({ id, label, value, min, max, onChange }) => {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const openCalendar = () => {
    const input = inputRef.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
      input.click();
    }
  };

  return (
    <div className="fl-date-field">
      <label htmlFor={id}>{label}</label>
      <div className="fl-date-input-wrap">
        <input
          ref={inputRef}
          id={id}
          type="date"
          value={value}
          min={min}
          max={max}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="fl-date-calendar-button"
          aria-label={`Abrir calendario para ${label.toLowerCase()}`}
          onClick={openCalendar}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M3 10h18" />
          </svg>
        </button>
      </div>
    </div>
  );
};

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
  const { isDemoMode } = useDemoMode();
  const [data, setData] = React.useState<MetricResponse | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [preset, setPreset] = React.useState<RangePreset>(30);
  const [draftRange, setDraftRange] = React.useState<DateSelection>(() => rangeForDays(30));
  const [appliedRange, setAppliedRange] = React.useState<DateSelection>(() => rangeForDays(30));
  const [trendGranularity, setTrendGranularity] = React.useState<TrendGranularity>('weekly');
  const [recipeGranularity, setRecipeGranularity] = React.useState<RecipeGranularity>('daily');

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
  }, [isDemoMode]);

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
  const recipeSeries = aggregateRecipeActivity(data.recipe_activity_per_day, recipeGranularity);
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
    { label: 'Recetas importadas', key: 'recipes_created' },
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
          <CalendarDateInput
            id="dashboard-date-from"
            label="Desde"
            value={draftRange.from}
            max={draftRange.to || today()}
            onChange={(value) => {
              setPreset('custom');
              setDraftRange((current) => ({ ...current, from: value }));
            }}
          />
          <CalendarDateInput
            id="dashboard-date-to"
            label="Hasta"
            value={draftRange.to}
            min={draftRange.from}
            max={today()}
            onChange={(value) => {
              setPreset('custom');
              setDraftRange((current) => ({ ...current, to: value }));
            }}
          />
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

        <Card className="fl-card fl-kpi fl-kpi-primary span-6" title="North Star · Usuarios con valor semanal" tooltip={DASHBOARD_TOOLTIPS.weeklyValueUsers}>
          <div className="fl-kpi-value">{data.weekly_value_users}</div>
          <div className="fl-kpi-label">
            Usuarios únicos que importaron o guardaron una receta en 7 días.
          </div>
          <DeltaBadge point={data.comparisons.mom.weekly_value_users} label="MoM" />
        </Card>

        <Card className="fl-card fl-kpi span-3" title="Usuarios nuevos" tooltip={DASHBOARD_TOOLTIPS.newUsers}>
          <div className="fl-kpi-value">{data.new_users}</div>
          <div className="fl-kpi-label">Registros creados en el período seleccionado.</div>
          <DeltaBadge point={data.comparisons.mom.new_users} label="MoM" />
        </Card>

        <Card className="fl-card fl-kpi span-3" title="Usuarios activos" tooltip={DASHBOARD_TOOLTIPS.activeUsers}>
          <div className="fl-kpi-value">{data.active_users}</div>
          <div className="fl-kpi-label">
            Usuarios únicos con actividad en los {periodDays} días seleccionados.
          </div>
        </Card>

        <Card className="fl-card span-4" title="Activación en 7 días" tooltip={DASHBOARD_TOOLTIPS.activation}>
          <CohortStat label="Nuevos con su primera acción de valor" metric={data.activation_7d} />
        </Card>

        <Card className="fl-card span-4" title="Retención de nuevos usuarios" tooltip={DASHBOARD_TOOLTIPS.retention}>
          <div className="fl-retention-grid">
            <CohortStat label="D1" metric={data.retention.d1} />
            <CohortStat label="D7" metric={data.retention.d7} />
            <CohortStat label="D30" metric={data.retention.d30} />
          </div>
        </Card>

        <Card className="fl-card span-4" title="Usuarios nuevos vs. recurrentes" tooltip={DASHBOARD_TOOLTIPS.userMix}>
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

        <Card className="fl-card fl-kpi span-3" title="Recetas importadas" tooltip={DASHBOARD_TOOLTIPS.recipesImported}>
          <div className="fl-kpi-value">{data.recipes_created}</div>
          <div className="fl-kpi-label">Importadas desde Instagram o TikTok durante el período.</div>
          <DeltaBadge point={data.comparisons.mom.recipes_created} label="MoM" />
        </Card>

        <Card className="fl-card fl-table-card span-9" title="Éxito de importación por plataforma" tooltip={DASHBOARD_TOOLTIPS.importPerformance}>
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

        <Card className="fl-card span-8" title="Recetas importadas y guardadas" tooltip={DASHBOARD_TOOLTIPS.recipeActivity}>
          <div className="fl-chart-toolbar">
            <div className="fl-segmented-control" aria-label="Agrupación de recetas importadas y guardadas">
              {([
                ['daily', 'Día'],
                ['weekly', 'Semana'],
                ['monthly', 'Mes'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={recipeGranularity === value ? 'active' : ''}
                  aria-pressed={recipeGranularity === value}
                  onClick={() => setRecipeGranularity(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="fl-chart-wrapper fl-recipe-chart-wrapper">
            {hasRecipeActivity ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={recipeSeries}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tickFormatter={(value) => formatRecipePeriod(String(value), recipeGranularity)} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <Tooltip
                    labelFormatter={(value) => formatRecipeTooltipPeriod(String(value), recipeGranularity)}
                    contentStyle={tooltipContentStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line name="Importadas" type="monotone" dataKey="created" stroke="var(--accent)" strokeWidth={2} dot={recipeGranularity === 'daily' ? false : { r: 3 }} activeDot={{ r: 4 }} />
                  <Line name="Guardadas" type="monotone" dataKey="saved" stroke="var(--success)" strokeWidth={2} dot={recipeGranularity === 'daily' ? false : { r: 3 }} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="fl-empty">Sin recetas importadas ni guardadas en este período.</div>
            )}
          </div>
        </Card>

        <Card className="fl-card span-4" title="Top tags por uso" tooltip={DASHBOARD_TOOLTIPS.topTags}>
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

        <Card className="fl-card span-6" title="Usuarios activos" tooltip={DASHBOARD_TOOLTIPS.activeUsersTrend}>
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

        <Card className="fl-card span-6" title="Éxito de importación" tooltip={DASHBOARD_TOOLTIPS.importTrend}>
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

        <Card className="fl-card fl-table-card span-12" title="Comparación MoM y YoY" tooltip={DASHBOARD_TOOLTIPS.comparisons}>
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

        <Card className="fl-card fl-table-card fl-scroll-table-card span-12" title="Preferencias declaradas · Estado actual" tooltip={DASHBOARD_TOOLTIPS.preferences}>
          <div
            className="fl-dashboard-table-scroll"
            role="region"
            aria-label="Preferencias declaradas"
            tabIndex={0}
          >
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
          </div>
        </Card>

        <Card className="fl-card fl-table-card span-12" title="Top autores originales de TikTok e Instagram" tooltip={DASHBOARD_TOOLTIPS.sourceAuthors}>
          {hasTopAuthors ? (
            <table className="fl-table fl-authors-table">
              <thead>
                <tr><th className="fl-authors-rank">#</th><th>Autor</th><th>Plataforma</th><th className="fl-table-cell-right">Recetas</th><th className="fl-table-cell-right">Guardados</th></tr>
              </thead>
              <tbody>
                {data.top_source_authors.map((author, index) => (
                  <tr key={`${author.platform}-${author.username.toLowerCase()}`}>
                    <td className="fl-authors-rank">{index + 1}</td>
                    <td className="fl-table-title-cell">@{author.username.replace(/^@+/, '')}</td>
                    <td><span className={`fl-platform-badge fl-platform-${author.platform.toLowerCase()}`}>{author.platform}</span></td>
                    <td className="fl-table-cell-right">{author.recipes}</td>
                    <td className="fl-table-number-cell">{author.saves}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="fl-empty fl-empty-compact">No hay autores identificados en este período.</div>}
        </Card>

        <Card className="fl-card fl-table-card span-12" title="Lectura estacional · Hemisferio sur" tooltip={DASHBOARD_TOOLTIPS.seasonality}>
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
                <tr><th>Estación</th><th>Período</th><th className="fl-table-cell-right">Usuarios con valor</th><th className="fl-table-cell-right">Importadas</th><th className="fl-table-cell-right">Guardadas</th><th>Tag destacado</th><th>Estado</th></tr>
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
