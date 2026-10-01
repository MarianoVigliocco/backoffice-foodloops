import React from 'react';
import dayjs from 'dayjs';
import Card from '../components/Card';
import { apiMetrics, type MetricResponse } from '../lib/api';
import { exportReportExcel, exportReportPdf } from '../lib/reportExports';
import {
  executiveInsights,
  getReportDefinition,
  overallImportSuccess,
  previewMetricsFor,
  REPORT_CATALOG,
  type ReportFormat,
  type ReportId,
} from '../lib/reports';
import '../styles/reports.css';
import { useDemoMode } from '../demoMode';

type DateSelection = { from: string; to: string };
type RangePreset = 7 | 30 | 90 | 'custom';

const today = () => dayjs().format('YYYY-MM-DD');

const rangeForDays = (days: number): DateSelection => ({
  from: dayjs().subtract(days - 1, 'day').format('YYYY-MM-DD'),
  to: today(),
});

const formatPeriod = (range: DateSelection) =>
  `${dayjs(range.from).format('DD/MM/YYYY')} – ${dayjs(range.to).format('DD/MM/YYYY')}`;

const formatGeneratedAt = (value: string) =>
  new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));

const formatPercent = (value: number | null) => value == null ? '—' : `${value}%`;

const formatLabels: Record<ReportFormat, string> = {
  pdf: 'PDF ejecutivo',
  xlsx: 'Excel analítico',
};

