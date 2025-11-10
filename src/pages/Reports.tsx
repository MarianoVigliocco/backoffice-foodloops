import React from 'react';
import Card from '../components/Card';
import { apiReport } from '../lib/api';
import '../styles/reports.css';

const Reports: React.FC = () => {
  const [loadingType, setLoadingType] = React.useState<'usage' | 'recipes' | 'users' | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const download = async (type: 'usage' | 'recipes' | 'users') => {
    if (loadingType) return; // evita doble click mientras descarga

    try {
      setError(null);
      setLoadingType(type);

      const blob = await apiReport(type);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${type}-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error('Report download error', e);
      setError('No se pudo generar el reporte. Intentá nuevamente en unos segundos.');
    } finally {
      setLoadingType(null);
    }
  };

  const isLoading = (type: 'usage' | 'recipes' | 'users') => loadingType === type;

  return (
    <div className="fl-reports-root">
      {/* Header */}
      <header className="fl-reports-header">
        <div>
          <h1 className="fl-reports-title">Reportes</h1>
          <p className="fl-reports-subtitle">
            Descargá reportes en CSV con la actividad de usuarios, recetas creadas
            y métricas clave para analizar el rendimiento de FoodLoops.
          </p>
        </div>
      </header>

      {/* Card principal */}
      <Card className="fl-card fl-reports-card" title="Reportes rápidos (CSV)">
        {error && (
          <div className="fl-reports-alert fl-reports-alert-error">
            {error}
          </div>
        )}

        <p className="fl-reports-description">
          Elegí el tipo de reporte que querés descargar. Cada archivo incluye datos
          listos para explorar en tu herramienta de análisis favorita.
        </p>

        <div className="fl-reports-buttons">
          <button
            className="fl-reports-btn fl-reports-btn-primary"
            onClick={() => download('usage')}
            disabled={isLoading('usage')}
          >
            {isLoading('usage') ? 'Generando reporte de uso...' : 'Reporte de uso'}
          </button>

          <button
            className="fl-reports-btn fl-reports-btn-outline"
            onClick={() => download('recipes')}
            disabled={isLoading('recipes')}
          >
            {isLoading('recipes') ? 'Generando reporte de recetas...' : 'Reporte de recetas'}
          </button>

          <button
            className="fl-reports-btn fl-reports-btn-outline"
            onClick={() => download('users')}
            disabled={isLoading('users')}
          >
            {isLoading('users') ? 'Generando reporte de usuarios...' : 'Reporte de usuarios'}
          </button>
        </div>

        <div className="fl-reports-hint">
          Los reportes se descargan en formato <strong>.csv</strong> para que puedas
          abrirlos en Google Sheets, Excel o tu herramienta de BI.
        </div>
      </Card>
    </div>
  );
};

export default Reports;
