import React, { useState, useEffect, useId } from 'react';
import { Info } from 'lucide-react';

export default function MetricInfo({ text }) {
  const [isOpen, setIsOpen] = useState(false);
  const id = useId();

  useEffect(() => {
    const handleOtherOpen = (e) => {
      if (e.detail !== id && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('metricInfoOpened', handleOtherOpen);
    return () => window.removeEventListener('metricInfoOpened', handleOtherOpen);
  }, [id, isOpen]);

  const toggle = (e) => {
    e.preventDefault();
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (nextState) {
      window.dispatchEvent(new CustomEvent('metricInfoOpened', { detail: id }));
    }
  };

  if (!text) return null;

  return (
    <>
      <button 
        onClick={toggle}
        // tap-area-44: o glifo continua com 14px e a area de toque passa a 44 (globals.css).
        className={`tap-area-44 inline-flex ml-1.5 align-text-bottom rounded-full p-0.5 transition-all ${isOpen ? 'text-[var(--coach)] bg-[var(--tint-coach-bg)]' : 'text-[var(--text-3)] active:bg-[var(--surface-glass)]'}`}
        aria-label="Mais informações"
      >
        <Info size={14} />
      </button>
      
      <div 
        className={`w-full basis-full grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100 mt-2 mb-4' : 'grid-rows-[0fr] opacity-0 m-0'}`}
      >
        <div className="overflow-hidden">
          <div className="bg-[var(--tint-coach-bg)] text-[var(--coach)] text-[11px] leading-relaxed p-3 rounded-xl border border-[var(--tint-coach-bd)] flex items-start gap-2 relative">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--coach)]" />
            <p className="flex-1 font-medium">{text}</p>
          </div>
        </div>
      </div>
    </>
  );
}
