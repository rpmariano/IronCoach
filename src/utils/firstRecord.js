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
  run: { title: 'A primeira corrida.', sub: 'Agora já sei por onde começar. Mais duas e digo-te onde está o teu ritmo de base.' },
  meal: { title: 'A primeira refeição.', sub: 'Os anéis começam a encher-se a partir daqui. É assim que percebo como comes.' },
  gym: { title: 'O primeiro treino de ginásio.', sub: 'Já sei o que levantas. Da próxima vez, digo-te se é para subir.' },
  body: { title: 'A primeira avaliação.', sub: 'É o ponto de partida. Tudo o que o corpo mudar, vou medir contra isto.' },
};

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
  return { ...FRASE[kind], everFirst };
}
