import { useLayoutEffect, useState } from 'react';
import { useAppStore } from '../store';

/* Um momento da Carol que acontece uma vez (a semana cumprida, o dia
   fechado, o marco da prova) — mas só quando se vê.

   Na primeira abertura de cada faixa do dia aparecem as boas-vindas por
   cima da Home (Welcome/CarolWelcome). Um momento que arrancasse ao montar
   corria tapado e ficava gasto (revisão pré-master de 2026-09-19). Por isso
   espera pela cancela `welcomeGate` do store: 'pending' enquanto o App ainda
   não decidiu se mostra as boas-vindas, 'open' enquanto estão abertas,
   'clear' quando o caminho está livre. Só aí o momento é marcado como visto
   e acontece.

   Efeito de layout: o momento decide-se antes de pintar, para o elemento
   não aparecer num frame já no estado final e depois saltar para o início
   da animação. `wasSeen`/`markSeen` são as funções de memória do momento. */
export default function useMomentOnce(active, wasSeen, markSeen) {
  const gate = useAppStore((s) => s.welcomeGate);
  const [moment, setMoment] = useState(false);
  useLayoutEffect(() => {
    if (!active || gate !== 'clear') return;
    if (!wasSeen()) {
      markSeen();
      setMoment(true);
    }
    // As funções de memória mudam de identidade a cada render; o que decide
    // é a cancela e o `active`.
  }, [active, gate]); // eslint-disable-line react-hooks/exhaustive-deps
  return moment;
}
