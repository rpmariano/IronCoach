import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../store';
import NutritionDashboard from './NutritionDashboard';
import { todayISO } from '../../lib/utils';

describe('NutritionDashboard', () => {
  beforeEach(() => {
    // Inject mock data into the Zustand store before each test
    useAppStore.setState({
      profile: {
        calorie_goal: 3000,
        protein_goal: 200,
        carbs_goal: 300,
        fat_goal: 100
      },
      meals: [
        { id: 1, date: todayISO(), calories: 1000, protein: 50, carbs: 100, fat: 30 },
        { id: 2, date: todayISO(), calories: 500, protein: 30, carbs: 50, fat: 10 }
      ]
    });
  });

  it('renders aggregated macros correctly based on today meals', () => {
    render(<NutritionDashboard />);
    
    // Total aggregated calories: 1500 out of 3000
    expect(screen.getByText('1500')).toBeInTheDocument();
    expect(screen.getByText(/3000\s*kcal/)).toBeInTheDocument();
    
    // Protein: 80 out of 200
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.getByText(/200\s*g/)).toBeInTheDocument();
    
    // Carbs: 150 out of 300
    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText(/300\s*g/)).toBeInTheDocument();
    
    // Fat: 40 out of 100
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText(/100\s*g/)).toBeInTheDocument();
  });
});