const CalendarDateInput: React.FC<{
  id: string;
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}> = ({ id, label, value, min, max, onChange }) => {
  const ref = React.useRef<HTMLInputElement>(null);
  const openPicker = () => {
    const input = ref.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
      input.click();
    }
  };

  return (
    <div className="fl-report-date-field">
      <label htmlFor={id}>{label}</label>
      <div className="fl-report-date-input-wrap">
        <input
          ref={ref}
          id={id}
          type="date"
          value={value}
          min={min}
          max={max}
          onChange={(event) => onChange(event.target.value)}
        />
        <button type="button" onClick={openPicker} aria-label={`Abrir calendario para ${label.toLowerCase()}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M3 10h18" />
          </svg>
        </button>
      </div>
    </div>
  );
};

const Reports: React.FC = () => {
  const { isDemoMode } = useDemoMode();
  const [selectedId, setSelectedId] = React.useState<ReportId>('executive');
  const [selectedFormat, setSelectedFormat] = React.useState<ReportFormat>('pdf');
  const [preset, setPreset] = React.useState<RangePreset>(30);
  const [draftRange, setDraftRange] = React.useState<DateSelection>(() => rangeForDays(30));
  const [appliedRange, setAppliedRange] = React.useState<DateSelection>(() => rangeForDays(30));
  const [metrics, setMetrics] = React.useState<MetricResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const definition = getReportDefinition(selectedId);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Argentina/Cordoba';

  const loadMetrics = React.useCallback(async (range: DateSelection, initial = false) => {
    try {
      setError(null);
      if (initial) setLoading(true);
      else setRefreshing(true);
      setMetrics(await apiMetrics({
        from: dayjs(range.from).startOf('day').toDate().toISOString(),
        to: dayjs(range.to).add(1, 'day').startOf('day').toDate().toISOString(),
        timezone,
      }));
    } catch (loadError) {
      console.error('Report metrics error', loadError);
      setError('No se pudieron cargar los datos del reporte. Intentá nuevamente en unos segundos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isDemoMode, timezone]);

  React.useEffect(() => {
    loadMetrics(appliedRange, !metrics);
  }, [appliedRange, loadMetrics]);

  const selectReport = (id: ReportId) => {
    const next = getReportDefinition(id);
    setSelectedId(id);
    if (!next.formats.includes(selectedFormat)) setSelectedFormat(next.formats[0]);
  };

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
      setError('Seleccioná un rango de fechas válido.');
      return;
    }
    if (to.diff(from, 'day') + 1 > 366) {
      setError('El rango máximo es de 366 días.');
      return;
    }
    setError(null);
    setPreset('custom');
    setAppliedRange(draftRange);
  };

  const download = async () => {
    if (!metrics || exporting) return;
    try {
      setExporting(true);
      setError(null);
      const context = {
        reportId: selectedId,
        metrics,
        period: formatPeriod(appliedRange),
        timezone,
        isDemoMode,
      };
      if (selectedFormat === 'pdf') await exportReportPdf(context);
      else await exportReportExcel(context);
    } catch (exportError) {
      console.error('Report export error', exportError);
      setError('No se pudo generar el archivo. Intentá nuevamente en unos segundos.');
    } finally {
      setExporting(false);
    }
  };

  const previewMetrics = metrics ? previewMetricsFor(selectedId, metrics) : [];
  const insights = metrics ? executiveInsights(metrics) : [];
  const periodDays = dayjs(appliedRange.to).diff(dayjs(appliedRange.from), 'day') + 1;

  return (
    <div className="fl-reports-root">
      <header className="fl-reports-header">
        <div>
          <span className="fl-reports-kicker">Centro de decisiones</span>
          <h1 className="fl-reports-title">Reportes</h1>
          <p className="fl-reports-subtitle">
            Generá resúmenes ejecutivos en PDF o libros de Excel listos para profundizar el análisis.
          </p>
        </div>
      </header>

      <section className="fl-report-range" aria-label="Rango de fechas del reporte">
        <div className="fl-report-range-summary">
          <span>Período del reporte</span>
          <strong>{formatPeriod(appliedRange)}</strong>
          <small>{periodDays} días incluidos</small>
        </div>
        <div className="fl-report-presets" aria-label="Rangos rápidos">
          {([7, 30, 90] as const).map((days) => (
            <button
              key={days}
              type="button"
              className={preset === days ? 'active' : ''}
              aria-pressed={preset === days}
              onClick={() => applyPreset(days)}
              disabled={refreshing}
            >
              {days} días
            </button>
          ))}
        </div>
        <div className="fl-report-custom-range">
          <CalendarDateInput
            id="report-date-from"
            label="Desde"
            value={draftRange.from}
            max={draftRange.to || today()}
            onChange={(value) => {
              setPreset('custom');
              setDraftRange((current) => ({ ...current, from: value }));
            }}
          />
          <CalendarDateInput
            id="report-date-to"
            label="Hasta"
            value={draftRange.to}
            min={draftRange.from}
            max={today()}
            onChange={(value) => {
              setPreset('custom');
              setDraftRange((current) => ({ ...current, to: value }));
            }}
          />
          <button type="button" className="fl-report-range-apply" onClick={applyCustomRange} disabled={refreshing}>
            {refreshing ? 'Actualizando…' : 'Aplicar'}
          </button>
        </div>
      </section>

      {error && <div className="fl-reports-alert fl-reports-alert-error">{error}</div>}

      <section className="fl-report-section">
        <div className="fl-report-section-heading">
          <div>
            <span>1 · Elegí el reporte</span>
            <h2>Plantillas para cada decisión</h2>
          </div>
          <p>Las cuatro plantillas comparten las mismas definiciones para que los resultados sean comparables.</p>
        </div>

        <div className="fl-report-catalog">
          {REPORT_CATALOG.map((report) => (
            <button
              key={report.id}
              type="button"
              className={`fl-report-option ${selectedId === report.id ? 'active' : ''}`}
              aria-pressed={selectedId === report.id}
              onClick={() => selectReport(report.id)}
            >
              <span className="fl-report-option-check" aria-hidden="true">
                {selectedId === report.id ? '✓' : '→'}
              </span>
              <span className="fl-report-option-eyebrow">{report.eyebrow}</span>
              <strong>{report.title}</strong>
              <span>{report.description}</span>
              <span className="fl-report-option-formats">
                {report.formats.map((format) => <em key={format}>{format === 'pdf' ? 'PDF' : 'Excel'}</em>)}
              </span>
              <small>{report.decision}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="fl-report-workspace">
        <div className="fl-report-section-heading">
          <div>
            <span>2 · Revisá el contenido</span>
            <h2>Vista previa del reporte</h2>
          </div>
          <button type="button" className="fl-report-refresh" onClick={() => loadMetrics(appliedRange)} disabled={loading || refreshing}>
            {refreshing ? 'Actualizando…' : 'Actualizar datos'}
          </button>
        </div>

        <Card className="fl-card fl-report-preview-card" title={definition.title}>
          <p className="fl-report-preview-scope">{definition.scope}</p>

          {loading && !metrics ? (
            <div className="fl-report-loading" role="status">Preparando la vista previa…</div>
          ) : metrics ? (
            <>
              <div className="fl-report-meta-grid">
                <div><span>Período</span><strong>{formatPeriod(appliedRange)}</strong></div>
                <div><span>Cobertura</span><strong>{periodDays} días</strong></div>
                <div><span>Zona horaria</span><strong>{timezone}</strong></div>
                <div><span>Datos actualizados</span><strong>{formatGeneratedAt(metrics.now)}</strong></div>
              </div>

              <div className="fl-report-preview-grid">
                {previewMetrics.map((item) => (
                  <div key={item.label} className="fl-report-preview-metric">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <small>{item.detail}</small>
                  </div>
                ))}
              </div>

              <div className="fl-report-preview-columns">
                <div className="fl-report-preview-block">
                  <span className="fl-report-preview-block-label">Incluye</span>
                  <ul>
                    {definition.contents.map((content) => <li key={content}>{content}</li>)}
                  </ul>
                </div>

                {selectedId === 'imports' ? (
                  <div className="fl-report-preview-block">
                    <span className="fl-report-preview-block-label">Transcripción por plataforma</span>
                    <div className="fl-report-platform-list">
                      {metrics.import_performance.platforms.map((platform) => (
                        <div key={platform.platform}>
                          <span>{platform.platform}</span>
                          <strong>{formatPercent(platform.success_rate)}</strong>
                          <small>{platform.resolved_attempts} resueltos · {platform.failures} fallas</small>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : selectedId === 'dataset' ? (
                  <div className="fl-report-preview-block">
                    <span className="fl-report-preview-block-label">Hojas del libro</span>
                    <div className="fl-report-sheet-tags">
                      {['Resumen', 'Actividad', 'Usuarios', 'Transcripciones', 'Contenido', 'Preferencias', 'Estacionalidad', 'Diccionario'].map((name) => <span key={name}>{name}</span>)}
                    </div>
                  </div>
                ) : (
                  <div className="fl-report-preview-block">
                    <span className="fl-report-preview-block-label">Lecturas automáticas</span>
                    <ol>
                      {insights.map((insight) => <li key={insight}>{insight}</li>)}
                    </ol>
                  </div>
                )}
              </div>

              {metrics.data_quality.new_users_low_sample && (
                <div className="fl-reports-alert fl-reports-alert-warning">
                  Algunas comparaciones se ocultarán porque la muestra no alcanza las {metrics.data_quality.min_reliable_sample} observaciones mínimas.
                </div>
              )}
            </>
          ) : null}
        </Card>
      </section>

      <section className="fl-report-export">
        <div className="fl-report-export-copy">
          <span>3 · Generá el archivo</span>
          <strong>{definition.title}</strong>
          <p>El archivo incluirá el período, la zona horaria, la fecha de generación y las definiciones necesarias para interpretarlo.</p>
        </div>
        <div className="fl-report-export-actions">
          <div className="fl-report-format-picker" aria-label="Formato del reporte">
            {definition.formats.map((format) => (
              <button
                key={format}
                type="button"
                className={selectedFormat === format ? 'active' : ''}
                aria-pressed={selectedFormat === format}
                onClick={() => setSelectedFormat(format)}
              >
                <span>{format === 'pdf' ? 'PDF' : 'XLSX'}</span>
                <small>{format === 'pdf' ? 'Lectura ejecutiva' : 'Análisis detallado'}</small>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="fl-report-download"
            onClick={download}
            disabled={exporting || loading || refreshing || !metrics}
          >
            {exporting ? 'Generando archivo…' : `Descargar ${formatLabels[selectedFormat]}`}
          </button>
        </div>
      </section>

      {metrics && selectedId === 'imports' && overallImportSuccess(metrics) == null && (
        <p className="fl-report-data-note">La tasa de éxito aparecerá como “sin datos” cuando no existan intentos resueltos en el período.</p>
      )}
    </div>
  );
};

export default Reports;
