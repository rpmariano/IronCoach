import React, { useMemo } from 'react';
import './CarolMuscleAnatomy.css';

/* Os músculos trabalhados num treino, na Carol em croché — substitui o boneco
   SVG (react-body-highlighter). Brief em specs/carol-anatomia-brief.md.

   Uma base (a Carol com os músculos apagados, frente à esquerda e costas à
   direita) e uma camada transparente por grupo, alinhada ao pixel: acendem-se
   as camadas dos grupos do treino, e qualquer combinação monta-se sozinha.
   Cardio troca a base pela do coração e pulmões, e o coração pulsa.

   Recebe os identificadores de `mapCategoriesToMuscles` (src/utils/gym.js). */

const SRC = `${import.meta.env.BASE_URL || '/'}carol-anatomia/`;

const MUSCLE_TO_LAYER = {
  chest: 'peito',
  'upper-back': 'costas', trapezius: 'costas', 'lower-back': 'costas', lats: 'costas',
  'front-deltoids': 'ombros', 'back-deltoids': 'ombros', shoulders: 'ombros',
  biceps: 'biceps',
  triceps: 'triceps',
  forearm: 'antebracos', forearms: 'antebracos',
  abs: 'core', obliques: 'core',
  gluteal: 'gluteos',
  quadriceps: 'coxas', hamstring: 'coxas', adductor: 'coxas', adductors: 'coxas', abductors: 'coxas',
  calves: 'gemeos',
};

/** As camadas, pela ordem em que se empilham, com o nome que se lê. */
export const ANATOMY_LAYERS = [
  { id: 'peito', label: 'peito' },
  { id: 'ombros', label: 'ombros' },
  { id: 'costas', label: 'costas' },
  { id: 'biceps', label: 'bíceps' },
  { id: 'triceps', label: 'tríceps' },
  { id: 'antebracos', label: 'antebraços' },
  { id: 'core', label: 'core e lombar' },
  { id: 'gluteos', label: 'glúteos' },
  { id: 'coxas', label: 'coxas' },
  { id: 'gemeos', label: 'gémeos' },
];

/** Das listas de músculos para as camadas da Carol, e se há cardio. */
export function anatomyLayersFor(activeMuscles = []) {
  const list = Array.isArray(activeMuscles) ? activeMuscles : [activeMuscles];
  const ids = new Set();
  let cardio = false;
  for (const item of list) {
    if (!item) continue;
    const key = String(item).trim().toLowerCase();
    if (key === 'cardio') { cardio = true; continue; }
    const layer = MUSCLE_TO_LAYER[key];
    if (layer) ids.add(layer);
  }
  return { layers: ANATOMY_LAYERS.filter((l) => ids.has(l.id)), cardio };
}

function describe({ layers, cardio }) {
  const parts = [...(cardio ? ['coração e pulmões'] : []), ...layers.map((l) => l.label)];
  if (!parts.length) return 'A Carol, de frente e de costas, sem músculos destacados.';
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}` : parts[0];
  return `A Carol, de frente e de costas, com ${list} em destaque.`;
}

export default function CarolMuscleAnatomy({ activeMuscles = [], naked = false, className = '' }) {
  const active = useMemo(() => anatomyLayersFor(activeMuscles), [activeMuscles]);
  const label = describe(active);

  return (
    <div
      className={`carol-anatomy ${naked ? 'is-naked ' : ''}${className}`}
      role="img"
      aria-label={label}
      data-cardio={active.cardio ? 'true' : undefined}
    >
      <img
        src={`${SRC}${active.cardio ? 'anatomia_cardio.webp' : 'anatomia_base.webp'}`}
        alt=""
        draggable="false"
        decoding="async"
        data-part="base"
        className="carol-anatomy-img"
      />
      {active.layers.map(({ id }) => (
        <img
          key={id}
          src={`${SRC}anatomia_${id}.webp`}
          alt=""
          draggable="false"
          decoding="async"
          data-part={`layer-${id}`}
          className="carol-anatomy-img carol-anatomy-layer"
        />
      ))}
      {active.cardio && (
        <img
          src={`${SRC}anatomia_cardio_coracao.webp`}
          alt=""
          draggable="false"
          decoding="async"
          data-part="heart"
          className="carol-anatomy-img carol-anatomy-heart"
        />
      )}
    </div>
  );
}
