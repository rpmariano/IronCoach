import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import { publicUrl } from '../../lib/utils';
import { Bot, LayoutGrid, Dumbbell, Plus, Camera, User, Calendar, LayoutDashboard, Trophy, Footprints, Droplets } from 'lucide-react';
import ReportIssueButton from '../shared/ReportIssueButton';
import BugNotificationsHandler from '../shared/BugNotificationsHandler';
import AppBackground from './AppBackground';
import WaterSheet from '../Home/WaterSheet';
import { useElasticPillIndicator } from '../../utils/useElasticPillIndicator';
import { useTabEnter } from '../../utils/useTabEnter';

/* Os separadores do Dashboard: qualquer um deles acende a coluna "Dashboard"
   da barra inferior. */
const DASHBOARD_TABS = ['hub', 'corrida', 'ginasio', 'nutricao', 'corpo', 'holistica'];

/* Índice de cada separador na minhoca da barra (0–3). Os ecrãs sem coluna
   própria (Perfil, Admin, registos) devolvem -1 e escondem a pílula em vez de
   a deixarem a apontar para um separador onde o atleta já não está. */
function navIndexFor(activeTab) {
  if (activeTab === 'home') return 0;
  if (activeTab === 'calendario') return 1;
  if (DASHBOARD_TABS.includes(activeTab)) return 2;
  if (activeTab === 'coach') return 3;
  return -1;
}

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

  // Minhoca da barra inferior — uma só pílula de 4px em gradiente, absoluta
  // no topo da nav, a deslizar entre os quatro separadores (ponto 4 do
  // handoff). Substitui o tracinho de 3px que cada botão pintava por baixo
  // de si. A duração é a da nav: min(950, 420 + 130·distância) ms, o valor
  // por omissão do hook.
  const navRef = useRef(null);
  const navIndex = navIndexFor(activeTab);
  const { indicatorStyle: navPill, setItemRef: setNavItemRef } =
    useElasticPillIndicator(navRef, navIndex);

  // "O conteúdo segue a pílula": o ecrã do separador novo entra com
  // translateX(±14px) → 0 em --dur-tab-content.
  const setContentRef = useTabEnter(navIndex);

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
        {/* Contentor do conteúdo: existe para o "conteúdo segue a pílula"
            (useTabEnter) ter onde reiniciar a animação sem remontar o ecrã. */}
        <div ref={setContentRef(navIndex)}>{children}</div>
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
            className="fixed left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2.5 w-max"
            style={{ bottom: 90 }}
            ref={fabRef}
          >
            <FabItem delayIndex={5}
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
            <FabItem delayIndex={4}
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
            <FabItem delayIndex={3} 
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
            <FabItem delayIndex={2} 
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
            <FabItem delayIndex={1} 
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
            <FabItem delayIndex={0}
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
        ref={navRef}
        data-testid="bottom-nav"
        className="fixed bottom-0 left-1/2 -translate-x-1/2 z-40 w-full max-w-md grid grid-cols-5 items-center pt-1.5 pb-2 border-t shadow-[0_-4px_20px_rgba(0,0,0,0.5)]"
        style={{
          // --nav-h (76px): a barra tem de medir o que a moldura dos mocks
          // reserva para ela, senão a ActionBar — que assenta a
          // --actionbar-bottom (76px) do fundo — flutua sobre um vão. Só com
          // os 44px do botão mais o padding a barra dava ~59px.
          minHeight: 'var(--nav-h)',
          background: 'var(--bg-nav)',
          backdropFilter: 'blur(var(--blur-chrome))',
          WebkitBackdropFilter: 'blur(var(--blur-chrome))',
          borderColor: 'var(--border-glass-strong)',
        }}
      >
        {/* A minhoca: uma só pílula de 4px, em gradiente e com brilho, no topo
            da barra. O tracinho de 3px por botão saiu — a pílula é a pista
            não-cromática do estado ativo (posição, não cor), e o aria-current
            de cada botão continua a dizê-lo a quem usa leitor de ecrã. */}
        <span
          aria-hidden="true"
          data-testid="nav-pill"
          style={{
            position: 'absolute',
            top: 0,
            left: navPill?.left ?? 0,
            width: navPill?.width ?? 0,
            height: 4,
            borderRadius: 'var(--radius-pill)',
            background: 'var(--grad-nav-pill)',
            boxShadow: 'var(--glow-pill)',
            opacity: navPill && navIndex >= 0 ? 1 : 0,
            pointerEvents: 'none',
          }}
        />

        <VBarBtn tab="home" icon={<LayoutGrid size={20} />} label="Início" activeTab={activeTab} setTab={setActiveTab} pillRef={setNavItemRef(0)} />
        <VBarBtn tab="calendario" icon={<Calendar size={20} />} label="Calendário" activeTab={activeTab} setTab={setActiveTab} pillRef={setNavItemRef(1)} />

        {/* Espaço central reservado na grelha */}
        <div aria-hidden="true" className="h-full" />

        <DashboardVBarBtn activeTab={activeTab} setTab={setActiveTab} lastDashboardTab={lastDashboardTab} pillRef={setNavItemRef(2)} />
        <VBarBtn tab="coach" icon={<Bot size={20} />} label="Coach" activeTab={activeTab} setTab={setActiveTab} pillRef={setNavItemRef(3)} />

        {/* Botão "+" flutuante — filho direto do nav para top: -22px ser relativo ao topo da barra */}
        <button
          ref={fabBtnRef}
          onClick={(e) => {
            e.stopPropagation();
            setFabOpen(v => !v);
          }}
          className={`${fabOpen ? 'fab-open ' : ''}absolute left-1/2 -translate-x-1/2 w-14 h-14 rounded-full flex items-center justify-center border-[4px] z-50 cursor-pointer`}
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
          {/* Ponto 9: o mesmo "+" a rodar 45° (vira "×") em --dur-tap, em vez
              de trocar de glifo — ver `.fab-icon` em globals.css. */}
          <Plus size={24} className="fab-icon stroke-[2.5]" />
        </button>
      </nav>
    </div>
  );
}

