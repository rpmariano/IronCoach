import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './coachBubbles';
import { useReducedMotion } from './useReducedMotion';
import { TabPageContext, TabReadyContext, useTabSettled } from './settledTab';

/**
 * Animar quando se VÊ, não quando monta (pedido 2026-09-13).
 *
 * Até aqui as animações do ponto 9 (barras a crescer, números a contar,
 * anéis a desenhar) corriam "uma vez por sessão", à montagem
 * (`useIntroAnimation`). Na prática não se viam: a PWA quase nunca fecha a
 * sessão, e o Dashboard monta os cinco módulos de uma vez no carrossel —
 * os gráficos animavam fora do ecrã e, quando o atleta deslizava para lá,
 * já estavam quietos.
 *
 * A regra passa a ser:
 * - o elemento fica transparente (`opacity: 0`, sem mexer no layout e sem
 *   sair da ordem do Tab nem da árvore de acessibilidade: focar um botão lá
 *   dentro faz scroll até ele e revela-o) até entrar no ecrã, e a animação
 *   corre nesse momento;
 * - `animate` só fica ligado durante a janela da animação
 *   (REVEAL_ANIMATION_WINDOW_MS) depois de cada aparecimento: mudar o
 *   período ou trocar de prova nas setas atualiza os números sem os voltar
 *   a contar de zero;
 * - volta a correr quando o elemento SAI DE LADO e regressa — é o que
 *   acontece ao trocar de separador no carrossel do Dashboard. Sair por
 *   cima ou por baixo (scroll) não re-arma: contar de novo a cada scroll
 *   cansa;
 * - trocar de ecrã na barra desmonta o ecrã, e voltar monta-o de novo,
 *   por isso anima outra vez;
 * - com `prefers-reduced-motion`, ou sem IntersectionObserver (jsdom dos
 *   testes, browsers antigos), nada se esconde e nada anima.
 *
 * Uso: pôr `ref` e `style` no elemento a observar, `key={playKey}` no que
 * tem de recomeçar a animação (um gráfico do Chart.js só anima ao montar),
 * e `animate` onde se decide se anima.
 *
 * ── Dois modos (2026-10-04, F5 — plano §2.1) ──────────────────────────────
 * O que está acima é o modo SEM `TabPageContext` — Início (StatusCard,
 * RaceCard) e Perfil (BadgesCard no carrossel do Perfil, que continua a
 * rearmar por sair de lado; BadgesPorGanharSheet). Fica exatamente igual.
 *
 * Dentro do carrossel da Evolução (Dashboard.jsx põe um `TabPageContext` por
 * página) o gatilho passa a ser o do plano:
 *   revelado = à vista && separador ASSENTE && dados do separador prontos
 * - "à vista" = `intersectionRect.height` ≥ 55 % da altura do que se observa
 *   (a ÁREA do gráfico, não o cartão). O `intersectionRect` já vem cortado
 *   pelos antepassados: a Análise Cruzada fechada (altura 0) e as páginas
 *   cortadas pelo carrossel nunca contam. A largura sai do critério — o lado
 *   é o separador assente que decide (settledTab.js);
 * - "pronto" = `TabReadyContext` (o Dashboard calcula-o com `sliceReady` das
 *   fatias do separador) E a opção `ready` de quem chama;
 * - `seen` liga no 1.º reveal e nunca desliga (é o que deixa criar o canvas
 *   uma vez só); `playKey` sobe a cada reveal;
 * - rearma quando o separador deixa de estar assente — mas só ao fim de
 *   QUICK_RETURN_MS fora dele e já fora da vista: num vai-e-vem rápido
 *   (< ~3 s, decisão D4) o gráfico nunca chega a voltar a zero e não
 *   repete. O scroll vertical nunca rearma;
 * - com reduced-motion: `seen` logo, `animate` sempre falso, nada escondido —
 *   mas continua a observar, porque a criação dos canvas continua a esperar
 *   pela proximidade (ChartFrame).
 */

/** Quanto tempo `animate` fica ligado depois de aparecer: cobre a contagem
 *  (--dur-count, 1400ms) e as barras (--dur-bars 550ms + desfasamento). */
