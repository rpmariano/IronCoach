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
      {/* Gathered hair base */}
      <path d="M10 8 L11 5" />
      <path d="M14 8 L13 5" />
      
      {/* Hair tie */}
      <path d="M10.5 5 h3" />
      
      {/* Ponytail leaf/teardrop */}
      <path d="M 12 5 C 12 2 17 1 19 4 C 20.5 6.5 18 9 16 11 C 14 9 13 7 12 5" />
      
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
