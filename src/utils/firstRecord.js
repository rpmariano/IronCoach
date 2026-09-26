/* O primeiro registo de cada tipo — o momento que ele é.

   CAROL.md: "Elogios automáticos a cada registo. Uma treinadora que aplaude
   tudo perde credibilidade ao terceiro dia. Reconhece o que é excecional."
   O registo de todos os dias continua a ser o visto de 900 ms. O PRIMEIRO de
   cada tipo é excecional: é quando a Carol passa a ter por onde começar —
   e a Home do primeiro dia prometeu-o ("os anéis enchem-se com o teu
   primeiro registo"). Aí a confirmação prolonga-se e é ela a dizê-lo, uma
   vez por tipo, para sempre.

   Puro: recebe o estado do store e o registo acabado de criar (que pode ou
   não já estar na lista — conta-se sem ele). */

const LISTA = { run: 'runs', meal: 'meals', gym: 'gymSessions', body: 'bodyAssessments' };

const FRASE = {
  run: (record) => primeiraCorrida(record),
  meal: { title: 'A primeira refeição.', sub: 'Os anéis começam a encher-se a partir daqui. É assim que percebo como comes.' },
  gym: (record) => primeiroGinasio(record),
  body: { title: 'A primeira avaliação.', sub: 'É o ponto de partida. Tudo o que o corpo mudar, vou medir contra isto.' },
};

/* A primeira corrida diz só o que o registo tem (revisão de 2026-09-26).
   O "Continuar assim mesmo" da persiana das métricas em falta deixa gravar
   sem tempo (ou sem distância): sem os dois não há ritmo nem esforço, e «o
   teu ritmo, a tua distância, o teu esforço» afirmava os três. Sem o
   registo à mão, a frase de sempre. */
function primeiraCorrida(record) {
  const title = 'A primeira corrida.';
  const tempo = !record || Number(record.duration_seconds) > 0;
  const distancia = !record || Number(record.distance_km) > 0;
  if (tempo && distancia) {
    return { title, sub: 'Agora já sei por onde começar: o teu ritmo, a tua distância, o teu esforço.' };
  }
  if (distancia) return { title, sub: 'Já sei a tua distância. Com o tempo, fico a saber o teu ritmo.' };
  if (tempo) return { title, sub: 'Já sei quanto tempo correste. Com a distância, fico a saber o teu ritmo.' };
  return { title, sub: 'É o teu ponto de partida. Com a distância e o tempo, fico a saber o teu ritmo.' };
}

/* O primeiro registo de ginásio diz-se pelo que ele é (pedido 2026-09-26).
   "Já sei o que levantas" era a frase de sempre — e era falsa quando o
   primeiro registo é uma aula de pilates ou de spinning (não há cargas
   nenhumas), ou um treino de força gravado sem séries: ela afirmava saber
   uma coisa que o registo não tem, e é isso que a faz soar a máquina. Cada
   frase escolhe-se pela condição que a torna verdadeira:
   - aula (`kind === 'aula'`): a modalidade, quando é uma só, e a promessa
     que a análise cumpre — a analyze-gym compara cada sessão com as
     anteriores do mesmo tipo (duração, calorias, esforço), e a partir da
     segunda já tem com que comparar;
   - força com cargas: sabe o que levantas;
   - força só com repetições (peso do corpo): sabe as repetições — pedir
     "as cargas" a quem faz flexões era outro disparate;
   - força sem séries: pede os exercícios e as cargas, e diz porquê (a não
     ser que venham escritos nas notas — ver abaixo);
   - sem o registo à mão: a frase que serve a qualquer um. */

// A modalidade como se diz a meio da frase: os nomes comuns em minúscula,
// as marcas e as siglas como estão (CLASS_TYPES em GymRegistration.jsx).
const MODALIDADE = { Pilates: 'pilates', Yoga: 'yoga', Zumba: 'zumba', 'Natação': 'natação', 'Treino Funcional': 'treino funcional' };

function modalidadeDaAula(record) {
  const tipos = (Array.isArray(record?.class_types) ? record.class_types : [])
    .filter((t) => typeof t === 'string' && t.trim() && t.trim() !== 'Outro');
  // Duas modalidades numa aula não cabem numa frase curta: fica "A primeira aula."
  if (tipos.length !== 1) return null;
  const t = tipos[0].trim();
  return MODALIDADE[t] || t;
}

function primeiroGinasio(record) {
  if (!record) {
    return { title: 'O primeiro treino de ginásio.', sub: 'É o teu ponto de partida. Da próxima vez, já tenho com que comparar.' };
  }
  if (record.kind === 'aula') {
    const modalidade = modalidadeDaAula(record);
    return {
      title: modalidade ? `A primeira aula de ${modalidade}.` : 'A primeira aula.',
      sub: 'É o teu ponto de partida. Da próxima vez, já tenho com que comparar.',
    };
  }
  const series = Array.isArray(record.workout_session_sets) ? record.workout_session_sets : [];
  const title = 'O primeiro treino de ginásio.';
  if (series.some((s) => Number(s?.weight) > 0)) {
    return { title, sub: 'Já sei o que levantas. Da próxima vez, digo-te se é para subir.' };
  }
  if (series.some((s) => Number(s?.reps) > 0)) {
    return { title, sub: 'Já sei quantas repetições fazes. Da próxima vez, digo-te se é para subir.' };
  }
  /* Sem séries, mas com o treino escrito (revisão de 2026-09-26). O registo
     manual não tem campos de séries: quem o usa escreve os exercícios e as
     cargas no "Contexto do treino", e a analyze-gym lê-os daí — e o registo
     a partir do plano já traz lá a instrução dela. Pedir-lhe «regista
     também os exercícios e as cargas» era pedir o que acabou de escrever.
     Fica a frase do ponto de partida, que a análise cumpre. */
  if (typeof record.notes === 'string' && record.notes.trim()) {
    return { title, sub: 'É o teu ponto de partida. Da próxima vez, já tenho com que comparar.' };
  }
  return { title, sub: 'Da próxima vez, regista também os exercícios e as cargas: é com eles que te digo se é para subir.' };
}

function semEste(list, record) {
  const id = record?.id;
  return (list || []).filter((r) => !id || r?.id !== id);
}

/**
 * { title, sub, everFirst } quando este é o primeiro registo do tipo; null
 * nos outros. `everFirst`: o primeiro registo de sempre, de qualquer tipo.
 */
export function firstRecordMoment(kind, state = {}, record = null) {
  const chave = LISTA[kind];
  if (!chave || !FRASE[kind]) return null;
  if (semEste(state[chave], record).length > 0) return null;
  const everFirst = Object.values(LISTA).every((k) => semEste(state[k], record).length === 0);
  const frase = typeof FRASE[kind] === 'function' ? FRASE[kind](record) : FRASE[kind];
  return { ...frase, everFirst };
}
