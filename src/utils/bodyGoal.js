/* O objetivo do corpo alcançado — a avaliação que chega à meta.

   As metas do Corpo (profiles.goal_*) são das coisas mais demoradas da app:
   meses de refeições e treinos para mexer um ponto de gordura. A avaliação
   que finalmente as passa merece ser dita — pela Carol, no momento em que se
   grava (o mesmo cartão do primeiro registo, shared/RecordConfirmation).

   Só conta a TRAVESSIA: a avaliação anterior estava do lado de lá da meta e
   esta chegou (ou passou). Quem já lá estava não recebe um "chegaste" em
   cada avaliação — isso seria aplaudir tudo (CAROL.md). Uma meta de cada
   vez, a mais difícil primeiro: composição antes do peso. Puro. */

const METAS = [
  { campo: 'body_fat_pct', meta: 'goal_body_fat_pct', sentido: 'down', unidade: '%' },
  { campo: 'muscle_mass_kg', meta: 'goal_muscle_mass_kg', sentido: 'up', unidade: 'kg' },
  { campo: 'lean_body_mass_kg', meta: 'goal_lean_body_mass_kg', sentido: 'up', unidade: 'kg' },
  { campo: 'weight_kg', meta: 'goal_weight_kg', sentido: null, unidade: 'kg' },
];

const n = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const fmt = (v) => String(Math.round(v * 10) / 10).replace('.', ',');

function frase(campo, agora, meta) {
  switch (campo) {
    case 'body_fat_pct':
      return { title: `Gordura corporal nos ${fmt(agora)}%.`, sub: `Passaste o objetivo de ${fmt(meta)}%. Isto não foi a balança: foi o que comeste e treinaste, semana após semana.` };
    case 'muscle_mass_kg':
      return { title: `${fmt(agora)} kg de massa muscular.`, sub: `Chegaste ao objetivo de ${fmt(meta)} kg. Músculo leva meses a construir, e levou.` };
    case 'lean_body_mass_kg':
      return { title: `${fmt(agora)} kg de massa magra.`, sub: `Chegaste ao objetivo de ${fmt(meta)} kg. É o número que menos mente.` };
    default:
      return { title: `Chegaste aos ${fmt(meta)} kg.`, sub: 'Era o peso que definiste. A partir daqui, o trabalho é mantê-lo. Diz-me se o objetivo muda.' };
  }
}

/**
 * { title, sub, field } quando a avaliação `record` atravessa uma meta do
 * perfil; null nos outros. `assessments` pode ou não já incluir `record`.
 */
export function bodyGoalMoment(record, assessments = [], profile = {}) {
  if (!record) return null;
  const anteriores = (assessments || [])
    .filter((a) => a && a.id !== record.id && String(a.date) <= String(record.date))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.created_at || '').localeCompare(String(a.created_at || '')));

  for (const { campo, meta: chave, sentido, unidade } of METAS) {
    const meta = n(profile?.[chave]);
    const agora = n(record[campo]);
    if (meta == null || agora == null || !(meta > 0)) continue;
    const antes = n(anteriores.find((a) => n(a[campo]) != null)?.[campo]);
    if (antes == null) continue;
    // O peso vai para onde a meta estiver: a descer ou a subir.
    const dir = sentido || (antes > meta ? 'down' : 'up');
    const atravessou = dir === 'down' ? antes > meta && agora <= meta : antes < meta && agora >= meta;
    if (atravessou) return { ...frase(campo, agora, meta), field: campo, unit: unidade };
  }
  return null;
}
