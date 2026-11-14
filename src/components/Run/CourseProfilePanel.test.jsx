import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CourseProfilePanel from './CourseProfilePanel';
import CourseMap from './CourseMap';
import { courseMapPath } from '../../utils/courseMap';
import { courseSuggestions } from '../../utils/courseSuggest';

vi.mock('react-chartjs-2', () => ({ Line: () => <div data-testid="c-line" /> }));

// Um percurso em L em Lisboa: 1 km para norte, depois para leste.
const TRACK = [[38.70, -9.15, 0, 10], [38.705, -9.15, 0.55, 30], [38.709, -9.15, 1.0, 45], [38.709, -9.14, 1.87, 40], [38.709, -9.13, 2.74, 20]];
const PROFILE = {
  v: 1, source: 'gpx', distance_km: 21.3, gain_m: 182, loss_m: 175, min_alt_m: 4, max_alt_m: 96,
  km: [], climbs: [],
  points: [[0, 10], [5, 60], [10, 96], [15, 40], [21.3, 17]],
  track: TRACK, start: [38.70, -9.15], finish: [38.709, -9.13],
};

describe('courseMapPath — projeção local, norte para cima', () => {
  it('desenha o traçado na caixa, com a partida e a chegada nos extremos', () => {
    const s = courseMapPath(TRACK, { width: 320 });
    expect(s.d.startsWith('M')).toBe(true);
    expect(s.d.split('L')).toHaveLength(TRACK.length);
    // A partida (sul) fica mais abaixo do que o ponto mais a norte; a chegada (leste) mais à direita.
    expect(s.start[1]).toBeGreaterThan(s.finish[1]);
    expect(s.finish[0]).toBeGreaterThan(s.start[0]);
    for (const [x, y] of [s.start, s.finish]) {
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(320);
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(s.height);
    }
    expect(s.loop).toBe(false);
  });

  it('um circuito (partida = chegada) marca-se como tal; menos de 2 pontos não desenha', () => {
    const loop = [...TRACK, [38.70, -9.15, 4, 10]];
    expect(courseMapPath(loop).loop).toBe(true);
    expect(courseMapPath([[38.7, -9.1, 0, 1]])).toBeNull();
    expect(courseMapPath(null)).toBeNull();
    expect(courseMapPath([[200, 1, 0, 0], ['x', 1, 0, 0]])).toBeNull();
  });
});

describe('CourseMap', () => {
  it('é uma imagem com descrição, linha, partida e chegada; sem track não aparece', () => {
    const { container, unmount } = render(<CourseMap track={TRACK} start={PROFILE.start} finish={PROFILE.finish} distanceKm={21.3} />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', expect.stringContaining('21,3 km'));
    expect(screen.getByTestId('course-map-line')).toBeInTheDocument();
    expect(screen.getByTestId('course-map-start')).toBeInTheDocument();
    expect(screen.getByTestId('course-map-finish')).toBeInTheDocument();
    // Sem nada de fora: nem imagens nem tiles.
    expect(container.querySelector('image, img, use[href^="http"]')).toBeNull();
    unmount();
    const { container: vazio } = render(<CourseMap track={undefined} />);
    expect(vazio.firstChild).toBeNull();
  });
});

describe('courseSuggestions — sugerir, nunca mudar sozinho', () => {
  it('sugere a distância e o D+ do GPX só quando diferem a sério', () => {
    expect(courseSuggestions(PROFILE, { distance_km: 21.0975, elevation_gain_m: 180 })).toBeNull();
    expect(courseSuggestions(PROFILE, { distance_km: 10, elevation_gain_m: 180 })).toEqual({ distance_km: 21.3 });
    expect(courseSuggestions(PROFILE, { distance_km: 21.1, elevation_gain_m: 90 })).toEqual({ elevation_gain_m: 182 });
    expect(courseSuggestions(PROFILE, { distance_km: '', elevation_gain_m: null })).toEqual({ distance_km: 21.3, elevation_gain_m: 182 });
    expect(courseSuggestions({ ...PROFILE, gain_m: 5 }, { distance_km: 21.3 })).toBeNull();
  });
});

describe('CourseProfilePanel', () => {
  it('sem percurso: «Carregar o percurso (GPX)» abre o seletor (.gpx) e entrega o ficheiro', () => {
    const onFile = vi.fn();
    render(<CourseProfilePanel profile={null} onFile={onFile} />);
    const input = screen.getByTestId('course-gpx-input');
    expect(input).toHaveAttribute('accept', '.gpx,application/gpx+xml');
    const click = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Carregar o percurso (GPX)' }));
    expect(click).toHaveBeenCalled();
    const file = new File(['<gpx/>'], 'percurso.gpx');
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('o erro diz-se como alerta', () => {
    render(<CourseProfilePanel profile={null} onFile={vi.fn()} error="O GPX não tem altitude." />);
    expect(screen.getByRole('alert')).toHaveTextContent('O GPX não tem altitude.');
  });

  it('com percurso: os números, o gráfico, o traçado, Trocar e Remover', async () => {
    const onRemove = vi.fn();
    render(<CourseProfilePanel profile={PROFILE} race={{ name: 'Meia de Lisboa', distance_km: 21.0975, elevation_gain_m: 180 }} onFile={vi.fn()} onRemove={onRemove} />);
    const stats = screen.getByTestId('course-profile-stats');
    expect(stats).toHaveTextContent('21,3 km');
    expect(stats).toHaveTextContent('182 m');
    expect(stats).toHaveTextContent('175 m');
    expect(stats).toHaveTextContent('4 m');
    expect(stats).toHaveTextContent('96 m');
    expect(await screen.findByTestId('c-line', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Pedir à Carol que explique')).toBeInTheDocument();
    expect(screen.getByTestId('course-map')).toBeInTheDocument();
    expect(screen.queryByTestId('course-suggestion')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Remover/ }));
    expect(onRemove).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Trocar/ })).toBeInTheDocument();
  });

  it('um perfil sem track não mostra o mapa', async () => {
    const { track, start, finish, ...semTrack } = PROFILE; // eslint-disable-line no-unused-vars
    render(<CourseProfilePanel profile={semTrack} onFile={vi.fn()} onRemove={vi.fn()} />);
    await screen.findByTestId('c-line', {}, { timeout: 8000 });
    expect(screen.queryByTestId('course-map')).toBeNull();
  });

  it('distância ou D+ diferentes: sugere, e só aplica quando o atleta confirma', () => {
    const onApply = vi.fn();
    render(<CourseProfilePanel profile={PROFILE} race={{ distance_km: 21.0975, elevation_gain_m: 60 }} onFile={vi.fn()} onRemove={vi.fn()} onApplySuggestion={onApply} />);
    expect(screen.getByTestId('course-suggestion')).toHaveTextContent('O GPX diz 182 m de D+ — a prova tem 60 m.');
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Usar os valores do GPX' }));
    expect(onApply).toHaveBeenCalledWith({ elevation_gain_m: 182 });
  });
});
