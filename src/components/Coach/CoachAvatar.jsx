import React, { useEffect, useRef, useState } from 'react';
import { normalizeMood } from '@formulas/carolMood.ts';
import { prefersReducedMotion } from '../../utils/coachBubbles';
import {
  CHEEKS, EARS_PATH, FACE_FILL_PATH, FRINGE_PATH, FRINGE_RIGHT_PATH, HAIR_PATH, HAIR_STRANDS_PATH,
  JAW_PATH, NECK_FILL_PATH, NECK_PATH, NOSE_PATH, PONYTAIL_PATH, PONYTAIL_STRANDS_PATH,
  PONYTAIL_TIE_PATH, SHINE_PATHS,
  frameFor, lerpRig, rigFor, rigPaths,
} from './carolFace';

/* O rosto da Carol (CAROL.md §4) — ponto único para todos os sítios onde ela
   aparece.

   Um retrato de traço simples dentro do disco ciano dela: linha escura,
   cara clara, bochechas coradas, franja em madeixas e o rabo-de-cavalo
   clássico. Só a cabeça — os ombros nunca aparecem. A geometria vive em
   carolFace.js; aqui só se desenha e se dá vida.

   Seis emoções (`mood`, vocabulário em @formulas/carolMood.ts): neutral (por
   defeito), happy, proud, worried, caring e thinking. A expressão acompanha o
   tom da mensagem em que aparece; quando muda, a cara passa de uma à outra
   (os traços deslizam, ~360 ms, e o corado sobe ou desce) e dá um aceno
   curto — nunca troca de desenho de repente, nunca muda sem motivo.

   Três camadas de vida, todas desligadas com prefers-reduced-motion:
   - `draw`: a assinatura. As linhas desenham-se como uma caneta — rabo-de-
     -cavalo, cabelo, maxilar, franja — e só depois o desenho ganha cor e
     acendem os olhos e a boca. Por defeito só nos tamanhos de palco (≥ 56 px: boas-
     -vindas, onboarding, chat vazio); os outros pedem-na nos momentos de
     chegada.
   - `alive`: pisca os olhos, com um compasso diferente em cada instância
     (duas Carol no ecrã não piscam em coro). Por defeito a partir de 26 px.
     Pára com a página escondida.
   - `breathing`: a animação 7 do ponto 9 ("A Carol respira"), inalterada —
     um halo de --dur-breathe, três ciclos e para, só quando há assunto por
     resolver. Ela chama, não alarma.

   Tem de funcionar a 30 px e a 76 px: abaixo de 32 px o enquadramento
   aproxima-se da cara (frameFor). `mood` fica também em data-mood. */

const MORPH_MS = 360;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function useMorphingRig(mood) {
  const [rig, setRig] = useState(() => rigFor(mood));
  const rigRef = useRef(rig);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    const from = rigRef.current;
    const to = rigFor(mood);
    if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      rigRef.current = to;
      setRig(to);
      return undefined;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / MORPH_MS);
      const next = lerpRig(from, to, easeInOut(t));
      rigRef.current = next;
      setRig(next);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [mood]);

  return rig;
}

