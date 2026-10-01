import dayjs from 'dayjs';
import type { SheetData } from 'write-excel-file/browser';
import type { MetricResponse } from './api';
import {
  executiveInsights,
  formatReportValue,
  getReportDefinition,
  overallImportSuccess,
  previewMetricsFor,
  type ReportId,
} from './reports';

type ExportContext = {
  reportId: ReportId;
  metrics: MetricResponse;
  period: string;
  timezone: string;
  isDemoMode?: boolean;
};

type DataRow = Array<string | number | boolean | null>;

const headerCell = (value: string) => ({
  value,
  fontWeight: 'bold' as const,
  color: '#ffffff',
  backgroundColor: '#e76f24',
  align: 'left' as const,
});

const sectionCell = (value: string) => ({
  value,
  fontWeight: 'bold' as const,
  color: '#8b3d12',
  backgroundColor: '#fff1e8',
});

function sheet(headers: string[], rows: DataRow[]): SheetData {
  return [headers.map(headerCell), ...rows];
}

function summaryRows(context: ExportContext): DataRow[] {
  const { metrics, period, timezone } = context;
  return [
    ['Tipo de datos', context.isDemoMode ? 'DEMOSTRACIÓN' : 'REALES', context.isDemoMode ? 'Datos sintéticos; no usar para decisiones reales' : 'Datos productivos'],
    ['Período', period, 'Rango seleccionado por el administrador'],
    ['Zona horaria', timezone, 'Usada para agrupar los eventos'],
    ['Usuarios con valor semanal', metrics.weekly_value_users, 'Transcribieron o guardaron una receta en los últimos 7 días'],
    ['Usuarios nuevos', metrics.new_users, 'Cuentas creadas dentro del período'],
    ['Usuarios activos', metrics.active_users, 'Usuarios con cualquier actividad relevante'],
    ['Activación en 7 días', metrics.activation_7d.value, 'Porcentaje de usuarios elegibles con primera acción de valor'],
    ['Retención D7', metrics.retention.d7.value, 'Porcentaje de la cohorte elegible que volvió el día 7'],
    ['Recetas transcriptas', metrics.recipes_created, 'Recetas transcriptas desde Instagram o TikTok'],
    ['Éxito de transcripción', overallImportSuccess(metrics), 'Porcentaje sobre intentos resueltos'],
  ];
}

function adoptionSheets(context: ExportContext) {
  const { metrics } = context;
  return [
    {
      sheet: 'Resumen',
      data: sheet(['Indicador', 'Valor', 'Definición'], summaryRows(context)),
      stickyRowsCount: 1,
    },
    {
      sheet: 'Tendencias',
      data: sheet(
        ['Granularidad', 'Período', 'Usuarios activos'],
        [
          ...metrics.trends.active_users.weekly.map((row) => ['Semanal', row.period, row.users] as DataRow),
          ...metrics.trends.active_users.monthly.map((row) => ['Mensual', row.period, row.users] as DataRow),
        ],
      ),
      stickyRowsCount: 1,
    },
    {
      sheet: 'Retención',
      data: sheet(
        ['Indicador', 'Porcentaje', 'Usuarios retenidos', 'Usuarios elegibles'],
        [
          ['Activación 7 días', metrics.activation_7d.value, metrics.activation_7d.numerator, metrics.activation_7d.denominator],
          ['Retención D1', metrics.retention.d1.value, metrics.retention.d1.numerator, metrics.retention.d1.denominator],
          ['Retención D7', metrics.retention.d7.value, metrics.retention.d7.numerator, metrics.retention.d7.denominator],
          ['Retención D30', metrics.retention.d30.value, metrics.retention.d30.numerator, metrics.retention.d30.denominator],
        ],
      ),
      stickyRowsCount: 1,
    },
    {
      sheet: 'Composición',
      data: sheet(
        ['Tipo de usuario activo', 'Usuarios'],
        [
          ['Nuevos', metrics.user_mix.new_users],
          ['Recurrentes', metrics.user_mix.returning_users],
        ],
      ),
      stickyRowsCount: 1,
    },
    {
      sheet: 'Diccionario',
      data: dictionarySheet('adoption'),
      stickyRowsCount: 1,
    },
  ];
}

