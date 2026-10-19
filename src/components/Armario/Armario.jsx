import React, { useState } from 'react';
import ExerciseLockerSection from './ExerciseLockerSection';
import PantrySection from '../Pantry/PantrySection';
import ShoeCabinet from '../Perfil/ShoeCabinet';

/* O Armário do Perfil, com submenus por secção (decisão 14 de
   specs/plano-registo-plano-coach.md): Treino (os exercícios), Alimentação (a
   despensa) e Equipamento (as sapatilhas). Cada secção grava sozinha, à parte
   do rascunho do perfil. O que se abriu da última vez lembra-se. */
const SECTIONS = [
  { key: 'treino', label: 'Treino', Panel: ExerciseLockerSection },
  { key: 'alimentacao', label: 'Alimentação', Panel: PantrySection },
  { key: 'equipamento', label: 'Equipamento', Panel: ShoeCabinet },
];
const STORAGE_KEY = 'ironcoach:armario-seccao';

const readSaved = () => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return SECTIONS.some((s) => s.key === v) ? v : null;
  } catch { return null; }
};

export default function Armario({ initial = null }) {
  const [active, setActive] = useState(() => (SECTIONS.some((s) => s.key === initial) ? initial : readSaved() || 'treino'));
  const choose = (key) => {
    setActive(key);
    try { localStorage.setItem(STORAGE_KEY, key); } catch { /* o separador lembra-se só enquanto está aberto */ }
  };
  const { Panel } = SECTIONS.find((s) => s.key === active);
  // Setas, Home e End movem entre as secções (padrão WAI-ARIA dos separadores).
  const onTabKey = (e) => {
    const i = SECTIONS.findIndex((s) => s.key === active);
    const next = e.key === 'ArrowRight' ? (i + 1) % SECTIONS.length
      : e.key === 'ArrowLeft' ? (i - 1 + SECTIONS.length) % SECTIONS.length
        : e.key === 'Home' ? 0 : e.key === 'End' ? SECTIONS.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    choose(SECTIONS[next].key);
    document.getElementById(`armario-tab-${SECTIONS[next].key}`)?.focus();
  };

  return (
    <div className="space-y-3" data-testid="armario">
      <div role="tablist" aria-label="Secções do Armário" className="grid grid-cols-3 gap-1 p-1 rounded-[14px]" style={{ background: 'rgba(255,255,255,.05)' }} onKeyDown={onTabKey}>
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            id={`armario-tab-${s.key}`}
            aria-selected={active === s.key}
            tabIndex={active === s.key ? 0 : -1}
            aria-controls="armario-painel"
            onClick={() => choose(s.key)}
            className="min-h-[44px] rounded-[10px] text-[12.5px] font-extrabold leading-tight px-1"
            style={active === s.key ? { background: 'rgba(255,255,255,.14)', color: 'var(--text-1)' } : { color: 'var(--text-3)' }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="armario-painel" aria-labelledby={`armario-tab-${active}`} className="space-y-4">
        <Panel />
      </div>
    </div>
  );
}
