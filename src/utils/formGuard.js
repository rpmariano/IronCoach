/* Há um formulário aberto por cima da app?
 *
 * Uma cerimónia de ecrã inteiro nunca se abre em cima de um formulário a ser
 * preenchido: o atleta perde o que estava a escrever, ou fica sem perceber
 * para onde foi o que tinha à frente. Esta é a régua que o momento do badge
 * (utils/useBadgeMoment.js) usa para esperar.
 *
 * Vivia dentro de `utils/useMedalMoment.js` e o momento do badge importava-a
 * de lá. Saiu para um ficheiro próprio quando os badges passaram a substituir
 * os medalhões: era o único import de produção que atravessava a fronteira do
 * sistema que ia ser removido para o que fica — apagar o outro ficheiro sem
 * mover isto primeiro partia o build, e não aparecia num grep por
 * "medalhao"/"palmares" porque o nome da função não tem nada a ver.
 *
 * Não tem nada de medalhões nem de badges: é só uma pergunta ao estado da
 * app, e é por isso que pode viver sozinha.
 */
export function isFormOpen(state) {
  return !!(state?.openCreationMode || state?.editingRaceId || state?.editingRunId || state?.navGuard || state?.onboardingOpen);
}

export default isFormOpen;
