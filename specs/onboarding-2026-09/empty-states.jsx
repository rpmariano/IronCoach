/*
 * Estados vazios em falta. Tudo reaproveita peças que já existem
 * (EmptyModuleState, setOpenCreationMode); nenhum componente novo de base.
 * Ordem = impacto num utilizador novo.
 */

// ═══ 1. Prontidão com poucos dados: "a calibrar" em vez de "18% · Baixa" ═══
// Onde: src/components/BI/RaceReadinessCard.jsx
//
// Problema: com 2 corridas e nada mais, o cartão mostra 18% a vermelho,
// "Prontidão Baixa" e três pilares a 0%. Para quem acabou de chegar isso lê-se
// como "estás mal preparado", quando a verdade é "ainda não sei". O próprio
// OverviewDashboard já assume isto no estado sem registos ("A prontidão
// precisa de duas semanas de registos…"), mas deixa de o dizer ao primeiro
// registo.
//
// Proposta: um limiar de dados, calculado ao lado do readiness:

import { subDays, format } from 'date-fns';

/** Dias distintos com algum registo nos últimos 14 dias. Abaixo de 5, a
 *  prontidão não diz nada útil: mostra-se "a calibrar". O número 5 é uma
 *  proposta (≈ 2-3 treinos/semana + alguma refeição); ajustar com a Carol
 *  se o motor usar outra janela. */
export function readinessCalibration({ runs, meals, gymSessions, bodyAssessments }, today = new Date()) {
  const from = format(subDays(today, 13), 'yyyy-MM-dd');
  const days = new Set(
    [...(runs || []), ...(meals || []), ...(gymSessions || []), ...(bodyAssessments || [])]
      .map((r) => String(r?.date || '').slice(0, 10))
      .filter((d) => d && d >= from),
  );
  const need = 5;
  return { calibrating: days.size < need, have: days.size, need };
}

// No cartão, quando calibrating:
//   - o anel fica tracejado a cinzento (como o EmptyChartFrame), com "—" no
//     lugar da percentagem e "A calibrar" por baixo;
//   - "Prontidão Baixa" é substituído por:
//       `Faltam-me ${need - have} dias com registos para te dizer como estás.`
//   - os pilares mostram "—" em vez de "0%" e a barra fica vazia sem cor
//     (var(--text-4)); o 0% vermelho sai.
//   - o bloco da prova (nome, fase, dias) fica igual: isso não depende dos
//     registos.
// Teste: 2 corridas no mesmo dia → calibrating true, have 1.


// ═══ 2. Calendário vazio ══════════════════════════════════════════════════
// Onde: src/components/Calendar/Calendar.jsx:424-429
//
// Hoje: caixa tracejada "Sem registos neste dia", sem ação. Para um
// utilizador sem nenhum registo, o calendário inteiro está vazio e a caixa
// não o diz.
//
// Proposta: dois casos.
//   a) NENHUM registo em lado nenhum (runs, gym, meals, body e raceEvents
//      todos vazios): EmptyModuleState no lugar da caixa.
//   b) Há registos, mas não neste dia: a caixa de hoje + um botão pequeno,
//      só se o dia selecionado for hoje ou no passado (não se regista uma
//      corrida no futuro; no futuro o botão é "Marcar prova").
//
// Precisa de setOpenCreationMode no destructuring do useAppStore (linha 66).

/*
  const nothingAnywhere = !runs?.length && !gymSessions?.length && !meals?.length
    && !bodyAssessments?.length && !raceEvents?.length;

  {!hasRecords && (nothingAnywhere ? (
    <EmptyModuleState
      icon={<CalendarIcon size={22} />}
      title="O teu calendário começa aqui"
      actionLabel="Registar o primeiro treino"
      onAction={() => setOpenCreationMode('run')}
    >
      Cada corrida, treino, refeição e prova aparece no dia em que aconteceu. Toca num dia para ver o que fizeste.
    </EmptyModuleState>
  ) : (
    <div className="rounded-2xl p-6 bg-[var(--surface-dim)] border border-white/15 border-dashed flex flex-col items-center justify-center text-[var(--text-3)]">
      <CalendarIcon size={24} className="opacity-40 mb-2" />
      <p className="text-[11px]">{emptyDayMessage(filter)}</p>
      {selectedDayStr <= todayStr ? (
        <button type="button" onClick={() => setOpenCreationMode(creationModeFor(filter))}
          className="mt-3 min-h-[44px] px-4 rounded-xl text-[12px] font-bold border border-[var(--border-glass)] text-[var(--text-2)]">
          {registerLabelFor(filter)}
        </button>
      ) : (
        <button type="button" onClick={() => setOpenCreationMode('race')} className="…mesmas classes…">
          Marcar prova
        </button>
      )}
    </div>
  ))}
*/

