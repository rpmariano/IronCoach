import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store';
import { TrendingUp, Dumbbell, Users } from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import '../../lib/chartSetup';
import TimeFilterBar from '../BI/TimeFilterBar';
import KPICard from '../BI/KPICard';
import VolumeLoadChart from '../BI/VolumeLoadChart';
import MetricInfo from '../BI/MetricInfo';
import ChartFrame from '../BI/ChartFrame';
import { barGrowAnimation } from '../../utils/introAnimations';
import { useRevealAnimation } from '../../utils/useRevealAnimation';
import EmptyModuleState, { EmptyChartFrame } from '../BI/EmptyModuleState';
import VerdictLine from '../BI/VerdictLine';
import { gymVerdict, fmtNumber } from '../../utils/dashboardVerdicts';
import { filterByDateRange, calculateVolumeLoad, sessionVolumeKg } from '../../utils/biEngine';
import { computeClassAnalytics } from '@formulas/classAnalytics.ts';
import { computeMuscleGroupVolumeDetailed } from '@formulas/muscleGroupVolume.ts';
import { todayISO } from '../../lib/utils';

// Semanas cobertas por cada filtro de período — denominador da frequência
// semanal usada pela frase de veredicto.
const WEEKS_BY_RANGE = { dia: 1, semana: 1, mes: 4, trimestre: 13, '6meses': 26, ano: 52 };

