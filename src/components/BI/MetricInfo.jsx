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
      {/* Alvo de toque de 44 px a sério (2026-10-04): o botão MEDE 44×44 — o
          reparo da verificação no browser foi que media 18×18 (a área do
          `tap-area-44` é um pseudo-elemento, que não conta quando se mede o
          botão). As margens negativas devolvem os 13 px de cada lado, por isso
          o layout fica igual ao do glifo de 14 px com a sua pastilha de 18 px,
          que passa a ser o <span> de dentro (o círculo "aberto" não cresce). */}
      <button
        type="button"
        onClick={toggle}
        data-testid="metric-info-button"
        className="group inline-flex items-center justify-center align-text-bottom shrink-0"
        style={{ width: 'var(--tap)', height: 'var(--tap)', margin: '-13px -13px -13px -7px', background: 'transparent', border: 0, padding: 0 }}
        aria-label="Mais informações"
        aria-expanded={isOpen}
      >
        <span className={`inline-flex rounded-full p-0.5 transition-all ${isOpen ? 'text-[var(--coach)] bg-[var(--tint-coach-bg)]' : 'text-[var(--text-3)] group-active:bg-[var(--surface-glass)]'}`}>
          <Info size={14} aria-hidden="true" />
        </span>
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
