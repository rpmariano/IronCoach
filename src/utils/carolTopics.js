/* O que a Carol tem por falar com o atleta, dito por ela (pedido
   2026-09-23). O popup "A Carol precisa de falar contigo" dizia só "Tens 1
   assunto a resolver com ela" — sem dizer qual — e repetia "Carol" quatro
   vezes. Agora cada assunto diz-se na primeira pessoa, sem o motivo técnico
   (esse é escrito para ela, no chat).

   Pedido 2026-09-26: a Carol nunca pode soar a autómato — cada frase parte
   do que ela sabe, e escolhe-se pela condição que a torna verdadeira. O
   assunto do check-in dizia sempre "O teu check-in de hoje deixou-me de pé
   atrás. Quero ver contigo o treino de hoje.": um check-in de terça visto na
   quinta continuava a ser "de hoje", e num dia de descanso falava de um
   treino que não existia. Agora diz de que dia foi o check-in (hora de
   Lisboa, e sem "hoje"/"ontem" depois da meia-noite, quando ainda não se
   dormiu), o que a preocupou (a dor, as noites mal dormidas), o que ela sabe
   da vida dele (uma cirurgia recente, utils/carolVida.js), e quando quer
   falar: antes do treino de hoje, antes da partida, no dia sem treino. */
import { goalsInterventionKind } from '@formulas/goalsIntervention.ts';
import { runLoadInterventionKind } from '@formulas/runLoadAlert.ts';
import { evaluateCheckinAlarms } from '@formulas/checkinAlarms.ts';
import { checkinOptions, readCheckinReason } from './checkin';
import { carolDay, lisbonParts, raceToday } from './carolWelcome';
import { eventoDaVida } from './carolVida';

const INTERVENCAO_PENDENTE = ['needed', 'in_progress'];

const dayIndex = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000);
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

const DIAS_DA_SEMANA = [
  ['no', 'domingo'], ['na', 'segunda-feira'], ['na', 'terça-feira'], ['na', 'quarta-feira'],
  ['na', 'quinta-feira'], ['na', 'sexta-feira'], ['no', 'sábado'],
];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/**
 * Quando foi o check-in, dito a partir de hoje (dia de Lisboa):
 * { dias, quando: 'hoje' | 'ontem' | 'na terça-feira' | 'a 15 de setembro' | '',
 *   de: 'de hoje' | 'de ontem' | 'de terça-feira' | 'de 15 de setembro' | '' },
 * ou null quando não se sabe o dia. Depois da meia-noite (antes das 5h),
 * "hoje" e "ontem" ficam ambíguos para quem ainda não dormiu — o check-in da
 * manhã anterior ainda é "de hoje" para ele —, e não se dizem: fica ''.
 */
