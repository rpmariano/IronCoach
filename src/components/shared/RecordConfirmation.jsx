import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Trophy } from 'lucide-react';
import { prefersReducedMotion } from '../../utils/coachBubbles';
import { useEscapeClose } from './Sheet';
import CoachAvatar from '../Coach/CoachAvatar';

/**
 * "Registo confirmado" — animação 6 de `design/IronCoach - Animacoes.dc.html`:
 * «Os cinco registos e o "Registar sessão". Pequeno impulso elástico, depois
 * desaparece sozinho e devolve o atleta ao Início. É a recompensa da app — o
 * único sítio onde vale a pena um exagero.»
 *
 * 420 ms de impulso (--dur-confirm, --ease-spring, overshoot 1,12), halo a
 * dissipar-se, e aos 900 ms (--dur-confirm-exit) chama `onDone` — é o
 * `onDone` que fecha o ecrã de registo e leva o atleta ao destino normal
 * (o Calendário no dia do registo, com o cartão do que ficou gravado).
 *
 * `prefers-reduced-motion`: o check aparece e sai aos 120 ms — a confirmação
 * continua a ler-se, só não se mexe. As animações em si já são encurtadas
 * pelos tokens e pela regra global de globals.css; o que este componente tem
 * de garantir é que o TEMPO ATÉ `onDone` acompanha, senão o ecrã ficava 900 ms
 * parado à espera de uma animação que já acabou.
 *
 * `tone="race"` — o dia da prova (specs/prova-concluida.md §4). Mesma
 * animação, outra leitura: âmbar em vez de verde e um troféu em vez do
 * visto, porque o que acabou de acontecer não foi "mais um registo" mas a
 * prova para a qual o ciclo inteiro foi montado. O rótulo traz o nome dela
 * ("Meia de Lisboa concluída"), escrito por quem monta.
 *
 * ── Dispensa manual (relatado pelo utilizador, "Registo da prova") ─────────
 * Primeiro foram só as mensagens de PARABÉNS — a prova concluída
 * (`tone="race"`), uma conquista nova (`achievement`) ou a Carol a marcar o
 * momento (`first`) —, que traziam texto a sério e desapareciam em 1,6-3 s,
 * antes de darem tempo de o ler: «surgiu uma mensagem de parabéns, mas foi
 * muito rápido. Este tipo de mensagem não deve desaparecer, mas sim ter um
 * botão para fechar, e fechar quando se clica fora da mensagem.»
 *
 * Desde 2026-09-21 é a regra de TODAS: «todas as mensagens que têm este
 * caráter temporário devem deixar de o ter; quero que só desapareçam
 * mediante ação do utilizador». O visto simples também esperava pouco (900
 * ms, ou 120 ms com movimento reduzido) e também era uma mensagem. Já não
 * há temporizador nenhum aqui: sai no botão "Continuar", no clique fora da
 * mensagem ou com Escape.
 */
const TONES = {
  ok: {
    ring: 'var(--ok)',
    fill: 'rgba(52,211,153,.16)',
    label: 'var(--ok-soft)',
    Icon: Check,
  },
  race: {
    ring: 'var(--race)',
    fill: 'var(--tint-race-bg)',
    label: 'var(--race)',
    Icon: Trophy,
  },
};

/* A conquista nova (specs/gamificacao-provas.md §1): entra 300 ms depois do
   check. `achievement` é uma conquista de `achievementsForRace` (name, detail,
   tone, Icon), com um `extra` opcional para o "+1 conquista" quando a prova
   deu mais do que uma. */
const DUR_ACHIEVEMENT_IN = 300;

/* O primeiro registo de um tipo (utils/firstRecord.js), ou um recorde de
   treino (@formulas/runRecord.ts): a Carol entra por baixo do visto e diz o
   que ele quer dizer. */
export const DUR_FIRST_IN = 350;

/* Já não temporiza a saída de nada — estas confirmações esperam pela dispensa
   do atleta —, mas continua exportada porque os testes a usam como unidade de
   "tempo mais do que suficiente para ter saído, se saísse". */
export const DUR_CONFIRM_EXIT_FIRST = 3000;

