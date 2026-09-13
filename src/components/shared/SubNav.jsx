import React, { useRef } from 'react';
import { useElasticPillIndicator, SUBNAV_PILL_DURATION } from '../../utils/useElasticPillIndicator';

/* Subnav em vidro com a minhoca rápida — porte de
   design-system/components/navigation/SubNav.jsx (ponto 4 do handoff).
   Usado nos cinco separadores do Dashboard e nos quatro do Perfil.

   A pílula corre a 480ms (--dur-pill-sub) em vez dos 650+170·distância da
   nav inferior: auditoria, achado 5 ("A minhoca em sete sítios") — na nav é
   assinatura, num subnav que se troca quatro vezes seguidas para comparar
   módulos seria espera.

   A cor é a do separador ativo (`tone`), não uma cor fixa da barra: no
   Dashboard é a do módulo (Geral e Corrida em ciano, Ginásio azul-acinzentado,
   Nutrição violeta, Corpo rosa) e no Perfil a do assunto de cada separador
   (Pessoal ginásio, Metas prova, Equipamento corrida, Coach Carol) — as cores
   que os mocks "Dashboard · Visão Geral" e "Perfil" mostram.

   Cinco separadores em 390px (achado 1 da auditoria, texto abaixo de 11px):
   os mocks resolvem-no encurtando o rótulo — "Visão Geral" passa a "Geral" —
   e mantêm ícone + rótulo em todos, sem scroll horizontal. `srLabel` guarda
   o nome por extenso para quem usa leitor de ecrã, para o rótulo curto não
   custar clareza. */

/** Estilo (fundo/borda da pílula + cor do texto ativo) para um tom. */
const toneStyles = (tone) => ({
  background: `var(--tint-${tone}-bg)`,
  borderColor: `var(--tint-${tone}-bd)`,
  color: `var(--${tone})`,
});

export default function SubNav({ items, activeIndex, onChange, className = '', style }) {
  const barRef = useRef(null);
  const { indicatorStyle, setItemRef } = useElasticPillIndicator(barRef, activeIndex, {
    duration: SUBNAV_PILL_DURATION,
  });

  const activeTone = items[activeIndex]?.tone || 'run';
  const activeStyles = toneStyles(activeTone);

  return (
    <div
      ref={barRef}
      data-testid="subnav"
      className={`relative flex overflow-hidden ${className}`}
      style={{
        padding: 6,
        borderRadius: 16,
        background: 'var(--surface-glass)',
        backdropFilter: 'blur(var(--blur-card))',
        WebkitBackdropFilter: 'blur(var(--blur-card))',
        border: '1px solid var(--border-glass)',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {indicatorStyle && (
        <span
          aria-hidden="true"
          data-testid="subnav-pill"
          style={{
            position: 'absolute',
            top: 6,
            bottom: 6,
            left: indicatorStyle.left,
            width: indicatorStyle.width,
            borderRadius: 10,
            borderWidth: 1,
            borderStyle: 'solid',
            background: activeStyles.background,
            borderColor: activeStyles.borderColor,
            // A posição vem do rAF do hook (transition: none); só a cor
            // transita, para a troca de módulo não piscar.
            transition: 'background-color 200ms var(--ease-out), border-color 200ms var(--ease-out)',
          }}
        />
      )}

      {items.map((item, i) => {
        const active = i === activeIndex;
        return (
          <button
            key={item.key ?? i}
            ref={setItemRef(i)}
            type="button"
            onClick={() => onChange?.(i, item)}
            aria-current={active ? 'page' : undefined}
            /* no-tap-scale: este botão É a caixa que a minhoca mede
               (setItemRef). O scale .98 do toque (ponto 9) encolhia-o
               enquanto o dedo estivesse em baixo e a pílula media 2% a
               menos — aqui a resposta ao toque é a própria pílula. */
            className="no-tap-scale relative flex-1 flex flex-col items-center justify-center cursor-pointer"
            style={{
              zIndex: 2,
              gap: 4,
              padding: '7px 0',
              minHeight: 44,
              minWidth: 0,
              background: 'none',
              border: 'none',
              fontSize: 11,
              lineHeight: 1.1,
              fontWeight: active ? 800 : 700,
              color: active ? `var(--${item.tone})` : 'var(--text-muted)',
              transition: 'color 200ms var(--ease-out)',
            }}
          >
            {item.icon}
            <span aria-hidden={item.srLabel ? 'true' : undefined} className="whitespace-nowrap">
              {item.label}
            </span>
            {item.srLabel && <span className="sr-only">{item.srLabel}</span>}
          </button>
        );
      })}
    </div>
  );
}
