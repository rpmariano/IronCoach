import React, { useMemo, useState } from 'react';
import { CalendarPlus, ChevronRight, Loader2 } from 'lucide-react';
import { Sheet } from '../shared/Sheet';
import { useToast } from '../shared/ToastProvider';
import { invokeEdgeFunctionWithTimeout } from '../../lib/supabase';
import { raceCalendarEvent } from '@formulas/raceCalendar.ts';
import { googleCalendarUrl, outlookCalendarUrl } from '../../utils/calendarLinks';

/* "Adicionar ao calendário" no hub da prova: uma persiana com os destinos.
   Google e Outlook por link de "novo evento" (abre no browser, já
   preenchido); Apple Calendar e o resto por .ics, servido pela Edge
   Function race-calendar — no iPhone com a app instalada só um URL real com
   text/calendar abre a folha do calendário (ver o cabeçalho da função).

   Cópia única: se a prova mudar depois, o evento no calendário não muda —
   dito na persiana para ninguém contar com isso. */

const OPTION_STYLE = {
  background: 'var(--surface-glass)',
  border: '1px solid var(--border-glass)',
  borderRadius: 18,
  minHeight: 52,
  padding: '10px 12px',
  color: 'var(--text-1)',
};

function Option({ href, onClick, busy, title, hint, testId }) {
  const content = (
    <>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-extrabold">{title}</span>
        <span className="block text-[11.5px] font-semibold" style={{ color: 'var(--text-4)' }}>{hint}</span>
      </span>
      {busy
        ? <Loader2 size={15} className="shrink-0 animate-spin" aria-hidden="true" style={{ color: 'var(--text-4)' }} />
        : <ChevronRight size={15} className="shrink-0" aria-hidden="true" style={{ color: 'var(--text-4)' }} />}
    </>
  );
  const className = 'w-full text-left flex items-center gap-3';
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} style={OPTION_STYLE} data-testid={testId}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={busy} aria-busy={busy} className={className} style={OPTION_STYLE} data-testid={testId}>
      {content}
    </button>
  );
}

export default function AddToCalendar({ race, raceEventId }) {
  const [open, setOpen] = useState(false);
  const [loadingIcs, setLoadingIcs] = useState(false);
  const { showToast } = useToast();

  const ev = useMemo(() => raceCalendarEvent(race || {}), [race]);
  if (!ev || !raceEventId) return null;

  const openIcs = async () => {
    setLoadingIcs(true);
    const { data, error } = await invokeEdgeFunctionWithTimeout(
      'race-calendar',
      { body: { race_event_id: raceEventId } },
      20000,
    );
    setLoadingIcs(false);
    if (error || !data?.url) {
      showToast('Não consegui preparar o ficheiro do calendário. Tenta outra vez.', 'error');
      return;
    }
    // Navegação, não window.open: depois de um await o window.open é
    // bloqueado como pop-up, e é a navegação que o iPhone trata como
    // "adicionar ao calendário". No computador o ficheiro só descarrega.
    window.location.href = data.url;
  };

  return (
    <>
      <button
        type="button"
        data-testid="race-hub-add-calendar"
        onClick={() => setOpen(true)}
        className="w-full inline-flex items-center justify-center gap-2"
        style={{ minHeight: 'var(--tap)', marginBottom: 12, borderRadius: 14, border: '1px solid var(--border-glass)', background: 'var(--surface-glass)', color: 'var(--text-2)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
      >
        <CalendarPlus size={16} aria-hidden="true" /> Adicionar ao calendário
      </button>

      {open && (
        <Sheet eyebrow="Calendário" eyebrowTone="race" title="Adicionar ao calendário" onClose={() => setOpen(false)} testId="race-calendar-sheet">
          <div className="flex flex-col gap-2 mt-2 pb-1">
            <Option
              href={googleCalendarUrl(ev)}
              title="Google Calendar"
              hint="Abre o Google já com a prova preenchida"
              testId="race-calendar-google"
            />
            <Option
              href={outlookCalendarUrl(ev, 'personal')}
              title="Outlook"
              hint="Conta pessoal — Outlook.com, Hotmail"
              testId="race-calendar-outlook"
            />
            <Option
              href={outlookCalendarUrl(ev, 'work')}
              title="Outlook de trabalho ou escola"
              hint="Microsoft 365"
              testId="race-calendar-outlook-work"
            />
            <Option
              onClick={openIcs}
              busy={loadingIcs}
              title="Apple Calendar e outros"
              hint="Ficheiro .ics — abre no calendário do telemóvel ou do computador"
              testId="race-calendar-ics"
            />
          </div>
          <p className="text-[11.5px] mt-2 mb-1" style={{ color: 'var(--text-4)' }}>
            Fica uma cópia da prova como está agora. Se mudares a data ou a hora aqui, volta a adicioná-la.
          </p>
        </Sheet>
      )}
    </>
  );
}
