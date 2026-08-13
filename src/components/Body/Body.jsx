import React from 'react';
import BodyDashboard from './BodyDashboard';
import BodyRegistration from './BodyRegistration';
import { useAppStore } from '../../store';

export default function Body() {
  const { openCreationMode, setOpenCreationMode } = useAppStore();

  if (openCreationMode === 'assessment') {
    return (
      <div className="flex flex-col fade-in flex-1 min-h-0">
        <BodyRegistration onClose={() => setOpenCreationMode(null)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col fade-in flex-1 min-h-0">
      <BodyDashboard />
    </div>
  );
}
