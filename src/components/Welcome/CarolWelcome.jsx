import React, { useEffect, useMemo, useRef } from 'react';
import { Footprints, UtensilsCrossed, Moon, Clock, Trophy } from 'lucide-react';
import CoachAvatar from '../Coach/CoachAvatar';
import { LOOK, ambientBackground, contourRings } from '../../utils/ambientWorld';
import { slotForHour, welcomeTimeZone } from '../../utils/carolWelcome';
import { useAppStore } from '../../store';

/* A sala da Carol — as boas-vindas antes da Home (canvas de design
   "Boas-vindas da Carol", 2026-09-19). A decisão de QUANDO aparece e o
   texto vivem em utils/carolWelcome.js; aqui só se desenha.

   O mundo é o dela: o rosto ciano ao centro, a respirar (as três
   respirações de CoachAvatar), as curvas de nível à volta — as mesmas do
   fundo da app, aqui em ciano e centradas nela — e o arco do dia, das 6h às
   21h, com o sol ou a lua na hora certa. A luz de fundo muda com a faixa:
   âmbar ao amanhecer, ciano à tarde, índigo à noite, quase nada de
   madrugada; no dia da prova, âmbar à volta dela (o rosto fica ciano).

   Entra o nome, depois as bolhas com o compasso do chat; fica até ele a
   dispensar — num toque em qualquer sítio, no botão ou com Escape.

   Até 2026-09-21 fechava-se sozinha ao fim de ~7,8 s, com uma linha a
   esvaziar-se por baixo a contar o tempo. Passou a esperar: «todas as
   mensagens que têm este caráter temporário devem deixar de o ter; quero
   que só desapareçam mediante ação do utilizador». A linha saiu com o
   temporizador — sem contagem para mostrar, era uma promessa falsa.

   Com movimento reduzido tudo aparece de uma vez
   (regras .welcome-* em globals.css). É um diálogo modal: o foco vai para
   o botão, o Tab não sai dela, e ao fechar o foco volta ao sítio de onde
   veio; a atualização automática (lib/appUpdate.js) espera por ela. */

const W = 390;
const ART_H = 330;
const CX = 195;
const CY = 196;
const ARC_R = 150;
const ARC_RY = ARC_R * 0.62;

/* A luz da hora e as curvas de nível saíram para utils/ambientWorld.js a
   2026-09-22: o momento do badge (shared/BadgeMoment.jsx) precisa do mesmo
   mundo, e duas paletas acabariam a discordar sobre o que é "de noite". O
   que ficou aqui é o que é só dela: o rosto, o arco do dia e as bolhas. */

const ICON = { run: Footprints, plate: UtensilsCrossed, moon: Moon, clock: Clock, trophy: Trophy };

/* As curvas de nível à volta dela, centradas nela. Fixas, calculadas uma
   vez (utils/ambientWorld.js). */
const CONTOURS = contourRings({ cx: CX, cy: CY });

/** A posição no arco do dia (6h à esquerda, 21h à direita). */
function arcPoint(hourFloat) {
  const t = Math.min(Math.max((hourFloat - 6) / 15, 0), 1);
  const ang = Math.PI * (1 - t);
  return [CX + ARC_R * Math.cos(ang), CY - ARC_RY * Math.sin(ang)];
}

