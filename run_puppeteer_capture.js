const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const DIST_DIR = path.join(__dirname, 'dist');
const PORT = 3987;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

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
      let filePath = path.join(DIST_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
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
  console.log('Launching system Chrome with puppeteer-core...');
  
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--hide-scrollbars']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

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
    const url = `http://localhost:${PORT}/?tab=${t.tab}`;
    console.log(`Opening ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1500));

    const destPath = path.join(docsDir, t.file);
    await page.screenshot({ path: destPath, type: 'jpeg', quality: 90 });
    console.log(`📸 Captured REAL app screenshot: ${t.file}`);
  }

  await browser.close();
  server.close();
  console.log('✅ All real IronHealth app screenshots captured successfully!');
}

capture().catch(err => {
  console.error('Capture error:', err);
  process.exit(1);
});
