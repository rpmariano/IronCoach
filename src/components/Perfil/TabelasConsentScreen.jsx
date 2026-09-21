import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft } from 'lucide-react';
import { useAppStore } from '../../store';
import GlassCard from '../shared/GlassCard';
import SectionLabel from '../shared/SectionLabel';
import Warning from '../shared/Warning';
import { useEscapeClose } from '../shared/Sheet';
import { useToast } from '../shared/ToastProvider';
import { shortDisplayName } from '../../utils/percentile';

/* "Entrar nas tabelas" — o consentimento da comparação por percentil
   (gamificação, Fase 5).

   DOIS INTERRUPTORES, NUNCA ENCADEADOS. São dois tratamentos diferentes de
   dados diferentes e a lei trata-os como dois:

     · "Entrar na média"    — o índice de execução entra no DENOMINADOR de um
       segmento de 20 pessoas ou mais. Não sai nome nenhum, nem lugar nenhum.
     · "Aparecer nas tabelas" — o nome abreviado passa a ser visível.

   O segundo só fica DISPONÍVEL depois do primeiro (a tabela mostra a métrica,
   e a métrica vem da média) — mas disponível não é consentido: é uma decisão
   à parte, com o seu próprio interruptor, o seu próprio texto e o seu próprio
   registo no livro. Ligar o primeiro nunca liga o segundo.

   A única cascata é a de RETIRAR: sair da média tira também das tabelas, e
   isso diz-se antes de acontecer.

   Interruptores a sério: `<input type="checkbox">` dentro de um `<label>`.
   Um div com onClick não é um interruptor — não tem estado para um leitor de
   ecrã, não responde ao teclado, e não se pode ligar a um rótulo. Num ecrã
   cuja função é recolher consentimento informado, isso não é detalhe. */

const CARD_SECUNDARIO = { background: 'var(--surface-glass)', border: '1px solid var(--border-glass)', borderRadius: 18 };

/** O que passa a ver-se com o consentimento das tabelas. */
const PASSA_A_VER_SE = [
  'O teu nome abreviado (por exemplo, "Rui M.")',
  'O teu escalão etário',
  'O teu nível e a modalidade que preparas',
  'A métrica da tabela — quanto do plano cumpriste',
];

/** O que NUNCA sai, com consentimento ou sem ele. */
const NUNCA_SAI = [
  'Fotografias',
  'Percursos e localização',
  'Os teus treinos um a um',
  'Peso e medidas',
  'O teu plano',
  'As tuas conversas com a Carol',
  'A tua data de nascimento',
  'O teu email',
];

/* O interruptor. `disabled` é mesmo `disabled` no input — e o motivo vem
   escrito por baixo, para "não dá" nunca ser um mistério. */
function Interruptor({ id, titulo, descricao, checked, onChange, disabled, motivo, testId }) {
  return (
    <label
      htmlFor={id}
      data-testid={testId}
      className="flex items-start gap-3 w-full cursor-pointer"
      style={{ ...CARD_SECUNDARIO, padding: 14, minHeight: 44, opacity: disabled ? 0.55 : 1, cursor: disabled ? 'default' : 'pointer' }}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 22, height: 22, marginTop: 2, accentColor: 'var(--ok)', flexShrink: 0 }}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-extrabold" style={{ color: 'var(--text-1)' }}>{titulo}</span>
        <span className="block text-[12px] mt-1" style={{ color: 'var(--text-3)', lineHeight: 'var(--leading-normal)' }}>{descricao}</span>
        {disabled && motivo && (
          <span className="block text-[11px] mt-1.5" style={{ color: 'var(--text-4)' }}>{motivo}</span>
        )}
      </span>
    </label>
  );
}

function Lista({ items, cor, testId }) {
  return (
    <ul className="m-0 p-0 mt-2 flex flex-col gap-1.5" style={{ listStyle: 'none' }} data-testid={testId}>
      {items.map((t) => (
        <li key={t} className="flex items-start gap-2 text-[12.5px]" style={{ color: 'var(--text-3)', lineHeight: 'var(--leading-normal)' }}>
          <span aria-hidden="true" style={{ color: cor, fontWeight: 900, lineHeight: 1.4 }}>·</span>
          {t}
        </li>
      ))}
    </ul>
  );
}