export default function CoachAvatar({
  mood: moodProp = 'neutral',
  size = 30,
  radius,
  className = '',
  style,
  breathing = false,
  draw,
  alive,
}) {
  const mood = normalizeMood(moodProp) || 'neutral';
  const rig = useMorphingRig(mood);
  const paths = rigPaths(rig);
  const frame = frameFor(size);

  // O compasso do piscar de cada instância, escolhido uma vez.
  const [blinkRhythm] = useState(() => ({
    '--carol-blink-dur': `${(4.6 + Math.random() * 2.4).toFixed(2)}s`,
    '--carol-blink-delay': `-${(Math.random() * 4).toFixed(2)}s`,
  }));

  // O aceno quando a emoção muda (não à entrada).
  const faceRef = useRef(null);
  const lastMood = useRef(mood);
  useEffect(() => {
    if (lastMood.current === mood) return;
    lastMood.current = mood;
    const el = faceRef.current;
    if (!el || typeof el.animate !== 'function' || prefersReducedMotion()) return;
    el.animate(
      [{ transform: 'translateY(0)' }, { transform: 'translateY(1.6px)' }, { transform: 'translateY(-0.6px)' }, { transform: 'translateY(0)' }],
      { duration: 420, easing: 'cubic-bezier(.16, 1, .3, 1)' },
    );
  }, [mood]);

  const drawing = (draw ?? size >= 56) && !prefersReducedMotion();
  const blinking = (alive ?? size >= 26) && rig.blink;

  // Espessura: `strokePx` é o traço principal em píxeis; o resto do rig está
  // desenhado para um traço de 3,2 unidades e escala com ele.
  const vbW = Number(frame.viewBox.split(' ')[2]);
  const unit = (frame.strokePx * vbW) / size;
  const k = unit / 3.2;
  const line = { stroke: 'var(--carol-line)' };

  return (
    <span
      aria-hidden="true"
      data-mood={mood}
      data-breathing={breathing ? 'true' : undefined}
      className={`carol-face inline-flex items-center justify-center shrink-0 ${breathing ? 'coach-breathing ' : ''}${drawing ? 'carol-draw ' : ''}${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? '50%',
        ...blinkRhythm,
        ...style,
      }}
    >
      <svg
        viewBox={frame.viewBox}
        width={size}
        height={size}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ display: 'block' }}
      >
        <g ref={faceRef}>
          {/* O pescoço sai pelo fundo do disco — não inclina com a cabeça. */}
          <path className="carol-fill" d={NECK_FILL_PATH} style={{ fill: 'var(--carol-skin)' }} />
          <path className="carol-sig carol-sig-2" pathLength="1" d={NECK_PATH} style={line} strokeWidth={unit} />

          <g data-part="head" transform={`rotate(${rig.tilt.toFixed(2)} 50 80) translate(0 ${rig.lift.toFixed(2)})`}>
            {/* O rabo-de-cavalo, por trás da cabeça. */}
            <path className="carol-fill" d={PONYTAIL_PATH} style={{ fill: 'var(--carol-hair)' }} />
            <path className="carol-sig" pathLength="1" d={PONYTAIL_PATH} style={line} strokeWidth={unit} />
            {frame.detail === 'full' && (
              <g className="carol-feat">
                <path d={PONYTAIL_STRANDS_PATH} style={line} strokeWidth={unit * 0.55} opacity=".55" />
              </g>
            )}

            <path className="carol-fill" d={FACE_FILL_PATH} style={{ fill: 'var(--carol-skin)' }} />
            <path className="carol-sig" pathLength="1" d={JAW_PATH} style={line} strokeWidth={unit} />
            <path className="carol-fill" d={HAIR_PATH} style={{ fill: 'var(--carol-hair)' }} />
            <path className="carol-sig" pathLength="1" d={HAIR_PATH} style={line} strokeWidth={unit} />
            <path className="carol-feat" d={PONYTAIL_TIE_PATH} style={{ stroke: 'var(--carol-tie)' }} strokeWidth={unit * 1.7} />
            <path className="carol-feat" d={EARS_PATH} style={{ ...line, fill: 'var(--carol-skin)' }} strokeWidth={unit * 0.85} />
            {frame.detail === 'full' && (
              <g className="carol-feat">
                <path d={HAIR_STRANDS_PATH} style={line} strokeWidth={unit * 0.55} opacity=".55" />
              </g>
            )}

            {/* O corado sobe e desce com a emoção. */}
            <g className="carol-feat">
              <g data-part="cheeks" style={{ fill: 'var(--carol-blush)' }} opacity={(0.25 + rig.blush * 0.6).toFixed(3)}>
                {CHEEKS.map(([cx, cy, rx, ry]) => (
                  <ellipse key={cx} cx={cx} cy={cy} rx={rx * (0.8 + rig.blush * 0.2)} ry={ry * (0.8 + rig.blush * 0.2)} />
                ))}
              </g>
            </g>
            {frame.detail === 'full' && (
              <g className="carol-feat">
                <path d={NOSE_PATH} style={line} strokeWidth={unit * 0.6} opacity=".7" />
              </g>
            )}
            <g className="carol-feat" style={line}>
              <path data-part="browL" d={paths.browL} strokeWidth={rig.browW * k * 0.7} />
              <path data-part="browR" d={paths.browR} strokeWidth={rig.browW * k * 0.7} />
            </g>
            <g className="carol-feat carol-eyes-in" style={line}>
              <g className={blinking ? 'carol-blink' : undefined}>
                <path data-part="eyeL" d={paths.eyeL} strokeWidth={rig.eyeW * k} />
                <path data-part="eyeR" d={paths.eyeR} strokeWidth={rig.eyeW * k} />
              </g>
            </g>
            <path
              data-part="mouth"
              className="carol-feat carol-mouth-in"
              d={paths.mouth}
              style={{ ...line, fill: 'var(--carol-line)' }}
              strokeWidth={rig.mouthW * k * 0.8}
              fillOpacity={paths.mouthOpen}
            />

            {/* A franja por cima de tudo: cai sobre a testa e as sobrancelhas. */}
            <path className="carol-fill" d={FRINGE_RIGHT_PATH} style={{ fill: 'var(--carol-hair)' }} />
            <path className="carol-fill" d={FRINGE_PATH} style={{ fill: 'var(--carol-hair)' }} />
            <path className="carol-sig carol-sig-2" pathLength="1" d={FRINGE_RIGHT_PATH} style={line} strokeWidth={unit * 0.9} />
            <path className="carol-sig carol-sig-2" pathLength="1" d={FRINGE_PATH} style={line} strokeWidth={unit * 0.9} />
          </g>

          <g data-part="shine" opacity={rig.shine.toFixed(3)} style={{ stroke: 'var(--carol-shine)' }}>
            {SHINE_PATHS.map((d) => (
              <path key={d} d={d} strokeWidth={unit * 1.1} />
            ))}
          </g>
        </g>
      </svg>
    </span>
  );
}
