import React from 'react';
import dayjs from 'dayjs';
import Card from '../components/Card';
import {
  apiReportDownload,
  apiReportPreview,
  type ReportColumn,
  type ReportParams,
  type ReportPreview,
} from '../lib/api';
import {
  getReportDefinition,
  REPORT_CATALOG,
  type ReportId,
} from '../lib/reports';
import '../styles/reports.css';

type DateSelection = { from: string; to: string };

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

function formatCell(value: unknown, column: ReportColumn) {
  if (value === null || value === undefined || value === '') return '—';
  if (column.type === 'boolean') return value ? 'Sí' : 'No';
  if (column.type === 'number') return new Intl.NumberFormat('es-AR').format(Number(value));
  if (column.type === 'date') return dayjs(String(value)).format('DD/MM/YYYY');
  if (column.type === 'datetime') {
    return new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(String(value)));
  }
  return String(value);
}

const Reports: React.FC = () => {
  const [selectedId, setSelectedId] = React.useState<ReportId>('usage');
  const [preset, setPreset] = React.useState<7 | 30 | 90 | 'custom'>(30);
  const [draftRange, setDraftRange] = React.useState<DateSelection>(() => rangeForDays(30));
  const [appliedRange, setAppliedRange] = React.useState<DateSelection>(() => rangeForDays(30));
  const [preview, setPreview] = React.useState<ReportPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = React.useState(true);
  const [downloading, setDownloading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const definition = getReportDefinition(selectedId);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Argentina/Cordoba';

  const requestParams = React.useCallback((): ReportParams => ({
    type: selectedId,
    from: dayjs(appliedRange.from).startOf('day').toDate().toISOString(),
    to: dayjs(appliedRange.to).add(1, 'day').startOf('day').toDate().toISOString(),
    timezone,
  }), [appliedRange, selectedId, timezone]);

  const loadPreview = React.useCallback(async () => {
    setLoadingPreview(true);
    setError(null);
    try {
      setPreview(await apiReportPreview(requestParams()));
    } catch (previewError) {
      console.error('Report preview error', previewError);
      setPreview(null);
      setError('No se pudo generar la vista previa. Intentá nuevamente en unos segundos.');
    } finally {
      setLoadingPreview(false);
    }
  }, [requestParams]);

  React.useEffect(() => {
    loadPreview();
  }, [loadPreview]);

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
    if (downloading) return;
    try {
      setDownloading(true);
      setError(null);
      const { blob, filename } = await apiReportDownload(requestParams());
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (downloadError) {
      console.error('Report download error', downloadError);
      setError('No se pudo descargar el reporte. Intentá nuevamente en unos segundos.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fl-reports-root">
      <header className="fl-reports-header">
        <div>
          <span className="fl-reports-kicker">Centro de análisis</span>
          <h1 className="fl-reports-title">Reportes</h1>
          <p className="fl-reports-subtitle">
            Elegí una pregunta, revisá la cobertura y descargá datos listos para analizar.
          </p>
        </div>
        <div className="fl-reports-header-note">
          <span>Formato disponible</span>
          <strong>CSV · UTF-8</strong>
        </div>
      </header>

      <section className="fl-report-range" aria-label="Rango de fechas del reporte">
        <div className="fl-report-range-summary">
          <span>Período del reporte</span>
          <strong>{formatPeriod(appliedRange)}</strong>
        </div>
        <div className="fl-report-presets" aria-label="Rangos rápidos">
          {([7, 30, 90] as const).map((days) => (
            <button
              key={days}
              type="button"
              className={preset === days ? 'active' : ''}
              aria-pressed={preset === days}
              onClick={() => applyPreset(days)}
              disabled={loadingPreview}
            >
              {days} días
            </button>
          ))}
        </div>
        <div className="fl-report-custom-range">
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
          <button type="button" onClick={applyCustomRange} disabled={loadingPreview}>
            Aplicar
          </button>
        </div>
      </section>

      {error && <div className="fl-reports-alert fl-reports-alert-error">{error}</div>}

      <section className="fl-report-section">
        <div className="fl-report-section-heading">
          <div>
            <span>1 · Elegí el enfoque</span>
            <h2>Plantillas disponibles</h2>
          </div>
          <p>Cada plantilla responde una pregunta concreta y mantiene una definición estable.</p>
        </div>

        <div className="fl-report-catalog">
          {REPORT_CATALOG.map((report) => (
            <button
              key={report.id}
              type="button"
              className={`fl-report-option ${selectedId === report.id ? 'active' : ''}`}
              aria-pressed={selectedId === report.id}
              onClick={() => setSelectedId(report.id)}
            >
              <span className="fl-report-option-check" aria-hidden="true">
                {selectedId === report.id ? '✓' : '→'}
              </span>
              <span className="fl-report-option-eyebrow">{report.eyebrow}</span>
              <strong>{report.title}</strong>
              <span>{report.description}</span>
              <small>{report.decision}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="fl-report-section">
        <div className="fl-report-section-heading">
          <div>
            <span>2 · Revisá antes de exportar</span>
            <h2>Vista previa</h2>
          </div>
          <button
            type="button"
            className="fl-report-refresh"
            onClick={loadPreview}
            disabled={loadingPreview}
          >
            {loadingPreview ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>

        <Card className="fl-card fl-report-preview-card" title={definition.title}>
          <p className="fl-report-preview-scope">{definition.scope}</p>

          {loadingPreview ? (
            <div className="fl-report-loading" role="status">Generando vista previa…</div>
          ) : preview ? (
            <>
              <div className="fl-report-meta-grid">
                <div><span>Período</span><strong>{formatPeriod(appliedRange)}</strong></div>
                <div><span>Filas totales</span><strong>{preview.report.row_count}</strong></div>
                <div><span>Zona horaria</span><strong>{preview.report.range.timezone}</strong></div>
                <div><span>Generado</span><strong>{formatGeneratedAt(preview.report.generated_at)}</strong></div>
              </div>

              {preview.data_quality.low_sample && (
                <div className="fl-reports-alert fl-reports-alert-warning">
                  Muestra chica: hay {preview.data_quality.observations} observaciones y la base confiable comienza en {preview.data_quality.min_reliable_sample}.
                </div>
              )}

              {preview.data_quality.warnings.map((warning) => (
                <div key={warning} className="fl-reports-alert fl-reports-alert-info">{warning}</div>
              ))}

              {preview.rows.length ? (
                <div className="fl-report-table-wrap">
                  <table className="fl-report-table">
                    <thead>
                      <tr>
                        {preview.columns.map((column) => (
                          <th key={column.key} title={column.description}>{column.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row, rowIndex) => (
                        <tr key={`${selectedId}-${rowIndex}`}>
                          {preview.columns.map((column) => (
                            <td key={column.key}>{formatCell(row[column.key], column)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="fl-report-empty">No hay datos para esta plantilla en el período elegido.</div>
              )}

              {preview.report.row_count > preview.report.preview_count && (
                <p className="fl-report-preview-note">
                  La vista previa muestra {preview.report.preview_count} de {preview.report.row_count} filas. El CSV incluye el conjunto completo.
                </p>
              )}
            </>
          ) : null}
        </Card>
      </section>

      <section className="fl-report-export">
        <div>
          <span>3 · Exportá</span>
          <strong>{definition.title}</strong>
          <p>El archivo incluye el período, la zona horaria y la fecha de generación.</p>
        </div>
        <button
          type="button"
          className="fl-report-download"
          onClick={download}
          disabled={downloading || loadingPreview || !preview}
        >
          {downloading ? 'Generando CSV…' : 'Descargar CSV detallado'}
        </button>
      </section>
    </div>
  );
};

export default Reports;
