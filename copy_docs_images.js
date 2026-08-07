const fs = require('fs');
const path = require('path');

const srcDir = 'C:\\Users\\rpmar\\.gemini\\antigravity\\brain\\08473867-0bd6-4615-bd7b-12c1f42fb54f';
const destDir = 'C:\\Users\\rpmar\\Claude\\docs-images';

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

const files = [
  { src: 'ironhealth_home_dashboard_1785581724286.jpg', dest: 'ironhealth_home.jpg' },
  { src: 'ironhealth_nutrition_dashboard_1785581735152.jpg', dest: 'ironhealth_nutrition.jpg' },
  { src: 'ironhealth_gym_dashboard_1785581743168.jpg', dest: 'ironhealth_gym.jpg' },
  { src: 'ironhealth_body_dashboard_1785581754474.jpg', dest: 'ironhealth_body.jpg' },
  { src: 'ironhealth_run_dashboard_1785581765507.jpg', dest: 'ironhealth_run.jpg' },
  { src: 'ironhealth_coach_dashboard_1785581776569.jpg', dest: 'ironhealth_coach.jpg' }
];

for (const f of files) {
  const srcPath = path.join(srcDir, f.src);
  const destPath = path.join(destDir, f.dest);
  fs.copyFileSync(srcPath, destPath);
  console.log(`Copied ${f.src} -> ${destPath}`);
}
