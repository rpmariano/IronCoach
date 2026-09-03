import React, { useRef } from 'react';
import { useElasticPillIndicator } from '../../utils/useElasticPillIndicator';

/**
 * Pontos de paginação de carrossel — mesmo indicador "pílula elástica" dos
 * subnavs do Dashboard/Perfil (ver useElasticPillIndicator): o traço ativo
 * não salta de tamanho instantaneamente, desliza a esticar/contrair.
 *
 * Cada ponto ocupa sempre a largura "ativa" (w-4) como alvo de toque —
 * maior e mais fácil de acertar do que o traço fino visível — mas só
 * mostra o traço pequeno (w-1.5, opacidade baixa) por trás; a pílula
 * animada, sobreposta, é que representa visualmente o ativo.
 */
export default function CarouselDots({ count, currentIndex, onSelect, ariaLabelPrefix = 'Ver' }) {
  const trackRef = useRef(null);
  const { indicatorStyle, setItemRef } = useElasticPillIndicator(trackRef, currentIndex);

  if (count <= 1) return null;

  return (
    <div ref={trackRef} className="relative flex items-center gap-1.5">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="relative w-4 h-1.5 flex items-center justify-center">
          <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-slate-300 opacity-40" />
          <button
            ref={setItemRef(idx)}
            type="button"
            onClick={() => onSelect(idx)}
            aria-label={`${ariaLabelPrefix} ${idx + 1}`}
            className="absolute inset-0 w-full h-full"
          />
        </div>
      ))}
      {indicatorStyle && (
        <div
          aria-hidden="true"
          className="absolute top-0 h-1.5 rounded-full bg-slate-300"
          style={{ left: indicatorStyle.left, width: indicatorStyle.width, transition: indicatorStyle.transition }}
        />
      )}
    </div>
  );
}
