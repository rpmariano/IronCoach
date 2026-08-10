// Nível de experiência do atleta como corredor. Duas colunas usam este mesmo
// vocabulário, com propósitos diferentes:
//
// - profiles.experience_level — nível GERAL, editado no Perfil (Perfil.jsx).
//   Calibra o que é comum a todos os treinos: linguagem, limiares de aumento
//   de volume, distribuição de intensidade. Editável à mão; também pode vir
//   sugerido a partir das respostas ao onboarding (por implementar).
//
// - race_events.experience_level — nível AUTODECLARADO por prova, preenchido
//   pelo atleta ao criar/editar a prova (RunAgenda.jsx). Existe precisamente
//   porque o nível geral não chega: um corredor avançado em estrada pode ser
//   iniciante na primeira prova de trail. Calibra taper, progressão e
//   viabilidade do objetivo PARA AQUELA prova especificamente.
//
// As chaves têm de bater certo com os check constraints das duas colunas —
// ver supabase/migrations/20260809000000_experience_level.sql.
//
// ── Porque é que estes critérios existem ─────────────────────────────────
// O autorrelato só serve se o atleta escolher com o MESMO critério que a
// doutrina do coach vai usar para o interpretar. Sem isto, alguém marca-se
// "avançado" por se achar dedicado, e recebe limiares de progressão que o
// podem lesionar. Daí `criteria`: os números concretos aparecem na interface,
// não ficam só no código.
//
// FONTE: specs/coach-investigacao.md, Bloco 0 #1 (terceira ronda, fontes
// canónicas — Daniels' Running Formula 4th Ed 2021, Pfitzinger Faster Road
// Racing 2014, McMillan Running Standards 2023). Confiança ALTA.
//
// Duas notas da fonte que a interface simplifica de propósito:
//  - Os volumes estão padronizados para provas de 10k a meia maratona. Com
//    objetivo de maratona, os limites inferiores sobem 15-20 km/semana a
//    partir de Básico. Não vale a pena expor isto no formulário — é detalhe
//    que a doutrina aplica, não que o atleta precise de calcular.
//  - A fonte prefere volume em TEMPO (h/semana) a volume em km, por ser
//    independente do ritmo: um corredor lento precisa de mais tempo para os
//    mesmos km. Mostramos os dois, com os km primeiro por serem mais
//    familiares.
export const EXPERIENCE_LEVELS = [
  {
    key: 'iniciante',
    label: 'Iniciante',
    description: 'Ainda a construir o hábito — corres há menos de 6 meses ou de forma pouco regular.',
    criteria: [
      '15-25 km/semana (ou 1,5-3h)',
      'Corrida mais longa até 8 km',
      '2-3 treinos por semana',
      'Menos de 6 meses de prática seguida',
      'Ritmo aos 5 km acima de 6:30/km',
    ],
  },
  {
    key: 'basico',
    label: 'Básico',
    description: 'Já corres com regularidade e consegues completar os treinos sem parar.',
    criteria: [
      '25-40 km/semana (ou 3-4,5h)',
      'Corrida mais longa de 8 a 12 km',
      '3-4 treinos por semana',
      '6 a 18 meses de prática seguida',
      'Ritmo aos 5 km entre 5:30 e 6:30/km',
    ],
  },
  {
    key: 'medio',
    label: 'Médio',
    description: 'Treinas de forma estruturada e já fizeste distâncias longas.',
    criteria: [
      '40-60 km/semana (ou 4,5-6,5h)',
      'Corrida mais longa de 15 a 21 km',
      '4-5 treinos por semana',
      '1,5 a 3 anos de prática seguida',
      'Ritmo aos 5 km entre 4:30 e 5:30/km',
    ],
  },
  {
    key: 'avancado',
    label: 'Avançado',
    description: 'Treinas com volume elevado e vários anos de consistência.',
    criteria: [
      '60-85 km/semana (ou 6,5-10h+)',
      'Já correste meia maratona ou mais',
      '5-7 treinos por semana',
      'Mais de 3 anos de prática seguida',
      'Ritmo aos 5 km abaixo de 4:30/km',
    ],
  },
];

export function experienceLevelLabel(key) {
  return (EXPERIENCE_LEVELS.find(l => l.key === key) || {}).label || key;
}

export function experienceLevelDescription(key) {
  return (EXPERIENCE_LEVELS.find(l => l.key === key) || {}).description || '';
}

export function experienceLevelCriteria(key) {
  return (EXPERIENCE_LEVELS.find(l => l.key === key) || {}).criteria || [];
}

// Regra de desempate quando os critérios não batem todos certo — o caso
// comum, não a exceção (ex.: 60 km/semana mas só 8 meses de prática).
//
// FONTE: specs/coach-investigacao.md, Bloco 0 #2 (Daniels 2021; Pfitzinger
// 2014; Noakes, Lore of Running 4th Ed 2003). A hierarquia tem pesos —
// carga atual 50%, tolerância estrutural 30%, ritmo 20% — mas a regra que
// interessa ao utilizador é a de segurança: em conflito, escolher o nível
// MAIS BAIXO, nunca o mais alto. O exemplo da própria fonte: 60 km/semana
// com 8 meses de prática classifica-se como Básico para efeitos de
// progressão de carga, apesar da capacidade aeróbica de Médio — os tecidos
// ainda não têm a maturidade que o motor tem.
export const EXPERIENCE_TIEBREAK_HINT =
  'Se não encaixas em todos os critérios de um nível, escolhe o mais baixo. ' +
  'O corpo adapta-se mais devagar que o fôlego, e o Coach prefere pecar por defeito.';
