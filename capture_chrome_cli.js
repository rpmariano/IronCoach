const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DIST_DIR = path.join(__dirname, 'dist');
const PORT = 3456;
const CHROME_PATH = '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"';

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

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

async function capture() {
  const server = await startServer();
  const docsDir = path.join(__dirname, 'docs-images');
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

  const tabs = [
    { tab: 'home', file: 'ironhealth_home.jpg' },
    { tab: 'nutricao', file: 'ironhealth_nutrition.jpg' },
    { tab: 'ginasio', file: 'ironhealth_gym.jpg' },
    { tab: 'corpo', file: 'ironhealth_body.jpg' },
    { tab: 'corrida', file: 'ironhealth_run.jpg' },
    { tab: 'coach', file: 'ironhealth_coach.jpg' }
  ];

  for (const t of tabs) {
    const destPath = path.join(docsDir, t.file);
    const targetUrl = `http://localhost:${PORT}/?tab=${t.tab}`;
    const cmd = `${CHROME_PATH} --headless --disable-gpu --hide-scrollbars --window-size=390,844 --screenshot="${destPath}" "${targetUrl}"`;
    
    console.log(`Capturing ${t.tab} -> ${destPath}...`);
    try {
      execSync(cmd, { stdio: 'ignore' });
      console.log(`✅ Saved ${t.file}`);
    } catch (e) {
      console.error(`❌ Failed ${t.file}:`, e.message);
    }
  }

  server.close();
  console.log('Done capturing Chrome screenshots!');
}

capture();
