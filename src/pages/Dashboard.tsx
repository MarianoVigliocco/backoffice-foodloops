import React from 'react';
import Card from '../components/Card';
import { apiMetrics } from '../lib/api';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

const Dashboard: React.FC = () => {
  const [data, setData] = React.useState<any | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try { setData(await apiMetrics()); } catch(e:any){ setErr(e.message); }
    })();
  }, []);

  if (err) return <div className="badge">Error: {err}</div>;
  if (!data) return null;

  return (
    <div className="grid">
      <Card className="kpi card" title="DAU (usuarios activos hoy)" >
        <div className="kpi">{data.dau}</div>
      </Card>
      <Card className="kpi card" title="MAU (últimos 30 días)">
        <div className="kpi">{data.mau}</div>
      </Card>
      <Card className="kpi card" title="Usuarios nuevos (7d)">
        <div className="kpi">{data.new_users_7d}</div>
      </Card>
      <Card className="kpi card" title="Recetas creadas (7d)">
        <div className="kpi">{data.recipes_7d}</div>
      </Card>

      <Card className="card" title="Recetas por día (14d)" >
        <div style={{height:240}}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.recipes_per_day_14}>
              <XAxis dataKey="day" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="card" title="Top tags por uso">
        <div style={{height:240}}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.top_tags}>
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="uses" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="card" title="Distribución estilos de alimentación (usuarios)">
        <div style={{height:240}}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data.diets_distribution} dataKey="users" nameKey="name" outerRadius={100} label />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="card" title="Distribución alergias (usuarios)">
        <div style={{height:240}}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data.allergies_distribution} dataKey="users" nameKey="name" outerRadius={100} label />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="card" title="Recetas más guardadas">
        <table className="table">
          <thead><tr><th>Receta</th><th>Guardados</th></tr></thead>
          <tbody>
            {data.top_saved_recipes.map((r:any)=>(
              <tr key={r.id_recipe}><td>{r.title}</td><td>{r.saves}</td></tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};
export default Dashboard;