export default function TabelasConsentScreen({ onClose }) {
  const { profile, setPrivacyConsent, setLeaderboardDisplayName } = useAppStore();
  const { showToast } = useToast();
  useEscapeClose(onClose);
  const [aGravar, setAGravar] = useState(null);

  const naMedia = !!profile?.stats_pool_consent_at;
  const nasTabelas = !!profile?.leaderboard_consent_at;
  const nomeCurto = profile?.leaderboard_display_name || shortDisplayName(profile?.display_name) || 'o teu nome abreviado';

  const trocar = async (kind, on) => {
    setAGravar(kind);
    const ok = await setPrivacyConsent(kind, on);
    if (ok && kind === 'leaderboard' && on && !profile?.leaderboard_display_name) {
      await setLeaderboardDisplayName(shortDisplayName(profile?.display_name));
    }
    setAGravar(null);
    if (!ok) { showToast('Não foi possível gravar a tua decisão. Tenta outra vez.', 'error'); return; }
    if (kind === 'stats_pool' && !on) showToast('Saíste da média. Já não contas para nenhuma distribuição.', 'success');
    if (kind === 'leaderboard' && !on) showToast('O teu nome saiu das tabelas.', 'success');
  };

  const conteudo = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Entrar nas tabelas"
      data-testid="tabelas-consent-screen"
      className="fixed inset-0 z-[80] flex flex-col fade-in"
      style={{ background: 'var(--bg-app)' }}
    >
      <div className="flex items-center gap-2.5 shrink-0" style={{ minHeight: 52, padding: '8px 14px', borderBottom: '1px solid var(--border-glass)' }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Voltar"
          className="shrink-0 flex items-center justify-center rounded-full"
          style={{ width: 44, height: 44, background: 'none', border: 'none', color: 'var(--text-3)' }}
        >
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: 'var(--tracking-label)', color: 'var(--race)' }}>Privacidade</div>
          <div className="text-[14.5px] font-extrabold truncate" style={{ color: 'var(--text-1)' }}>Entrar nas tabelas</div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-2" style={{ padding: '12px 18px calc(26px + env(safe-area-inset-bottom, 0px))' }}>
        <GlassCard radius={24} padding={16}>
          <h2 className="m-0 text-[16px] font-black" style={{ letterSpacing: 'var(--tracking-tight)', color: 'var(--text-1)' }}>
            São duas decisões, não uma
          </h2>
          <p className="m-0 text-[12.5px] mt-1.5" style={{ color: 'var(--text-3)', lineHeight: 'var(--leading-normal)' }}>
            Entrar na média é contar para um número de grupo, sem nome nenhum. Aparecer nas tabelas é ser visto pelo
            nome abreviado. Podes fazer a primeira e nunca fazer a segunda — e podes desfazer qualquer uma a qualquer
            momento.
          </p>
        </GlassCard>

        <SectionLabel style={{ marginTop: 6 }}>O que passa a ver-se</SectionLabel>
        <div style={{ ...CARD_SECUNDARIO, padding: 14 }}>
          <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-4)' }}>
            Só com o segundo interruptor ligado, e só isto:
          </p>
          <Lista items={PASSA_A_VER_SE} cor="var(--ok)" testId="tabelas-passa-a-ver-se" />
        </div>

        <SectionLabel style={{ marginTop: 6 }}>O que nunca sai</SectionLabel>
        <div style={{ ...CARD_SECUNDARIO, padding: 14 }}>
          <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-4)' }}>
            Com consentimento ou sem ele, nada disto chega a ninguém:
          </p>
          <Lista items={NUNCA_SAI} cor="var(--text-4)" testId="tabelas-nunca-sai" />
        </div>

        <SectionLabel style={{ marginTop: 6 }}>As tuas decisões</SectionLabel>

        <Interruptor
          id="consent-stats-pool"
          testId="tabelas-switch-stats-pool"
          titulo="Entrar na média do meu escalão"
          descricao={'O teu índice de execução do plano passa a contar para a distribuição do teu escalão. Não aparece nome nenhum nem lugar nenhum — só entras no denominador, e só em segmentos com 20 atletas ou mais.'}
          checked={naMedia}
          onChange={(on) => trocar('stats_pool', on)}
          disabled={aGravar !== null}
        />

        <Interruptor
          id="consent-leaderboard"
          testId="tabelas-switch-leaderboard"
          titulo="Aparecer nas tabelas com o meu nome abreviado"
          descricao={`Passas a ser visível como "${nomeCurto}", com o escalão, o nível, a modalidade e a métrica. É uma decisão à parte da de cima: ligar a primeira não liga esta.`}
          checked={nasTabelas}
          onChange={(on) => trocar('leaderboard', on)}
          disabled={aGravar !== null || !naMedia}
          motivo="Fica disponível depois de entrares na média — a tabela mostra a métrica, e a métrica vem de lá."
        />

        {naMedia && nasTabelas && (
          <Warning tone="warn" title="Se saíres da média">
            Sair da média tira-te também das tabelas: a tabela mostra a métrica, e sem média não há métrica para mostrar.
          </Warning>
        )}

        <Warning tone="ok" title="O que a lei diz">
          Isto é consentimento explícito ao abrigo do art. 9.º/2 a) do RGPD, porque a métrica se cruza com dados de
          saúde. É voluntário, não muda nada no resto da app, e podes retirá-lo a qualquer momento — com efeito
          imediato: sais dos cálculos seguintes e as distribuições ainda vivas são refeitas sem ti. Cada decisão tua
          fica registada com a data e a versão do texto que leste, para poderes pedir-nos que a demonstremos.
        </Warning>

        <p className="m-0 text-[11px] text-center" style={{ color: 'var(--text-4)' }}>
          As distribuições publicam-se de 14 em 14 dias e nunca com menos de 20 atletas num segmento.
        </p>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(conteudo, document.body) : conteudo;
}
