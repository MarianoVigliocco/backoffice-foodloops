import type { MetricPoint, MetricResponse } from './api';

export type ReportId = 'executive' | 'adoption' | 'imports' | 'dataset';
export type ReportFormat = 'pdf' | 'xlsx';

export type ReportDefinition = {
  id: ReportId;
  title: string;
  eyebrow: string;
  description: string;
  decision: string;
  scope: string;
  formats: readonly ReportFormat[];
  contents: readonly string[];
};

export type PreviewMetric = {
  label: string;
  value: string;
  detail: string;
};

const numberFormatter = new Intl.NumberFormat('es-AR');

export const REPORT_CATALOG: readonly ReportDefinition[] = [
  {
    id: 'executive',
    eyebrow: 'Dirección',
    title: 'Resumen ejecutivo',
    description: 'Una lectura breve de adquisición, valor, retención y salud del flujo de importación.',
    decision: 'Detectar rápidamente qué mejoró, qué empeoró y dónde conviene actuar.',
    scope: 'Sintetiza los indicadores principales y genera conclusiones basadas únicamente en el período seleccionado.',
    formats: ['pdf'],
    contents: ['Indicadores clave', 'Comparaciones MoM y YoY', 'Lecturas ejecutivas', 'Calidad de la muestra'],
  },
  {
    id: 'adoption',
    eyebrow: 'Producto & Growth',
    title: 'Adopción y retención',
    description: 'Altas, usuarios activos, activación, recurrencia y evolución de cohortes.',
    decision: 'Entender si las personas llegan al valor inicial y vuelven a usar FoodLoops.',
    scope: 'Las acciones de valor son importar una receta desde Instagram o TikTok, o guardar una receta.',
    formats: ['pdf', 'xlsx'],
    contents: ['Usuarios nuevos y activos', 'Activación en 7 días', 'Retención D1, D7 y D30', 'Nuevos vs. recurrentes'],
  },
  {
    id: 'imports',
    eyebrow: 'Operación & Contenido',
    title: 'Importaciones y contenido',
    description: 'Volumen, éxito por plataforma, tendencias, autores originales y tags.',
    decision: 'Encontrar caídas del flujo principal y oportunidades de contenido por plataforma.',
    scope: 'Sólo considera recetas importadas mediante links de Instagram o TikTok; no existe creación manual.',
    formats: ['pdf', 'xlsx'],
    contents: ['Recetas importadas', 'Éxito y fallas por plataforma', 'Evolución temporal', 'Autores y tags'],
  },
  {
    id: 'dataset',
    eyebrow: 'Análisis',
    title: 'Dataset analítico',
    description: 'Libro de Excel con series, tablas de soporte y un diccionario de métricas.',
    decision: 'Cruzar datos, crear modelos propios y profundizar análisis fuera del backoffice.',
    scope: 'Incluye información agregada y anonimizada. No exporta nombres ni correos de usuarios.',
    formats: ['xlsx'],
    contents: ['Resumen', 'Actividad diaria', 'Tendencias', 'Importaciones', 'Preferencias', 'Diccionario'],
  },
] as const;

export function getReportDefinition(id: ReportId) {
  return REPORT_CATALOG.find((report) => report.id === id) ?? REPORT_CATALOG[0];
}

export function formatReportValue(value: number | null, percent = false) {
  if (value == null) return '—';
  return `${numberFormatter.format(value)}${percent ? '%' : ''}`;
}

export function overallImportSuccess(metrics: MetricResponse) {
  const resolved = metrics.import_performance.platforms.reduce(
    (total, platform) => total + platform.resolved_attempts,
    0,
  );
  const successes = metrics.import_performance.platforms.reduce(
    (total, platform) => total + platform.successes,
    0,
  );
  return resolved > 0 ? Math.round((successes / resolved) * 100) : null;
}

function metricChange(point: MetricPoint) {
  if (!point.comparison_available || point.change_percent == null) return 'Sin base comparable';
  const prefix = point.change_percent > 0 ? '+' : '';
  return `${prefix}${numberFormatter.format(point.change_percent)}% vs. período comparable`;
}

