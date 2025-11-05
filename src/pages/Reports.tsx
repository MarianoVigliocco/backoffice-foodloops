import React from 'react';
import Card from '../components/Card';
import { apiReport } from '../lib/api';

const Reports: React.FC = () => {
  const download = async (type: 'usage'|'recipes'|'users') => {
    const blob = await apiReport(type);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `report-${type}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="grid">
      <Card title="Reportes rápidos (CSV)">
        <div style={{display:'flex', gap:10}}>
          <button className="btn" onClick={()=>download('usage')}>Uso</button>
          <button className="btn" onClick={()=>download('recipes')}>Recetas</button>
          <button className="btn" onClick={()=>download('users')}>Usuarios</button>
        </div>
      </Card>
    </div>
  );
};
export default Reports;
