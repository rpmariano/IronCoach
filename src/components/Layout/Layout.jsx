import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import { publicUrl } from '../../lib/utils';
import { Bot, LayoutGrid, Dumbbell, Plus, X, Camera, User, Calendar, LayoutDashboard, Trophy, Footprints, Droplets } from 'lucide-react';
import ReportIssueButton from '../shared/ReportIssueButton';
import BugNotificationsHandler from '../shared/BugNotificationsHandler';
import AppBackground from './AppBackground';
import WaterSheet from '../Home/WaterSheet';

const TAB_MODULE_COLORS = {
  home: 'var(--green)',
  calendario: 'var(--green)',
  dashboard: 'var(--green)',
  nutricao: 'var(--green)',
  ginasio: 'var(--green)',
  corpo: 'var(--green)',
  corrida: 'var(--green)',
  coach: 'var(--mod-coach-to, #06b6d4)',
  perfil: 'var(--green)',
};

// Círculo de ícone com glifo branco: usa o mesmo gradiente -from → -to dos
// dashboards de cada módulo. O tom -to sozinho é demasiado claro para o
// ícone branco ter contraste suficiente.
const moduleGradient = (mod) =>
  `linear-gradient(135deg, var(--mod-${mod}-from), var(--mod-${mod}-to))`;

