import React, { forwardRef } from 'react';
import { cn } from './Button';

/**
 * Componente Base de Input (Design System)
 * Centraliza os Inputs de texto num formato Premium Glass.
 */
export const Input = forwardRef(({
  className,
  error,
  icon,
  ...props
}, ref) => {
  const baseClasses = 'w-full bg-white/5 border rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 transition-all duration-300';
  
  const borderClasses = error 
    ? 'border-red-500/50 focus:ring-red-500' 
    : 'border-white/10 focus:ring-[var(--accent)]';

  const iconPadding = icon ? 'pl-11' : '';

  return (
    <div className="relative w-full">
      {icon && (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
          {icon}
        </div>
      )}
      <input
        ref={ref}
        className={cn(baseClasses, borderClasses, iconPadding, className)}
        {...props}
      />
      {error && (
        <span className="text-xs text-red-400 mt-1.5 ml-1 block">{error}</span>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;
