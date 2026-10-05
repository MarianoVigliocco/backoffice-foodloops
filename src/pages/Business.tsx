import React from 'react';
import '../styles/business.css';

type Metric = {
  label: string;
  value: string;
  detail?: string;
};

type BusinessAreaProps = {
  title: string;
  description: string;
  tone: 'users' | 'premium' | 'ads';
  icon: React.ReactNode;
  metrics: Metric[];
};

const BusinessArea: React.FC<BusinessAreaProps> = ({ title, description, tone, icon, metrics }) => (
  <section className={`fl-business-card fl-business-card--${tone}`}>
    <div className="fl-business-card-header">
      <span className="fl-business-card-icon" aria-hidden="true">{icon}</span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
    <div className="fl-business-metrics">
      {metrics.map((metric) => (
        <div className="fl-business-metric" key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
          {metric.detail && <small>{metric.detail}</small>}
        </div>
      ))}
    </div>
  </section>
);

const alliances = [
  { name: 'Mercado Verde', type: 'Supermercado', validity: '31/12/2026', status: 'Activa', income: '$ 420.000' },
  { name: 'Cocina con Mica', type: 'Influencer', validity: '15/11/2026', status: 'Activa', income: '$ 180.000' },
  { name: 'Sabor Natural', type: 'Marca', validity: '28/02/2027', status: 'Activa', income: '$ 310.000' },
  { name: 'Almacén Central', type: 'Supermercado', validity: '20/09/2026', status: 'Finalizada', income: '$ 150.000' },
];

const creators = [
  { name: '@cocinaconmica', platform: 'Instagram', users: '486', recipes: '1.240', saves: '318', recurrence: '37 %', partner: true },
  { name: '@food.en.minutos', platform: 'TikTok', users: '392', recipes: '978', saves: '246', recurrence: '31 %', partner: false },
  { name: '@sabores.casa', platform: 'Instagram', users: '354', recipes: '814', saves: '221', recurrence: '34 %', partner: true },
  { name: '@verde.y.rico', platform: 'Instagram', users: '287', recipes: '635', saves: '174', recurrence: '29 %', partner: false },
  { name: '@recetasexpress', platform: 'TikTok', users: '241', recipes: '522', saves: '139', recurrence: '25 %', partner: false },
];

