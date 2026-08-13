import React from 'react';
import RunDashboard from './RunDashboard';
import RunRegistration from './RunRegistration';
import { useAppStore } from '../../store';

export default function Run() {
  const { openCreationMode, setOpenCreationMode } = useAppStore();
  
  if (openCreationMode === 'run') {
    return (
      <div className="flex flex-col fade-in flex-1 min-h-0">
        <RunRegistration onClose={() => setOpenCreationMode(null)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col fade-in flex-1 min-h-0">
      <RunDashboard />
    </div>
  );
}
