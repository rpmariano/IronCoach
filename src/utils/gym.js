export function mapCategoriesToMuscles(categories = []) {
  const muscles = new Set();
  const mapping = {
    'peito': ['chest'],
    'costas': ['lats', 'upper-back', 'lower-back'],
    'pernas': ['quadriceps', 'hamstring', 'gluteal', 'calves', 'adductors'],
    'ombros': ['shoulders'],
    'biceps': ['biceps'],
    'triceps': ['triceps'],
    'glúteos': ['gluteal'],
    'full body': ['chest', 'lats', 'upper-back', 'lower-back', 'quadriceps', 'hamstring', 'gluteal', 'calves', 'shoulders', 'biceps', 'triceps', 'abs'],
    'levantamento olímpico': ['quadriceps', 'hamstring', 'gluteal', 'shoulders', 'lower-back'],
    'powerlifting': ['chest', 'quadriceps', 'gluteal', 'hamstring', 'lower-back'],
    'calistenia': ['chest', 'lats', 'shoulders', 'triceps', 'biceps', 'abs'],
    'hiit': ['quadriceps', 'hamstring', 'calves', 'gluteal', 'chest', 'shoulders'],
    'rpm/cycling': ['quadriceps', 'hamstring', 'calves', 'gluteal'],
    'pilates': ['abs', 'lower-back', 'gluteal'],
    'yoga': ['abs', 'lower-back', 'shoulders'],
    'body pump': ['chest', 'lats', 'quadriceps', 'hamstring', 'shoulders', 'biceps', 'triceps', 'gluteal'],
    'zumba': ['calves', 'quadriceps', 'hamstring', 'gluteal'],
    'crossfit': ['chest', 'lats', 'quadriceps', 'hamstring', 'shoulders', 'gluteal', 'lower-back', 'calves', 'biceps', 'triceps', 'abs'],
    'treino funcional': ['abs', 'lower-back', 'quadriceps', 'shoulders', 'gluteal'],
    'natação': ['lats', 'upper-back', 'shoulders', 'chest', 'triceps', 'quadriceps']
  };

  categories.forEach(cat => {
    const key = cat.toLowerCase();
    if (mapping[key]) {
      mapping[key].forEach(m => muscles.add(m));
    }
  });

  return Array.from(muscles);
}
