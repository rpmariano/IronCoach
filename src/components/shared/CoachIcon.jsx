import React from 'react';

export default function CoachIcon({ size = 24, className = '', color = 'currentColor', ...props }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke={color} 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {/* Antenna and Bow */}
      <path d="M12 8V4" />
      <circle cx="12" cy="3" r="1" />
      <path d="M12 5 l2.5 -1.5 v3 z" />
      <path d="M12 5 l-2.5 -1.5 v3 z" />
      
      {/* Head */}
      <rect width="16" height="12" x="4" y="8" rx="4" />
      
      {/* Ears */}
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      
      {/* Happy Eyes */}
      <path d="M8 13c.5-1 1.5-1 2 0" />
      <path d="M14 13c.5-1 1.5-1 2 0" />
      
      {/* Smiling Mouth */}
      <path d="M9 16c1.5 1.5 4.5 1.5 6 0" />
    </svg>
  );
}
