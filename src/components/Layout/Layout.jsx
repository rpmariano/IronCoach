import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../../store';
import { House, Dumbbell, Plus, Camera, User, Calendar, LayoutDashboard, Trophy, Footprints, Droplets, Calculator, X, MessageCircle } from 'lucide-react';
import CarolIcon from '../Coach/CarolIcon';
import ReportIssueButton from '../shared/ReportIssueButton';
import BugNotificationsHandler from '../shared/BugNotificationsHandler';
import BrandMark from '../shared/BrandMark';
import AppBackground from './AppBackground';
import { scrollToTop as scrollMainToTop, isDashboardSwipe } from '../../utils/scrollToTop';
import WaterSheet from '../Home/WaterSheet';
import { useFeature } from '../../utils/features';
import PaceCalculatorSheet from '../shared/PaceCalculatorSheet';
import { useElasticPillIndicator } from '../../utils/useElasticPillIndicator';
import { useTabEnter } from '../../utils/useTabEnter';
import { installSoftKeyboardWatcher } from '../../utils/softKeyboard';
import { useDesignV2 } from '../../utils/designV2';

/* Os separadores do Dashboard: qualquer um deles acende a coluna "Dashboard"
   da barra inferior. */
const DASHBOARD_TABS = ['hub', 'corrida', 'ginasio', 'nutricao', 'corpo', 'holistica'];

/* Índice de cada separador na minhoca da barra (0–3). Os ecrãs sem coluna
   própria (Perfil, Calendário, Admin, registos) devolvem -1 e escondem a
   pílula em vez de a deixarem a apontar para um separador onde o atleta já
   não está. A barra é Início · Provas · Evolução · Carol (nomes desde 2026-09-24)
   (opção A de "Onde vivem as provas"): a prova é o grande objetivo da app e
   ganhou coluna; o Calendário passou para o cabeçalho. */
/* Design v2 (P2b, 2026-11-25): o separador aceso é o do ecrã à frente, não o separador por baixo.
   Um registo aberto por cima (openCreationMode) não pertence à Evolução por estar debaixo de
   'corrida': o registo da prova e a ficha da prova são das Provas; os outros registos não acendem
   nenhum. Devolve null quando não há separador certo. */
export function navTabV2(activeTab, openCreationMode, runFromRace) {
  if (openCreationMode === 'race') return 'provas';
  if (openCreationMode === 'run' && runFromRace) return 'provas';
  if (openCreationMode) return null;
  return activeTab;
}

function navIndexFor(activeTab) {
  if (activeTab === 'home') return 0;
  if (activeTab === 'provas') return 1;
  if (DASHBOARD_TABS.includes(activeTab)) return 2;
  if (activeTab === 'coach') return 3;
  return -1;
}

// Círculo de ícone com glifo branco: usa o mesmo gradiente -from → -to dos
// dashboards de cada módulo. O tom -to sozinho é demasiado claro para o
// ícone branco ter contraste suficiente.
const moduleGradient = (mod) =>
  `linear-gradient(135deg, var(--mod-${mod}-from), var(--mod-${mod}-to))`;

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** «qua, 25 nov» — a data do cabeçalho no Design v2. */
export function shortDatePt(d) {
  return `${DIAS_CURTOS[d.getDay()]}, ${d.getDate()} ${MESES_CURTOS[d.getMonth()]}`;
}