export const REVEAL_ANIMATION_WINDOW_MS = 1600;

/** Quanto do elemento tem de estar à vista para contar como "visto". */
export const REVEAL_MIN_VISIBLE_PX = 80;
export const REVEAL_MIN_VISIBLE_RATIO = 0.3;

/** Modo separador: fração da altura (limitada à do ecrã) que tem de estar à
 *  vista. Com os 80 px do modo antigo, num cartão o gráfico começava a crescer
 *  com uns 20 px da área à vista — o movimento acontecia abaixo da dobra. */
export const REVEAL_TAB_MIN_RATIO = 0.55;
/** Modo separador: voltar ao separador antes disto não repete a entrada. */
export const QUICK_RETURN_MS = 3000;

const THRESHOLDS = [0, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1];
// Passos finos: o IntersectionObserver só chama ao cruzar um limiar, e o
// critério é por altura (55 % do que cabe no ecrã), não por um rácio fixo.
export const TAB_THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20);

/**
 * O critério "à vista" do modo separador, para uma entrada do
 * IntersectionObserver: `{ out, inView }`. Exportado (2026-10-05, A5) para a
 * ChartFrame usar o MESMO critério quando um gráfico aparece depois de a
 * moldura já estar revelada.
 */
export function tabEntryVisibility(entry) {
  const box = entry?.boundingClientRect || {};
  const seenRect = entry?.intersectionRect || {};
  const viewHeight = entry?.rootBounds?.height
    || (typeof window !== 'undefined' ? window.innerHeight : 0)
    || (typeof document !== 'undefined' ? document.documentElement?.clientHeight : 0) || 0;
  const height = box.height || 0;
  const need = Math.min(height, viewHeight || height) * REVEAL_TAB_MIN_RATIO;
  const seenHeight = seenRect.height || 0;
  const seenWidth = seenRect.width ?? box.width ?? 1;
  // Uma página vizinha encostada à margem do carrossel pode vir como
  // "a intersetar" com largura 0 (interseção de aresta) — é fora.
  const out = !entry?.isIntersecting || seenHeight <= 0 || !(seenWidth > 0);
  return { out, inView: !out && seenHeight >= need };
}

export function useRevealAnimation(options = {}) {
  const page = useContext(TabPageContext);
  // O modo não muda durante a vida do componente: um componente não passa de
  // fora para dentro do carrossel sem remontar (o Provider muda a árvore). Por
  // isso os dois ramos nunca trocam de ordem de hooks entre renders.
  return page == null ? useLegacyReveal(options) : useTabReveal(options);
}