function DayArc({ disc, hourFloat, accent }) {
  const [x0, x1] = [CX - ARC_R, CX + ARC_R];
  const [px, py] = arcPoint(hourFloat);
  const dentroDoDia = hourFloat >= 6 && hourFloat <= 21;
  return (
    <>
      <path d={`M${x0},${CY} A${ARC_R},${ARC_RY} 0 0 1 ${x1},${CY}`} fill="none" stroke="#cbd5e1" strokeOpacity=".22" strokeDasharray="2 5" />
      {[[6, '6h'], [21, '21h']].map(([h, lab]) => {
        const [tx, ty] = arcPoint(h);
        return <text key={lab} x={tx} y={ty + 18} fill="#9aa5b4" fontSize="9.5" fontWeight="700" textAnchor="middle" letterSpacing=".06em">{lab}</text>;
      })}
      {disc !== 'none' && dentroDoDia && (
        <>
          <path d={`M${x0},${CY} A${ARC_R},${ARC_RY} 0 0 1 ${px.toFixed(1)},${py.toFixed(1)}`} fill="none" stroke={accent} strokeOpacity=".55" strokeWidth="1.5" strokeLinecap="round" />
          {disc === 'sun' ? (
            <>
              <circle cx={px} cy={py} r="16" fill="#fbbf24" fillOpacity=".14" />
              <circle cx={px} cy={py} r="6.5" fill="#fbbf24" />
            </>
          ) : (
            <>
              <circle cx={px} cy={py} r="14" fill="#a5b4fc" fillOpacity=".10" />
              <circle cx={px} cy={py} r="6.5" fill="none" stroke="#c7d2fe" strokeWidth="1.6" />
            </>
          )}
        </>
      )}
      {(disc === 'none' || !dentroDoDia) && [[64, 70, 1.2, 0.5], [318, 44, 1.5, 0.6], [262, 112, 1, 0.35], [110, 142, 0.9, 0.3], [340, 160, 1.1, 0.4]].map(([x, y, r, o]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#e2e8f0" fillOpacity={o} />
      ))}
    </>
  );
}

/* O relógio no mesmo fuso do texto (welcomeTimeZone): senão, nos Açores, o
   "Boa noite" das 22h30 de lá aparecia por cima de um 23:30. */
