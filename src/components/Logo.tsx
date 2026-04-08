import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ className, size = 'md', showText = true }) => {
  const dimensions = {
    sm: { widthClass: 'w-24', textClass: 'text-[8px]' },
    md: { widthClass: 'w-32', textClass: 'text-[9px]' },
    lg: { widthClass: 'w-40', textClass: 'text-[10px]' },
    xl: { widthClass: 'w-52', textClass: 'text-xs' },
  };

  const { widthClass, textClass } = dimensions[size];

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <img
          src="/logo.svg"
          alt="Constructora WM_M&S"
          className={`${widthClass} h-auto object-contain`}
          loading="eager"
          decoding="async"
        />
        {showText && (
          <span className={`${textClass} font-black uppercase tracking-widest text-slate-700 dark:text-slate-200 hidden sm:inline`}>
            Constructora WM_M&S
          </span>
        )}
      </div>
    </div>
  );
};