const Business: React.FC = () => (
  <div className="fl-business-root">
    <header className="fl-business-header">
      <div>
        <div className="fl-business-kicker">Monetización</div>
        <h1>Resumen del modelo de negocio</h1>
        <p>Una primera lectura de usuarios, suscripciones y acuerdos comerciales.</p>
      </div>
      <span className="fl-business-demo-badge">
        <span aria-hidden="true" /> Datos simulados
      </span>
    </header>

    <div className="fl-business-notice" role="note">
      Esta vista utiliza información sintética para validar la estructura del módulo. No representa movimientos reales.
    </div>

    <div className="fl-business-grid">
      <BusinessArea
        title="Usuarios"
        description="Actividad y crecimiento de la comunidad"
        tone="users"
        icon={<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></svg>}
        metrics={[
          { label: 'Usuarios activos', value: '1.284', detail: 'últimos 30 días' },
          { label: 'Nuevos registros', value: '186', detail: 'este mes' },
          { label: 'Retención', value: '42,8 %', detail: 'a 30 días' },
          { label: 'Tiempo de uso', value: '18 min', detail: 'promedio diario' },
        ]}
      />

      <BusinessArea
        title="Premium"
        description="Estado de las suscripciones pagas"
        tone="premium"
        icon={<svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" /></svg>}
        metrics={[
          { label: 'Suscriptores activos', value: '214' },
          { label: 'Altas', value: '34', detail: 'este mes' },
          { label: 'Bajas', value: '9', detail: 'este mes' },
          { label: 'Conversión', value: '5,0 %' },
          { label: 'Ingresos', value: '$ 1.284.000', detail: 'este mes' },
        ]}
      />

      <BusinessArea
        title="Publicidad"
        description="Rendimiento general de campañas"
        tone="ads"
        icon={<svg viewBox="0 0 24 24"><path d="m3 11 18-5v12L3 14v-3Z" /><path d="M11.6 16 10 21H6l1-6" /><path d="M21 10v4" /></svg>}
        metrics={[
          { label: 'Campañas activas', value: '4' },
          { label: 'Anuncios', value: '11' },
          { label: 'Impresiones', value: '184 mil', detail: 'este mes' },
          { label: 'Clics', value: '6.240', detail: '3,4 % CTR' },
          { label: 'Ingresos', value: '$ 780.000', detail: 'este mes' },
        ]}
      />
    </div>

    <section className="fl-business-alliances">
      <div className="fl-business-section-heading">
        <div>
          <span>Alianzas</span>
          <h2>Acuerdos comerciales</h2>
        </div>
        <div className="fl-business-alliance-total">
          <strong>3</strong>
          <span>activas</span>
        </div>
      </div>

      <div className="fl-business-table-wrap">
        <table className="fl-business-table">
          <thead>
            <tr>
              <th>Empresa o influencer</th>
              <th>Tipo</th>
              <th>Vigencia</th>
              <th>Estado</th>
              <th>Ingreso acordado</th>
            </tr>
          </thead>
          <tbody>
            {alliances.map((alliance) => (
              <tr key={alliance.name}>
                <td><strong>{alliance.name}</strong></td>
                <td>{alliance.type}</td>
                <td>Hasta {alliance.validity}</td>
                <td>
                  <span className={`fl-business-status ${alliance.status === 'Activa' ? 'is-active' : ''}`}>
                    {alliance.status}
                  </span>
                </td>
                <td className="fl-business-income">{alliance.income}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>

    <section className="fl-business-creators">
      <div className="fl-business-section-heading fl-business-creators-heading">
        <div>
          <span>Creadores de contenido</span>
          <h2>Audiencia y consumo por creador</h2>
          <p>
            Se considera consumo cuando un usuario visualiza o guarda una receta atribuida al creador.
          </p>
        </div>
        <div className="fl-business-creator-summary" aria-label="Resumen de creadores">
          <div><strong>1.076</strong><span>usuarios únicos</span></div>
          <div><strong>2</strong><span>alianzas activas</span></div>
        </div>
      </div>

      <div className="fl-business-table-wrap">
        <table className="fl-business-table fl-business-creators-table">
          <thead>
            <tr>
              <th>Creador</th>
              <th>Plataforma</th>
              <th>Usuarios alcanzados</th>
              <th>Recetas consumidas</th>
              <th>Guardados</th>
              <th>Usuarios recurrentes</th>
              <th>Relación comercial</th>
            </tr>
          </thead>
          <tbody>
            {creators.map((creator) => (
              <tr key={creator.name}>
                <td><strong>{creator.name}</strong></td>
                <td>
                  <span className={`fl-business-platform fl-business-platform--${creator.platform.toLowerCase()}`}>
                    {creator.platform}
                  </span>
                </td>
                <td className="fl-business-number">{creator.users}</td>
                <td className="fl-business-number">{creator.recipes}</td>
                <td className="fl-business-number">{creator.saves}</td>
                <td>
                  <div className="fl-business-recurrence">
                    <span><i style={{ width: creator.recurrence }} /></span>
                    <strong>{creator.recurrence}</strong>
                  </div>
                </td>
                <td>
                  <span className={`fl-business-partner ${creator.partner ? 'is-partner' : ''}`}>
                    {creator.partner ? 'Alianza activa' : 'Orgánico'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="fl-business-table-note">
        Un mismo usuario puede consumir contenido de más de un creador; por eso los usuarios por fila no deben sumarse entre sí.
      </div>
    </section>
  </div>
);

export default Business;
