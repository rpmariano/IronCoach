/**
 * Frases de veredicto dos dashboards de módulo — ponto 6 do redesenho 6c
 * ("Frase de veredicto no topo de cada módulo").
 *
 * 2026-10-04: refactoring mecânico para modularização (fases 4–6 trabalhando
 * em paralelo). Este ficheiro re-exporta tudo dos módulos específicos mantendo
 * a API pública inalterada.
 *
 * Uma função pura por módulo. Recebem SÓ dados já calculados pelo biEngine
 * (nada de store, nada de datas do relógio senão as que vêm nos dados) para
 * poderem ser testadas com números à mão e para a frase ser sempre a mesma
 * para os mesmos dados.
 *
 * Devolvem `{ text, tone }`:
 *   ok      — está bem, continua
 *   warn    — está a correr mal e dá para corrigir
 *   danger  — está a correr mal e é urgente
 *   neutral — não dá para dizer (sem dados, ou dados insuficientes)
 *
 * Tom (CAROL.md §2 e "Fundamentos de conteúdo" do design-system):
 * opinião primeiro, número depois como prova; frases curtas e afirmativas;
 * sem "talvez", sem emoji, sem exclamação, sem elogio automático; português
 * europeu na segunda pessoa; vírgula decimal e espaço de milhar.
 *
 * Ordem das regras dentro de cada módulo: primeiro o que é perigoso, depois
 * o que está mal, depois o que está bem. A primeira regra que der match
 * ganha — só sai UMA frase.
 */

// Re-exports de shared — constantes e helpers comuns
export { NO_DATA_TEXT, fmtNumber, spellFem, capitalize, streakDirection } from './verdicts/shared';

// Re-exports dos veredictos por módulo
export { runVerdict } from './verdicts/run';
export { gymVerdict } from './verdicts/gym';
export { nutritionVerdict } from './verdicts/nutrition';
export { bodyVerdict } from './verdicts/body';

// Default export mantendo a mesma forma
import { runVerdict } from './verdicts/run';
import { gymVerdict } from './verdicts/gym';
import { nutritionVerdict } from './verdicts/nutrition';
import { bodyVerdict } from './verdicts/body';
import { NO_DATA_TEXT } from './verdicts/shared';

export default { runVerdict, gymVerdict, nutritionVerdict, bodyVerdict, NO_DATA_TEXT };
