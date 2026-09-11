import React, { useEffect } from 'react';
import { Check } from 'lucide-react';
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
 */
export default function RecordConfirmation({ label = 'Registo guardado', onDone }) {
  useEffect(() => {
    const delay = prefersReducedMotion() ? DUR_TAP : DUR_CONFIRM_EXIT;
    const id = setTimeout(() => { onDone?.(); }, delay);
    return () => clearTimeout(id);
    // `onDone` muda de identidade a cada render de quem nos monta; re-armar o
    // temporizador por causa disso adiava a saída para sempre.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      data-testid="record-confirmation"
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center"
      style={{ background: 'var(--bg-scrim)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}
    >
      <div className="relative flex items-center justify-center" style={{ width: 56, height: 56 }}>
        <span aria-hidden="true" className="record-confirm-halo absolute inset-0 rounded-full" style={{ border: '2px solid var(--ok)' }} />
        <span
          aria-hidden="true"
          className="record-confirm-check flex items-center justify-center rounded-full"
          style={{ width: 56, height: 56, background: 'rgba(52,211,153,.16)', border: '1.5px solid var(--ok)', color: 'var(--ok)' }}
        >
          <Check size={26} strokeWidth={2.5} />
        </span>
      </div>
      <div className="record-confirm-label text-[13px] font-extrabold mt-[15px]" style={{ color: '#a7f3d0' }}>{label}</div>
    </div>
  );
}
