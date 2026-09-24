import React, { useState } from 'react';
import { Route as RouteIcon, Droplet, Zap, Download, Share2 } from 'lucide-react';
import Button from '../shared/Button';
import GlassCard from '../shared/GlassCard';
import SectionLabel from '../shared/SectionLabel';
import Warning, { WarningAction } from '../shared/Warning';
import { formatPace, formatDuration } from '../../utils/run';
import { normalizeStartTime } from '../../utils/startTime';
import {
  kmLabel as km, FUEL_LABEL, basisLabel as basisLabelOf,
  renderRacePlanFile, downloadFile, shareOrDownload, canShareFiles,
} from '../../utils/racePlanImage';

/* ── Cartão "Plano para o dia" (specs/plano-de-prova.md §"Onde aparece" 1) ──
   Vive no hub da prova, nos últimos 7 dias e no próprio dia. Um plano de
   prova é uma tabela, não um conselho: para cada troço, o ritmo, o tempo de
   passagem e a instrução. A régua é uma só — buildRacePacingPlan em
   @formulas/racePacing.ts, a mesma que a Carol lê no coach-chat — por isso
   este ficheiro não decide nada: só apresenta o que o plano diz.

   O cartão sai do RaceHubView.jsx para ficheiro próprio porque o hub já
   passa das mil linhas; a decisão de o mostrar (janela de 7 dias) continua
   lá, junto ao resto do estado ANTES da prova.

   "Guardar como imagem" (ação P.13) faz do plano uma imagem para a manhã da
   prova sem rede — utils/racePlanImage.js, onde vivem também os textos que
   o cartão e a imagem partilham (km, abastecimento, a base do plano). */

/* A cor diz o significado (redesenho 6c, ponto 3): o âmbar é da prova e
   fica reservado ao ponto de decisão, o verde ao que é para ganhar tempo, o
   coral ao relevo que obriga a mudar de ritmo. O trabalho regular
   (controlar/ritmo/aguentar) não é acontecimento nenhum — texto-3. */
const LABEL_COLOR = {
  controlar: 'var(--text-3)',
  ritmo: 'var(--text-3)',
  aguentar: 'var(--text-3)',
  decidir: 'var(--race)',
  acelerar: 'var(--ok)',
  subida: 'var(--warn)',
  descida: 'var(--warn)',
};

