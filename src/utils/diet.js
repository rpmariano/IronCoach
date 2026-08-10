// Restrições alimentares do atleta — vocabulário partilhado entre o Perfil
// (onde o atleta as declara) e a doutrina do Coach (que as usa para nunca
// sugerir o que o atleta não come).
//
// As chaves têm de bater certo com o check constraint de
// profiles.dietary_restrictions — ver
// supabase/migrations/20260810120000_dietary_restrictions.sql.
//
// ── Porque é que este campo existe ───────────────────────────────────────
// É pré-requisito de todo o Bloco 7 (sugestões alimentares), e por uma razão
// diferente das outras lacunas da investigação. Sem HRV ou ferritina o Coach
// fica CALADO; sem isto o Coach fica ERRADO — sugere 150 g de frango a um
// vegetariano, massa a um celíaco, e perde a confiança do utilizador à
// primeira sugestão.
//
// Não é só sobre o que substituir. Cada restrição desloca alvos numéricos que
// os alarmes já existentes usam: o limiar de preocupação de ferro de um
// vegetariano é 1,8x o de um omnívoro (ver Bloco 4.2 #2), portanto sem saber
// a dieta o alarme está calibrado para a pessoa errada.
//
// FONTE: specs/coach-investigacao.md, Bloco 7 #5 — Venderley & Campbell
// (2006); Rogerson, JISSN (2017); ACSM (2016); Burke (2021). Confiança ALTA.
export const DIETARY_RESTRICTIONS = [
  {
    key: 'vegetariano',
    label: 'Vegetariano',
    description: 'Sem carne nem peixe. Inclui ovos e lacticínios.',
    // Fontes de proteína a que o Coach pode recorrer numa sugestão.
    substitutes: ['tofu', 'tempeh', 'seitan', 'ovos', 'lacticínios', 'leguminosas com cereais'],
    // Nutrientes cuja meta MUDA por causa desta restrição — não é uma lista de
    // "coisas a vigiar", é o que a doutrina tem de recalcular.
    criticalNutrients: [
      'Ferro: precisa de 1,8× o valor de um omnívoro (o ferro não-heme absorve 2-20%, o heme 15-35%). Com vitamina C à refeição, sem café/chá/cálcio à mesma hora.',
      'Proteína: +10-20% face ao alvo normal, pela menor digestibilidade e teor de leucina.',
    ],
  },
  {
    key: 'vegano',
    label: 'Vegano',
    description: 'Sem qualquer produto de origem animal — nem ovos nem lacticínios.',
    substitutes: ['tofu', 'tempeh', 'seitan', 'proteína de ervilha ou arroz', 'soja texturizada', 'leguminosas com cereais'],
    criticalNutrients: [
      'B12: suplementação obrigatória — 250 µg/dia ou 2000 µg/semana. Não é opcional nem substituível por alimentos.',
      'Ferro: precisa de 1,8× o valor de um omnívoro. Com vitamina C à refeição, sem café/chá/cálcio à mesma hora.',
      'Proteína: +10-20% face ao alvo normal, pela menor digestibilidade e teor de leucina.',
      'Creatina 3-5 g/dia e ómega-3 de microalgas.',
    ],
  },
  {
    key: 'sem_lactose',
    label: 'Sem lactose',
    description: 'Intolerância à lactose — evita leite e derivados frescos.',
    substitutes: ['produtos sem lactose', 'queijos curados (<0,1 g)', 'bebidas vegetais enriquecidas', 'whey isolate', 'proteína vegetal'],
    criticalNutrients: [
      'Cálcio e vitamina D: as bebidas vegetais só os fornecem se forem enriquecidas.',
    ],
  },
  {
    key: 'sem_gluten',
    label: 'Sem glúten',
    description: 'Celíaco ou sensível ao glúten — evita trigo, centeio e cevada.',
    substitutes: ['arroz', 'batata', 'batata-doce', 'tapioca', 'milho', 'quinoa', 'trigo sarraceno', 'aveia certificada'],
    criticalNutrients: [
      'Carga de hidratos: chegar a 10-12 g/kg é mais difícil sem exceder a fibra, porque muitos produtos sem glúten usam farinhas integrais e sementes. Priorizar arroz branco, tapioca e fécula de batata.',
    ],
  },
];

export function dietaryRestrictionLabel(key) {
  return (DIETARY_RESTRICTIONS.find(r => r.key === key) || {}).label || key;
}

export function dietaryRestrictionDescription(key) {
  return (DIETARY_RESTRICTIONS.find(r => r.key === key) || {}).description || '';
}

// Vegano e vegetariano nunca coexistem — a base de dados recusa-os juntos, e
// esta função é o que faz a interface respeitar isso sem o utilizador ter de
// perceber a regra: escolher um desliga o outro.
export function toggleRestriction(current, key) {
  const list = Array.isArray(current) ? current : [];
  if (list.includes(key)) return list.filter(k => k !== key);

  const oposto = key === 'vegano' ? 'vegetariano' : key === 'vegetariano' ? 'vegano' : null;
  const base = oposto ? list.filter(k => k !== oposto) : list;
  // Mantém a ordem de DIETARY_RESTRICTIONS para o array na BD ser estável —
  // duas gravações da mesma escolha produzem o mesmo valor.
  const escolhidas = new Set([...base, key]);
  return DIETARY_RESTRICTIONS.filter(r => escolhidas.has(r.key)).map(r => r.key);
}

// Um array vazio e NULL significam a mesma coisa (sem restrições), mas gravar
// [] deixa lixo que obriga toda a leitura a testar os dois casos. Normaliza-se
// à saída, uma vez.
export function normalizeRestrictions(list) {
  return Array.isArray(list) && list.length > 0 ? list : null;
}

// Bloco de texto que o Coach recebe no seu contexto. Devolve string vazia
// quando não há nada a dizer, para não gastar tokens a afirmar ausência.
//
// dietary_notes entra aqui em bruto e SEM interpretação: é onde cabem as
// alergias que a lista fechada não exprime (frutos secos, marisco). O Coach
// trata-o como restrição absoluta mesmo sem o compreender.
export function describeRestrictionsForCoach(restrictions, notes) {
  const linhas = [];
  const lista = Array.isArray(restrictions) ? restrictions : [];

  for (const key of lista) {
    const r = DIETARY_RESTRICTIONS.find(x => x.key === key);
    if (!r) continue;
    linhas.push(`- ${r.label}: ${r.description}`);
    linhas.push(`  Alternativas aceitáveis: ${r.substitutes.join(', ')}.`);
    for (const n of r.criticalNutrients) linhas.push(`  ${n}`);
  }

  const notasLimpas = typeof notes === 'string' ? notes.trim() : '';
  if (notasLimpas) {
    linhas.push(`- Alergias/recusas declaradas pelo atleta: "${notasLimpas}".`);
    linhas.push('  Trata isto como restrição absoluta: nunca sugiras nada que a contrarie.');
  }

  if (linhas.length === 0) return '';
  return ['RESTRIÇÕES ALIMENTARES (nunca sugerir alimentos que as violem):', ...linhas].join('\n');
}
