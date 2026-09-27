import { useEffect } from 'react';
import { useAppStore } from '../store';
import { lisbonTodayISO } from '../lib/utils';
import { cupDateChangeKey } from './cupPushRoute';

/* A mudança de data de uma jornada vista na app (specs/trofeu.md §8, Fase 5).
   2026-09-27.

   O aviso `cup_date_change` só sai a quem ainda não viu a mudança: quem abriu
   o calendário do Troféu, ou a lista de Provas com a jornada à vista, já a
   leu ("mudou de 17 para 24 jan") e não precisa da notificação. Fica gravada
   como impressão 'moment', sem título — fora do prompt da Carol, como o mapa
   da época —, com a chave do contrato (`cup_date_change:<roundId>:<nova
   data>`); o tick lê-as dos últimos 7 dias.

   Só as jornadas com mudança (`round.dateChange`, que já é null quando a
   jornada passou) e com "Vou" — as outras não recebem o aviso. Uma escrita
   por chave e por dia em cada sessão da app (a BD também não duplica: a
   impressão é única por dia). Sem inscrição não há jornadas, e nada se
   escreve. */

const vistas = new Set(); // `${userId}:${dia}:${chave}` — já pedidas nesta sessão

/** As chaves das mudanças de data à vista numa lista de jornadas da vista
 *  (useCup): com mudança e "Vou". Pura. */
export function cupDateChangeSeenKeys(rounds) {
  const keys = [];
  for (const round of rounds || []) {
    if (!round?.dateChange || round.participation?.decision !== 'vou') continue;
    const key = cupDateChangeKey(round.id, round.date);
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

/** Marca como vistas as mudanças de data destas jornadas (as que estão à
 *  vista no ecrã que chama). */
export function useCupDateChangeSeen(rounds) {
  const joined = cupDateChangeSeenKeys(rounds).join('|');
  useEffect(() => {
    if (!joined) return;
    const s = useAppStore.getState();
    const userId = s.session?.user?.id || s.profile?.id || null;
    if (!userId || typeof s.logImpression !== 'function') return;
    const day = lisbonTodayISO();
    for (const key of joined.split('|')) {
      const id = `${userId}:${day}:${key}`;
      if (vistas.has(id)) continue;
      vistas.add(id);
      s.logImpression({ kind: 'moment', key, title: null });
    }
  }, [joined]);
}

/** Só para os testes: esquece o que já se pediu nesta sessão. */
export function __resetCupDateChangeSeen() {
  vistas.clear();
}

export default useCupDateChangeSeen;
