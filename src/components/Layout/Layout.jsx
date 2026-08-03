import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import { LayoutGrid, Utensils, Dumbbell, Bot, Plus, X, Camera, User } from 'lucide-react';

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

const TAB_MODULE_COLORS = {
  home: 'var(--accent)',
  nutricao: 'var(--mod-nutricao-to, #059669)',
  ginasio: 'var(--mod-ginasio-to, #2563eb)',
  corpo: 'var(--mod-corpo-to, #7c3aed)',
  corrida: 'var(--mod-corrida-to, #c026d3)',
  coach: 'var(--accent)',
  perfil: 'var(--accent)',
};

export default function Layout({ children }) {
  const { activeTab, setActiveTab, profile, isAdmin, setOpenCreationMode } = useAppStore();
  const [fabOpen, setFabOpen] = useState(false);
  const fabRef = useRef(null);
  const fabBtnRef = useRef(null);
  const lastLogoClickAt = useRef(0);

  const todayLabel = new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });

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

  useEffect(() => {
    function handleClick(e) {
      if (
        fabOpen && 
        fabRef.current && !fabRef.current.contains(e.target) && 
        fabBtnRef.current && !fabBtnRef.current.contains(e.target)
      ) {
        setFabOpen(false);
      }
    }
    
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
    };
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

      {/* FAB Backdrop & Menu — abre sobre o botão "+" */}
      {fabOpen && (
        <>
          <div 
            className="fixed inset-0 bg-slate-900/20 backdrop-blur-[1px] z-40 fade-in"
            onClick={(e) => {
              e.stopPropagation();
              closeFab();
            }}
          />

          <div
            className="fixed left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2.5 w-max fade-in"
            style={{ bottom: 90 }}
            ref={fabRef}
          >
            <FabItem 
              label="Registar refeição" 
              bgColor="bg-[#059669]" 
              icon={<Camera size={14} />} 
              onClick={(e) => { 
                e.stopPropagation(); 
                closeFab(); 
                setActiveTab('nutricao'); 
                setOpenCreationMode('meal'); 
              }} 
            />
            <FabItem 
              label="Nova avaliação" 
              bgColor="bg-[#7c3aed]" 
              icon={<User size={14} />} 
              onClick={(e) => { 
                e.stopPropagation(); 
                closeFab(); 
                setActiveTab('corpo'); 
                setOpenCreationMode('assessment'); 
              }} 
            />
            <FabItem 
              label="Nova corrida" 
              bgColor="bg-[#c026d3]" 
              icon={<RunIcon className="w-3.5 h-3.5" />} 
              onClick={(e) => { 
                e.stopPropagation(); 
                closeFab(); 
                setActiveTab('corrida'); 
                setOpenCreationMode('run'); 
              }} 
            />
            <FabItem 
              label="Novo treino" 
              bgColor="bg-[#2563eb]" 
              icon={<Dumbbell size={14} />} 
              onClick={(e) => { 
                e.stopPropagation(); 
                closeFab(); 
                setActiveTab('ginasio'); 
                setOpenCreationMode('workout'); 
              }} 
            />
          </div>
        </>
      )}

      {/* Barra inferior — 7 colunas + "+" central elevado */}
      <nav
        className="fixed bottom-0 left-1/2 -translate-x-1/2 z-40 w-full max-w-md grid grid-cols-7 items-center pt-1.5 pb-2 bg-white border-t border-slate-200/80 shadow-lg"
      >
        <VBarBtn tab="home" icon={<LayoutGrid size={20} />} label="Início" activeTab={activeTab} setTab={setActiveTab} />
        <VBarBtn tab="nutricao" icon={<Utensils size={20} />} label="Nutrição" activeTab={activeTab} setTab={setActiveTab} />
        <VBarBtn tab="ginasio" icon={<Dumbbell size={20} />} label="Ginásio" activeTab={activeTab} setTab={setActiveTab} />

        {/* Espaço central reservado na grelha */}
        <div aria-hidden="true" className="h-full" />

        <VBarBtn tab="corpo" icon={<User size={20} />} label="Corpo" activeTab={activeTab} setTab={setActiveTab} />
        <VBarBtn tab="corrida" icon={<RunIcon />} label="Corrida" activeTab={activeTab} setTab={setActiveTab} />
        <VBarBtn tab="coach" icon={<Bot size={20} />} label="Coach" activeTab={activeTab} setTab={setActiveTab} />

        {/* Botão "+" flutuante — filho direto do nav para top: -22px ser relativo ao topo da barra */}
        <button
          ref={fabBtnRef}
          onClick={(e) => {
            e.stopPropagation();
            setFabOpen(v => !v);
          }}
          className="absolute left-1/2 -translate-x-1/2 w-14 h-14 rounded-full flex items-center justify-center active:scale-95 transition-all bg-[#f3d5ab] border-[4px] border-white ring-[2.5px] ring-slate-900 shadow-xl text-slate-900 z-50 cursor-pointer"
          style={{
            top: -22,
          }}
          aria-label="Registar"
        >
          {fabOpen ? (
            <X size={22} className="stroke-[2.5]" />
          ) : (
            <Plus size={24} className="stroke-[2.5]" />
          )}
        </button>
      </nav>
    </div>
  );
}

function VBarBtn({ tab, icon, label, activeTab, setTab }) {
  const active = activeTab === tab;
  const activeColor = TAB_MODULE_COLORS[tab] || 'var(--accent)';

  return (
    <button
      onClick={() => setTab(tab)}
      data-vert={tab}
      aria-label={label}
      className="vbar-btn w-full flex flex-col items-center justify-center gap-1 py-1 active:scale-95 transition cursor-pointer"
      style={{ color: active ? activeColor : '#64748b', fontWeight: active ? 700 : 500 }}
    >
      {icon}
      <span className="text-[10px] leading-none whitespace-nowrap">{label}</span>
    </button>
  );
}

function FabItem({ label, bgColor, icon, onClick }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className="flex items-center gap-3 pl-2.5 pr-4 py-2 min-h-[44px] rounded-full bg-white border border-slate-200/80 shadow-md hover:shadow-lg active:scale-95 transition-transform cursor-pointer"
    >
      <span
        className={`w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0 ${bgColor}`}
      >
        {icon}
      </span>
      <span className="text-xs font-bold text-slate-800 whitespace-nowrap">{label}</span>
    </button>
  );
}
