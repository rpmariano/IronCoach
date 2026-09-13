import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import CoachAvatar from '../Coach/CoachAvatar';
import { useAppStore } from '../../store';
import { existingRaceBalance, requestRaceBalance, balanceAlreadyGivenInChat, balanceParagraphs } from '../../utils/raceBalance';

/* O balanço da Carol no hub da prova (pedido 2026-09-13). Com a corrida
   registada, pede-se o balanço completo ao coach-chat à primeira abertura e
   fica guardado na prova; a linha de números da régua única fica por baixo,
   mais discreta. As sugestões do "perto" ("Sim, para a próxima quero
   melhor") levam ao chat com a resposta já enviada — é lá que se decide o
   que muda no treino. */
export default function RaceBalanceCard({ race, run, runs = [], profile = {}, numbersLine, onLeave }) {
  const { raceEvents } = useAppStore();
  const [balance, setBalance] = useState(() => existingRaceBalance(race));
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestedRef = useRef(null);

  // A coluna pode chegar depois (recarga da prova) — é ela que manda.
  useEffect(() => {
    if (race?.coach_balance && race.coach_balance !== balance?.text) {
      setBalance({ text: race.coach_balance, suggestions: balance?.suggestions || [] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [race?.coach_balance]);

  const ask = async () => {
    setLoading(true);
    setFailed(false);
    try {
      setBalance(await requestRaceBalance({ race, run, runs, raceEvents, profile }));
    } catch (err) {
      console.warn('Balanço da prova não obtido', err);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  // À primeira abertura com corrida registada pede-se sozinho — uma vez por
  // prova. Se o chat já fez este balanço (neste dispositivo) não se repete
  // sem o atleta o pedir: a mensagem já está lá.
  useEffect(() => {
    if (!run || !race?.id || balance || requestedRef.current === race.id) return;
    if (balanceAlreadyGivenInChat({ race, run, runs, raceEvents, profile })) return;
    requestedRef.current = race.id;
    ask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [race?.id, run?.id, balance]);

  const reply = (text) => {
    const store = useAppStore.getState();
    store.setCoachIntent({ kind: 'say', text });
    onLeave?.();
    store.setActiveTab('coach');
  };

  const paragraphs = balance ? balanceParagraphs(balance.text) : [];

  return (
    <div data-testid="race-balance-card" style={{ borderRadius: 22, background: 'var(--tint-coach-bg)', border: '1px solid var(--tint-coach-bd)', padding: 16, marginTop: 12 }}>
      <div className="flex items-center gap-2.5">
        <CoachAvatar size={28} breathing={loading} />
        <span className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: '.06em', color: 'var(--coach-soft)' }}>
          Balanço da Carol
        </span>
      </div>

      {loading && (
        <div data-testid="race-balance-loading" className="flex flex-col gap-2 mt-3" aria-label="A Carol está a escrever o balanço">
          <span className="text-[11.5px] font-bold" style={{ color: 'var(--coach)' }}>a escrever…</span>
          <span className="block h-3 rounded-full w-full" style={{ background: 'rgba(255,255,255,.08)' }} />
          <span className="block h-3 rounded-full w-5/6" style={{ background: 'rgba(255,255,255,.08)' }} />
          <span className="block h-3 rounded-full w-2/3" style={{ background: 'rgba(255,255,255,.08)' }} />
        </div>
      )}

      {!loading && paragraphs.length > 0 && (
        <div data-testid="race-balance-carol" className="flex flex-col gap-2.5 mt-3">
          {paragraphs.map((p, i) => (
            <p key={i} className="text-[13px] leading-[1.55]" style={{ color: 'var(--text-1)' }}>{p}</p>
          ))}
          {balance.suggestions?.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
              {balance.suggestions.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => reply(sug)}
                  className="inline-flex items-center rounded-full text-[12.5px] font-extrabold"
                  style={{ minHeight: 44, padding: '0 14px', background: 'var(--grad-coach-legible)', color: 'var(--coach-ink)', border: 'none' }}
                >
                  {sug}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && paragraphs.length === 0 && run && (
        <button
          type="button"
          data-testid="race-balance-ask"
          onClick={ask}
          className="inline-flex items-center gap-1.5 mt-3 text-[12.5px] font-extrabold"
          style={{ minHeight: 44, color: 'var(--coach)' }}
        >
          <RefreshCw size={14} /> {failed ? 'Não consegui falar com a Carol. Tentar de novo' : 'Pedir o balanço à Carol'}
        </button>
      )}

      {numbersLine && (
        <p
          data-testid="race-hub-balance"
          className="text-[12px] leading-[1.5]"
          style={{ color: paragraphs.length ? 'var(--text-4)' : 'var(--text-2)', marginTop: paragraphs.length || loading ? 12 : 12, paddingTop: paragraphs.length ? 10 : 0, borderTop: paragraphs.length ? '1px solid rgba(34,211,238,.14)' : 'none' }}
        >
          {numbersLine}
        </p>
      )}
    </div>
  );
}
