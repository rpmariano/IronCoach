import React, { forwardRef } from 'react';
import { cn } from './Button';

/**
 * Componente Base de Select (Design System)
 */
export const Select = forwardRef(({
  className,
  error,
  icon,
  children,
  ...props
}, ref) => {
  const baseClasses = 'w-full bg-[var(--surface-glass)] border rounded-2xl px-4 py-3 text-sm text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 transition-all duration-300 appearance-none';
  
  const borderClasses = error 
    ? 'border-[var(--tint-danger-bd)] focus:ring-[var(--danger)]' 
    : 'border-[var(--border-glass)] focus:ring-[var(--accent)]';

  const iconPadding = icon ? 'pl-11' : '';

  return (
    <div className="relative w-full">
      {icon && (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-3)]">
          {icon}
        </div>
      )}
      <select
        ref={ref}
        className={cn(baseClasses, borderClasses, iconPadding, className)}
        {...props}
      >
        {children}
      </select>
      
      {/* Seta customizada */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-3)]">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </div>

      {error && (
        <span className="text-xs text-[var(--danger)] mt-1.5 ml-1 block">{error}</span>
      )}
    </div>
  );
});

Select.displayName = 'Select';

export default Select;
