import React from 'react';
import { ChevronDown } from 'lucide-react';
import { prescriptionExercises, exercisesSummary } from '../../utils/prescriptionView';

/* Os exercícios de um treino de ginásio do plano: nome, séries × repetições (ou a duração) e o
   objetivo curto. Dois formatos:
   - lista (por omissão): todos os exercícios à vista — onde há espaço (a folha da proposta, o
     dia aberto, a gaveta «Ver detalhe do treino»);
   - resumo (`resumo`): «3 exercícios: A, B, C» que abre a lista — onde há pouco espaço (o ecrã
     do plano, uma linha por dia).
   Sem exercícios (plano antigo, ou um treino só nas notas) não desenha nada. */
export default function PrescriptionExercises({ prescription, resumo = false, titulo = null, testid = 'plan-exercicios' }) {
  const exercicios = prescriptionExercises(prescription);
  if (exercicios.length === 0) return null;

  const lista = (
    <ul data-testid={`${testid}-lista`} className="list-none m-0 p-0 flex flex-col" style={{ gap: 8 }}>
      {exercicios.map((e, i) => (
        <li key={`${e.name}-${i}`} data-testid={`${testid}-item`} className="flex flex-col" style={{ gap: 1 }}>
          <span className="flex items-baseline justify-between" style={{ gap: 10 }}>
            <span className="text-[13px] font-extrabold min-w-0" style={{ color: 'var(--text-1)' }}>{e.name}</span>
            {e.target && <span className="text-[12.5px] font-extrabold shrink-0" style={{ color: 'var(--gym)' }}>{e.target}</span>}
          </span>
          {e.goal && <span className="text-[12px] leading-[1.4]" style={{ color: 'var(--text-3)' }}>{e.goal}</span>}
        </li>
      ))}
    </ul>
  );

  if (resumo) {
    return (
      <details data-testid={testid} className="mt-1">
        <summary
          className="flex items-center justify-between cursor-pointer list-none min-h-[44px] text-[12px] font-bold"
          style={{ color: 'var(--text-2)', gap: 8 }}
        >
          <span>{exercisesSummary(exercicios)}</span>
          <ChevronDown size={13} style={{ color: 'var(--text-4)', flexShrink: 0 }} aria-hidden="true" />
        </summary>
        <div className="pb-2">{lista}</div>
      </details>
    );
  }

  return (
    <section data-testid={testid} aria-label={titulo ? `Exercícios — ${titulo}` : 'Exercícios do treino'} className="flex flex-col" style={{ gap: 6 }}>
      <p className="m-0 text-[11px] font-extrabold uppercase" style={{ color: 'var(--text-3)', letterSpacing: '.06em' }}>
        {titulo ? `Exercícios · ${titulo}` : 'Exercícios'}
      </p>
      {lista}
    </section>
  );
}
