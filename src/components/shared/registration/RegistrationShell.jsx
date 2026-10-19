import React from 'react';
import { X } from 'lucide-react';
import UnsavedChangesModal from '../UnsavedChangesModal';
import RecordConfirmation from '../RecordConfirmation';
import ActionBar, { ACTION_BAR_SCROLL_PAD } from '../ActionBar';

/* A moldura comum dos registos (registo unificado, specs/plano-registo-plano-coach.md
   §1, decisão 12 — feita com o Corpo, o registo mais pequeno, antes da
   Corrida). O que é igual em todos fica aqui; o que é de cada módulo
   (campos, leitura de prints, gravação) fica em quem a usa:

   · o cartão em vidro com a lavagem na cor do módulo (`accent`);
   · o cabeçalho — ícone, título, fechar (com o aviso se houver alterações);
   · `status`: a espera e a falha da análise, acima do formulário;
   · `busy`: o formulário bloqueado enquanto a Carol trabalha;
   · o aviso de saída, a confirmação do registo e a ActionBar fixa.

   O estado da saída vem de useRegistrationExit (passado em `exit`). */
export default function RegistrationShell({
  accent, icon: Icon, title, exit, status = null, busy = false,
  onSaveAndLeave, isSaving = false, confirmation = null, primaryAction, children,
  // A Refeição: o cartão recorta o que sobe com o teclado, a barra sai com ele,
  // e os testes procuram o bloco dos campos pelo id.
  cardClassName = '', actionBarClassName = '', bodyTestId = undefined,
}) {
  return (
    // --focus-ring: anel de teclado na cor do módulo (handoff, "Fidelity").
    <div className="space-y-4 fade-in" style={{ '--focus-ring': accent, paddingBottom: ACTION_BAR_SCROLL_PAD }}>
      <div
        className={`module-card-contrast ${cardClassName}`.trim()}
        // O mesmo vidro fosco do resto da app, com a cor do módulo por cima, bem subtil.
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 3%, transparent), color-mix(in srgb, ${accent} 6%, transparent)), rgba(255, 255, 255, 0.05)`,
        }}
      >
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="w-5 h-5" style={{ color: accent }} aria-hidden="true" />}
            <h2 className="text-sm font-semibold text-[var(--text-1)]">{title}</h2>
          </div>
          <button
            onClick={exit.requestClose}
            type="button"
            // O círculo desenha-se com 32px; a área tocável à volta tem 44 (--tap).
            className="tap-44 shrink-0"
            title="Fechar"
            aria-label="Fechar"
          >
            <span className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--surface-glass)] text-[var(--text-3)] hover:bg-[var(--surface-strong)] transition-colors">
              <X size={16} />
            </span>
          </button>
        </div>

        {status}

        <div data-testid={bodyTestId} aria-busy={busy || undefined} style={busy ? { opacity: 0.45, pointerEvents: 'none' } : undefined}>
          {children}
        </div>
      </div>

      <UnsavedChangesModal
        isOpen={exit.showUnsaved}
        isSaving={isSaving}
        onSaveAndLeave={onSaveAndLeave}
        onDiscardAndLeave={exit.close}
        onCancel={exit.cancelLeave}
      />

      {confirmation && <RecordConfirmation label={confirmation.label} first={confirmation.first} onDone={confirmation.done} />}

      <ActionBar className={actionBarClassName || undefined}>{primaryAction}</ActionBar>
    </div>
  );
}
