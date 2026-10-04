import { describe, it, expect } from 'vitest';
import Run from '../Run/Run';
import Gym from '../Gym/Gym';
import Nutrition from '../Nutrition/Nutrition';
import Body from '../Body/Body';
import OverviewDashboard from './OverviewDashboard';

/* Os 5 separadores da Evolução montam todos ao mesmo tempo e o Dashboard
   redesenha a cada deslize: sem React.memo, cada deslize redesenhava os cinco
   (2026-10-04). O memo é o `$$typeof` Symbol(react.memo). */
describe('separadores da Evolução exportam React.memo', () => {
  it.each([
    ['Run', Run], ['Gym', Gym], ['Nutrition', Nutrition], ['Body', Body], ['OverviewDashboard', OverviewDashboard],
  ])('%s', (_nome, Component) => {
    expect(String(Component.$$typeof)).toBe('Symbol(react.memo)');
  });
});