export default function Layout({ children }) {
  /* Seletores por campo, não o store inteiro (2026-10-04): `useAppStore()` sem
     seletor subscreve tudo, e cada alteração — um deslize entre separadores da
     Evolução mexe em `lastDashboardTab`, um recarregamento de dados cria
     listas novas — redesenhava o Layout e, com ele, todos os filhos. Cada
     campo só redesenha quando é ele que muda. (`profile` vinha na
     desestruturação sem ser usado: tirado, deixava-o redesenhar o Layout a
     cada recarga do perfil.) As ações são estáveis no zustand. */
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const isAdmin = useAppStore((s) => s.isAdmin);
  const openCreationMode = useAppStore((s) => s.openCreationMode);
  const setOpenCreationMode = useAppStore((s) => s.setOpenCreationMode);
  const lastDashboardTab = useAppStore((s) => s.lastDashboardTab);
  const setWaterSheetOpen = useAppStore((s) => s.setWaterSheetOpen);
  // A água tem interruptor (v1 lite): desligada, sai do FAB e a persiana não monta.
  const waterOn = useFeature('water');
  const editingRunId = useAppStore((s) => s.editingRunId);
  const editingRaceId = useAppStore((s) => s.editingRaceId);
  const runRacePrefill = useAppStore((s) => s.runRacePrefill);
  // O Design v2: só marca o cabeçalho da app (data-app-header) para o v2.css o estilizar.
  const v2 = useDesignV2();
  /* O registo em modo prova consome o runRacePrefill ao montar (RunRegistration), por isso lembra-se
     aqui, enquanto o mesmo registo estiver aberto, que veio de uma prova. */
  const runFromRaceRef = useRef(false);
  if (openCreationMode !== 'run') runFromRaceRef.current = false;
  else if (runRacePrefill?.raceId) runFromRaceRef.current = true;
  // O separador que a barra mostra aceso: na v1 o activeTab, como sempre; no v2 o do ecrã à frente.
  const navTab = v2 ? navTabV2(activeTab, openCreationMode, runFromRaceRef.current) : activeTab;
  const [fabOpen, setFabOpen] = useState(false);
  const fabRef = useRef(null);
  const fabBtnRef = useRef(null);
  const mainRef = useRef(null);
  const lastLogoClickAt = useRef(0);
  // Cada toque no logótipo toca um ciclo da animação da marca (BrandMark).
  const [logoPlays, setLogoPlays] = useState(0);
  /* A calculadora de ritmo é uma ferramenta, não um ecrã: não muda de
     separador nem entra no histórico de navegação — abre por cima do que
     estiver à frente e fecha-se sem deixar rasto. Por isso vive em estado
     local do Layout e não no store, ao contrário da persiana da água (que o
     FAB também abre, de outro sítio). */
  const [calculadoraAberta, setCalculadoraAberta] = useState(false);

  // Minhoca da barra inferior — uma só pílula de 4px em gradiente, absoluta
  // no topo da nav, a deslizar entre os quatro separadores (ponto 4 do
  // handoff). Substitui o tracinho de 3px que cada botão pintava por baixo
  // de si. A duração é a da nav: min(1300, 650 + 170·distância) ms, o valor
  // por omissão do hook.
  const navRef = useRef(null);
  const navIndex = navIndexFor(navTab);
  const { indicatorStyle: navPill, setItemRef: setNavItemRef } =
    useElasticPillIndicator(navRef, navIndex);

  // "O conteúdo segue a pílula": o ecrã do separador novo entra com
  // translateX(±14px) → 0 em --dur-tab-content.
  const setContentRef = useTabEnter(navIndex);

  // Teclado aberto → a barra de baixo, o "+" e o botão dos bugs saem da
  // frente da caixa de texto (ver utils/softKeyboard.js e globals.css).
  useEffect(() => installSoftKeyboardWatcher(), []);

  const scrollToTop = useCallback(() => scrollMainToTop(mainRef.current), []);

  const prevScreenRef = useRef(null);
  useEffect(() => {
    const prev = prevScreenRef.current;
    prevScreenRef.current = { activeTab, openCreationMode, editingRunId, editingRaceId };

    // Quando se muda de tela, a próxima é apresentada com scroll up — menos
    // o chat (Coach) e o deslize entre separadores da Evolução, onde só muda
    // o separador (ver utils/scrollToTop.js).
    const onlySwipedDashboard = prev
      && isDashboardSwipe(prev.activeTab, activeTab)
      && prev.openCreationMode === openCreationMode
      && prev.editingRunId === editingRunId
      && prev.editingRaceId === editingRaceId;
    if (activeTab !== 'coach' && !onlySwipedDashboard) {
      scrollToTop();
      requestAnimationFrame(() => {
        scrollToTop();
        requestAnimationFrame(scrollToTop);
      });
    }
  }, [activeTab, openCreationMode, editingRunId, editingRaceId, scrollToTop]);

  const todayLabel = new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
  // No v2 a data cabe numa linha a 375 px: «qua, 25 nov» (a longa partia em duas).
  const todayLabelV2 = shortDatePt(new Date());

  const handleLogoClick = () => {
    setLogoPlays((n) => n + 1);
    if (!isAdmin) { goTab('home'); return; }
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
  /* Design v2 (2.ª crítica, 2026-11-25): o + abre o registo por cima do ecrã onde se está, sem
     trocar de separador antes; fechar volta a esse ecrã. Com um formulário por gravar à frente
     (navGuard), o caminho de sempre, que pergunta antes de sair. */
  const goRegister = (tab, mode) => {
    if (v2 && !useAppStore.getState().navGuard) {
      useAppStore.setState({ runRegistrationReturn: null, editingRunId: null });
      setOpenCreationMode(mode);
      return;
    }
    if (setActiveTab('calendario')) setOpenCreationMode(mode);
  };

  /* A barra inferior fecha o ecrã "O plano" (openCreationMode 'plano').
     É só leitura e abre por cima do separador — sem isto, tocar em Home
     (o separador onde já se estava) não fazia nada e tocar noutro mudava
     o separador por baixo com o plano ainda a tapar tudo: o atleta ficava
     preso nele (relato 2026-09-19). Os registos não entram aqui: têm
     rascunho e saem pelo próprio botão ou pelo voltar do telemóvel. */
  const goTab = (tab) => {
    if (openCreationMode === 'plano') {
      setOpenCreationMode(null);
      if (tab === activeTab) return true;
    }
    /* Design v2: tocar no separador ativo, com um registo ou o hub da prova por cima, volta à raiz
       dele. Um registo com alterações pergunta antes (o navGuard dele). */
    if (v2 && tab === activeTab && openCreationMode) {
      const guard = useAppStore.getState().navGuard;
      if (guard && !guard(tab)) return false;
      useAppStore.getState().resetToTabRootV2();
      return true;
    }
    return setActiveTab(tab);
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
        {/* data-app-header só com o v2 (o v2.css estiliza ESTE cabeçalho, não os <header> dos ecrãs);
            desligado, o atributo não existe e o DOM é o de sempre. */}
        <header data-app-header={v2 ? '' : undefined} className="px-4 pb-3 flex items-center justify-between" style={{ paddingTop: 'max(16px, env(safe-area-inset-top, 0px))' }}>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="IronCoach, ir para o Início" onClick={handleLogoClick} className="tap-44 flex items-center justify-center -ml-1 rounded-xl active:scale-95 transition">
              <BrandMark variant="icon" playOnce={logoPlays} size={36} className="rounded-xl" />
            </button>
            <div>
              {/* No v2 o h1 é o título de cada ecrã (Provas, Evolução, Calendário, Perfil): a marca do
                  cabeçalho passa a texto, para haver um só h1 por ecrã. Na v1, o h1 de sempre. */}
              {v2 ? (
                <p className="v2-app-brand text-base font-bold tracking-tight leading-none" style={{ color: 'var(--brand)' }}>IronCoach</p>
              ) : (
                <h1 className="text-base font-bold tracking-tight leading-none" style={{ color: 'var(--brand)' }}>IronCoach</h1>
              )}
              <p className="text-[11px] leading-none mt-1" style={{ color: 'var(--brd-700)' }}>{v2 ? todayLabelV2 : todayLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Notificações de bug reports — só se renderiza a si própria
                quando há mensagens por ler (ver BugNotificationsHandler) */}
            <BugNotificationsHandler />
            {/* O Calendário saiu da barra para aqui (2026-09-13): continua a um
                toque, mas a barra ficou para o que a app é. */}
            <HeaderIconBtn label="Calendário" active={activeTab === 'calendario'} onClick={() => setActiveTab('calendario')}>
              <Calendar size={18} />
            </HeaderIconBtn>
            {/* Calculadora de ritmo: à direita do Calendário (pedido do
                utilizador, 2026-09-23). Não navega — abre uma persiana e
                devolve o atleta ao sítio onde estava. */}
            <HeaderIconBtn label="Calculadora de ritmo" active={calculadoraAberta} onClick={() => setCalculadoraAberta(true)}>
              <Calculator size={18} />
            </HeaderIconBtn>
            {/* O Perfil deixou o âmbar: o âmbar é só da prova. */}
            <HeaderIconBtn label="Perfil" active={activeTab === 'perfil'} onClick={() => setActiveTab('perfil')}>
              <User size={18} />
            </HeaderIconBtn>
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
      {waterOn && <WaterSheet />}
      {/* Quem monta controla a existência; a Sheet trata da saída animada e
          do Escape (pilha partilhada), por isso fecha-se por onClose. */}
      {calculadoraAberta && <PaceCalculatorSheet onClose={() => setCalculadoraAberta(false)} />}

      {/* Design v2: o menu do «+» é uma folha de baixo, com linhas planas (FabSheetV2). */}
      {fabOpen && v2 && (
        <FabSheetV2
          sheetRef={fabRef}
          returnFocusRef={fabBtnRef}
          onClose={closeFab}
          items={[
            { key: 'run', label: 'Nova corrida', icon: <Footprints size={18} />, color: 'var(--run)', go: () => goRegister('corrida', 'run') },
            { key: 'meal', label: 'Registar refeição', icon: <Camera size={18} />, color: 'var(--nutrition)', go: () => goRegister('nutricao', 'meal') },
            { key: 'workout', label: 'Novo treino', icon: <Dumbbell size={18} />, color: 'var(--gym)', go: () => goRegister('ginasio', 'workout') },
            { key: 'assessment', label: 'Nova avaliação', icon: <User size={18} />, color: 'var(--body)', go: () => goRegister('corpo', 'assessment') },
            { key: 'race', label: 'Nova prova', icon: <Trophy size={18} />, color: 'var(--race)', go: () => goRegister(activeTab, 'race') },
            ...(waterOn ? [{ key: 'water', label: 'Registar água', icon: <Droplets size={18} />, color: 'var(--neon-agua)', go: () => setWaterSheetOpen(true) }] : []),
          ]}
        />
      )}

      {/* FAB Backdrop & Menu — abre sobre o botão "+" */}
      {fabOpen && !v2 && (
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
            style={{ bottom: 'calc(90px + env(safe-area-inset-bottom, 0px))' }}
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
              ink="var(--nutrition-ink)"
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
              ink="var(--body-ink)"
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
              ink="var(--run-ink)"
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
              ink="var(--gym-ink)"
              icon={<Dumbbell size={14} />} 
              onClick={(e) => { 
                e.stopPropagation(); 
                closeFab(); 
                goRegister('ginasio', 'workout');
              }} 
            />
            {/* Água: saiu do cartão do Início (a órbita é só leitura —
                auditoria 2026-09-09, achado 7) e regista-se aqui. */}
            {waterOn && <FabItem delayIndex={0}
              label="Registar água"
              tone="run"
              ink="var(--run-ink)"
              icon={<Droplets size={14} />}
              onClick={(e) => {
                e.stopPropagation();
                closeFab();
                setWaterSheetOpen(true);
              }}
            />}
          </div>
        </>
      )}

      {/* Barra inferior — 5 colunas + "+" central elevado */}
      <nav
        ref={navRef}
        data-testid="bottom-nav"
        className="hide-when-keyboard fixed bottom-0 left-1/2 -translate-x-1/2 z-40 w-full max-w-md grid grid-cols-5 items-center pt-1.5 border-t shadow-[0_-4px_20px_rgba(0,0,0,0.5)]"
        style={{
          // --nav-h (76px): a barra tem de medir o que a moldura dos mocks
          // reserva para ela, senão a ActionBar — que assenta a
          // --actionbar-bottom (76px) do fundo — flutua sobre um vão. Só com
          // os 44px do botão mais o padding a barra dava ~59px.
          // Safe-area: o index.html pede viewport-fit=cover, por isso a
          // barra chega ao fundo físico do ecrã e, num telemóvel com
          // indicador de gestos, os ícones ficavam por baixo dele. O
          // max()/env() só acrescenta onde há inset — num ecrã sem notch
          // env() é 0 e a barra mede os mesmos 76px de sempre.
          minHeight: 'calc(var(--nav-h) + env(safe-area-inset-bottom, 0px))',
          paddingBottom: 'max(8px, env(safe-area-inset-bottom, 0px))',
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

        {/* Os nomes em português (2026-09-24): Início, Provas, Evolução e Carol
            — o separador dela tem o nome e o rosto dela (CarolIcon), não um
            robô. As chaves internas (home, dashboard, coach) não mudam. */}
        <VBarBtn tab="home" icon={<House size={20} />} label="Início" activeTab={navTab} setTab={goTab} pillRef={setNavItemRef(0)} />
        <VBarBtn tab="provas" icon={<Trophy size={20} />} label="Provas" activeTab={navTab} setTab={goTab} pillRef={setNavItemRef(1)} />

        {/* Espaço central reservado na grelha */}
        <div aria-hidden="true" className="h-full" />

        <DashboardVBarBtn activeTab={navTab} setTab={goTab} lastDashboardTab={lastDashboardTab} pillRef={setNavItemRef(2)} />
        {/* No v2 (pedido do Rui, 25/11) o separador da Carol leva o balão do Lucide, como os outros
            ícones da barra; o nome fica «Carol». Na v1, a cara dela (CarolIcon). */}
        <VBarBtn tab="coach" icon={v2 ? <MessageCircle size={20} data-testid="nav-carol-icon-v2" /> : <CarolIcon size={20} />} label="Carol" activeTab={navTab} setTab={goTab} pillRef={setNavItemRef(3)} />

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

/* Botão redondo do cabeçalho (Calendário, Perfil): neutro, na cor da marca,
   44px. O ativo acende-se no mesmo tom, sem âmbar — o âmbar é da prova. */
function HeaderIconBtn({ label, active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className="flex items-center justify-center rounded-full active:scale-95 transition shrink-0"
      style={{
        width: 44,
        height: 44,
        color: 'var(--brand)',
        background: active ? 'rgba(127,179,199,.16)' : 'rgba(255,255,255,.05)',
        border: `1px solid ${active ? 'rgba(127,179,199,.55)' : 'var(--border-glass-strong)'}`,
      }}
    >
      {children}
    </button>
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
      onClick={() => setTab(active ? activeTab : (lastDashboardTab || 'hub'))}
      data-vert="dashboard"
      aria-label="Evolução"
      aria-current={active ? 'page' : undefined}
      className="vbar-btn relative w-full min-h-[44px] flex flex-col items-center justify-center gap-1 py-1 active:scale-95 transition cursor-pointer"
      style={{ color: 'var(--brand)', fontWeight: active ? 700 : 500 }}
    >
      <NavPillAnchor pillRef={pillRef} />
      <LayoutDashboard size={20} />
      <span className="text-[11px] leading-none whitespace-nowrap">Evolução</span>
    </button>
  );
}

/* O menu do «+» no Design v2 (pedido do Rui, 25/11): uma folha de baixo, no painel do v2, com
   linhas planas de 44 px e um ícone pequeno à esquerda; a cor do módulo só no ícone. A entrada é a
   do menu de sempre (.fab-item, de baixo para cima, desfasada), que já respeita o
   prefers-reduced-motion. O ✕ fecha; o «+» da barra também, como antes. */
function FabSheetV2({ items, onClose, sheetRef, returnFocusRef }) {
  /* O foco (revisão de 2026-11-25): ao abrir vai para a primeira linha; fica preso dentro da folha
     (aria-modal) enquanto está aberta; o Escape fecha; ao fechar volta ao «+». */
  useEffect(() => {
    const sheet = sheetRef?.current;
    const focusables = () => (sheet ? [...sheet.querySelectorAll('button:not([disabled])')] : []);
    focusables()[1]?.focus(); // [0] é o ✕; a primeira linha é a ação que se procura
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && (document.activeElement === first || !sheet.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !sheet.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const back = returnFocusRef?.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      back?.focus?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="fixed inset-0 z-40 fade-in v2-fab-scrim" onClick={(e) => { e.stopPropagation(); onClose(); }} />
      <div ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="v2-fab-title" className="v2-fab-sheet" data-testid="fab-sheet-v2">
        <div className="v2-fab-head">
          <h2 id="v2-fab-title">Registar</h2>
          <button type="button" className="v2-fab-close" aria-label="Fechar" onClick={(e) => { e.stopPropagation(); onClose(); }}>
            <X size={18} />
          </button>
        </div>
        <ul>
          {items.map((it, i) => (
            <li key={it.key} className="fab-item" style={{ '--fab-i': items.length - 1 - i }}>
              <button
                type="button"
                className="v2-fab-row"
                data-testid={`fab-v2-${it.key}`}
                onClick={(e) => { e.stopPropagation(); onClose(); it.go(); }}
              >
                <span className="v2-fab-ic" style={{ color: it.color }} aria-hidden="true">{it.icon}</span>
                <span>{it.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
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