function importSheets(context: ExportContext) {
  const { metrics } = context;
  return [
    {
      sheet: 'Resumen',
      data: sheet(['Indicador', 'Valor', 'Definición'], summaryRows(context)),
      stickyRowsCount: 1,
    },
    {
      sheet: 'Plataformas',
      data: sheet(
        ['Plataforma', 'Intentos', 'Resueltos', 'Exitosos', 'Fallas', 'Pendientes', 'Éxito %', 'Duración promedio (s)', 'Recetas transcriptas'],
        metrics.import_performance.platforms.map((row) => [
          row.platform,
          row.attempts,
          row.resolved_attempts,
          row.successes,
          row.failures,
          row.pending,
          row.success_rate,
          row.average_duration_seconds,
          row.imported_recipes,
        ]),
      ),
      stickyRowsCount: 1,
    },
    {
      sheet: 'Actividad diaria',
      data: sheet(
        ['Fecha', 'Recetas transcriptas', 'Guardados'],
        metrics.recipe_activity_per_day.map((row) => [row.day, row.created, row.saved]),
      ),
      stickyRowsCount: 1,
    },
    {
      sheet: 'Tendencia transcripción',
      data: sheet(
        ['Granularidad', 'Período', 'Instagram %', 'Intentos Instagram', 'TikTok %', 'Intentos TikTok'],
        [
          ...metrics.trends.import_success.weekly.map((row) => ['Semanal', row.period, row.instagram, row.instagram_attempts, row.tiktok, row.tiktok_attempts] as DataRow),
          ...metrics.trends.import_success.monthly.map((row) => ['Mensual', row.period, row.instagram, row.instagram_attempts, row.tiktok, row.tiktok_attempts] as DataRow),
        ],
      ),
      stickyRowsCount: 1,
    },
    {
      sheet: 'Contenido',
      data: [
        [sectionCell('Autores originales')],
        ['Autor', 'Plataforma', 'Recetas transcriptas', 'Guardados'].map(headerCell),
        ...metrics.top_source_authors.map((row) => [row.username, row.platform, row.recipes, row.saves]),
        [],
        [sectionCell('Tags más utilizados')],
        ['Tag', 'Usos'].map(headerCell),
        ...metrics.top_tags.map((row) => [row.name, row.uses]),
      ],
    },
    {
      sheet: 'Diccionario',
      data: dictionarySheet('imports'),
      stickyRowsCount: 1,
    },
  ];
}

function dictionarySheet(scope: 'adoption' | 'imports' | 'dataset'): SheetData {
  const common: DataRow[] = [
    ['Usuarios con valor semanal', 'Usuarios únicos que transcribieron o guardaron una receta durante los 7 días cerrados por la fecha final.'],
    ['Usuarios activos', 'Usuarios únicos que transcribieron o guardaron recetas, conversaron con FoodLoops o usaron la planificación.'],
    ['Activación en 7 días', 'Usuarios nuevos con una primera acción de valor dentro de sus primeros 7 días, sobre usuarios elegibles.'],
    ['Retención D1 / D7 / D30', 'Usuarios de una cohorte que volvieron a tener actividad en el día indicado.'],
    ['Recetas transcriptas', 'Recetas transcriptas mediante links de Instagram o TikTok. No incluye creación manual.'],
    ['Éxito de transcripción', 'Intentos exitosos dividido intentos resueltos. Los pendientes recientes no cuentan como fallas.'],
    ['MoM', 'Comparación con el mismo rango desplazado un mes.'],
    ['YoY', 'Comparación con las mismas fechas del año anterior.'],
  ];
  const note = scope === 'dataset'
    ? [['Privacidad', 'El libro contiene información agregada y no incluye nombres ni correos de usuarios.']]
    : [];
  return sheet(['Métrica', 'Definición'], [...common, ...note]);
}

