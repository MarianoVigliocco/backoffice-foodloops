import React from 'react';
const Card: React.FC<{ title?: string; className?: string; children: React.ReactNode }> = ({ title, className, children }) => (
  <div className={`card ${className ?? ''}`}>
    {title && <h3>{title}</h3>}
    {children}
  </div>
);
export default Card;