function welcomeClock(now) {
  const timeZone = welcomeTimeZone();
  const data = new Intl.DateTimeFormat('pt-PT', { timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const hora = new Intl.DateTimeFormat('pt-PT', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const [h, m] = hora.split(':').map(Number);
  return { data, hora, hourFloat: h + m / 60 };
}

export default function CarolWelcome({ welcome, onClose, now = new Date() }) {
  const race = welcome.variant === 'prova';
  const { data, hora, hourFloat } = useMemo(() => welcomeClock(now), [now]);
  // A véspera não tem luz própria: é a da hora a que aparece.
  const look = LOOK[welcome.variant] || LOOK[slotForHour(Math.floor(hourFloat))] || LOOK.manha;
  const accent = race ? '#fbbf24' : '#22d3ee';
  const buttonRef = useRef(null);
  const closedRef = useRef(false);

  const fechar = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClose?.();
  };
  const fecharRef = useRef(fechar);
  fecharRef.current = fechar;

  useEffect(() => {
    // Quem tinha o foco antes — para lho devolver ao fechar.
    const antes = document.activeElement;
    buttonRef.current?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === 'Escape') { fecharRef.current(); return; }
      // Enquanto ela está aberta, o Tab não sai dela: só há uma ação.
      if (e.key === 'Tab') {
        e.preventDefault();
        buttonRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (antes && typeof antes.focus === 'function' && document.contains(antes)) antes.focus({ preventScroll: true });
    };
  }, []);

  const ChipIcon = welcome.chip ? (ICON[welcome.chip.icon] || Clock) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="carol-welcome-title"
      data-testid="carol-welcome"
      data-variant={welcome.variant}
      onClick={fechar}
      className="welcome-root fixed inset-0 overflow-hidden"
      style={{
        // Acima de tudo o que a app desenha (o menu do FAB é o 50).
        zIndex: 70,
        background: ambientBackground(look),
        color: 'var(--text-1)',
        cursor: 'pointer',
      }}
    >
      <div className="relative mx-auto h-full w-full max-w-md flex flex-col overflow-y-auto" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-baseline justify-between" style={{ padding: '22px 24px 0' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-4)' }}>{data}</span>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{hora}</span>
        </div>

        {/* A arte: curvas de nível, o arco do dia e ela ao centro. */}
        <div aria-hidden="true" className="welcome-art relative shrink-0" style={{ height: ART_H - 40 }}>
          <svg width={W} height={ART_H} viewBox={`0 0 ${W} ${ART_H}`} className="absolute left-1/2 -translate-x-1/2" style={{ top: -40 }}>
            {CONTOURS.map((c, i) => (
              <polyline key={i} points={c.points} fill="none" stroke={accent} strokeOpacity={c.opacity} strokeWidth="1" />
            ))}
            <DayArc disc={look.disc} hourFloat={hourFloat} accent={accent} />
          </svg>
          <div className="absolute left-1/2" style={{ top: CY - 40 - 44, marginLeft: -44, width: 88, height: 88 }}>
            <span className="welcome-halo absolute rounded-full" style={{ inset: -22, background: `radial-gradient(circle, ${race ? 'rgba(251,191,36,.28)' : 'rgba(34,211,238,.28)'}, transparent 68%)` }} />
            <CoachAvatar
              size={88}
              mood={welcome.mood || (race ? 'happy' : 'neutral')}
              style={{ position: 'relative', boxShadow: race ? '0 0 0 10px rgba(251,191,36,.10), 0 18px 40px rgba(251,191,36,.30)' : '0 0 0 10px rgba(34,211,238,.08), 0 18px 40px rgba(34,211,238,.30)' }}
            />
          </div>
        </div>

        <section className="flex flex-col" style={{ gap: 10, padding: '6px 28px 0' }}>
          <h1 id="carol-welcome-title" className="welcome-greet" style={{ margin: '0 0 8px', fontSize: 40, lineHeight: 1.06, fontWeight: 900, letterSpacing: '-.035em', color: 'var(--text-1)' }}>
            {welcome.greeting}
          </h1>
          {welcome.lines.map((t, i) => (
            <p
              key={t}
              className="welcome-bubble"
              style={{
                margin: 0,
                alignSelf: 'flex-start',
                maxWidth: 320,
                padding: '12px 15px',
                background: race ? 'rgba(251,191,36,.08)' : 'rgba(34,211,238,.09)',
                border: `1px solid ${race ? 'rgba(251,191,36,.30)' : 'rgba(34,211,238,.26)'}`,
                borderRadius: '20px 20px 20px 6px',
                color: 'var(--text-2)',
                fontSize: 15,
                lineHeight: 1.5,
                animationDelay: `${900 + i * 600}ms`,
              }}
            >
              {t}
            </p>
          ))}
        </section>

        <div className="mt-auto flex flex-col" style={{ gap: 14, padding: '20px 24px 28px' }}>
          {welcome.chip && (
            <div className="flex items-center" style={{ gap: 12, padding: '12px 14px', borderRadius: 16, background: race ? 'rgba(251,191,36,.10)' : 'rgba(255,255,255,.05)', border: `1px solid ${race ? 'rgba(251,191,36,.34)' : 'rgba(255,255,255,.10)'}` }}>
              <span className="shrink-0 flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 11, background: race ? 'rgba(251,191,36,.16)' : 'rgba(34,211,238,.14)', color: accent }}>
                <ChipIcon size={18} aria-hidden="true" />
              </span>
              <span className="flex flex-col min-w-0" style={{ gap: 2 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-4)' }}>{welcome.chip.label}</span>
                <span className="truncate" style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text-1)' }}>{welcome.chip.value}</span>
              </span>
            </div>
          )}
          <button
            ref={buttonRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              // "Fazer o check-in": leva ao Início e abre-o lá (o cartão
              // "Como estás hoje?"). Se a navegação for recusada (um
              // formulário por gravar), só fecha.
              if (welcome.action === 'checkin') {
                const { setActiveTab, requestCheckin } = useAppStore.getState();
                if (setActiveTab('home') !== false) requestCheckin();
              }
              fechar();
            }}
            className="transition active:scale-[.98]"
            style={{
              height: 54,
              border: 'none',
              borderRadius: 16,
              background: race ? 'var(--grad-race)' : 'var(--grad-coach-legible)',
              color: race ? 'var(--race-ink)' : 'var(--coach-ink)',
              fontSize: 15.5,
              fontWeight: 800,
            }}
          >
            {welcome.cta}
          </button>
          <div className="flex items-center justify-center" aria-hidden="true">
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-4)' }}>Toca em qualquer sítio para fechar</span>
          </div>
        </div>
      </div>
    </div>
  );
}
