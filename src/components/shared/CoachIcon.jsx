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
      {/* Hair bun / gather */}
      <path d="M 9 8 C 9 4 15 4 15 8" />
      
      {/* Hair tie */}
      <path d="M 10 5 h 4" />
      
      {/* Sweeping Ponytail */}
      <path d="M 14 5 C 18 2 23 5 21 10 C 20 12 18 13 16 13" />
      
      {/* Head */}
      <rect width="16" height="12" x="4" y="8" rx="4" />
      
      {/* Ears */}
      <path d="M 2 14 h 2" />
      <path d="M 20 14 h 2" />
      
      {/* Happy Eyes with Eyelashes */}
      <path d="M 7 12 L 8 13 C 8.5 12 9.5 12 10 13" />
      <path d="M 17 12 L 16 13 C 15.5 12 14.5 12 14 13" />
      
      {/* Smiling Mouth */}
      <path d="M 9 16 C 10.5 17.5 13.5 17.5 15 16" />
    </svg>
  );
}
