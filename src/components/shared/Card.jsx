import React from 'react';
import { cn } from './Button';

/**
 * Componente Base de Cartão (Design System)
 * Centraliza o Efeito Branco (Glassmorphism Premium) e as bordas consistentes
 * para que toda a aplicação use a mesma linguagem visual escura.
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {string} [props.className] - Classes extra
 * @param {boolean} [props.noPadding=false] - Se true, remove o padding base (p-5 ou p-6)
 * @param {boolean} [props.interactive=false] - Se true, adiciona hover state e press state
 * @param {Function} [props.onClick] - Transforma num cartão clicável
 */
export function Card({
  children,
  className,
  noPadding = false,
  interactive = false,
  onClick,
  ...props
}) {
  // rounded-3xl é 24px no tailwind
  const baseClasses = 'relative overflow-hidden bg-white/5 backdrop-blur-[20px] border border-white/10 rounded-3xl shadow-[inset_0_2px_10px_rgba(255,255,255,0.05),0_8px_30px_rgba(0,0,0,0.2)]';
  
  const paddingClasses = noPadding ? '' : 'p-5 md:p-6';
  
  const interactiveClasses = interactive || onClick 
    ? 'cursor-pointer hover:bg-white/10 active:scale-[0.98] transition-all duration-300' 
    : '';

  return (
    <div
      className={cn(baseClasses, paddingClasses, interactiveClasses, className)}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      {...props}
    >
      {children}
    </div>
  );
}

export default Card;
