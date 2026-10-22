import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import CarolMuscleAnatomy, { anatomyLayersFor, ANATOMY_LAYERS } from './CarolMuscleAnatomy';
import { mapCategoriesToMuscles } from '../../utils/gym';

const parts = (c) => [...c.querySelectorAll('[data-part]')].map((i) => i.getAttribute('data-part'));
const ids = (cats) => anatomyLayersFor(mapCategoriesToMuscles(cats)).layers.map((l) => l.id);

describe('CarolMuscleAnatomy — as camadas acesas', () => {
  it('sem músculos, só a base', () => {
    const { container } = render(<CarolMuscleAnatomy activeMuscles={[]} />);
    expect(parts(container)).toEqual(['base']);
    expect(container.querySelector('[data-part="base"]').getAttribute('src')).toMatch(/carol-anatomia\/anatomia_base\.webp$/);
  });

  it('cada grupo do vocabulário acende as suas camadas', () => {
    expect(ids(['Peito'])).toEqual(['peito']);
    expect(ids(['Tríceps'])).toEqual(['triceps']);
    expect(ids(['Braços'])).toEqual(['biceps', 'triceps', 'antebracos']);
    expect(ids(['Pernas Inferiores'])).toEqual(['gemeos']);
    expect(ids(['Pernas Superiores'])).toEqual(['coxas']);
    expect(ids(['Pull'])).toEqual(['ombros', 'costas', 'biceps']);
    expect(ids(['Core/Abdominais'])).toEqual(['core']);
  });

  it('Full Body acende quase tudo; os antebraços só com Braços', () => {
    expect(ids(['Full Body'])).toEqual(ANATOMY_LAYERS.map((l) => l.id).filter((id) => id !== 'antebracos'));
  });

  it('um treino de vários grupos monta a combinação', () => {
    const { container } = render(<CarolMuscleAnatomy activeMuscles={mapCategoriesToMuscles(['Peito', 'Tríceps', 'Pernas Inferiores'])} />);
    expect(parts(container)).toEqual(['base', 'layer-peito', 'layer-triceps', 'layer-gemeos']);
  });

  it('cardio troca a base e põe o coração a pulsar, e soma-se aos músculos', () => {
    const { container } = render(<CarolMuscleAnatomy activeMuscles={mapCategoriesToMuscles(['Cardio', 'Pernas Inferiores'])} />);
    expect(container.querySelector('[data-part="base"]').getAttribute('src')).toMatch(/anatomia_cardio\.webp$/);
    expect(parts(container)).toEqual(['base', 'layer-gemeos', 'heart']);
  });

  it('diz em texto o que está aceso; as imagens são decorativas', () => {
    const { container } = render(<CarolMuscleAnatomy activeMuscles={mapCategoriesToMuscles(['Cardio', 'Peito', 'Tríceps'])} />);
    const root = container.querySelector('[role="img"]');
    expect(root.getAttribute('aria-label')).toBe('A Carol, de frente e de costas, com coração e pulmões, peito e tríceps em destaque.');
    for (const img of container.querySelectorAll('img')) expect(img.getAttribute('alt')).toBe('');
  });

  it('ignora o que não conhece', () => {
    expect(anatomyLayersFor(['nada', null, 'calves'])).toEqual({ layers: [{ id: 'gemeos', label: 'gémeos' }], cardio: false });
  });
});
