import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import MuscleAnatomy2D from './MuscleAnatomy2D';
import React from 'react';

describe('MuscleAnatomy2D', () => {
  it('renders without crashing', () => {
    try {
      render(<MuscleAnatomy2D activeMuscles={[]} />);
    } catch(e) {
      console.error(e);
      throw e;
    }
  });
});
