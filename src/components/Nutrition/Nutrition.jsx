import React, { useEffect } from 'react';
import NutritionDashboard from './NutritionDashboard';
import MealRegistration from './MealRegistration';
import { useAppStore } from '../../store';

export default function Nutrition() {
  const { openCreationMode, setOpenCreationMode } = useAppStore();

  if (openCreationMode === 'meal') {
    return (
      <div className="flex flex-col fade-in flex-1 min-h-0">
        <MealRegistration onClose={() => setOpenCreationMode(null)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col fade-in flex-1 min-h-0">
      <NutritionDashboard />
    </div>
  );
}
