const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const DIST_DIR = path.join(__dirname, 'dist');
const PORT = 3456;

// Mime types helper
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

// 1. Create local static server
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let filePath = path.join(DIST_DIR, req.url === '/' ? 'index.html' : req.url);
      if (!fs.existsSync(filePath)) {
        filePath = path.join(DIST_DIR, 'index.html');
      }
      const ext = path.extname(filePath);
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      
      fs.readFile(filePath, (err, content) => {
        if (err) {
          res.writeHead(500);
          res.end('Error loading file');
        } else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content, 'utf-8');
        }
      });
    });

    server.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
      resolve(server);
    });
  });
}

// Mock state data matching IronHealth schema
const MOCK_PROFILE = {
  id: 'user-demo-123',
  email: 'atleta@ironhealth.app',
  full_name: 'Atleta IronHealth',
  gender: 'M',
  height_cm: 178,
  weight_kg: 74.2,
  is_admin: true,
  accent_color: 'orange',
  calorie_goal: 2400,
  protein_goal: 160,
  carbs_goal: 250,
  fat_goal: 65,
  water_goal_ml: 2500,
  goal_weight_kg: 72.0,
  goal_body_fat_pct: 14.5,
  coach_context: 'A treinar para a Meia Maratona do Porto (alvo sub 1h35).'
};

const MOCK_MEALS = [
  {
    id: 'm1',
    date: new Date().toISOString().slice(0, 10),
    meal_type: 'almoco',
    meal_items: [
      { name: 'Peito de Frango Grelhado', quantity_grams: 200, calories_per_100g: 165, protein_per_100g: 31, carbs_per_100g: 0, fat_per_100g: 3.6 },
      { name: 'Arroz Basmati Cozido', quantity_grams: 180, calories_per_100g: 130, protein_per_100g: 2.7, carbs_per_100g: 28, fat_per_100g: 0.3 },
      { name: 'Brócolos ao Vapor', quantity_grams: 150, calories_per_100g: 34, protein_per_100g: 2.8, carbs_per_100g: 7, fat_per_100g: 0.4 }
    ]
  },
  {
    id: 'm2',
    date: new Date().toISOString().slice(0, 10),
    meal_type: 'pequeno-almoco',
    meal_items: [
      { name: 'Papeis de Aveia com Whey e Fruta', quantity_grams: 250, calories_per_100g: 140, protein_per_100g: 12, carbs_per_100g: 20, fat_per_100g: 2.5 }
    ]
  }
];

const MOCK_GYM = [
  {
    id: 'g1',
    date: new Date().toISOString().slice(0, 10),
    name: 'Treino de Peitoral e Tríceps',
    status: 'concluido',
    kind: 'forca',
    categories: ['Peitoral', 'Tríceps'],
    duration_seconds: 3240,
    calories_kcal: 450,
    avg_hr: 135,
    max_hr: 162,
    exertion: 8,
    workout_session_sets: [
      { set_index: 1, reps: 10, weight: 28 },
      { set_index: 2, reps: 8, weight: 30 },
      { set_index: 3, reps: 8, weight: 30 }
    ]
  }
];

const MOCK_BODY = [
  {
    id: 'b1',
    date: new Date().toISOString().slice(0, 10),
    weight_kg: 74.2,
    bmi: 23.4,
    body_fat_pct: 15.8,
    skeletal_muscle_pct: 44.2,
    muscle_mass_kg: 61.8,
    body_water_pct: 61.5,
    protein_pct: 18.2,
    bone_mass_kg: 3.4,
    bmr_kcal: 1740,
    visceral_fat: 4,
    subcutaneous_fat_pct: 12.1,
    metabolic_age: 24,
    lean_body_mass_kg: 62.5
  }
];

const MOCK_RUNS = [
  {
    id: 'r1',
    date: new Date().toISOString().slice(0, 10),
    kind: 'treino',
    training_type: 'tempo',
    distance_km: 12.5,
    duration_seconds: 3260,
    exertion: 8
  }
];

const MOCK_WATER = [
  { amount_ml: 500 }, { amount_ml: 500 }, { amount_ml: 300 }, { amount_ml: 500 }
];

const MOCK_RACES = [
  {
    id: 'rc1',
    date: new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 10),
    name: 'Meia Maratona do Porto',
    race_type: '21k',
    location: 'Porto',
    target_time: '01:35:00',
    status: 'agendada'
  }
];

async function capture() {
  const server = await startServer();
  console.log('Launching Puppeteer browser...');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  // Set realistic mobile viewport (iPhone 14 / modern smartphone)
  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 2
  });

  console.log('Navigating to app...');
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle0' });

  // Inject session mock and store state
  await page.evaluate((profile, meals, gym, body, runs, water, races) => {
    // Set dummy Supabase session token in localStorage
    const mockSession = {
      user: { id: profile.id, email: profile.email },
      access_token: 'mock-access-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600
    };
    localStorage.setItem('sb-roxfzsiciizkevopgpnl-auth-token', JSON.stringify(mockSession));

    // Access Zustand store window object or trigger window state
    if (window.useAppStore) {
      const store = window.useAppStore.getState();
      store.setSession(mockSession);
      store.setProfile(profile);
      store.setMeals(meals);
      store.setGymSessions(gym);
      store.setBodyAssessments(body);
      store.setRuns(runs);
      if (store.setWaterLogs) store.setWaterLogs(water);
    }
  }, MOCK_PROFILE, MOCK_MEALS, MOCK_GYM, MOCK_BODY, MOCK_RUNS, MOCK_WATER, MOCK_RACES);

  // Reload to apply injected session
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));

  const tabs = [
    { tab: 'home', file: 'ironhealth_home.jpg' },
    { tab: 'nutricao', file: 'ironhealth_nutrition.jpg' },
    { tab: 'ginasio', file: 'ironhealth_gym.jpg' },
    { tab: 'corpo', file: 'ironhealth_body.jpg' },
    { tab: 'corrida', file: 'ironhealth_run.jpg' },
    { tab: 'coach', file: 'ironhealth_coach.jpg' }
  ];

  const docsDir = path.join(__dirname, 'docs-images');
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

  for (const t of tabs) {
    console.log(`Navigating to tab [${t.tab}]...`);
    
    // Click tab button or call store setActiveTab
    await page.evaluate((tabName) => {
      // Find button by data-vert or click nav button
      const btn = document.querySelector(`[data-vert="${tabName}"]`);
      if (btn) btn.click();
    }, t.tab);

    await new Promise(r => setTimeout(r, 1500));

    const destPath = path.join(docsDir, t.file);
    await page.screenshot({
      path: destPath,
      type: 'jpeg',
      quality: 92,
      fullPage: false
    });
    console.log(`📸 Captured screenshot: ${destPath}`);
  }

  await browser.close();
  server.close();
  console.log('✅ All real app screenshots captured successfully!');
}

capture().catch(err => {
  console.error('Error during capture:', err);
  process.exit(1);
});
