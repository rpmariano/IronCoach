import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import { publicUrl } from '../../lib/utils';
import { LayoutGrid, Utensils, Dumbbell, Bot, Plus, X, Camera, User, Calendar, Activity, LayoutDashboard, Trophy } from 'lucide-react';
import RunIcon from '../shared/RunIcon';

const TAB_MODULE_COLORS = {
  home: 'var(--accent)',
  calendario: 'var(--accent)',
  dashboard: 'var(--accent)',
  nutricao: 'var(--mod-nutricao-to, #059669)',
  ginasio: 'var(--mod-ginasio-to, #facc15)',
  corpo: 'var(--mod-corpo-to, #e11d48)',
  corrida: 'var(--mod-corrida-to, #c026d3)',
  coach: 'var(--mod-coach-to, #06b6d4)',
  perfil: 'var(--accent)',
};

// Círculo de ícone com glifo branco: usa o mesmo gradiente -from → -to dos
// dashboards de cada módulo. O tom -to sozinho é demasiado claro para o
// ícone branco ter contraste suficiente.
const moduleGradient = (mod) =>
  `linear-gradient(135deg, var(--mod-${mod}-from), var(--mod-${mod}-to))`;

export default function Layout({ children }) {
  const { activeTab, setActiveTab, profile, isAdmin, setOpenCreationMode, lastDashboardTab } = useAppStore();
  const [fabOpen, setFabOpen] = useState(false);
  const fabRef = useRef(null);
  const fabBtnRef = useRef(null);
  const mainRef = useRef(null);
  const lastLogoClickAt = useRef(0);

  useEffect(() => {
    if (activeTab !== 'coach') {
      // Pequeno atraso para dar tempo aos componentes de renderizarem a sua altura
      setTimeout(() => {
        window.scrollTo(0, 0);
        
        // Caso o container interno tenha scroll (fallback)
        if (mainRef.current) {
          mainRef.current.scrollTo(0, 0);
        }
      }, 10);
    }
  }, [activeTab]);

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

  // setActiveTab devolve false quando o navGuard recusa (ex.: Perfil com
  // alterações por gravar). Sem isto, openCreationMode ficava no store e o
  // formulário de registo abria sozinho na visita seguinte a esse módulo.
  const goRegister = (tab, mode) => {
    if (setActiveTab(tab)) setOpenCreationMode(mode);
  };

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col relative" style={{ background: 'var(--page-bg)' }}>

      {/* Header fixo no topo */}
      <div className="sticky top-0 z-20" style={{ background: 'color-mix(in srgb, var(--surf-950) 95%, transparent)', backdropFilter: 'blur(8px)', borderBottom: '1px solid var(--brd-800)' }}>
        <header className="px-4 pt-4 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={handleLogoClick} className="tap-44 flex items-center justify-center -ml-1 rounded-xl active:scale-95 transition">
              <img src={publicUrl('logo.png')} alt="" className="w-9 h-9 rounded-xl object-cover" onError={e => { e.target.style.display='none'; }} />
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
      <main ref={mainRef} className="flex-1 px-4 pt-4 pb-28 overflow-y-auto">
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
              label="Nova prova"
              color={moduleGradient('coach')}
              icon={<Trophy size={14} />} 
              onClick={(e) => { 
                e.stopPropagation(); 
                closeFab(); 
                goRegister('coach', 'race');
              }} 
            />
            <FabItem
              label="Registar refeição"
              color={moduleGradient('nutricao')}
              icon={<Camera size={14} />}
              onClick={(e) => { 
                e.stopPropagation(); 
                closeFab(); 
                goRegister('nutricao', 'meal');
              }} 
            />
            <FabItem 
              label="Nova avaliação"
              color={moduleGradient('corpo')}
              icon={<User size={14} />} 
              onClick={(e) => { 
                e.stopPropagation(); 
                closeFab(); 
                goRegister('corpo', 'assessment');
              }} 
            />
            <FabItem 
              label="Nova corrida"
              color={moduleGradient('corrida')}
              icon={<RunIcon className="w-3.5 h-3.5" />} 
              onClick={(e) => { 
                e.stopPropagation(); 
                closeFab(); 
                goRegister('corrida', 'run');
              }} 
            />
            <FabItem 
              label="Novo treino"
              color={moduleGradient('ginasio')}
              icon={<Dumbbell size={14} />} 
              onClick={(e) => { 
                e.stopPropagation(); 
                closeFab(); 
                goRegister('ginasio', 'workout');
              }} 
            />
          </div>
        </>
      )}

      {/* Barra inferior — 5 colunas + "+" central elevado */}
      <nav
        className="fixed bottom-0 left-1/2 -translate-x-1/2 z-40 w-full max-w-md grid grid-cols-5 items-center pt-1.5 pb-2 bg-white border-t border-slate-200/80 shadow-lg"
      >
        <VBarBtn tab="home" icon={<LayoutGrid size={20} />} label="Início" activeTab={activeTab} setTab={setActiveTab} />
        <VBarBtn tab="calendario" icon={<Calendar size={20} />} label="Calendário" activeTab={activeTab} setTab={setActiveTab} />

        {/* Espaço central reservado na grelha */}
        <div aria-hidden="true" className="h-full" />

        <DashboardVBarBtn activeTab={activeTab} setTab={setActiveTab} lastDashboardTab={lastDashboardTab} />
        <VBarBtn tab="coach" icon={<Bot size={20} />} label="Coach" activeTab={activeTab} setTab={setActiveTab} />

        {/* Botão "+" flutuante — filho direto do nav para top: -22px ser relativo ao topo da barra */}
        <button
          ref={fabBtnRef}
          onClick={(e) => {
            e.stopPropagation();
            setFabOpen(v => !v);
          }}
          className="absolute left-1/2 -translate-x-1/2 w-14 h-14 rounded-full flex items-center justify-center active:scale-95 transition-all bg-[var(--fab-bg)] border-[4px] border-white ring-[2.5px] ring-slate-900 shadow-xl text-slate-900 z-50 cursor-pointer"
          style={{
            top: -22,
          }}
          aria-label={fabOpen ? 'Fechar menu de registo' : 'Registar novo item'}
          aria-expanded={fabOpen}
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
      aria-current={active ? 'page' : undefined}
      className="vbar-btn relative w-full min-h-[44px] flex flex-col items-center justify-center gap-1 py-1 active:scale-95 transition cursor-pointer"
      style={{ color: active ? activeColor : '#64748b', fontWeight: active ? 700 : 500 }}
    >
      {/* Pista não-cromática do estado ativo: as cores de módulo em texto de
          10px não chegam ao contraste AA sobre o branco da barra, por isso o
          estado não pode depender só da cor. Ver PRD 5.2. */}
      {active && (
        <span
          aria-hidden="true"
          className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-[3px] rounded-full"
          style={{ background: activeColor }}
        />
      )}
      {icon}
      <span className="text-[10px] leading-none whitespace-nowrap">{label}</span>
    </button>
  );
}

