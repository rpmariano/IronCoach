import React, { useEffect, useState } from 'react';
import { Check, Trophy } from 'lucide-react';
import { prefersReducedMotion } from '../../utils/coachBubbles';
import { DUR_CONFIRM_EXIT, DUR_TAP } from '../../utils/introAnimations';

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
   check e prolonga a confirmação até 1,6 s, porque há mais para ler. Sem
   conquista nova nada disto acontece — o registo de todos os dias sai aos
   900 ms como sempre. `achievement` é uma conquista do computeAchievements
   (name, detail, tone, Icon), com um `extra` opcional para o "+1 conquista"
   quando a prova deu mais do que uma. */
const DUR_ACHIEVEMENT_IN = 300;
const DUR_CONFIRM_EXIT_ACHIEVEMENT = 1600;

export default function RecordConfirmation({ label = 'Registo guardado', tone = 'ok', achievement = null, onDone }) {
  const { ring, fill, label: labelColor, Icon } = TONES[tone] || TONES.ok;
  const [showAchievement, setShowAchievement] = useState(false);
  useEffect(() => {
    // Movimento reduzido mantém a regra da app: tudo a 120 ms, incluindo o
    // tempo até sair. A conquista não se perde — o hub mostra-a a seguir,
    // na secção "Conquistas".
    const reduced = prefersReducedMotion();
    const delay = reduced ? DUR_TAP : (achievement ? DUR_CONFIRM_EXIT_ACHIEVEMENT : DUR_CONFIRM_EXIT);
    const timers = [setTimeout(() => { onDone?.(); }, delay)];
    if (achievement) timers.push(setTimeout(() => setShowAchievement(true), reduced ? 0 : DUR_ACHIEVEMENT_IN));
    return () => timers.forEach(clearTimeout);
    // `onDone` muda de identidade a cada render de quem nos monta; re-armar o
    // temporizador por causa disso adiava a saída para sempre.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      data-testid="record-confirmation"
      data-tone={tone}
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center"
      style={{ background: 'var(--bg-scrim)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}
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
    </div>
  );
}
