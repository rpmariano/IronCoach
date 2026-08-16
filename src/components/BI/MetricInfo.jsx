import React, { useState } from 'react';
import { Info } from 'lucide-react';

export default function MetricInfo({ text }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!text) return null;

  return (
    <>
      <button 
        onClick={(e) => { e.preventDefault(); setIsOpen(!isOpen); }}
        className={`inline-flex ml-1.5 align-text-bottom rounded-full p-0.5 transition-all ${isOpen ? 'text-cyan-500 bg-cyan-50' : 'text-slate-400 active:bg-slate-100'}`}
        aria-label="Mais informações"
      >
        <Info size={14} />
      </button>
      
      <div 
        className={`overflow-hidden transition-all duration-300 ease-in-out block ${isOpen ? 'max-h-32 opacity-100 mt-2 mb-4' : 'max-h-0 opacity-0 m-0'}`}
      >
        <div className="bg-cyan-50 text-cyan-900 text-[11px] leading-relaxed p-3 rounded-xl border border-cyan-100 flex items-start gap-2 relative">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-cyan-500" />
          <p className="flex-1 font-medium">{text}</p>
        </div>
      </div>
    </>
  );
}
