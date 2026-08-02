import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import { LayoutGrid, Utensils, Scale, Dumbbell, Bot, Plus, X, Camera, User, Route, Flag } from 'lucide-react';

// SVG de corrida (igual ao legado, sem equivalente no lucide)
function RunIcon({ className = "w-5 h-5" }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14.1 7.9 12.5 10"/>
      <path d="M17.4 10.1 16 12"/>
      <path d="M2 16a2 2 0 0 0 2 2h13c2.8 0 5-2.2 5-5a2 2 0 0 0-2-2c-.8 0-1.6-.2-2.2-.7l-6.2-4.2c-.4-.3-.9-.2-1.3.1 0 0-.6.8-1.2 1.1a3.5 3.5 0 0 1-4.2.1C4.4 7 3.7 6.3 3.7 6.3A.92.92 0 0 0 2 7Z"/>
      <path d="M2 11c0 1.7 1.3 3 3 3h7"/>
    </svg>
  );
}

export default function Layout({ children }) {
  const { activeTab, setActiveTab, profile, isAdmin, setOpenCreationMode } = useAppStore();
  const [fabOpen, setFabOpen] = useState(false);
  const fabRef = useRef(null);
  const lastLogoClickAt = useRef(0);

  // Data dinâmica no header
  const todayLabel = new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });

  // Logo: clique simples → home; duplo clique rápido (<1s) → admin (só admins)
  const handleLogoClick = () => {
    if (!isAdmin) { setActiveTab('home'); return; }
    const now = Date.now();
    if (now - lastLogoClickAt.current < 1000) {
      lastLogoClickAt.current = 0;
      setActiveTab('admin');
      return;
    }
    lastLogoClickAt.current = now;
    setActiveTab('home');
  };

  // Fechar FAB ao clicar fora
  useEffect(() => {
    function handleClick(e) {
      if (fabOpen && fabRef.current && !fabRef.current.contains(e.target)) {
        setFabOpen(false);
      }
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [fabOpen]);

  const closeFab = () => setFabOpen(false);

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col relative" style={{ background: 'var(--page-bg)' }}>

      {/* Header fixo no topo */}
      <div className="sticky top-0 z-20" style={{ background: 'color-mix(in srgb, var(--surf-950) 95%, transparent)', backdropFilter: 'blur(8px)', borderBottom: '1px solid var(--brd-800)' }}>
        <header className="px-4 pt-4 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={handleLogoClick} className="tap-44 flex items-center justify-center -ml-1 rounded-xl active:scale-95 transition">
              <img src="/logo.png" alt="" className="w-9 h-9 rounded-xl object-cover" onError={e => { e.target.style.display='none'; }} />
            </button>
            <div>
              <h1 className="text-base font-bold tracking-tight leading-none" style={{ color: 'var(--green)' }}>IronHealth</h1>
              <p className="text-[11px] leading-none mt-1" style={{ color: 'var(--brd-700)' }}>{todayLabel}</p>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('perfil')}
            className="tap-h-44 flex items-center gap-1 text-xs font-bold pl-3.5 pr-4 rounded-full active:scale-95 transition"
            style={{ background: 'var(--chrome)', color: 'var(--text-main)' }}
          >
            <User size={14} /> Perfil
          </button>
        </header>
      </div>

      {/* Conteúdo */}
      <main className="flex-1 px-4 pt-4 pb-28 overflow-y-auto">
        {children}
      </main>

      {/* FAB Menu — sobre o botão "+" */}
      {fabOpen && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2 w-max"
          style={{ bottom: 86 }}
          ref={fabRef}
        >
          <FabItem label="Registar refeição" gradient="var(--mod-nutricao-from),var(--mod-nutricao-to)" icon={<Camera size={14} />} onClick={() => { closeFab(); setActiveTab('nutricao'); setOpenCreationMode('meal'); }} />
          <FabItem label="Nova avaliação" gradient="var(--mod-corpo-from),var(--mod-corpo-to)" icon={<User size={14} />} onClick={() => { closeFab(); setActiveTab('corpo'); setOpenCreationMode('assessment'); }} />
          <FabItem label="Nova corrida" gradient="var(--mod-corrida-from),var(--mod-corrida-to)" icon={<RunIcon className="w-3.5 h-3.5" />} onClick={() => { closeFab(); setActiveTab('corrida'); setOpenCreationMode('run'); }} />
          <FabItem label="Novo treino" gradient="var(--mod-ginasio-from),var(--mod-ginasio-to)" icon={<Dumbbell size={14} />} onClick={() => { closeFab(); setActiveTab('ginasio'); setOpenCreationMode('workout'); }} />
        </div>
      )}

      {/* Barra inferior — 7 colunas + "+" central elevado */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 max-w-md mx-auto grid items-center pt-1 pb-2"
        style={{
          gridTemplateColumns: 'repeat(7, 1fr)',
          background: 'color-mix(in srgb, var(--surf-900) 97%, transparent)',
          backdropFilter: 'blur(8px)',
          borderTop: '1px solid var(--brd-800)',
        }}
      >
        <VBarBtn tab="home" icon={<LayoutGrid size={20} />} label="Início" activeTab={activeTab} setTab={setActiveTab} />
        <VBarBtn tab="nutricao" icon={<Utensils size={20} />} label="Nutrição" activeTab={activeTab} setTab={setActiveTab} />
        <VBarBtn tab="ginasio" icon={<Dumbbell size={20} />} label="Ginásio" activeTab={activeTab} setTab={setActiveTab} />

        {/* Espaço central — botão "+" flutuante */}
        <div className="relative flex items-center justify-center">
          <button
            onClick={() => setFabOpen(v => !v)}
            className="absolute w-14 h-14 rounded-full flex items-center justify-center active:scale-95 transition-transform"
            style={{
              top: -22,
              background: 'var(--chrome)',
              color: 'var(--text-main)',
              border: '4px solid var(--page-bg)',
              boxShadow: '0 8px 20px -4px color-mix(in srgb, var(--chrome) 55%, transparent)',
            }}
            aria-label="Registar"
          >
            <Plus size={24} className={`transition-transform duration-200 ${fabOpen ? 'rotate-45' : ''}`} />
          </button>
        </div>

        <VBarBtn tab="corpo" icon={<Scale size={20} />} label="Corpo" activeTab={activeTab} setTab={setActiveTab} />
        <VBarBtn tab="corrida" icon={<RunIcon />} label="Corrida" activeTab={activeTab} setTab={setActiveTab} />
        <VBarBtn tab="coach" icon={<Bot size={20} />} label="Coach" activeTab={activeTab} setTab={setActiveTab} />
      </nav>
    </div>
  );
}

function VBarBtn({ tab, icon, label, activeTab, setTab }) {
  const active = activeTab === tab;
  return (
    <button
      onClick={() => setTab(tab)}
      data-vert={tab}
      className={`vbar-btn flex flex-col items-center justify-center gap-0.5 py-2 active:scale-95 transition ${active ? 'active' : ''}`}
    >
      {icon}
      <span className="text-[9px] font-medium leading-none">{label}</span>
    </button>
  );
}

function FabItem({ label, gradient, icon, onClick }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className="flex items-center gap-2 pl-2.5 pr-3.5 py-2 rounded-full shadow-lg active:scale-95 transition"
      style={{ background: 'var(--surf-900)', border: '1px solid var(--brd-800)' }}
    >
      <span
        className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0"
        style={{ background: `linear-gradient(135deg,${gradient})` }}
      >
        {icon}
      </span>
      <span className="text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--text-main)' }}>{label}</span>
    </button>
  );
}
