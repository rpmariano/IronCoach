const fs = require('fs');


const replacements = [
  { from: /{ name: 'Manual' }/g, to: "{ name: /Manual/i }" },
  { from: /{ name: 'Competição' }/g, to: "{ name: /Competição/i }" },
  { from: /{ name: 'Treino' }/g, to: "{ name: /Treino/i }" },
  { from: /{ name: 'Analisar Corrida' }/g, to: "{ name: /Analisar Corrida/i }" },
  { from: /{ name: 'Analisar Treino' }/g, to: "{ name: /Analisar Treino/i }" },
  { from: /{ name: 'Analisar Avaliação' }/g, to: "{ name: /Analisar Avaliação/i }" },
  { from: /{ name: 'Analisar Refeição' }/g, to: "{ name: /Analisar Refeição/i }" },
  { from: /{ name: 'Guardar Alterações' }/g, to: "{ name: /Guardar Alterações/i }" },
  { from: /{ name: 'Almoço' }/g, to: "{ name: /Almoço/i }" },
  { from: /{ name: 'Jantar' }/g, to: "{ name: /Jantar/i }" },
  { from: /{ name: 'Peito' }/g, to: "{ name: /Peito/i }" },
  { from: /{ name: 'Adicionar alimento' }/g, to: "{ name: /Adicionar alimento/i }" },
  { from: /{ name: 'Remover Arroz' }/g, to: "{ name: /Remover Arroz/i }" },
  { from: /{ name: 'Remover Frango' }/g, to: "{ name: /Remover Frango/i }" },
  { from: /{ name: \/Carregar mais prints da app\/i }/g, to: "{ name: /Mais prints/i }" },
  { from: /{ name: \/Completar manualmente\/i }/g, to: "{ name: /Manual/i }" },
];

const files = [
  'src/components/Run/RunRegistration.test.jsx',
  'src/components/Run/MissingMetricsBottomSheet.test.jsx',
  'src/components/Body/BodyRegistration.test.jsx',
  'src/components/Gym/GymRegistration.test.jsx',
  'src/components/Nutrition/MealRegistration.test.jsx'
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    let changed = false;
    replacements.forEach(r => {
      if (content.match(r.from)) {
        content = content.replace(r.from, r.to);
        changed = true;
      }
    });
    if (changed) {
      fs.writeFileSync(file, content, 'utf8');
      console.log(`Updated ${file}`);
    }
  }
});
