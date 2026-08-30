// Analytics de aulas e modalidades (HIIT, RPM, pilates, etc.) sobre um
// período relativo: contagem, tempo total e RPE médio, no geral e por
// modalidade.
//
// @contexto Migrado de "classAnalytics" em src/components/Gym/GymDashboard.jsx
// (specs/formulas-checklist.md Fase E). `avgRpe`/`classList[].avgRpe`
// mantêm-se como STRING (`toFixed(1)`) para não mudar o que já está no
// ecrã — o original já os formatava assim antes de os guardar no estado.

import { filterByRelativeDateRange, type RelativeDateRange } from "./relativeDateRange.ts";

export interface SessionForClassAnalytics {
  date: string;
  kind?: string | null;
  name?: string | null;
  categories?: string[] | null;
  duration_seconds?: number | null;
  exertion?: number | null;
  rpe?: number | null;
}

export interface ClassGroupStats {
  name: string;
  count: number;
  totalSeconds: number;
  avgRpe: string | null;
}

export interface ClassAnalytics {
  totalClasses: number;
  totalClassSeconds: number;
  avgRpe: string | null;
  classList: ClassGroupStats[];
}

export function computeClassAnalytics(
  sessions: SessionForClassAnalytics[],
  todayISO: string,
  range: string,
): ClassAnalytics {
  const sessionsInRange = filterByRelativeDateRange(sessions, todayISO, range as RelativeDateRange);
  const classSessions = sessionsInRange.filter((s) => s.kind === "aula");

  const classMap: Record<string, { name: string; count: number; totalSeconds: number; rpeSum: number; rpeCount: number }> = {};
  let totalClassSeconds = 0;
  let rpeSum = 0;
  let rpeCount = 0;

  for (const s of classSessions) {
    const duration = Number(s.duration_seconds || 0);
    totalClassSeconds += duration;
    const exertionVal = s.exertion != null ? Number(s.exertion) : s.rpe != null ? Number(s.rpe) : null;
    if (exertionVal !== null && !isNaN(exertionVal)) {
      rpeSum += exertionVal;
      rpeCount++;
    }

    const rawCats = s.categories && s.categories.length > 0 ? s.categories : s.name ? [s.name] : ["Aula de Grupo"];
    for (const rawCat of rawCats) {
      const cat = rawCat.trim();
      if (!classMap[cat]) classMap[cat] = { name: cat, count: 0, totalSeconds: 0, rpeSum: 0, rpeCount: 0 };
      classMap[cat].count++;
      classMap[cat].totalSeconds += duration;
      if (exertionVal !== null && !isNaN(exertionVal)) {
        classMap[cat].rpeSum += exertionVal;
        classMap[cat].rpeCount++;
      }
    }
  }

  const classList: ClassGroupStats[] = Object.values(classMap)
    .sort((a, b) => b.count - a.count)
    .map((c) => ({
      name: c.name,
      count: c.count,
      totalSeconds: c.totalSeconds,
      avgRpe: c.rpeCount > 0 ? (c.rpeSum / c.rpeCount).toFixed(1) : null,
    }));

  return {
    totalClasses: classSessions.length,
    totalClassSeconds,
    avgRpe: rpeCount > 0 ? (rpeSum / rpeCount).toFixed(1) : null,
    classList,
  };
}