/** Modo antigo (sem `TabPageContext`) — sem alterações desde 2026-09-13. */
function useLegacyReveal({ enabled = true } = {}) {
  const supported = typeof window !== 'undefined' && typeof window.IntersectionObserver === 'function';
  const active = enabled && supported && !prefersReducedMotion();

  // O ref só guarda o elemento quando há o que observar. Guardá-lo sempre
  // forçava um segundo render logo a seguir à montagem — inofensivo no
  // browser, mas no jsdom o Chart.js tentava atualizar um canvas dado como
  // desligado e rebentava (NutritionDashboard.test, 2026-09-13). Inativo,
  // o componente fica exatamente como era.
  const activeRef = useRef(active);
  activeRef.current = active;
  const [node, setNode] = useState(null);
  const ref = useCallback((el) => { if (activeRef.current) setNode(el); }, []);

  const [state, setState] = useState(() => ({ shown: !active, play: 0 }));
  // O `play` cuja animação já acabou. Enquanto for diferente do `play` atual,
  // anima; e como é o `play` que sobe, o que remonta com o novo `key` monta
  // já a animar, no mesmo render.
  const [settledPlay, setSettledPlay] = useState(0);

  useEffect(() => {
    if (!active || state.play === 0) return undefined;
    const timer = setTimeout(() => setSettledPlay(state.play), REVEAL_ANIMATION_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [active, state.play]);

  useEffect(() => {
    if (!active || !node) return undefined;
    const observer = new window.IntersectionObserver((entries) => {
      for (const entry of entries) {
        const box = entry.boundingClientRect;
        const seen = entry.intersectionRect;
        // Altura E largura: a página seguinte do carrossel do Dashboard
        // espreita uns 16px na margem, e com a altura toda "à vista" contava
        // como vista — o gráfico animava antes de o atleta deslizar para lá.
        const needHeight = Math.min(REVEAL_MIN_VISIBLE_PX, box.height * REVEAL_MIN_VISIBLE_RATIO);
        const needWidth = Math.min(REVEAL_MIN_VISIBLE_PX, (box.width || 0) * REVEAL_MIN_VISIBLE_RATIO);
        const seenWidth = seen.width ?? box.width ?? 0;
        if (entry.isIntersecting && seen.height >= needHeight && seenWidth >= needWidth) {
          setState((s) => (s.shown ? s : { shown: true, play: s.play + 1 }));
        } else {
          // Re-arma quando saiu DE LADO, que é a troca de separador no
          // carrossel. Não basta comparar com a largura da janela: no desktop
          // a coluna é estreita e centrada, e a página vizinha fica dentro.
          // - A espreitar (a lasca de 16px na margem): o corte é lateral
          //   quando o que se vê começa depois ou acaba antes da caixa.
          // - Fora por completo: se a caixa está dentro da janela na vertical,
          //   só pode ter sido cortada de lado. Fora por cima ou por baixo é
          //   scroll, e isso não re-arma.
          const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
          const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
          const seenLeft = seen.left ?? box.left;
          const seenRight = seen.right ?? box.right;
          const sliverSideways = entry.isIntersecting && seenWidth < needWidth
            && (seenLeft > box.left + 1 || seenRight < box.right - 1 || box.left < 0 || box.right > viewportWidth);
          const verticallyInView = (box.bottom ?? 0) > 0 && (box.top ?? viewportHeight) < viewportHeight;
          const goneSideways = !entry.isIntersecting && verticallyInView;
          if (sliverSideways || goneSideways) setState((s) => (s.shown ? { shown: false, play: s.play } : s));
        }
      }
    }, { threshold: THRESHOLDS });
    observer.observe(node);
    return () => observer.disconnect();
  }, [active, node]);

  return {
    ref,
    playKey: state.play,
    animate: active && state.play > 0 && settledPlay !== state.play,
    style: active && !state.shown ? { opacity: 0 } : undefined,
  };
}

/**
 * Modo separador (dentro do carrossel da Evolução). Opções:
 *   enabled  false desliga (o ChartFrame desliga o seu quando o gráfico lhe
 *            passa o próprio `reveal`)
 *   ready    false segura o reveal (soma-se ao TabReadyContext da página) —
 *            para um gráfico que espera por uma fatia que o separador não lista
 */
function useTabReveal({ enabled = true, ready: readyOption = true } = {}) {
  const supported = typeof window !== 'undefined' && typeof window.IntersectionObserver === 'function';
  // Observar (saber o que está à vista) e animar são coisas separadas: com
  // reduced-motion não se anima, mas os canvas continuam a ser criados só
  // quando perto — e para isso é preciso continuar a observar.
  const observing = enabled && supported;
  const reduced = useReducedMotion();
  const motion = observing && !reduced;
  const settled = useTabSettled();
  const tabReady = useContext(TabReadyContext);
  const ready = tabReady !== false && readyOption !== false;

  // Como no modo antigo: sem nada a observar, o ref nem guarda o elemento
  // (evita o 2.º render logo à montagem que rebentava o Chart.js no jsdom).
  const observingRef = useRef(observing);
  observingRef.current = observing;
  const [node, setNode] = useState(null);
  const ref = useCallback((el) => { if (observingRef.current) setNode(el); }, []);

  // `inView` é ESTADO (não só uma ref): uma entrada do observer que chegue
  // depois de o separador assentar tem de poder revelar sozinha.
  const [inView, setInView] = useState(false);
  // Fora da vista por completo (rácio 0) — a condição para rearmar: nunca se
  // devolve a zero um gráfico que ainda se vê, nem que seja de raspão.
  const outRef = useRef(true);
  const settledRef = useRef(settled);
  settledRef.current = settled;
  const pendingRearmRef = useRef(false);
  const pendingUnreadyRef = useRef(false);

  const [st, setSt] = useState({ shown: false, seen: false, play: 0 });
  const [settledPlay, setSettledPlay] = useState(0);

  // Revela no próprio render em que as três condições se juntam (e não num
  // efeito): quem desenha o gráfico recebe já `seen`/`playKey` novos e monta o
  // canvas no mesmo commit — o construtor do Chart.js anima a partir da base.
  if (motion && !st.shown && inView && settled && ready) {
    setSt((s) => (s.shown ? s : { shown: true, seen: true, play: s.play + 1 }));
  }

  const rearm = useCallback(() => {
    pendingRearmRef.current = false;
    pendingUnreadyRef.current = false;
    setSt((s) => (s.shown ? { ...s, shown: false } : s));
  }, []);

  /* 2026-10-05 (A7): quem chama baixou o seu `ready` depois de revelar — é a
     Análise Cruzada a fechar (`ready={opened && …}`). Fechar não saía de lado
     nem deixava o separador, por isso nada rearmava e reabrir mostrava o
     gráfico já cheio. Agora rearma, mas só quando já não se vê (a secção
     fechada corta a área a 0 px): um `ready` que desça com o gráfico à vista
     nunca o devolve a zero diante do atleta — fica pendente até sair. Voltar
     a ficar pronto antes disso cancela. Só a opção de quem chama: o
     TabReadyContext do separador não desce numa sessão. */
  const readyOptionRef = useRef(readyOption !== false);
  readyOptionRef.current = readyOption !== false;
  useEffect(() => {
    if (!motion || readyOption !== false || !st.shown) {
      pendingUnreadyRef.current = false;
      return;
    }
    if (outRef.current) rearm();
    else pendingUnreadyRef.current = true;
  }, [motion, readyOption, st.shown, rearm]);

  // O separador deixou de estar assente: rearma ao fim de QUICK_RETURN_MS,
  // se já não se vê; se ainda se vê (o dedo pousado, a página a voltar),
  // fica pendente até o observer a dar como fora. Voltar a assentar antes
  // cancela tudo — é o vai-e-vem rápido, que não repete.
  useEffect(() => {
    if (!motion || settled || !st.shown) return undefined;
    const timer = setTimeout(() => {
      if (outRef.current) rearm();
      else pendingRearmRef.current = true;
    }, QUICK_RETURN_MS);
    return () => {
      clearTimeout(timer);
      pendingRearmRef.current = false;
    };
  }, [motion, settled, st.shown, rearm]);

  useEffect(() => {
    if (!motion || st.play === 0) return undefined;
    const timer = setTimeout(() => setSettledPlay(st.play), REVEAL_ANIMATION_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [motion, st.play]);

  useEffect(() => {
    if (!observing || !node) return undefined;
    const observer = new window.IntersectionObserver((entries) => {
      for (const entry of entries) {
        const { out, inView: seen } = tabEntryVisibility(entry);
        outRef.current = out;
        setInView(seen);
        if (out && pendingRearmRef.current && !settledRef.current) rearm();
        if (out && pendingUnreadyRef.current && !readyOptionRef.current) rearm();
      }
    }, { threshold: TAB_THRESHOLDS });
    observer.observe(node);
    return () => observer.disconnect();
  }, [observing, node, rearm]);

  return {
    ref,
    playKey: st.play,
    animate: motion && st.play > 0 && settledPlay !== st.play,
    // Escondido só antes do 1.º reveal; depois de rearmado fica à vista no
    // estado zero (o ChartFrame põe o gráfico na base e o número a 0).
    style: motion && !st.seen ? { opacity: 0 } : undefined,
    seen: !motion || st.seen,
    armed: motion && st.seen && !st.shown,
    reduced,
    // Para o ChartFrame: há animação a gerir? há observer? e a área está à
    // vista com o separador assente (o critério de criar o canvas)?
    active: motion,
    observing,
    visible: observing ? inView && settled : true,
    settled,
    ready,
  };
}
