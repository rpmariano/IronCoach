/* ════════════════════════════════════════════════════════════════════════
   Tutorial da App — A Carol mostra-te a casa (specs/onboarding-tutorial.md)

   Guia rápido pelos cinco pilares essenciais do IronCoach:
   1. A Carol (A tua treinadora pessoal dedicada)
   2. O Início (Ordem do dia e o que fazer hoje)
   3. O Botão Central (+) (Registo com leitura de prints por IA)
   4. Provas e o Plano (Metas, tapering e percursos)
   5. O Chat da Carol (Ajustes de treino, dores e dúvidas)

   O estado de conclusão vive em localStorage por utilizador
   (`ironcoach_tutorial_done_${userId}`) para não se repetir a cada sessão,
   mas permanece reentrável a qualquer altura pelo separador Perfil ou pelo
   parâmetro `?tutorial=1` em desenvolvimento.
   ════════════════════════════════════════════════════════════════════════ */

export const TUTORIAL_LOCAL_KEY_PREFIX = 'ironcoach_tutorial_done_';

export const tutorialLocalKey = (userId) => `${TUTORIAL_LOCAL_KEY_PREFIX}${userId || 'anon'}`;

export function isTutorialDoneLocally(userId) {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    return window.localStorage.getItem(tutorialLocalKey(userId)) === '1';
  } catch (_) {
    return false;
  }
}

export function markTutorialDoneLocally(userId) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(tutorialLocalKey(userId), '1');
  } catch (_) {
    // Modo privado/quota cheia — tolera falha silenciosa
  }
}

export function resetTutorialLocally(userId) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(tutorialLocalKey(userId));
  } catch (_) {
    // Modo privado — tolera falha silenciosa
  }
}

export const TUTORIAL_STEPS = [
  {
    id: 'carol',
    badge: 'A tua Treinadora Pessoal',
    title: 'Mais do que uma app, tens uma PT ao teu lado',
    lead: 'Empática, atenta e 100% focada no teu bem-estar.',
    description: 'Eu sou a Carol. Não sou um algoritmo frio nem uma folha de cálculo: sou a tua treinadora pessoal dedicada. Compreendo o cansaço do dia a dia, as semanas complicadas de trabalho e as dores musculares. O meu compromisso é cuidar de ti e calibrar o treino para evoluíres com saúde, confiança e sem lesões.',
    tip: 'Estou disponível 24 horas por dia. Se tiveres um dia difícil, diz-me logo — descansar também é treinar.',
    iconKey: 'coach',
    tone: 'coach',
  },
  {
    id: 'omniscience',
    badge: 'Inteligência e Atenção ao Detalhe',
    title: 'Omnisciente: Reparo em tudo o que fazes',
    lead: 'Cruzo sono, esforço, nutrição, ritmo e até a meteorologia.',
    description: 'Vejo o quadro completo da tua rotina: a hora a que corres, o impacto da passada, se dormiste pouco, as calorias que ingeriste e o terreno da tua próxima prova. Leio prints do teu Garmin, Strava ou Apple Watch e fotos das tuas refeições — extraio tudo num instante para não teres de preencher formulários chatos.',
    tip: 'Se eu notar que a tua recuperação está atrasada ou que a carga foi excessiva, aviso-te antes que surja uma lesão.',
    iconKey: 'plus',
    tone: 'race',
  },
  {
    id: 'omnipresence',
    badge: 'Sempre Presente',
    title: 'Omnipresente: Acompanho-te em cada ecrã',
    lead: 'Da primeira saudação matinal até ao teu último copo de água.',
    description: 'Estou em todo o lado na app: no Início com o teu plano do dia e meteorologia para a corrida, no botão central (+) pronta para analisar os teus registos, a recalibrar os teus blocos no calendário e a vibrar com as tuas conquistas. Nunca estás sozinho nesta jornada.',
    tip: 'Logo de manhã, quando abres a app, deixo-te uma recomendação personalizada ajustada ao teu dia.',
    iconKey: 'home',
    tone: 'coach',
  },
  {
    id: 'provas',
    badge: 'O Teu Grande Objetivo',
    title: 'Levamos-te à meta com total confiança',
    lead: 'Calendário inteligente, semanas de tapering e percurso km a km.',
    description: 'Quer seja a tua primeira corrida de 10 km, uma maratona ou um trail técnico, desmonto a prova em etapas realistas. Calculo os ritmos certos, a semana de descarga (tapering), o que comer na véspera e a hidratação exata para o grande dia.',
    tip: 'No dia da prova não tens ansiedade nem dúvidas: o plano está traçado na tua cabeça e tu estás preparado.',
    iconKey: 'trophy',
    tone: 'race',
  },
  {
    id: 'chat',
    badge: 'Conversa Direta e Aberta',
    title: 'Uma conversa resolve qualquer imprevisto',
    lead: 'Tu mandas na tua rotina, eu adapto o treino.',
    description: 'Sentes uma fisgada no gémeo? A semana complicou-se e precisas de mudar o dia do treino longo? Abre o meu chat e conversa comigo como farias com um treinador presencial. Adapto o calendário em segundos, com empatia, flexibilidade e carinho.',
    tip: 'Agora que já nos conhecemos, vamos ao teu arranque para eu saber quem és e desenhar o teu plano!',
    iconKey: 'chat',
    tone: 'coach',
  },
];
