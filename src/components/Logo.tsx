import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ className, size = 'md', showText = true }) => {
  const dimensions = {
    sm: { iconClass: 'w-10 h-10', titleClass: 'text-[10px]', taglineClass: 'text-[8px]' },
    md: { iconClass: 'w-12 h-12', titleClass: 'text-xs', taglineClass: 'text-[9px]' },
    lg: { iconClass: 'w-14 h-14', titleClass: 'text-sm', taglineClass: 'text-[10px]' },
    xl: { iconClass: 'w-16 h-16', titleClass: 'text-base', taglineClass: 'text-xs' },
  };

  const { iconClass, titleClass, taglineClass } = dimensions[size];

  return (
    <div className={className}>
      <div className="flex items-center gap-2.5">
        <div className={`${iconClass} shrink-0`}>
          <img
            src={`${import.meta.env.BASE_URL}logo.svg`}
            alt="Constructora WM_M&S"
            className="w-full h-full object-contain"
            loading="eager"
            decoding="async"
          />
        </div>
        {showText && (
          <div className="leading-tight min-w-0">
            <p className={`${titleClass} font-black uppercase tracking-widest text-slate-800 dark:text-slate-100 truncate`}>
              CONSTRUCTORA WM/M&S
            </p>
            <p className={`${taglineClass} font-semibold text-slate-500 dark:text-slate-400 truncate`}>
              Edificando el Futuro
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
