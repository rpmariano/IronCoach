export function mapCategoriesToMuscles(categories = []) {
  if (typeof categories === 'string') categories = [categories];
  if (!Array.isArray(categories)) categories = [];
  
  const muscles = new Set();
  const mapping = {
    'peito': ['chest'],
    'costas': ['trapezius', 'upper-back', 'lower-back'],
    'pernas': ['quadriceps', 'hamstring', 'gluteal', 'calves', 'adductor', 'abductors'],
    'ombros': ['front-deltoids', 'back-deltoids'],
    'biceps': ['biceps'],
    'triceps': ['triceps'],
    'glúteos': ['gluteal'],
    'core': ['abs', 'obliques'],
    'abdominais': ['abs', 'obliques'],
    'full body': ['chest', 'trapezius', 'upper-back', 'lower-back', 'quadriceps', 'hamstring', 'gluteal', 'calves', 'front-deltoids', 'back-deltoids', 'biceps', 'triceps', 'abs'],
    'levantamento olímpico': ['quadriceps', 'hamstring', 'gluteal', 'front-deltoids', 'back-deltoids', 'lower-back'],
    'powerlifting': ['chest', 'quadriceps', 'gluteal', 'hamstring', 'lower-back'],
    'calistenia': ['chest', 'upper-back', 'front-deltoids', 'back-deltoids', 'triceps', 'biceps', 'abs'],
    'hiit': ['quadriceps', 'hamstring', 'calves', 'gluteal', 'chest', 'front-deltoids'],
    'rpm/cycling': ['quadriceps', 'hamstring', 'calves', 'gluteal'],
    'pilates': ['abs', 'lower-back', 'gluteal'],
    'yoga': ['abs', 'lower-back', 'front-deltoids', 'back-deltoids'],
    'body pump': ['chest', 'upper-back', 'quadriceps', 'hamstring', 'front-deltoids', 'back-deltoids', 'biceps', 'triceps', 'gluteal'],
    'zumba': ['calves', 'quadriceps', 'hamstring', 'gluteal'],
    'crossfit': ['chest', 'upper-back', 'quadriceps', 'hamstring', 'front-deltoids', 'back-deltoids', 'gluteal', 'lower-back', 'calves', 'biceps', 'triceps', 'abs'],
    'treino funcional': ['abs', 'lower-back', 'quadriceps', 'front-deltoids', 'back-deltoids', 'gluteal'],
    'natação': ['upper-back', 'trapezius', 'front-deltoids', 'back-deltoids', 'chest', 'triceps', 'quadriceps']
  };

  categories.forEach(cat => {
    const key = cat.toLowerCase();
    if (mapping[key]) {
      mapping[key].forEach(m => muscles.add(m));
    }
  });

  return Array.from(muscles);
}