export default function RacePacingPlanCard({
  plan,
  race,
  onGoToEdit,
  onFetchWebInfo,
  fetchingWebInfo = false,
}) {
  /* O percurso só se pode ir buscar se houver site e ainda não houver
     extração feita — é o mesmo onFetchWebInfo do cartão "Informação do Site
     Oficial", aqui repetido junto ao plano porque é aqui que a falta se
     nota. */
  const canFetchRoute = !!onFetchWebInfo && !race?.web_info && !!race?.website?.toString().trim();

  /* Guardar o plano como imagem (ação P.13). Guardar descarrega; partilhar
     abre a folha do sistema (no iPhone é por aí que se guarda nas Fotos) e,
     sem suporte para ficheiros, descarrega. Cancelar a partilha não é erro. */
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState('');
  const canShare = canShareFiles();
  const saveImage = async ({ viaShare = false } = {}) => {
    setImageError('');
    setImageBusy(true);
    try {
      const file = await renderRacePlanFile(plan, race);
      if (viaShare) await shareOrDownload(file, race?.name ? `Plano · ${race.name}` : 'O meu plano de prova');
      else downloadFile(file);
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.warn('Guardar o plano falhou', err);
        setImageError(viaShare
          ? 'Não consegui abrir a partilha. Guarda a imagem e abre-a a partir da galeria.'
          : 'Não consegui guardar a imagem. Tenta outra vez.');
      }
    } finally {
      setImageBusy(false);
    }
  };

  /* A hora de partida (specs/plano-de-prova.md, "A véspera e a hora"). Sem
     ela a Carol planeia a véspera e a manhã em abstrato — "acorda cedo" em
     vez de "acorda às 06:00" —, por isso o cartão pede-a aqui, onde a falta
     se nota, e encaminha para o mesmo "Editar detalhes" da agenda. */
  const startTime = normalizeStartTime(race?.start_time);

  const editCta = onGoToEdit ? (
    <Button
      variant="light"
      size="sm"
      onClick={onGoToEdit}
      type="button"
      data-testid="race-pacing-edit"
      className="w-full mt-3"
      style={{ minHeight: 'var(--tap)' }}
    >
      Editar detalhes
    </Button>
  ) : null;

  const startTimeNote = startTime ? (
    <p
      data-testid="race-pacing-start-time"
      className="text-[11.5px] leading-[1.45] mt-2"
      style={{ color: 'var(--text-4)' }}
    >
      Partida às {startTime}
    </p>
  ) : (
    <p
      data-testid="race-pacing-start-time-missing"
      className="text-[11.5px] leading-[1.45] mt-2"
      style={{ color: 'var(--text-4)' }}
    >
      Sem hora de partida: marca-a para a Carol planear a véspera
    </p>
  );

  const routeCta = canFetchRoute ? (
    <div style={{ marginTop: 12 }}>
      <p className="text-[11.5px] leading-[1.45]" style={{ color: 'var(--text-4)' }}>
        Sem o percurso o plano não ajusta subidas e descidas.
      </p>
      <Button
        variant="module"
        moduleColor="var(--mod-prova)"
        size="sm"
        isLoading={fetchingWebInfo}
        onClick={onFetchWebInfo}
        type="button"
        data-testid="race-pacing-fetch-route"
        className="w-full mt-2"
        style={{ minHeight: 'var(--tap)' }}
        icon={<RouteIcon size={13} />}
      >
        Buscar o percurso
      </Button>
    </div>
  ) : null;

  // Sem plano: falta o objetivo (ou a previsão do treino) para o montar.
  if (!plan) {
    return (
      <>
        <SectionLabel tone="race" style={{ margin: '16px 2px 0' }}>Plano para o dia</SectionLabel>
        <GlassCard tone="race" data-testid="race-pacing-card" style={{ marginTop: 8, marginBottom: 12 }}>
          <p className="text-[12.5px] leading-[1.5]" style={{ color: 'var(--text-3)' }}>
            Marca um objetivo de tempo para eu montar o plano.
          </p>
          {startTimeNote}
          {editCta}
          {routeCta}
        </GlassCard>
      </>
    );
  }

  const effort = plan.effortMode;
  // A nota do objetivo ambicioso é a primeira que o motor escreve e vai para
  // o cabeçalho, em --warn; as restantes ficam no fim, em texto corrido.
  const ambitiousNote = plan.ambitious ? plan.notes[0] : null;
  const notes = plan.ambitious ? plan.notes.slice(1) : plan.notes;

  const basisLabel = basisLabelOf(plan);

  return (
    <>
      <SectionLabel tone="race" style={{ margin: '16px 2px 0' }}>Plano para o dia</SectionLabel>
      <GlassCard tone="race" glow data-testid="race-pacing-card" style={{ marginTop: 8, marginBottom: 12 }}>
        {/* Cabeçalho: a chegada planeada é a soma dos troços, não o objetivo. */}
        <div className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: 'var(--tracking-eyebrow)', color: 'var(--race)' }}>
          Chegada planeada
        </div>
        <div
          data-testid="race-pacing-finish"
          style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-1)', lineHeight: 1.1, letterSpacing: '-.02em', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}
        >
          {formatDuration(Math.round(plan.plannedFinishSeconds))}
        </div>
        <p className="text-[12px] mt-1" style={{ color: 'var(--text-3)' }}>
          {effort ? `${basisLabel} · por esforço` : basisLabel}
        </p>
        {ambitiousNote && (
          <p data-testid="race-pacing-ambitious" className="text-[11.5px] leading-[1.45] mt-2" style={{ color: 'var(--warn)' }}>
            {ambitiousNote}
          </p>
        )}

        {/* A hora: uma linha só, e o atalho para a marcar quando falta. */}
        {startTimeNote}
        {!startTime && editCta}

        {/* A tabela. Cada troço numa linha: km, ritmo e passagem em cima,
            rótulo e instrução por baixo. Em trail o ritmo é referência
            (texto-4), porque o que manda é o esforço. */}
        <div data-testid="race-pacing-rows" style={{ marginTop: 14 }}>
          {plan.rows.map((row) => (
            <div
              key={`${row.fromKm}-${row.toKm}`}
              style={{
                padding: '10px 0',
                borderTop: '1px solid var(--border-faint)',
              }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12px] font-bold" style={{ color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
                  km {km(row.fromKm)} a {km(row.toKm)}
                </span>
                <span className="flex items-baseline gap-2 shrink-0">
                  <span
                    className="text-[12.5px] font-extrabold"
                    style={{ color: effort ? 'var(--text-4)' : 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}
                  >
                    {formatPace(row.paceSecPerKm)}/km
                  </span>
                  <span className="text-[12px]" style={{ color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatDuration(row.cumulativeSeconds)}
                  </span>
                </span>
              </div>

              {row.route && (
                <p className="text-[11.5px] leading-[1.4] mt-1" style={{ color: 'var(--text-4)', fontStyle: 'italic' }}>
                  {row.route}
                </p>
              )}

              <p className="text-[11.5px] leading-[1.45] mt-1" style={{ color: 'var(--text-3)' }}>
                <span
                  className="text-[11px] font-extrabold uppercase"
                  style={{ letterSpacing: '.06em', color: LABEL_COLOR[row.label] || 'var(--text-3)' }}
                >
                  {row.label}
                </span>
                {' · '}
                {row.instruction}
              </p>
            </div>
          ))}
        </div>

        {/* Abastecimento: uma linha de marcos, não um plano nutricional. */}
        {plan.fuel.length > 0 && (
          <div data-testid="race-pacing-fuel" className="flex flex-wrap gap-1.5" style={{ marginTop: 12 }}>
            {plan.fuel.map((f) => (
              <span
                key={`${f.km}-${f.what}`}
                className="inline-flex items-center gap-1 text-[11px] font-bold"
                style={{
                  padding: '5px 9px',
                  borderRadius: 999,
                  background: 'var(--surface-faint)',
                  border: '1px solid var(--border-glass)',
                  color: 'var(--text-3)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {f.what === 'agua' ? <Droplet size={11} /> : <Zap size={11} />}
                km {km(f.km)} · {FUEL_LABEL[f.what] || f.what}
              </span>
            ))}
          </div>
        )}

        {notes.length > 0 && (
          <div data-testid="race-pacing-notes" style={{ marginTop: 12 }}>
            {notes.map((note) => (
              <p key={note} className="text-[11.5px] leading-[1.45]" style={{ color: 'var(--text-3)', marginTop: 4 }}>
                {note}
              </p>
            ))}
          </div>
        )}

        {/* Guardar o plano (ação P.13): a imagem para a manhã da prova sem rede. */}
        <div className="flex gap-2" style={{ marginTop: 14 }}>
          <Button
            variant="module"
            moduleColor="var(--mod-prova)"
            size="sm"
            isLoading={imageBusy}
            onClick={() => saveImage()}
            type="button"
            data-testid="race-pacing-save-image"
            className="flex-1"
            style={{ minHeight: 'var(--tap)' }}
            icon={<Download size={13} />}
          >
            {/* "como imagem": no hub, a barra "Guardar prova" está logo abaixo,
                e "Guardar o plano" lia-se como gravar o plano. */}
            Guardar como imagem
          </Button>
          {canShare && (
            <Button
              variant="light"
              size="sm"
              disabled={imageBusy}
              onClick={() => saveImage({ viaShare: true })}
              type="button"
              data-testid="race-pacing-share-image"
              aria-label="Partilhar o plano"
              style={{ minHeight: 'var(--tap)', minWidth: 'var(--tap)' }}
            >
              <Share2 size={15} />
            </Button>
          )}
        </div>
        {imageError && (
          <Warning title="Plano" className="mt-3" actions={<WarningAction onClick={() => saveImage()}>Guardar a imagem</WarningAction>}>
            {imageError}
          </Warning>
        )}

        {routeCta}
      </GlassCard>
    </>
  );
}
