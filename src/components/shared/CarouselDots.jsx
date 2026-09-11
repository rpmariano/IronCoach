import React, { useRef } from 'react';
import { useElasticPillIndicator } from '../../utils/useElasticPillIndicator';

/**
 * Pontos de paginação de carrossel — mesmo indicador "pílula elástica" dos
 * subnavs do Dashboard/Perfil (ver useElasticPillIndicator): o traço ativo
 * não salta de tamanho instantaneamente, desliza a esticar/contrair.
 *
 * Cada ponto ocupa sempre a largura "ativa" (w-4) no LAYOUT — é essa caixa
 * que a minhoca mede e que a pílula ativa passa a ocupar — mas só mostra o
 * traço pequeno (w-1.5, opacidade baixa) por trás; a pílula animada,
 * sobreposta, é que representa visualmente o ativo.
 *
 * Ponto 9: o alvo de toque é SEPARADO do traço. O traço continua a medir
 * 16×6 (a caixa que a minhoca lê, `setItemRef`); por cima, um botão
 * invisível de 44×44 centrado nele, fora do fluxo, dá o alvo que o handoff
 * pede sem mexer um pixel no desenho. Como o passo entre pontos (22px) é
 * menor que 44, os alvos de pontos vizinhos sobrepõem-se e ganha o ponto
 * mais à direita na zona comum — cada ponto fica com pelo menos 22×44,
 * ainda assim muito acima dos 16×6 de antes.
 */
export default function CarouselDots({ count, currentIndex, onSelect, ariaLabelPrefix = 'Ver' }) {
  const trackRef = useRef(null);
  const { indicatorStyle, setItemRef } = useElasticPillIndicator(trackRef, currentIndex);

  if (count <= 1) return null;

  return (
    <div ref={trackRef} className="relative flex items-center gap-1.5">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="relative w-4 h-1.5 flex items-center justify-center">
          {/* A caixa que a minhoca mede — o traço visível, 16×6. */}
          <span ref={setItemRef(idx)} aria-hidden="true" className="absolute inset-0" />
          <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-slate-300 opacity-40" />
          {/* O alvo: 44×44 invisível, centrado no traço, fora do fluxo (não
              mexe no layout nem no que a minhoca mede). `no-tap-scale`
              porque encolher um alvo invisível não se vê e ainda mexia na
              caixa por baixo. */}
          <button
            type="button"
            onClick={() => onSelect(idx)}
            aria-label={`${ariaLabelPrefix} ${idx + 1}`}
            data-testid="carousel-dot-target"
            className="no-tap-scale absolute top-1/2 left-1/2"
            style={{ width: 'var(--tap)', height: 'var(--tap)', transform: 'translate(-50%, -50%)' }}
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