function datasetSheets(context: ExportContext) {
  const { metrics } = context;
  return [
    {
      sheet: 'Resumen',
      data: sheet(['Indicador', 'Valor', 'Definición'], summaryRows(context)),
      stickyRowsCount: 1,
    },
    {
      sheet: 'Actividad',
      data: sheet(
        ['Fecha', 'Recetas transcriptas', 'Guardados'],
        metrics.recipe_activity_per_day.map((row) => [row.day, row.created, row.saved]),
      ),
      stickyRowsCount: 1,
    },
    {
      sheet: 'Usuarios',
      data: sheet(
        ['Granularidad', 'Período', 'Usuarios activos'],
        [
          ...metrics.trends.active_users.weekly.map((row) => ['Semanal', row.period, row.users] as DataRow),
          ...metrics.trends.active_users.monthly.map((row) => ['Mensual', row.period, row.users] as DataRow),
        ],
      ),
      stickyRowsCount: 1,
    },
    {
      sheet: 'Transcripciones',
      data: importSheets(context)[1].data,
      stickyRowsCount: 1,
    },
    {
      sheet: 'Contenido',
      data: importSheets(context)[4].data,
    },
    {
      sheet: 'Preferencias',
      data: [
        [sectionCell('Dietas declaradas')],
        ['Dieta', 'Usuarios'].map(headerCell),
        ...metrics.diets_distribution.map((row) => [row.name, row.users]),
        [],
        [sectionCell('Alergias declaradas')],
        ['Alergia', 'Usuarios'].map(headerCell),
        ...metrics.allergies_distribution.map((row) => [row.name, row.users]),
      ],
    },
    {
      sheet: 'Estacionalidad',
      data: sheet(
        ['Estación', 'Período', 'Usuarios con valor', 'Recetas transcriptas', 'Guardados', 'Tag destacado', 'Período completo'],
        metrics.seasonality.seasons.map((row) => [
          row.season,
          row.period,
          row.value_users,
          row.recipes_created,
          row.recipes_saved,
          row.top_tag,
          row.complete ? 'Sí' : 'No',
        ]),
      ),
      stickyRowsCount: 1,
    },
    {
      sheet: 'Diccionario',
      data: dictionarySheet('dataset'),
      stickyRowsCount: 1,
    },
  ];
}

export async function exportReportExcel(context: ExportContext) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const sheets = context.reportId === 'adoption'
    ? adoptionSheets(context)
    : context.reportId === 'imports'
      ? importSheets(context)
      : datasetSheets(context);
  const filename = `foodloops-${context.reportId}${context.isDemoMode ? '-demo' : ''}-${dayjs().format('YYYY-MM-DD')}.xlsx`;
  await writeXlsxFile(sheets, { fontFamily: 'Arial', fontSize: 10 }).toFile(filename);
}

function comparisonRows(metrics: MetricResponse) {
  const rows: Array<[string, string, string, string]> = [];
  const definitions = [
    ['Usuarios nuevos', 'new_users', false],
    ['Usuarios con valor semanal', 'weekly_value_users', false],
    ['Recetas transcriptas', 'recipes_created', false],
    ['Éxito de transcripción', 'import_success_rate', true],
  ] as const;
  definitions.forEach(([label, key, percent]) => {
    const mom = metrics.comparisons.mom[key];
    const yoy = metrics.comparisons.yoy[key];
    rows.push([
      label,
      formatReportValue(mom.value, percent),
      mom.comparison_available && mom.change_percent != null ? `${mom.change_percent}%` : 'Sin base',
      yoy.comparison_available && yoy.change_percent != null ? `${yoy.change_percent}%` : 'Sin base',
    ]);
  });
  return rows;
}

