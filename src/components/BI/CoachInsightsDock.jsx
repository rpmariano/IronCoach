import React, { useMemo, useState } from 'react';
import { Dialog } from '../shared/Sheet';
import CoachInsightButton from './CoachInsightButton';
import CoachInsightModal from './CoachInsightModal';
import useCarolNotices from './useCarolNotices';
import { useBannerShown } from './SmartInsightsBanner';
import { useLastSettledIndex } from '../../utils/settledTab';

/* O botão flutuante da Carol e a sua janela, prontos a montar em qualquer
   ecrã — em todos menos no Chat, que é onde o atleta já está a falar com
   ela: ali um botão a chamá-lo para a conversa que já está aberta não faz
   sentido nenhum.

   Desde 2026-09-27 o que mostram é o mesmo em todo o lado (useCarolNotices):
   os avisos em que ela pede para falar e os insights todos. Antes o Início,
   a Evolução e os restantes ecrãs tinham cada um a sua seleção, e o mesmo
   botão dizia coisas diferentes consoante o separador.

   `CarolNoticesDock` recebe a lista já feita — o Início usa-a, porque o
   cartão da Carol precisa do mesmo `openCoach`. O `CoachInsightsDock` (o de
   omissão) calcula-a sozinho. `bottom` sobe o botão nos ecrãs com barra de
   ação fixa. */
export function CarolNoticesDock({ notices, bottom }) {
  const [open, setOpen] = useState(false);
  const { alerts, insights, logOpened, dismissDialog } = notices;

  const openWindow = () => {
    logOpened();
    setOpen(true);
  };

  return (
    <>
      <CoachInsightButton insights={insights} alerts={alerts} onClick={openWindow} bottom={bottom} />
      {open && <CoachInsightModal insights={insights} alerts={alerts} onClose={() => setOpen(false)} />}
      {dismissDialog.open && (
        <Dialog
          title="Dispensar este assunto?"
          onClose={dismissDialog.cancel}
          actions={(
            <>
              <button type="button" disabled={dismissDialog.busy} onClick={dismissDialog.confirm} className="flex-1 min-h-[44px] rounded-[11px] text-[13px] font-extrabold disabled:opacity-45" style={{ background: 'var(--tint-coach-bg)', border: '1px solid var(--tint-coach-bd)', color: 'var(--coach)' }}>
                {dismissDialog.busy ? 'A dispensar…' : 'Dispensar'}
              </button>
              <button type="button" disabled={dismissDialog.busy} onClick={dismissDialog.cancel} className="flex-1 min-h-[44px] rounded-[11px] text-[13px] font-bold" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--border-glass-strong)', color: 'var(--text-3)' }}>
                Cancelar
              </button>
            </>
          )}
        >
          {/* Diz qual é o assunto e o que fica (revisão pré-deploy
              2026-09-27). O texto do handoff (specs/design-handoff-2026-09),
              "O aviso deixa de aparecer no Início", deixou de ser verdade: o
              aviso já não vive só no Início, e com planos ou objetivos à
              espera fica, só sem a intervenção. */}
          {dismissDialog.topic && (
            <p data-testid="dismiss-topic" className="text-[12.5px] leading-[1.55]" style={{ color: 'var(--text-2)' }}>
              «{dismissDialog.topic}»
            </p>
          )}
          <p className="text-[12.5px] leading-[1.55]" style={{ color: 'var(--text-3)' }}>
            Deixo de te chamar por isto.{' '}
            {dismissDialog.othersWaiting && 'O que tens à espera da tua decisão continua no aviso. '}
            Podes voltar a falar comigo no chat sempre que quiseres.
          </p>
        </Dialog>
      )}
    </>
  );
}

/* O botão não repete o que o banner do Geral já mostra (2026-10-04): enquanto o
   separador assente é aquele onde o banner vive, os insights que ele mostra saem
   da lista e da contagem; em qualquer outro ecrã (ou fora da Evolução, onde não
   há banner) o botão diz tudo, como antes. Os avisos da Carol (`alerts`) nunca
   se escondem — o banner não os mostra. Desde 2026-10-05 cada insight do
   banner tem os seus botões ("Falar com a Carol", "Percebi", "Agora não"),
   por isso o que sai daqui continua acionável lá. */
export default function CoachInsightsDock({ bottom }) {
  const notices = useCarolNotices();
  const shown = useBannerShown();
  const settledPage = useLastSettledIndex();
  const bannerVisible = shown.ids.length > 0 && (shown.page == null || shown.page === settledPage);

  const deduped = useMemo(() => {
    if (!bannerVisible) return notices;
    return { ...notices, insights: notices.insights.filter((i) => !shown.ids.includes(i.id)) };
  }, [notices, bannerVisible, shown]);

  return <CarolNoticesDock notices={deduped} bottom={bottom} />;
}