// Mapeamento filtro → formulário (em utils/calendarFilter.js, ao lado de
// emptyDayMessage, para os dois não divergirem):
export const REGISTER_BY_TYPE = {
  todos: { mode: 'run', label: 'Registar neste dia' },
  corrida: { mode: 'run', label: 'Registar corrida' },
  ginasio: { mode: 'workout', label: 'Registar treino' },
  nutricao: { mode: 'meal', label: 'Registar refeição' },
  corpo: { mode: 'assessment', label: 'Registar avaliação' },
  prova: { mode: 'race', label: 'Marcar prova' },
};
// ⚠ Os formulários abrem com a data de HOJE: o store não tem um "prefill de
// data" para registos (só pendingCalendarDate, que é o inverso). Enquanto
// não houver, o rótulo "Registar neste dia" mente para dias passados. Duas
// saídas: (1) acrescentar registerPrefillDate ao store e lê-lo nos 4
// formulários; (2) mostrar o botão só quando o dia selecionado é hoje.
// A (2) é a melhoria rápida; a (1) é a certa.
// Os modos são os do menu + (Layout.jsx:282-315 e App.jsx:1021-1039):
// run, workout, meal, assessment, race.


// ═══ 3. Calendários por módulo ════════════════════════════════════════════
// RunCalendar.jsx:168, GymCalendar.jsx:119, NutritionCalendar.jsx:164,
// BodyCalendar.jsx:120: a mesma regra do ponto 2b, com o rótulo do módulo.


// ═══ 4. Ginásio › Aulas ═══════════════════════════════════════════════════
// GymDashboard.jsx:292-297: o texto já explica; falta o botão.
/*
  <button type="button" onClick={() => setOpenCreationMode('workout')}
    className="mt-3 min-h-[44px] px-4 rounded-xl text-[12px] font-bold"
    style={{ background: 'var(--tint-gym-bg)', border: '1px solid var(--tint-gym-bd)', color: 'var(--gym)' }}>
    Registar aula
  </button>
*/


// ═══ 5. Pilares e ACWR com "Sem dados" nu ═════════════════════════════════
// OverviewDashboard.jsx:67/121/135, RunDashboard.jsx:240 e :326, ACWRChart.jsx:66-71.
// "Sem dados" sozinho não diz o que fazer. Substituir por quanto falta:
export const NOT_ENOUGH = {
  acwr: (weeksHave) => `Faltam ${Math.max(0, 4 - weeksHave)} semanas de corridas`,
  nutricao: 'Regista uma refeição',
  corpo: 'Regista uma avaliação',
  ginasio: 'Regista um treino com pesos',
  distribuicao: 'Precisa de corridas com zonas de FC',
};
// O Overview já calcula as semanas para a frase da Carol ("Preciso de
// quatro semanas seguidas…"): reutilizar esse valor em vez de o recontar.


// ═══ 6. Vitrina › badges ══════════════════════════════════════════════════
// BadgesCard.jsx:164: "Aparecem aqui à medida que os ganhares."
// Proposta: "O mais perto é {nome}: {o que falta}." Os dados já existem
// (a Vitrina mostra "Os Quilómetros — faltam 480 km para bronze"); é ligar
// o badge mais próximo a este estado vazio.


// ═══ 7. Corpo: "print da Renpho Health" ═══════════════════════════════════
// BodyDashboard.jsx:159-166. Para quem não tem uma Renpho, o nome não diz
// nada. Texto proposto:
export const BODY_EMPTY_COPY =
  'Ainda não há avaliações neste período. Regista o peso à mão, ou envia um print da tua balança inteligente (por exemplo, a Renpho) e eu leio os valores.';
