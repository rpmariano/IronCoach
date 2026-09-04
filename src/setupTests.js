import '@testing-library/jest-dom';
import { afterEach } from 'vitest';

// Limpeza global entre testes — sem isto, um rascunho gravado em localStorage
// por um teste (ex.: formDraftPersistence) sobrevive para o teste seguinte,
// mesmo noutro describe/ficheiro, e contamina testes que não esperam nenhum
// rascunho pré-existente (ex.: guardas de navegação de formulário "limpo").
// Encontrado 2026-09-04 ao investigar falhas não-determinísticas da suite
// completa em RunRegistration/GymRegistration/BodyRegistration.test.jsx.
afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
