import React from 'react';
import GymDashboard from './GymDashboard';
import GymRegistration from './GymRegistration';
import { useAppStore } from '../../store';

export default function Gym() {
  const { openCreationMode, setOpenCreationMode } = useAppStore();

  if (openCreationMode === 'workout') {
    return (
      <div className="flex flex-col fade-in flex-1 min-h-0">
        <GymRegistration onClose={() => setOpenCreationMode(null)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col fade-in flex-1 min-h-0">
      <GymDashboard />
    </div>
  );
}
