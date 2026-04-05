import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ className, size = 'md', showText = true }) => {
  const dimensions = {
    sm: { width: 120, height: 40 },
    md: { width: 180, height: 60 },
    lg: { width: 240, height: 80 },
    xl: { width: 320, height: 110 },
  };

  const { width, height } = dimensions[size];

  return (
    <div className={className}>
      <svg
        width={width}
        height={height}
        viewBox="0 0 320 110"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto"
      >
        {/* Primary Blue Square for M */}
        <rect x="10" y="10" width="80" height="80" fill="var(--primary-color)" rx="12" />
        
        {/* White M */}
        <text
          x="50"
          y="75"
          fontFamily="var(--font-sans)"
          fontSize="70"
          fontWeight="900"
          fill="white"
          textAnchor="middle"
        >
          M
        </text>

        {/* Black & */}
        <text
          x="115"
          y="75"
          fontFamily="var(--font-sans)"
          fontSize="65"
          fontWeight="900"
          fill="var(--logo-text-primary)"
          textAnchor="middle"
        >
          &
        </text>

        {/* Slate S */}
        <text
          x="175"
          y="75"
          fontFamily="var(--font-sans)"
          fontSize="85"
          fontWeight="900"
          fill="var(--logo-text-secondary)"
          textAnchor="middle"
        >
          S
        </text>

        {showText && (
          <text
            x="10"
            y="100"
            fontFamily="var(--font-sans)"
            fontSize="16"
            fontWeight="700"
            fill="var(--logo-text-primary)"
          >
            <tspan fill="var(--primary-color)">M</tspan>
            <tspan fill="var(--logo-text-primary)">ULTI</tspan>
            <tspan fill="var(--logo-text-secondary)">S</tspan>
            <tspan fill="var(--logo-text-primary)">ERVICIOS DE GUATEMALA S.A.</tspan>
          </text>
        )}
      </svg>
    </div>
  );
};
