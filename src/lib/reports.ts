export type ReportId = 'usage' | 'recipes' | 'users';

export type ReportDefinition = {
  id: ReportId;
  title: string;
  eyebrow: string;
  description: string;
  decision: string;
  scope: string;
};

export const REPORT_CATALOG: readonly ReportDefinition[] = [
  {
    id: 'usage',
    eyebrow: 'Producto',
    title: 'Actividad del producto',
    description: 'Usuarios activos, recetas creadas y guardadas día por día.',
    decision: 'Entender si el uso y la entrega de valor crecen de forma sostenida.',
    scope: 'Incluye actividad registrada durante el período seleccionado.',
  },
  {
    id: 'recipes',
    eyebrow: 'Contenido',
    title: 'Rendimiento de recetas',
    description: 'Recetas creadas o utilizadas, con guardados y apariciones en planes.',
    decision: 'Detectar qué contenido merece destacarse o investigarse.',
    scope: 'No calcula conversión: todavía no existe un evento confiable de visualización.',
  },
  {
    id: 'users',
    eyebrow: 'Audiencia',
    title: 'Actividad por usuario',
    description: 'Usuarios nuevos o activos, identificados sin nombre ni correo.',
    decision: 'Analizar adopción y recurrencia sin exponer datos personales.',
    scope: 'Los contadores reflejan únicamente el período elegido.',
  },
] as const;

export function getReportDefinition(id: ReportId) {
  return REPORT_CATALOG.find((report) => report.id === id) ?? REPORT_CATALOG[0];
}
