import { useEffect, useState } from 'react';
import { prefersReducedMotion } from './coachBubbles';

/**
 * "Uma vez por sessão" — ponto 9 do redesenho 6c.
 *
 * Do ficheiro de animações (`design/IronCoach - Animacoes.dc.html`, painel
 * "Uma vez, não sempre"): «Anéis, números e barras animam à primeira entrada
 * da sessão e ficam quietos no resto. O trilho é a exceção: repete quando a
 * semana muda, porque aí há novidade a mostrar. Guardar isso em
 * sessionStorage chega.»
 *
 * Por isso: uma marca por `sessionStorage` (morre ao fechar o separador,
 * sobrevive a navegação dentro da app) e um hook que devolve `shouldAnimate`
 * só na PRIMEIRA montagem da sessão — e nunca com `prefers-reduced-motion`.
 *
 * A marca é por CHAVE e não uma só para a app inteira: os anéis vivem no
 * Início e as barras nos dashboards; com uma marca única, entrar primeiro no
 * Início gastava a animação dos gráficos que o atleta ainda nem viu. Todas
 * as chaves vivem dentro do mesmo registo de sessionStorage
 * (`ironcoach:intro-animations-played`), como o handoff pede.
 */

export const INTRO_ANIMATIONS_KEY = 'ironcoach:intro-animations-played';

/* Os tempos e o desfasamento das animações que correm em JS (contagem de
   números, barras do Chart.js) — o espelho de `design-system/tokens/
   motion.css`, que o CSS lê como variável e o JS não consegue ler sem
   getComputedStyle. Manter os dois em sincronia. */
export const DUR_COUNT = 1400;      // --dur-count
export const DUR_BARS = 550;        // --dur-bars
export const STAGGER_BARS = 60;     // --stagger-bars
export const DUR_TRAIL = 1600;      // --dur-trail
export const DUR_CONFIRM = 420;     // --dur-confirm
export const DUR_CONFIRM_EXIT = 900; // --dur-confirm-exit
export const DUR_TAP = 120;         // --dur-tap (também o "tudo a 120ms" do movimento reduzido)

/** Lê o conjunto de chaves já tocadas nesta sessão. Tolerante a um
 *  sessionStorage indisponível (Safari privado, WebViews) ou corrompido —
 *  nesse caso a app anima sempre, que é o mal menor. */
function readPlayed() {
  try {
    const raw = sessionStorage.getItem(INTRO_ANIMATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Já correu nesta sessão? */
export function introAnimationsPlayed(key = 'default') {
  return readPlayed().includes(key);
}

/** Marca como visto. Silencioso se o sessionStorage não deixar escrever. */
export function markIntroAnimationsPlayed(key = 'default') {
  try {
    const played = readPlayed();
    if (played.includes(key)) return;
    sessionStorage.setItem(INTRO_ANIMATIONS_KEY, JSON.stringify([...played, key]));
  } catch {
    /* sem sessionStorage não há memória de sessão — a animação repete-se, e
       isso é preferível a rebentar o render. */
  }
}

/** Só para testes e para o "Rever o arranque": esquece tudo. */
export function resetIntroAnimations() {
  try { sessionStorage.removeItem(INTRO_ANIMATIONS_KEY); } catch { /* nada a fazer */ }
}

/**
 * `shouldAnimate` para esta chave: true só na primeira montagem da sessão e
 * nunca com `prefers-reduced-motion`. A decisão é tomada uma vez, no
 * inicializador do estado, para não mudar a meio da animação; a marca é
 * escrita logo a seguir à montagem, para que o segundo ecrã a montar já
 * apanhe a chave gasta.
 */
export function useIntroAnimation(key = 'default') {
  const [shouldAnimate] = useState(() => !prefersReducedMotion() && !introAnimationsPlayed(key));

  useEffect(() => {
    if (shouldAnimate) markIntroAnimationsPlayed(key);
  }, [shouldAnimate, key]);

  return shouldAnimate;
}

/**
 * Configuração de animação do Chart.js para as barras que crescem (animação 4
 * do ficheiro: «550ms · scaleY · stagger 60ms», da esquerda para a direita).
 * O Chart.js já cresce da base; aqui só se fixa a duração, a curva e o
 * desfasamento por barra, em vez de escrever uma animação nossa.
 *
 * `false` desliga a animação por completo — é o que o Chart.js espera para
 * "aparece já no sítio", e é o que se usa fora da primeira entrada da sessão
 * e com movimento reduzido.
 */
export function barGrowAnimation(shouldAnimate) {
  if (!shouldAnimate) return false;
  return {
    duration: DUR_BARS,
    // O Chart.js não aceita cubic-bezier; easeOutQuart é a curva da família
    // de --ease-out (.16,1,.3,1) que ele traz de origem.
    easing: 'easeOutQuart',
    delay: (ctx) => (ctx.type === 'data' && ctx.mode === 'default' ? ctx.dataIndex * STAGGER_BARS : 0),
  };
}