export async function exportReportPdf(context: ExportContext) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const definition = getReportDefinition(context.reportId);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const metrics = context.metrics;
  const accent: [number, number, number] = [231, 111, 36];
  const ink: [number, number, number] = [48, 43, 40];
  const muted: [number, number, number] = [113, 105, 100];

  doc.setProperties({
    title: `FoodLoops - ${definition.title}`,
    subject: `Reporte para ${context.period}`,
    author: 'FoodLoops Backoffice',
  });

  doc.setFillColor(...accent);
  doc.rect(0, 0, 210, 7, 'F');
  doc.setTextColor(...accent);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('FOODLOOPS · BACKOFFICE', 16, 20);
  if (context.isDemoMode) {
    doc.setFillColor(255, 241, 232);
    doc.roundedRect(145, 14, 49, 9, 2, 2, 'F');
    doc.setFontSize(8);
    doc.text('DATOS DE DEMOSTRACIÓN', 169.5, 19.7, { align: 'center' });
  }
  doc.setTextColor(...ink);
  doc.setFontSize(23);
  doc.text(definition.title, 16, 32);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...muted);
  doc.text(`Período: ${context.period}`, 16, 40);
  doc.text(`Generado: ${dayjs().format('DD/MM/YYYY HH:mm')} · ${context.timezone}`, 16, 46);

  const preview = previewMetricsFor(context.reportId, metrics);
  preview.forEach((item, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 16 + column * 90;
    const y = 55 + row * 27;
    doc.setFillColor(250, 248, 246);
    doc.roundedRect(x, y, 84, 22, 2, 2, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...muted);
    doc.setFontSize(8);
    doc.text(item.label, x + 4, y + 6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...ink);
    doc.setFontSize(15);
    doc.text(item.value, x + 4, y + 13);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...muted);
    doc.setFontSize(7);
    doc.text(item.detail.slice(0, 52), x + 4, y + 18);
  });

  const tableTheme = {
    styles: { font: 'helvetica', fontSize: 8, textColor: ink, cellPadding: 2.5 },
    headStyles: { fillColor: accent, textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' as const },
    alternateRowStyles: { fillColor: [250, 248, 246] as [number, number, number] },
    margin: { left: 16, right: 16 },
  };

  let y = 118;
  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Lectura del período', 16, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const insights = executiveInsights(metrics);
  insights.forEach((insight, index) => {
    const lines = doc.splitTextToSize(`${index + 1}. ${insight}`, 174);
    doc.text(lines, 18, y + 8 + index * 11);
  });
  y += 44;

  if (context.reportId === 'imports') {
    autoTable(doc, {
      ...tableTheme,
      startY: y,
      head: [['Plataforma', 'Intentos', 'Resueltos', 'Fallas', 'Éxito']],
      body: metrics.import_performance.platforms.map((row) => [row.platform, row.attempts, row.resolved_attempts, row.failures, formatReportValue(row.success_rate, true)]),
    });
    y = (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    autoTable(doc, {
      ...tableTheme,
      startY: y,
      head: [['Autor original', 'Plataforma', 'Recetas', 'Guardados']],
      body: metrics.top_source_authors.slice(0, 8).map((row) => [row.username, row.platform, row.recipes, row.saves]),
    });
  } else if (context.reportId === 'adoption') {
    autoTable(doc, {
      ...tableTheme,
      startY: y,
      head: [['Indicador', 'Resultado', 'Usuarios', 'Elegibles']],
      body: [
        ['Activación 7 días', formatReportValue(metrics.activation_7d.value, true), metrics.activation_7d.numerator, metrics.activation_7d.denominator],
        ['Retención D1', formatReportValue(metrics.retention.d1.value, true), metrics.retention.d1.numerator, metrics.retention.d1.denominator],
        ['Retención D7', formatReportValue(metrics.retention.d7.value, true), metrics.retention.d7.numerator, metrics.retention.d7.denominator],
        ['Retención D30', formatReportValue(metrics.retention.d30.value, true), metrics.retention.d30.numerator, metrics.retention.d30.denominator],
      ],
    });
  } else {
    autoTable(doc, {
      ...tableTheme,
      startY: y,
      head: [['Indicador', 'Actual', 'MoM', 'YoY']],
      body: comparisonRows(metrics),
    });
    y = (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    autoTable(doc, {
      ...tableTheme,
      startY: y,
      head: [['Plataforma', 'Resueltos', 'Fallas', 'Éxito']],
      body: metrics.import_performance.platforms.map((row) => [row.platform, row.resolved_attempts, row.failures, formatReportValue(row.success_rate, true)]),
    });
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(225, 220, 216);
    doc.line(16, 284, 194, 284);
    doc.setFontSize(7);
    doc.setTextColor(...muted);
    doc.text('Fuente: FoodLoops Backoffice · Datos agregados', 16, 290);
    doc.text(`Página ${page} de ${pages}`, 194, 290, { align: 'right' });
  }

  doc.save(`foodloops-${context.reportId}${context.isDemoMode ? '-demo' : ''}-${dayjs().format('YYYY-MM-DD')}.pdf`);
}