export default function Layout({ children }) {
  const { activeTab, setActiveTab, profile, isAdmin, setOpenCreationMode, lastDashboardTab, setWaterSheetOpen } = useAppStore();
  const [fabOpen, setFabOpen] = useState(false);
  const fabRef = useRef(null);
  const fabBtnRef = useRef(null);
  const mainRef = useRef(null);
  const lastLogoClickAt = useRef(0);

  useEffect(() => {
    if (activeTab !== 'coach') {
      // Usar requestAnimationFrame duplo garante que o React já fez render e o DOM foi atualizado
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo({ top: 0, behavior: 'instant' });
          if (mainRef.current) {
            mainRef.current.scrollTo({ top: 0, behavior: 'instant' });
          }
        });
      });
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
    if (setActiveTab('calendario')) setOpenCreationMode(mode);
  };

  return (
    // min-h-dvh (não min-h-screen): min-h-screen usa a "layout viewport",
    // que no Android Chrome NÃO encolhe quando o teclado abre (o meta
    // viewport aqui não pede interactive-widget=resizes-content, por isso o
    // comportamento por omissão é resizes-visual). O nav/FAB fixed já segue
    // a "visual viewport" corretamente e fica acima do teclado — mas com
    // min-h-screen, este contentor (e por extensão a altura do <main> e o
    // rodapé de input do Coach, que vive no fluxo normal lá dentro) fica
    // preso à altura antiga do ecrã e não encolhe, ficando parte por trás do
    // teclado quando o browser faz scroll para mostrar o campo focado —
    // é o que colide com o nav/FAB fixo (bug-019, "caixa de texto cortada").
    // dvh acompanha a visual viewport, tal como os elementos fixed.
    <div className="max-w-md mx-auto min-h-dvh flex flex-col relative" >

      {/* Fundo (gradiente ambiente + curvas de nível + fade) — uma vez, por
          baixo de tudo. Ver AppBackground.jsx. */}
      <AppBackground />


      {/* Header — fixed (não sticky): sticky + backdrop-blur tem um bug de
          composição no Chromium em que o desfoque deixa de ser recalculado
          a meio do scroll de páginas longas (ex.: o formulário de Prova
          depois de "Obter informação do site"), ficando o texto de baixo
          nítido e a aparecer através do cabeçalho em vez de desfocado — na
          prática, o cabeçalho "desaparece". O menu inferior já usa fixed e
          nunca teve este problema; mesmo padrão aqui (centrado com
          left-1/2 -translate-x-1/2, como o nav). main ganha padding-top
          equivalente à altura do cabeçalho para compensar ele ter saído do
          fluxo normal. will-change-transform força uma camada de
          composição própria para o cabeçalho — sem isto, um scroll grande
          e abrupto (ex.: o próprio reset de scroll ao trocar de separador)
          ainda conseguia repetir o mesmo problema mesmo já fixed. */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 z-20 w-full max-w-md border-b will-change-transform"
        style={{
          background: 'var(--bg-header)',
          backdropFilter: 'blur(var(--blur-chrome))',
          WebkitBackdropFilter: 'blur(var(--blur-chrome))',
          borderColor: 'var(--border-glass-strong)',
          boxShadow: '0 6px 18px rgba(0,0,0,.45)',
        }}
      >
        <header className="px-4 pt-4 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={handleLogoClick} className="tap-44 flex items-center justify-center -ml-1 rounded-xl active:scale-95 transition">
              <img src={publicUrl('logo.png')} alt="" className="w-9 h-9 rounded-xl object-cover" onError={e => { e.target.style.display='none'; }} />
            </button>
            <div>
              <h1 className="text-base font-bold tracking-tight leading-none" style={{ color: 'var(--brand)' }}>IronCoach</h1>
              <p className="text-[11px] leading-none mt-1" style={{ color: 'var(--brd-700)' }}>{todayLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Notificações de bug reports — só se renderiza a si própria
                quando há mensagens por ler (ver BugNotificationsHandler) */}
            <BugNotificationsHandler />
            <button
              onClick={() => setActiveTab('perfil')}
              className="tap-h-44 flex items-center gap-1 text-xs font-bold pl-3.5 pr-4 rounded-full active:scale-95 transition"
              style={{ background: 'var(--grad-race)', color: 'var(--race-ink)', border: 'none' }}
            >
              <User size={14} /> Perfil
            </button>
          </div>
        </header>
      </div>

      {/* Conteúdo */}
      {/* padding-top = --header-h (85px) e padding-bottom = --scroll-pad-bottom
          (112px), os mesmos da moldura dos mocks. */}
      <main ref={mainRef} className="flex-1 px-4 overflow-y-auto" style={{ paddingTop: 'var(--header-h)', paddingBottom: 'var(--scroll-pad-bottom)' }}>
        {children}
      </main>

      {/* Botão discreto de report de erro — presente em todos os ecrãs,
          porque vive aqui (Layout envolve tudo o que é renderizado depois
          do login, incluindo os ecrãs de registo — ver App.jsx). */}
      <ReportIssueButton />

      {/* Registar água — só se abre pelo FAB (ver WaterSheet.jsx). */}
      <WaterSheet />

      {/* FAB Backdrop & Menu — abre sobre o botão "+" */}
      {fabOpen && (
        <>
          <div 
            className="fixed inset-0 z-40 fade-in"
            style={{ background: 'var(--bg-scrim)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}
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
              tone="race"
              ink="var(--race-ink)"
              icon={<Trophy size={14} />}
              onClick={(e) => {
                e.stopPropagation();
                closeFab();
                // Ao contrário dos outros registos (cada um "mora" no seu
                // separador — meal em nutricao, etc.), a Prova não tem
                // separador próprio; passar o activeTab atual em vez de um
                // fixo 'coach' preserva onde o atleta estava, para o
                // formulário conseguir voltar exatamente aí ao cancelar/
                // fechar sem gravar (ver RunAgenda.jsx, initialTab).
                goRegister(activeTab, 'race');
              }}
            />
            <FabItem
              label="Registar refeição"
              tone="nutrition"
              ink="#22103a"
              icon={<Camera size={14} />}
              onClick={(e) => { 
                e.stopPropagation(); 
                closeFab(); 
                goRegister('nutricao', 'meal');
              }} 
            />
            <FabItem 
              label="Nova avaliação"
              tone="body"
              ink="#3a0a22"
              icon={<User size={14} />} 
              onClick={(e) => { 
                e.stopPropagation(); 
                closeFab(); 
                goRegister('corpo', 'assessment');
              }} 
            />
            <FabItem 
              label="Nova corrida"
              tone="run"
              ink="#04252b"
              icon={<Footprints size={14} />} 
              onClick={(e) => { 
                e.stopPropagation(); 
                closeFab(); 
                goRegister('corrida', 'run');
              }} 
            />
            <FabItem 
              label="Novo treino"
              tone="gym"
              ink="#0b2129"
              icon={<Dumbbell size={14} />} 
              onClick={(e) => { 
                e.stopPropagation(); 
                closeFab(); 
                goRegister('ginasio', 'workout');
              }} 
            />
            {/* Água: saiu do cartão do Início (a órbita é só leitura —
                auditoria 2026-09-09, achado 7) e regista-se aqui. */}
            <FabItem
              label="Registar água"
              tone="run"
              ink="#04252b"
              icon={<Droplets size={14} />}
              onClick={(e) => {
                e.stopPropagation();
                closeFab();
                setWaterSheetOpen(true);
              }}
            />
          </div>
        </>
      )}

      {/* Barra inferior — 5 colunas + "+" central elevado */}
      <nav
        className="fixed bottom-0 left-1/2 -translate-x-1/2 z-40 w-full max-w-md grid grid-cols-5 items-center pt-1.5 pb-2 border-t shadow-[0_-4px_20px_rgba(0,0,0,0.5)]"
        style={{
          background: 'var(--bg-nav)',
          backdropFilter: 'blur(var(--blur-chrome))',
          WebkitBackdropFilter: 'blur(var(--blur-chrome))',
          borderColor: 'var(--border-glass-strong)',
        }}
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
          className="absolute left-1/2 -translate-x-1/2 w-14 h-14 rounded-full flex items-center justify-center active:scale-95 transition-all border-[4px] z-50 cursor-pointer"
          style={{
            top: -22,
            background: 'var(--grad-race)',
            color: 'var(--race-ink)',
            borderColor: '#0f172a',
            boxShadow: 'var(--shadow-fab)',
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
      <span className="text-[11px] leading-none whitespace-nowrap">{label}</span>
    </button>
  );
}

function DashboardVBarBtn({ activeTab, setTab, lastDashboardTab }) {
  const active = ['hub', 'corrida', 'ginasio', 'nutricao', 'corpo', 'holistica'].includes(activeTab);
  const activeColor = 'var(--accent)';

  return (
    <button
      onClick={() => { if (!active) setTab(lastDashboardTab || 'hub'); }}
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
      <span className="text-[11px] leading-none whitespace-nowrap">Dashboard</span>
    </button>
  );
}

// Pílula do menu do FAB (mock "FAB aberto"): fundo escuro, borda na cor do
// módulo, círculo cheio dessa cor com o glifo em tinta escura.
function FabItem({ label, tone, ink, icon, onClick }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className="flex items-center gap-[9px] min-h-[44px] rounded-full active:scale-95 transition-transform cursor-pointer"
      style={{ padding: '9px 16px 9px 12px', background: 'rgba(15,23,42,.92)', border: `1px solid var(--tint-${tone}-bd)`, boxShadow: '0 8px 22px rgba(0,0,0,.5)' }}
    >
      <span className="w-[26px] h-[26px] rounded-full flex items-center justify-center shrink-0" style={{ background: `var(--${tone})`, color: ink }}>
        {icon}
      </span>
      <span className="text-[13px] font-extrabold whitespace-nowrap" style={{ color: 'var(--text-1)' }}>{label}</span>
    </button>
  );
}
