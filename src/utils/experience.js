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
// `description` existe para calibrar o autorrelato: sem uma explicação do que
// cada nível significa, o critério de quem escolhe "avançado" no formulário
// pode não bater certo com o critério que a doutrina do coach vai usar para o
// interpretar (src/coach-knowledge/, ver PRD 3.6.2). O texto é o mesmo nos
// dois sítios onde este vocabulário aparece — Perfil e Agenda de Provas.
//
// Fonte parcial: specs/coach-investigacao.md (Bloco 0, respostas registadas).
// A literatura carregada não deu corte de volume/frequência para básico e
// médio — só para iniciante (frequência) e avançado (anos de prática, ritmo
// de maratona). O texto abaixo completa os dois níveis do meio com critério
// de senso de treino comum, não de fonte, precisamente para não deixar a
// escolha sem qualquer ajuda enquanto a investigação não fecha esses cortes.
export const EXPERIENCE_LEVELS = [
  {
    key: 'iniciante',
    label: 'Iniciante',
    description: 'Ainda a construir o hábito — corres com pouca regularidade ou há pouco tempo.',
  },
  {
    key: 'basico',
    label: 'Básico',
    description: 'Já corres com regularidade (cerca de 3-4x/semana) e consegues completar o treino sem parar.',
  },
  {
    key: 'medio',
    label: 'Médio',
    description: 'Treinas de forma consistente há mais de um ano e já correste alguma prova.',
  },
  {
    key: 'avancado',
    label: 'Avançado',
    description: '2+ anos de prática consistente; se já correste uma maratona, provavelmente abaixo de 3h.',
  },
];

export function experienceLevelLabel(key) {
  return (EXPERIENCE_LEVELS.find(l => l.key === key) || {}).label || key;
}

export function experienceLevelDescription(key) {
  return (EXPERIENCE_LEVELS.find(l => l.key === key) || {}).description || '';
}