function quandoFoi(data, hoje, depoisDaMeiaNoite) {
  if (!data) return null;
  const dias = dayIndex(hoje) - dayIndex(data);
  if (!Number.isFinite(dias) || dias < 0) return null;
  if (dias <= 1 && depoisDaMeiaNoite) return { dias, quando: '', de: '' };
  if (dias === 0) return { dias, quando: 'hoje', de: 'de hoje' };
  if (dias === 1) return { dias, quando: 'ontem', de: 'de ontem' };
  const d = new Date(`${data}T00:00:00Z`);
  if (dias < 7) {
    const [prep, nome] = DIAS_DA_SEMANA[d.getUTCDay()];
    return { dias, quando: `${prep} ${nome}`, de: `de ${nome}` };
  }
  const dia = `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
  return { dias, quando: `a ${dia}`, de: `de ${dia}` };
}

/** Um motivo antigo ("Check-in de hoje:", sem data) foi escrito com as frases
 *  que evaluateCheckinAlarms dá para o dia do check-in. O dia mais recente
 *  cujos alarmes, com os check-ins de agora, estão escritos no motivo é um
 *  dia em que o atleta lhe contou exatamente isso — dizê-lo é verdade. Sem
 *  check-ins carregados, ou com o check-in já editado, não se sabe: null. */
function dataDoMotivoAntigo(reason, checkins, hoje, opts) {
  const datas = [...new Set((checkins || []).map((c) => String(c?.date || '').slice(0, 10)))]
    .filter((d) => d && d <= hoje && dayIndex(hoje) - dayIndex(d) <= 30)
    .sort()
    .reverse();
  return datas.find((d) => evaluateCheckinAlarms(checkins, d, opts).some((a) => reason.includes(a.reason))) || null;
}

/** O check-in desse dia foi corrigido e já não dá o alarme que abriu a
 *  intervenção (uma dor 5 posta por engano e corrigida para 0): o cartão diz
 *  "Sem dor" e o popup não pode continuar preocupado. Só com o check-in
 *  desse dia carregado — sem ele, não se sabe, e não se diz. */
function checkinCorrigido(motivo, data, checkins, opts) {
  if (!data || !(motivo.dor || motivo.sono)) return false;
  if (!(checkins || []).some((c) => String(c?.date || '').slice(0, 10) === data)) return false;
  const agora = evaluateCheckinAlarms(checkins, data, opts);
  const aindaDor = agora.some((a) => a.code === 'G2' || a.code === 'G5');
  const aindaSono = agora.some((a) => a.code === 'G4');
  return !(motivo.dor && aindaDor) && !(motivo.sono && aindaSono);
}

/** A prova de hoje ainda está por partir? A mesma régua das boas-vindas
 *  (carolWelcome.js, momentoDaProva): com hora marcada, até à partida; sem
 *  ela, até às 9h. */
function antesDaPartida(prova, hour, minute) {
  const hora = prova?.start_time ? String(prova.start_time).slice(0, 5) : null;
  if (!hora) return hour < 9;
  const [hh, mm] = hora.split(':').map(Number);
  return hh * 60 + mm > hour * 60 + minute;
}

/** Quando ela quer falar, pelo que o dia é. Sem o plano (`dia` null), a
 *  frase que é verdade em qualquer dia. Às 23h o treino que ficou por fazer
 *  já não é "hoje", e depois da meia-noite "amanhã" não se diz. */
function quandoFalar(dia, { hoje, hour, minute, raceEvents, depoisDaMeiaNoite }) {
  const tarde = hour >= 23 || depoisDaMeiaNoite;
  // A prova de hoje conta mesmo sem o plano: vem da agenda.
  const prova = dia ? (dia.tipo === 'prova' ? dia.prova : null) : raceToday(raceEvents, hoje);
  if (prova && antesDaPartida(prova, hour, minute)) return 'Quero falar contigo antes da partida.';
  if (dia?.tipo === 'treino' && !tarde) return 'Antes de treinares hoje, quero falar contigo.';
  if (!depoisDaMeiaNoite && raceToday(raceEvents, addDays(hoje, 1))) {
    return 'Antes da prova de amanhã, quero falar contigo.';
  }
  if ((dia?.tipo === 'descanso' || dia?.tipo === 'semTreino') && !tarde) return 'Hoje não há treino: é a altura certa para falarmos.';
  return 'Quero falar contigo antes do próximo treino.';
}

/** O que ela sabe da vida dele e pesa na preocupação: uma cirurgia, uma
 *  lesão ou uma doença que já aconteceu e de que ainda está a recuperar. */
function pesoDaVida(vida) {
  if (!vida || vida.dias < 1) return '';
  return vida.dias <= 3 ? `, ainda para mais com ${vida.a} tão recente` : `, ainda para mais em plena recuperação ${vida.da}`;
}

/** A frase do assunto aberto por um check-in. */
function linhaDoCheckin(motivo, reason, ctx) {
  const { now, profile, dailyCheckins, coachPlans, coachPlanItems, raceEvents, coachNotes } = ctx;
  const { date: hoje, hour, minute } = lisbonParts(now);
  const depoisDaMeiaNoite = hour < 5;
  const opts = checkinOptions(profile);
  const data = motivo.date || dataDoMotivoAntigo(reason, dailyCheckins, hoje, opts);
  const q = quandoFoi(data, hoje, depoisDaMeiaNoite);

  if (motivo.date && checkinCorrigido(motivo, motivo.date, dailyCheckins, opts)) {
    return `Vi que corrigiste o check-in${q?.de ? ` ${q.de}` : ''}. Quero confirmar contigo que está tudo bem.`;
  }

  const vida = pesoDaVida(eventoDaVida(coachNotes, hoje));
  let preocupacao;
  if (motivo.dor) {
    const quando = q?.quando ? ` ${q.quando}` : ' no check-in';
    preocupacao = `A dor que me contaste${quando}${motivo.repetida ? ', pelo segundo dia seguido,' : ''} preocupa-me${vida}.`;
  } else if (motivo.sono) {
    // "Tens contado" só enquanto o check-in é o de agora; depois, "contaste".
    const recente = q && (q.quando === 'hoje' || (depoisDaMeiaNoite && q.dias <= 1));
    preocupacao = `As noites mal dormidas que me ${recente ? 'tens contado' : 'contaste'} preocupam-me${vida}.`;
  } else {
    preocupacao = `O teu check-in${q?.de ? ` ${q.de}` : ''} preocupou-me${vida}.`;
  }

  // Sem os itens do plano, não se sabe o que o dia é: a frase de qualquer dia.
  const dia = Array.isArray(coachPlanItems) ? carolDay(hoje, { coachPlans, coachPlanItems, raceEvents }) : null;
  return `${preocupacao} ${quandoFalar(dia, { hoje, hour, minute, raceEvents, depoisDaMeiaNoite })}`;
}

/**
 * Uma frase por assunto por resolver, pela ordem em que interessam.
 *
 * Para o assunto do check-in falar do dia certo (2026-09-26), o Início passa
 * também o que ela precisa de saber: `coachPlanItems` e `raceEvents` (o que
 * o dia de hoje é), `dailyCheckins` (o dia de um motivo antigo, e se o
 * check-in foi corrigido), `coachNotes` (a vida dele) e `now` (o relógio,
 * para os testes). Sem eles, as frases são as que servem qualquer dia.
 */
export function pendingTopicLines({
  profile, coachPlans = [], coachGoalProposals = [],
  coachPlanItems, raceEvents = [], dailyCheckins = [], coachNotes = [], now = new Date(),
} = {}) {
  const lines = [];
  if (INTERVENCAO_PENDENTE.includes(profile?.coach_intervention_status)) {
    const reason = profile?.coach_intervention_reason || '';
    const objetivos = goalsInterventionKind(reason);
    const carga = runLoadInterventionKind(reason);
    const checkin = readCheckinReason(reason);
    if (objetivos === 'definir') lines.push('Vi a tua avaliação corporal. Quero definir contigo os teus objetivos.');
    else if (objetivos === 'rever') lines.push('A tua última avaliação mostra que os teus objetivos já não servem. Quero revê-los contigo.');
    else if (checkin) {
      lines.push(linhaDoCheckin(checkin, reason, { now, profile, dailyCheckins, coachPlans, coachPlanItems, raceEvents, coachNotes }));
    }
    // A carga conta-se numa janela de 7 dias, não na semana do calendário
    // (2026-09-26): aberta ao domingo e vista na terça, "esta semana" era
    // uma semana com uma corrida.
    else if (carga === 'acima_do_plano') lines.push('Nos últimos dias correste bem mais do que o plano previa. Quero ver contigo como ficam os próximos.');
    else if (carga === 'sem_plano') lines.push('A tua carga de corrida subiu muito face às últimas semanas. Quero ver contigo como ficam os próximos dias.');
    // Aberta por uma refeição de segunda e vista na quarta, "o teu último
    // registo" já era a corrida de quarta (2026-09-26): sem a origem no
    // perfil, não se diz qual.
    else lines.push('Num registo teu, há uma coisa que quero ver contigo.');
  }
  const planos = (coachPlans || []).filter((p) => p?.status === 'proposto').length;
  if (planos === 1) lines.push('Tens um plano meu à espera que o aceites ou recuses.');
  else if (planos > 1) lines.push(`Tens ${planos} planos meus à espera que os aceites ou recuses.`);
  if ((coachGoalProposals || []).some((g) => g?.status === 'proposto')) lines.push('Tens objetivos meus à espera da tua decisão.');
  return lines;
}
