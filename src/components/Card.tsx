import React from 'react';

type CardProps = {
  title?: string;
  tooltip?: string;
  className?: string;
  children: React.ReactNode;
};

const Card: React.FC<CardProps> = ({ title, tooltip, className, children }) => {
  const tooltipId = React.useId();
  const [tooltipOpen, setTooltipOpen] = React.useState(false);

  return (
    <div className={`card ${className ?? ''}`}>
      {title && (
        <div className="card-title-row">
          <h3>{title}</h3>
          {tooltip && (
            <span
              className={`card-tooltip-container ${tooltipOpen ? 'is-open' : ''}`}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setTooltipOpen(false);
                }
              }}
            >
              <button
                type="button"
                className="card-tooltip-trigger"
                aria-label={`Cómo leer: ${title}`}
                aria-expanded={tooltipOpen}
                aria-describedby={tooltipId}
                onClick={() => setTooltipOpen((open) => !open)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setTooltipOpen(false);
                    event.currentTarget.blur();
                  }
                }}
              >
                ?
              </button>
              <span id={tooltipId} role="tooltip" className="card-tooltip">
                {tooltip}
              </span>
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  );
};

export default Card;
