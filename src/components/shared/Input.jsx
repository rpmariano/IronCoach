import React, { forwardRef } from 'react';
import { cn } from './Button';
import { FieldInput } from './registration/Field';

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
  // O aspeto vem do Field (o padrão dos registos); aqui só o estado de erro e o ícone.
  const baseClasses = '';
  
  const borderClasses = error 
    ? 'border-[var(--tint-danger-bd)]! focus:border-[var(--danger)]!' 
    : '';

  const iconPadding = icon ? 'pl-11!' : '';

  return (
    <div className="relative w-full">
      {icon && (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-3)]">
          {icon}
        </div>
      )}
      <FieldInput
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
