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
  const baseClasses = 'w-full bg-[var(--surface-glass)] border rounded-2xl px-4 py-3 text-sm text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 transition-all duration-300';
  
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
      <input
        ref={ref}
        className={cn(baseClasses, borderClasses, iconPadding, className)}
        {...props}
      />
      {error && (
        <span className="text-xs text-[var(--danger)] mt-1.5 ml-1 block">{error}</span>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;