function formatDurationMinutes(seconds) {
  // Sem duração não é "0 min" (G7, 2026-10-04): é dado em falta.
  if (!seconds) return '—';
  const mins = Math.round(seconds / 60);
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins} min`;
}

/* G7 (2026-10-04): a duração de uma aula é opcional, por isso o total só
   soma as aulas que a têm. Nenhuma com duração → "—" (antes "0 min"); só
   parte → o total com a nota "em N de M aulas", para não se ler como o
   tempo todo. */
function classTimeSummary(totalSeconds, withDuration, totalClasses) {
  if (!(withDuration > 0)) return { value: '—', note: null };
  return {
    value: formatDurationMinutes(totalSeconds),
    note: withDuration < totalClasses ? `em ${withDuration} de ${totalClasses} aulas` : null,
  };
}

export default function GymDashboard() {
  const { gymSessions, runs, setOpenCreationMode } = useAppStore();
  const [timeRange, setTimeRange] = useState('mes');
  const rangeKey = timeRange;

  const sessionsInRange = useMemo(() => filterByDateRange(gymSessions, rangeKey), [gymSessions, rangeKey]);
  const volumeData = useMemo(() => calculateVolumeLoad(gymSessions, rangeKey), [gymSessions, rangeKey]);
  // G1 (2026-10-04): as séries não guardam grupo muscular, por isso só entram
  // as sessões de um único grupo; as de vários ficam de fora e contam-se aqui
  // (muscleGroupVolume.ts). Chama a fórmula partilhada diretamente porque o
  // biEngine só devolve os grupos.
  const { groups: muscleVolume, multiGroupSessions } = useMemo(() => {
    try {
      return computeMuscleGroupVolumeDetailed(gymSessions || [], todayISO(), rangeKey);
    } catch {
      return { groups: {}, multiGroupSessions: 0 };
    }
  }, [gymSessions, rangeKey]);

  const { volumeByDay } = useMemo(() => {
    const byDay = {};

    // sessionVolumeKg() (biEngine.js) — antes este componente reimplementava
    // a soma peso×reps sem o atalho `volume_kg`, que sessionVolumeKg já
    // trata (specs/formulas-checklist.md Fase C).
    sessionsInRange.forEach(session => {
      const dateStr = session.date;
      byDay[dateStr] = (byDay[dateStr] || 0) + sessionVolumeKg(session);
    });

    return {
      volumeByDay: byDay
    };
  }, [sessionsInRange]);

  const strengthSessions = useMemo(() => sessionsInRange.filter(s => s.kind !== 'aula'), [sessionsInRange]);

  // Valores que o ponto 6 põe em HTML acima dos gráficos, em vez de os
  // deixar nos ticks do eixo.
  const dayVolumes = useMemo(() => Object.keys(volumeByDay).sort().map(d => volumeByDay[d]), [volumeByDay]);
  const lastDayVolume = dayVolumes.length ? dayVolumes[dayVolumes.length - 1] : 0;
  const maxDayVolume = dayVolumes.length ? Math.max(...dayVolumes) : 0;
  const topMuscle = useMemo(() => {
    const groups = Object.keys(muscleVolume).sort((a, b) => muscleVolume[b].sets - muscleVolume[a].sets);
    return groups.length ? { name: groups[0], sets: muscleVolume[groups[0]].sets } : null;
  }, [muscleVolume]);

  const groupCount = Object.keys(muscleVolume).length;
  const multiGroupNote = multiGroupSessions > 0
    ? `${multiGroupSessions} ${multiGroupSessions === 1 ? 'sessão com vários grupos não entra' : 'sessões com vários grupos não entram'}.`
    : '';
  const muscleHint = `${groupCount} ${groupCount === 1 ? 'grupo' : 'grupos'}${multiGroupNote ? ` · ${multiGroupNote.slice(0, -1)}` : ''}`;

  const volChartData = useMemo(() => {
    const days = Object.keys(volumeByDay).sort();
    return {
      labels: days.map(d => d.slice(8, 10) + '/' + d.slice(5, 7)),
      datasets: [{
        label: 'Volume (kg)',
        data: days.map(d => volumeByDay[d]),
        // Ponto 6, paleta das séries: era um gradiente âmbar
        // (#d97706 → #f59e0b) e o âmbar é da prova. Passa ao ardósia do
        // ginásio (--gym #9ec3d2), em tinta.
        backgroundColor: (context) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return 'rgba(158, 195, 210, 0.7)';
          const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
          gradient.addColorStop(0, 'rgba(158, 195, 210, 0.25)');
          gradient.addColorStop(1, 'rgba(158, 195, 210, 0.9)');
          return gradient;
        },
        borderRadius: 6
      }]
    };
  }, [volumeByDay]);

  const muscleChartData = useMemo(() => {
    const groups = Object.keys(muscleVolume).sort((a,b) => muscleVolume[b].sets - muscleVolume[a].sets);
    return {
      labels: groups,
      datasets: [{
        label: 'Séries',
        data: groups.map(g => muscleVolume[g].sets),
        // Mesma razão do gráfico acima: fora o âmbar, dentro o ardósia.
        backgroundColor: (context) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return 'rgba(158, 195, 210, 0.7)';
          const gradient = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
          gradient.addColorStop(0, 'rgba(158, 195, 210, 0.25)');
          gradient.addColorStop(1, 'rgba(158, 195, 210, 0.9)');
          return gradient;
        },
        borderRadius: 6
      }]
    };
  }, [muscleVolume]);

  // Analytics de Aulas e Modalidades — delega em @formulas/classAnalytics.ts
  // (T1.5), partilhado com a Carol (specs/formulas-checklist.md Fase E).
  // Nota: recebe `gymSessions` (não `sessionsInRange`) porque a própria
  // função já aplica o filtro de período por dentro — mesma fonte usada
  // por `calculateVolumeLoad`/`calculateMuscleGroupVolume` acima.
  const classAnalytics = useMemo(
    () => computeClassAnalytics(gymSessions, todayISO(), rangeKey),
    [gymSessions, rangeKey],
  );
  const classTime = classTimeSummary(classAnalytics.totalClassSeconds, classAnalytics.classesWithDuration, classAnalytics.totalClasses);

  /* Ponto 6 do redesenho: a frase de veredicto. As regras vivem em
     utils/dashboardVerdicts.js; aqui só se juntam os dados já calculados.
     `weeksInRange` é o denominador da frequência semanal — o número de
     semanas que o filtro de período cobre. */
  const verdict = useMemo(() => gymVerdict({
    weeklyBreakdown: volumeData.weeklyBreakdown,
    strengthSessions: strengthSessions.length,
    classes: classAnalytics.totalClasses,
    weeksInRange: WEEKS_BY_RANGE[rangeKey] || 4,
    totalVolumeLoad: volumeData.totalVolumeLoad,
    runCount: (runs || []).length,
  }), [volumeData, strengthSessions.length, classAnalytics.totalClasses, rangeKey, runs]);

  // Ponto 6: os ticks deixam de escrever dentro da tela — os valores atuais
  // e os extremos dos eixos passam a HTML no ChartFrame.
  const darkScalesVertical = {
    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { display: false }, border: { display: false } },
    x: { grid: { display: false }, ticks: { display: false }, border: { display: false } }
  };
  const darkScalesHorizontal = {
    x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { display: false }, border: { display: false } },
    y: { grid: { display: false }, ticks: { display: false }, border: { display: false } }
  };
  /* Ponto 9, animação 4: as barras crescem da base com --stagger-bars,
     quando cada gráfico aparece no ecrã (useRevealAnimation). */
  const volReveal = useRevealAnimation();
  const muscleReveal = useRevealAnimation();
  const baseChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } }
  };

  /* Ponto 7: sem sessões no período, o cartão de convite do mock
     "Dashboard · sem dados" em vez dos KPIs a zero e do bloco de aulas
     vazio. O veredicto e o filtro ficam — é pelo filtro que se chega a um
     período com dados. */
  if (sessionsInRange.length === 0) {
    return (
      <div className="space-y-4 fade-in">
        <VerdictLine text={verdict.text} tone={verdict.tone} />
        <TimeFilterBar activeRange={timeRange} onChange={setTimeRange} module="ginasio" />
        <EmptyModuleState
          tone="gym"
          icon={<Dumbbell size={22} />}
          actionLabel="Registar treino"
          onAction={() => setOpenCreationMode('workout')}
        >
          Ainda não há treinos neste período. Regista um treino para veres a tua evolução aqui.
        </EmptyModuleState>
        <EmptyChartFrame label="Volume diário" unit="kg no último dia com treino" height={192} />
      </div>
    );
  }

  return (
    <div className="space-y-4 fade-in">
      {/* Veredicto — antes dos filtros e dos KPIs, como no mock. */}
      <VerdictLine text={verdict.text} tone={verdict.tone} />

      <TimeFilterBar activeRange={timeRange} onChange={setTimeRange} module="ginasio" />
      
      <div className="grid grid-cols-3 gap-3">
        <KPICard label="Treinos de Força" value={strengthSessions.length} icon={Dumbbell} moduleColor="var(--mod-ginasio)" />
        <KPICard label="Vol. Carga" value={Math.round(volumeData.totalVolumeLoad).toLocaleString('pt-PT')} unit="kg" icon={TrendingUp} moduleColor="var(--mod-ginasio)" />
        <KPICard label="Aulas" value={classAnalytics.totalClasses} icon={Users} moduleColor="var(--mod-ginasio)" />
      </div>

      {/* O caso "sem sessões no período" já saiu antes (EmptyModuleState). */}
      {(
        <div className="space-y-4">
          {volumeData.weeklyBreakdown.length > 0 && (
            <VolumeLoadChart weeklyData={volumeData.weeklyBreakdown} acwr={{ ratio: volumeData.acwr, status: volumeData.acwrStatus, hasEnoughData: volumeData.acwrHasEnoughData, historyWeeks: volumeData.historyWeeks }} />
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ChartFrame
              reveal={volReveal}
              label="Volume diário"
              value={fmtNumber(lastDayVolume, 0)}
              unit="kg no último dia com treino"
              valueColor="var(--gym)"
              axis={maxDayVolume > 0 ? { min: '0 kg', max: `${fmtNumber(maxDayVolume, 0)} kg` } : undefined}
              legend={[{ label: 'Volume-carga do dia', color: 'var(--gym)' }]}
              height={192}
            >
              <Bar data={volChartData} options={{ ...baseChartOptions, animation: barGrowAnimation(volReveal.animate), scales: darkScalesVertical }} />
            </ChartFrame>

            {Object.keys(muscleVolume).length > 0 && (
              <ChartFrame
                reveal={muscleReveal}
                label="Séries por músculo"
                value={topMuscle ? topMuscle.sets : '—'}
                unit={topMuscle ? `séries em ${topMuscle.name}` : undefined}
                valueColor="var(--gym)"
                hint={muscleHint}
                legend={[{ label: 'Séries no período', color: 'var(--gym)' }]}
                height={192}
              >
                <Bar data={muscleChartData} options={{ ...baseChartOptions, animation: barGrowAnimation(muscleReveal.animate), indexAxis: 'y', scales: darkScalesHorizontal }} />
              </ChartFrame>
            )}
          </div>

          {Object.keys(muscleVolume).length === 0 && multiGroupSessions > 0 && (
            <p className="text-[11px] text-[var(--text-3)] px-1">
              {multiGroupNote} Sem grupos para mostrar nas séries por músculo.
            </p>
          )}

          {/* Secção de Aulas e Modalidades de Grupo */}
          <div className="bg-[var(--surface-glass)] backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" style={{ color: 'var(--gym)' }} />
                <h3 className="text-[12px] font-bold text-[var(--text-2)] uppercase tracking-wider">Aulas & Modalidades</h3>
              </div>
              <MetricInfo text="Registo das tuas aulas de grupo e modalidades (HIIT, Cycling, Pilates, CrossFit, etc.). Monitoriza a frequência semanal, tempo total investido e o nível de esforço percebido (RPE)." />
            </div>

            {classAnalytics.totalClasses > 0 ? (
              <div className="space-y-3">
                {/* Mini KPIs de Aulas */}
                <div className="grid grid-cols-3 gap-2 bg-[var(--surface-glass)] rounded-xl p-3 border border-[var(--border-glass)] text-center">
                  <div>
                    <p className="text-base font-extrabold text-white leading-none">{classAnalytics.totalClasses}</p>
                    <p className="text-[11px] text-[var(--text-3)] mt-1">Aulas</p>
                  </div>
                  <div>
                    <p className="text-base font-extrabold text-white leading-none">
                      {classTime.value}
                    </p>
                    <p className="text-[11px] text-[var(--text-3)] mt-1">Tempo Total</p>
                    {classTime.note && <p className="text-[10px] text-[var(--text-3)]">{classTime.note}</p>}
                  </div>
                  <div>
                    <p className="text-base font-extrabold leading-none" style={{ color: 'var(--gym)' }}>
                      {classAnalytics.avgRpe ? `${classAnalytics.avgRpe.replace('.', ',')} / 10` : '—'}
                    </p>
                    <p className="text-[11px] text-[var(--text-3)] mt-1">Esforço Médio (RPE)</p>
                  </div>
                </div>

                {/* Lista de Modalidades */}
                <div className="space-y-1.5 mt-2">
                  {classAnalytics.classList.map(c => {
                    // G6 (2026-10-04): classAnalytics devolve `avgRpe` (string já
                    // formatada), não rpeSum/rpeCount — antes lia estes e nunca aparecia.
                    const avgClassRpe = c.avgRpe ? c.avgRpe.replace('.', ',') : null;
                    return (
                      <div key={c.name} className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl bg-[var(--surface-glass)] border border-[var(--border-faint)]">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: 'var(--gym)' }}></div>
                          <div>
                            <p className="text-xs font-semibold text-[var(--text-2)]">{c.name}</p>
                            <p className="text-[11px] text-[var(--text-3)]">
                              {c.count} aula{c.count > 1 ? 's' : ''}
                              {c.totalSeconds > 0 ? ` · ${formatDurationMinutes(c.totalSeconds)}` : ''}
                            </p>
                          </div>
                        </div>
                        {avgClassRpe && (
                          <div className="text-right">
                            <span className="text-[11px] font-bold text-[var(--text-3)]">RPE {avgClassRpe}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="py-6 flex flex-col items-center justify-center text-center">
                <Users className="w-8 h-8 text-[var(--text-3)] mb-2 opacity-50" />
                <p className="text-xs text-[var(--text-3)] max-w-xs leading-relaxed">
                  Sem aulas registadas neste período. Ao registares aulas (HIIT, Cycling, Pilates, etc.), verás aqui o resumo e o esforço.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

