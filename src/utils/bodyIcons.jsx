import React from 'react';
import { 
  Scale, Activity, Droplet, PersonStanding, Weight, Droplets, 
  Beef, Bone, Flame, Target, Layers, Timer, BicepsFlexed 
} from 'lucide-react';

export const getBodyIcon = (key, size = 14, className = '', style = {}) => {
  const props = { size, className, style };
  switch (key) {
    case 'weight_kg': return <Scale {...props} />;
    case 'bmi': return <Activity {...props} />;
    case 'body_fat_pct': return <Droplet {...props} />;
    case 'skeletal_muscle_pct': return <PersonStanding {...props} />;
    case 'muscle_mass_kg': return <Weight {...props} />;
    case 'body_water_pct': return <Droplets {...props} />;
    case 'protein_pct': return <Beef {...props} />;
    case 'bone_mass_kg': return <Bone {...props} />;
    case 'bmr_kcal': return <Flame {...props} />;
    case 'visceral_fat': return <Target {...props} />;
    case 'subcutaneous_fat_pct': return <Layers {...props} />;
    case 'metabolic_age': return <Timer {...props} />;
    case 'lean_body_mass_kg': return <BicepsFlexed {...props} />;
    default: return <Activity {...props} />;
  }
};
