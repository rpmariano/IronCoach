/* Um resultado de computeMedalhoes com a forma do contrato de
   utils/medalhoes.js, para os testes da UI não dependerem das regras. */

const slot = (key, label, state, extra = {}) => ({
  key, label, state, enamel: 'amber', value: null, valueLabel: null, periodKey: null,
  awardedOn: null, raceId: null, detail: null, progress: null, remainingLabel: null, wins: state === 'won' ? 1 : 0,
  ...extra,
});

const medalhao = (key, name, slots, extra = {}) => ({
  key,
  name,
  engraving: name.toUpperCase(),
  year: 2026,
  footer: null,
  rule: `A regra de ${name}.`,
  slots,
  wonCount: slots.filter((s) => s.state === 'won').length,
  totalSlots: slots.length,
  progressLine: null,
  summary: `${slots.filter((s) => s.state === 'won').length} de ${slots.length}`,
  ...extra,
});

export function makeMedalhoes() {
  const medalhoes = [
    medalhao('ano_km', 'O Ano em Km', [
      slot('mes', 'Mês', 'won', {
        value: 182, valueLabel: '182', detail: 'ganha em agosto · para repetir: mais de 182 km num mês', wins: 2,
        contributionsPeriodLabel: 'agosto de 2026',
        contributionsSummary: '182 km · 3 corridas',
        contributions: [
          { kind: 'race', id: 'race-meia', raceId: 'race-meia', runId: 'run-meia', date: '2026-08-28', title: 'Meia do Porto', meta: '21,1 km · 1:52:10' },
          { kind: 'run', id: 'run-longo', raceId: null, runId: 'run-longo', date: '2026-08-15', title: 'Longo', meta: '30 km · 2:45:00' },
          { kind: 'gym', id: 'item-gym', raceId: null, runId: null, date: '2026-08-10', title: 'Core', meta: 'concluído no plano' },
        ],
      }),
      slot('trimestre', 'Trimestre', 'won', { enamel: 'cyan', value: 410, valueLabel: '410', detail: 'jun–ago' }),
      slot('semestre', 'Semestre', 'empty', { progress: 0.72, valueLabel: '655 km até agora', detail: 'fecha o semestre a correr e a medalha é tua' }),
      slot('ano', 'Ano', 'empty', { progress: null, detail: 'o primeiro ano fecha-se a 31 de dezembro' }),
    ], { footer: '1 240 km corridos', progressLine: 'Este mês levas 96 km — a 86 km de voltares a ganhar a medalha do mês.' }),
    medalhao('distancias', 'As Distâncias', [
      slot('5k', '5 km', 'won', { valueLabel: '5 km' }),
      slot('10k', '10 km', 'won', { valueLabel: '10 km' }),
      slot('21k', '21,1 km', 'empty'),
      slot('42k', '42,2 km', 'empty'),
    ]),
    medalhao('recordes', 'Os Recordes', [
      slot('5k', '5 km', 'empty'), slot('10k', '10 km', 'empty'), slot('21k', '21,1 km', 'empty'), slot('42k', '42,2 km', 'empty'),
    ]),
    medalhao('epoca', "A Época '26", [
      slot('r1', 'Prova 1', 'won', { enamel: 'silver' }),
      slot('r2', 'Prova 2', 'won', { enamel: 'silver' }),
      slot('r3', 'Prova 3', 'empty'),
      slot('r4', 'Prova 4', 'empty'),
      slot('r5', 'Prova 5', 'empty'),
    ]),
    medalhao('consistencia', 'A Consistência', [
      slot('4', '4 semanas', 'empty'), slot('12', '12 semanas', 'empty'), slot('26', '26 semanas', 'empty'), slot('52', '52 semanas', 'empty'),
    ]),
    medalhao('superacao', 'A Superação', [
      slot('1', '1 objetivo', 'won', { valueLabel: '1' }), slot('3', '3 objetivos', 'empty'), slot('5', '5 objetivos', 'empty'), slot('10', '10 objetivos', 'empty'),
    ]),
  ];
  return { medalhoes, heroKey: 'ano_km', due: [] };
}