/* Âncora de 26×4 no topo do botão: é o que a minhoca mede. A pílula dos mocks
   tem 26px (não a largura do botão), por isso o hook precisa de uma caixa
   real com essa medida em vez de se calcular a partir do botão. */
function NavPillAnchor({ pillRef }) {
  return (
    <span
      ref={pillRef}
      aria-hidden="true"
      className="absolute top-0 left-1/2 -translate-x-1/2 w-[26px] h-[4px]"
      style={{ pointerEvents: 'none' }}
    />
  );
}

function VBarBtn({ tab, icon, label, activeTab, setTab, pillRef }) {
  const active = activeTab === tab;

  return (
    <button
      onClick={() => setTab(tab)}
      data-vert={tab}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className="vbar-btn relative w-full min-h-[44px] flex flex-col items-center justify-center gap-1 py-1 active:scale-95 transition cursor-pointer"
      // Todos os separadores em --brand, ativo incluído — é o que os 24
      // ecrãs dos mocks mostram. O estado ativo lê-se pela minhoca (posição
      // e forma, não cor) e pelo aria-current.
      style={{ color: 'var(--brand)', fontWeight: active ? 700 : 500 }}
    >
      <NavPillAnchor pillRef={pillRef} />
      {icon}
      <span className="text-[11px] leading-none whitespace-nowrap">{label}</span>
    </button>
  );
}

function DashboardVBarBtn({ activeTab, setTab, lastDashboardTab, pillRef }) {
  const active = DASHBOARD_TABS.includes(activeTab);

  return (
    <button
      onClick={() => { if (!active) setTab(lastDashboardTab || 'hub'); }}
      data-vert="dashboard"
      aria-label="Dashboard"
      aria-current={active ? 'page' : undefined}
      className="vbar-btn relative w-full min-h-[44px] flex flex-col items-center justify-center gap-1 py-1 active:scale-95 transition cursor-pointer"
      style={{ color: 'var(--brand)', fontWeight: active ? 700 : 500 }}
    >
      <NavPillAnchor pillRef={pillRef} />
      <LayoutDashboard size={20} />
      <span className="text-[11px] leading-none whitespace-nowrap">Dashboard</span>
    </button>
  );
}

// Pílula do menu do FAB (mock "FAB aberto"): fundo escuro, borda na cor do
// módulo, círculo cheio dessa cor com o glifo em tinta escura.
function FabItem({ label, tone, ink, icon, onClick, delayIndex = 0 }) {
  return (
    <button
      onClick={onClick}
      type="button"
      /* `fab-item` (globals.css): entra de baixo para cima com o
         desfasamento do ponto 9; o scale .98 do toque vem da regra global. */
      className="fab-item flex items-center gap-[9px] min-h-[44px] rounded-full cursor-pointer"
      style={{ '--fab-i': delayIndex, padding: '9px 16px 9px 12px', background: 'rgba(15,23,42,.92)', border: `1px solid var(--tint-${tone}-bd)`, boxShadow: '0 8px 22px rgba(0,0,0,.5)' }}
    >
      <span className="w-[26px] h-[26px] rounded-full flex items-center justify-center shrink-0" style={{ background: `var(--${tone})`, color: ink }}>
        {icon}
      </span>
      <span className="text-[13px] font-extrabold whitespace-nowrap" style={{ color: 'var(--text-1)' }}>{label}</span>
    </button>
  );
}
