import { describe, it, expect } from 'vitest';
import { useAppStore } from './index';

// Revisão pré-deploy de 5ce5f31: o "+" a abrir outro registo por cima de uma
// corrida em edição deixava o editingRunId preso — e a app "ocupada" para
// sempre aos olhos da atualização automática.
describe('setOpenCreationMode', () => {
  it('trocar para outro ecrã de topo larga a corrida em edição; o registo de corrida mantém-na', () => {
    useAppStore.setState({ openCreationMode: 'run', editingRunId: 'run-1' });
    useAppStore.getState().setOpenCreationMode('meal');
    expect(useAppStore.getState().editingRunId).toBeNull();

    useAppStore.setState({ openCreationMode: null, editingRunId: 'run-2' });
    useAppStore.getState().setOpenCreationMode('run');
    expect(useAppStore.getState().editingRunId).toBe('run-2');
    useAppStore.setState({ openCreationMode: null, editingRunId: null });
  });
});
