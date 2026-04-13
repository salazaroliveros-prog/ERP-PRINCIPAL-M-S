import React, { useState } from 'react';

interface GaugeProps {
  value: number; // 0-100
  min?: number;
  max?: number;
  label?: string;
  color?: string;
  units?: string;
  tooltip?: string;
}

export const Gauge: React.FC<GaugeProps> = ({ value, min = 0, max = 100, label, color = '#3b82f6', units, tooltip }) => {
  const radius = 50;
  const stroke = 10;
  const normalizedRadius = radius - stroke / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const percent = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const strokeDashoffset = circumference * (1 - percent);
  const [hover, setHover] = useState(false);

  // Color dinámico según valor
  let dynamicColor = color;
  if (!color) {
    if (percent < 0.5) dynamicColor = '#10b981'; // verde
    else if (percent < 0.8) dynamicColor = '#f59e42'; // ámbar
    else dynamicColor = '#ef4444'; // rojo
  }

  return (
    <div
      style={{ width: 130, height: 130, display: 'inline-block', position: 'relative', cursor: tooltip ? 'pointer' : 'default' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      tabIndex={tooltip ? 0 : -1}
    >
      <svg width={130} height={130}>
        <defs>
          <linearGradient id="gauge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="50%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>
        <circle
          stroke="#e5e7eb"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={65}
          cy={65}
        />
        <circle
          stroke={color ? dynamicColor : 'url(#gauge-gradient)'}
          fill="transparent"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference + ' ' + circumference}
          style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.7s cubic-bezier(.4,2,.3,1)' }}
          r={normalizedRadius}
          cx={65}
          cy={65}
        />
      </svg>
      <div style={{
        position: 'absolute',
        top: 0, left: 0, width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: dynamicColor }}>{value}{units || ''}</span>
        {label && <span style={{ fontSize: 14, color: '#334155', fontWeight: 700, marginTop: 2 }}>{label}</span>}
      </div>
      {tooltip && hover && (
        <div style={{
          position: 'absolute',
          left: '50%',
          top: '-40px',
          transform: 'translateX(-50%)',
          background: '#fff',
          color: '#334155',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          padding: '8px 14px',
          fontSize: 13,
          fontWeight: 500,
          boxShadow: '0 2px 12px #0002',
          zIndex: 10,
          whiteSpace: 'pre-line',
        }}>{tooltip}</div>
      )}
    </div>
  );
};

export default Gauge;
