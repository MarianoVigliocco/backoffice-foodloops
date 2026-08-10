import React from 'react';
import Card from '../components/Card';
import { apiMetrics } from '../lib/api';
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

const Dashboard: React.FC = () => {
  const [data, setData] = React.useState<any | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await apiMetrics();
        setData(res);
      } catch (e: any) {
        setErr(e.message || 'Error al cargar métricas');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (err) {
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
    Array.isArray(data.recipes_per_day_14) && data.recipes_per_day_14.length > 0;
  const hasTopTags = Array.isArray(data.top_tags) && data.top_tags.length > 0;
  const hasDiets =
    Array.isArray(data.diets_distribution) && data.diets_distribution.length > 0;
  const hasAllergies =
    Array.isArray(data.allergies_distribution) &&
    data.allergies_distribution.length > 0;
  const hasTopSaved =
    Array.isArray(data.top_saved_recipes) &&
    data.top_saved_recipes.length > 0;

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
        <div className="fl-dashboard-meta">
          <span className="fl-dashboard-meta-label">Última actualización</span>
          <span className="fl-dashboard-meta-value">
            {new Date(data.now).toLocaleString('es-AR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      </header>

      <div className="fl-dashboard-grid">
        {/* KPIs */}
        <Card className="fl-card fl-kpi span-3" title="Usuarios activos hoy (DAU)">
          <div className="fl-kpi-value">{data.dau}</div>
          <div className="fl-kpi-label">
            Usuarios únicos con actividad en las últimas 24 hs
          </div>
        </Card>

        <Card className="fl-card fl-kpi span-3" title="Usuarios activos (30 días)">
          <div className="fl-kpi-value">{data.mau}</div>
          <div className="fl-kpi-label">
            Usuarios únicos con sesión o evento en los últimos 30 días
          </div>
        </Card>

        <Card className="fl-card fl-kpi span-3" title="Usuarios nuevos (7 días)">
          <div className="fl-kpi-value">{data.new_users_7d}</div>
          <div className="fl-kpi-label">Registros creados en los últimos 7 días</div>
        </Card>

        <Card className="fl-card fl-kpi span-3" title="Recetas creadas (7 días)">
          <div className="fl-kpi-value">{data.recipes_7d}</div>
          <div className="fl-kpi-label">
            Recetas transcritas o generadas en los últimos 7 días
          </div>
        </Card>

        {/* Recetas por día (14d) */}
        <Card
          className="fl-card span-8"
          title="Recetas creadas por día (últimos 14 días)"
        >
          <div className="fl-chart-wrapper">
            {hasRecipesPerDay ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.recipes_per_day_14}>
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                  />
                  <Tooltip
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
                Sin datos de recetas creadas en los últimos 14 días.
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

        {/* Estilos de alimentación - tabla */}
        <Card
          className="fl-card fl-table-card span-4"
          title="Estilos de alimentación declarados"
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
          title="Alergias reportadas por usuarios"
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