export function previewMetricsFor(reportId: ReportId, metrics: MetricResponse): PreviewMetric[] {
  if (reportId === 'adoption') {
    return [
      { label: 'Usuarios nuevos', value: formatReportValue(metrics.new_users), detail: metricChange(metrics.comparisons.mom.new_users) },
      { label: 'Usuarios activos', value: formatReportValue(metrics.active_users), detail: 'Actividad dentro del período' },
      { label: 'Activación 7 días', value: formatReportValue(metrics.activation_7d.value, true), detail: `${metrics.activation_7d.numerator} de ${metrics.activation_7d.denominator} elegibles` },
      { label: 'Retención D7', value: formatReportValue(metrics.retention.d7.value, true), detail: `${metrics.retention.d7.numerator} de ${metrics.retention.d7.denominator} elegibles` },
    ];
  }

  if (reportId === 'imports') {
    const resolved = metrics.import_performance.platforms.reduce((sum, item) => sum + item.resolved_attempts, 0);
    const failures = metrics.import_performance.platforms.reduce((sum, item) => sum + item.failures, 0);
    return [
      { label: 'Recetas importadas', value: formatReportValue(metrics.recipes_created), detail: metricChange(metrics.comparisons.mom.recipes_created) },
      { label: 'Éxito general', value: formatReportValue(overallImportSuccess(metrics), true), detail: `${resolved} intentos resueltos` },
      { label: 'Fallas', value: formatReportValue(failures), detail: 'Instagram y TikTok' },
      { label: 'Autores identificados', value: formatReportValue(metrics.top_source_authors.length), detail: 'Autores originales en el período' },
    ];
  }

  if (reportId === 'dataset') {
    return [
      { label: 'Series diarias', value: formatReportValue(metrics.recipe_activity_per_day.length), detail: 'Importaciones y guardados' },
      { label: 'Series de tendencia', value: formatReportValue(metrics.trends.active_users.weekly.length + metrics.trends.active_users.monthly.length), detail: 'Semanas y meses disponibles' },
      { label: 'Tablas temáticas', value: '8', detail: 'Hojas listas para analizar' },
      { label: 'Datos personales', value: '0', detail: 'Exportación anonimizada' },
    ];
  }

  return [
    { label: 'Usuarios con valor semanal', value: formatReportValue(metrics.weekly_value_users), detail: metricChange(metrics.comparisons.mom.weekly_value_users) },
    { label: 'Usuarios nuevos', value: formatReportValue(metrics.new_users), detail: metricChange(metrics.comparisons.mom.new_users) },
    { label: 'Retención D7', value: formatReportValue(metrics.retention.d7.value, true), detail: `${metrics.retention.d7.numerator} de ${metrics.retention.d7.denominator} elegibles` },
    { label: 'Éxito de importación', value: formatReportValue(overallImportSuccess(metrics), true), detail: 'Intentos resueltos de ambas plataformas' },
  ];
}

export function executiveInsights(metrics: MetricResponse) {
  const insights: string[] = [];
  const northStar = metrics.comparisons.mom.weekly_value_users;
  if (northStar.comparison_available && northStar.change_percent != null) {
    const direction = northStar.change_percent >= 0 ? 'creció' : 'cayó';
    insights.push(`La North Star ${direction} ${Math.abs(northStar.change_percent)}% frente al período comparable.`);
  } else {
    insights.push('La North Star todavía no tiene una base suficiente para calcular una variación comparable.');
  }

  const activation = metrics.activation_7d.value;
  const retentionD7 = metrics.retention.d7.value;
  if (activation == null || retentionD7 == null) {
    insights.push('Activación o retención D7 no cuentan todavía con una muestra elegible suficiente.');
  } else {
    insights.push(`La activación a 7 días fue ${activation}% y la retención D7 fue ${retentionD7}%.`);
  }

  const importSuccess = overallImportSuccess(metrics);
  if (importSuccess == null) {
    insights.push('No hubo intentos de importación resueltos suficientes para calcular la tasa de éxito.');
  } else {
    const assessment = importSuccess >= 90 ? 'saludable' : importSuccess >= 75 ? 'a monitorear' : 'requiere atención';
    insights.push(`El éxito general de importación fue ${importSuccess}% y se encuentra ${assessment}.`);
  }

  return insights;
}
