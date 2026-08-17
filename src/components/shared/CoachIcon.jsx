import React from 'react';
import carolSvg from '../../assets/Carol.svg';

export default function CoachIcon({ size = 24, className = '', style = {}, color }) {
  // If color is passed, it means it's an active/inactive state in a tab.
  // Since it's a full color SVG, we can use a CSS filter to gray it out when not active.
  // "color" in lucide-react is usually passed as 'currentColor' or a hex.
  // In the layout, active is usually a brand color, inactive is gray.
  const isInactive = color === '#94a3b8' || color === 'var(--slate-400)' || className.includes('text-slate-400');
  
  return (
    <img 
      src={carolSvg} 
      alt="Coach" 
      width={size} 
      height={size}
      className={className}
      style={{
        ...style,
        filter: isInactive ? 'grayscale(100%) opacity(70%)' : style.filter || 'none',
        objectFit: 'contain'
      }}
    />
  );
}