function DashboardVBarBtn({ activeTab, setTab, lastDashboardTab }) {
  const active = ['corrida', 'ginasio', 'nutricao', 'corpo'].includes(activeTab);
  const activeColor = 'var(--accent)';

  return (
    <button
      onClick={() => { if (!active) setTab(lastDashboardTab || 'corrida'); }}
      data-vert="dashboard"
      aria-label="Dashboard"
      aria-current={active ? 'page' : undefined}
      className="vbar-btn relative w-full min-h-[44px] flex flex-col items-center justify-center gap-1 py-1 active:scale-95 transition cursor-pointer"
      style={{ color: active ? activeColor : '#64748b', fontWeight: active ? 700 : 500 }}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-[3px] rounded-full"
          style={{ background: activeColor }}
        />
      )}
      <LayoutDashboard size={20} />
      <span className="text-[10px] leading-none whitespace-nowrap">Dashboard</span>
    </button>
  );
}

function FabItem({ label, color, icon, onClick }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className="flex items-center gap-3 pl-2.5 pr-4 py-2 min-h-[44px] rounded-full bg-white border border-slate-200/80 shadow-md hover:shadow-lg active:scale-95 transition-transform cursor-pointer"
    >
      <span
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
        style={{ background: color, color: '#fff' }}
      >
        {icon}
      </span>
      <span className="text-xs font-bold text-slate-800 whitespace-nowrap">{label}</span>
    </button>
  );
}