export default function RecordConfirmation({ label = 'Registo guardado', tone = 'ok', achievement = null, first = null, onDone }) {
  const { ring, fill, label: labelColor, Icon } = TONES[tone] || TONES.ok;
  const [showAchievement, setShowAchievement] = useState(() => !!achievement && prefersReducedMotion());
  // Com movimento reduzido, ela já lá está no primeiro render.
  const [showFirst, setShowFirst] = useState(() => !!first && prefersReducedMotion());
  const doneRef = useRef(false);
  const closeRef = useRef(null);
  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone?.();
  };
  useEffect(() => {
    const reduced = prefersReducedMotion();
    const timers = [];
    /* Os únicos temporizadores que restam são de ENTRADA — a conquista e a
       fala da Carol aparecem um instante depois do visto, para não entrarem
       todas ao mesmo tempo. Nenhum deles faz nada sair. */
    if (achievement && !first) timers.push(setTimeout(() => setShowAchievement(true), reduced ? 0 : DUR_ACHIEVEMENT_IN));
    if (first && !reduced) timers.push(setTimeout(() => setShowFirst(true), DUR_FIRST_IN));
    return () => timers.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Escape fecha pela pilha partilhada (Sheet.jsx), não por um listener
     próprio: é essa pilha que garante que a tecla fecha SÓ o que está por
     cima. Um listener à parte funcionava por acaso — `document` dispara
     antes de `window` no bubble — e o comentário da pilha regista que foi
     exatamente esse atalho que já trouxe o bug de volta uma vez. */
  const escapeClose = useCallback(() => finish(), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEscapeClose(escapeClose);

  /* O foco vai para o botão de dispensa e não sai dali enquanto a mensagem
     estiver aberta — é o que `aria-modal` promete, e o ecrã por baixo
     continua montado. Mesmo padrão das boas-vindas da Carol
     (Welcome/CarolWelcome.jsx): só há uma ação, por isso o Tab devolve
     sempre o foco ao botão. Ao fechar, o foco volta a quem o tinha. */
  useEffect(() => {
    const antes = document.activeElement;
    closeRef.current?.focus?.({ preventScroll: true });
    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      e.preventDefault();
      closeRef.current?.focus?.({ preventScroll: true });
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (antes && typeof antes.focus === 'function' && document.contains(antes)) {
        antes.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <div
      data-testid="record-confirmation"
      data-tone={tone}
      data-first={first ? 'true' : undefined}
      data-dismissible="true"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={finish}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center"
      style={{ background: 'var(--bg-scrim)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', cursor: 'pointer' }}
    >
      {/* Clicar NA mensagem não a fecha — só clicar fora dela. */}
      <div
        className="flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
        style={{ cursor: 'auto' }}
      >
        <div className="relative flex items-center justify-center" style={{ width: 56, height: 56 }}>
          <span aria-hidden="true" className="record-confirm-halo absolute inset-0 rounded-full" style={{ border: `2px solid ${ring}` }} />
          <span
            aria-hidden="true"
            className="record-confirm-check flex items-center justify-center rounded-full"
            style={{ width: 56, height: 56, background: fill, border: `1.5px solid ${ring}`, color: ring }}
          >
            <Icon size={26} />
          </span>
        </div>
        <div className="record-confirm-label text-[13px] font-extrabold mt-[15px]" style={{ color: labelColor }}>{label}</div>

        {showFirst && first && (
          <div
            data-testid="record-confirmation-first"
            className="first-record-card flex items-start gap-3 mx-6 mt-6"
            style={{
              maxWidth: 330,
              borderRadius: 20,
              background: 'rgba(12,20,34,.92)',
              border: '1px solid rgba(34,211,238,.32)',
              padding: '14px 16px 12px',
              boxShadow: '0 18px 40px rgba(0,0,0,.45)',
            }}
          >
            <CoachAvatar size={40} mood="happy" breathing draw />
            <div className="min-w-0 flex-1">
              <div className="text-[17px] font-black leading-[1.2]" style={{ color: 'var(--text-1)', letterSpacing: '-.015em' }}>{first.title}</div>
              <div className="text-[13px] leading-[1.5] mt-1" style={{ color: 'var(--text-3)' }}>{first.sub}</div>
            </div>
          </div>
        )}

        {showAchievement && achievement && (
          <div
            data-testid="record-confirmation-achievement"
            className="record-confirm-label flex items-center gap-3 mx-6 mt-5"
            style={{
              maxWidth: 320,
              borderRadius: 20,
              background: 'var(--surface-glass)',
              border: `1px solid var(--tint-${achievement.tone}-bd)`,
              padding: '12px 14px',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <span
              aria-hidden="true"
              className="inline-flex items-center justify-center shrink-0"
              style={{
                width: 44, height: 44, borderRadius: '50%',
                background: `var(--tint-${achievement.tone}-bg)`,
                border: `1px solid var(--tint-${achievement.tone}-bd)`,
                color: `var(--${achievement.tone})`,
              }}
            >
              {achievement.Icon && <achievement.Icon size={20} />}
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: '.05em', color: `var(--${achievement.tone})` }}>Nova conquista</div>
              <div className="text-[17px] font-black leading-[1.15] mt-0.5" style={{ color: 'var(--text-1)' }}>{achievement.name}</div>
              {achievement.detail && <div className="text-[11.5px] leading-[1.35] mt-[3px]" style={{ color: 'var(--text-3)' }}>{achievement.detail}</div>}
              {achievement.extra && <div className="text-[11px] mt-[3px]" style={{ color: 'var(--text-4)' }}>{achievement.extra}</div>}
            </div>
          </div>
        )}

        <button
            type="button"
            ref={closeRef}
            data-testid="record-confirmation-close"
            onClick={finish}
            className="inline-flex items-center justify-center min-h-[44px] mt-6 rounded-[11px] text-[12.5px] font-extrabold"
            style={{
              padding: '0 28px',
              background: tone === 'race' ? 'var(--tint-race-bg)' : 'var(--surface-glass)',
              border: `1px solid ${tone === 'race' ? 'var(--tint-race-bd)' : 'var(--border-glass-strong)'}`,
              color: tone === 'race' ? 'var(--race)' : 'var(--text-1)',
            }}
          >
            Continuar
        </button>
      </div>
    </div>
  );
}
