const fs = require('fs');
const https = require('https');
const path = require('path');

const images = [
  { key: 'home', name: 'ironhealth_home_dashboard.jpg', path: 'C:\\Users\\rpmar\\.gemini\\antigravity\\brain\\08473867-0bd6-4615-bd7b-12c1f42fb54f\\ironhealth_home_dashboard_1785581724286.jpg' },
  { key: 'nutrition', name: 'ironhealth_nutrition_dashboard.jpg', path: 'C:\\Users\\rpmar\\.gemini\\antigravity\\brain\\08473867-0bd6-4615-bd7b-12c1f42fb54f\\ironhealth_nutrition_dashboard_1785581735152.jpg' },
  { key: 'gym', name: 'ironhealth_gym_dashboard.jpg', path: 'C:\\Users\\rpmar\\.gemini\\antigravity\\brain\\08473867-0bd6-4615-bd7b-12c1f42fb54f\\ironhealth_gym_dashboard_1785581743168.jpg' },
  { key: 'body', name: 'ironhealth_body_dashboard.jpg', path: 'C:\\Users\\rpmar\\.gemini\\antigravity\\brain\\08473867-0bd6-4615-bd7b-12c1f42fb54f\\ironhealth_body_dashboard_1785581754474.jpg' },
  { key: 'run', name: 'ironhealth_run_dashboard.jpg', path: 'C:\\Users\\rpmar\\.gemini\\antigravity\\brain\\08473867-0bd6-4615-bd7b-12c1f42fb54f\\ironhealth_run_dashboard_1785581765507.jpg' },
  { key: 'coach', name: 'ironhealth_coach_dashboard.jpg', path: 'C:\\Users\\rpmar\\.gemini\\antigravity\\brain\\08473867-0bd6-4615-bd7b-12c1f42fb54f\\ironhealth_coach_dashboard_1785581776569.jpg' }
];

function uploadToPixeldrain(fileInfo) {
  return new Promise((resolve, reject) => {
    const fileBuffer = fs.readFileSync(fileInfo.path);
    const req = https.request({
      hostname: 'pixeldrain.com',
      path: '/api/file/' + encodeURIComponent(fileInfo.name),
      method: 'PUT',
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': fileBuffer.length
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.id) {
            resolve({ key: fileInfo.key, url: `https://pixeldrain.com/api/file/${json.id}` });
          } else {
            reject(new Error(`Pixeldrain failed: ${data}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(fileBuffer);
    req.end();
  });
}

async function run() {
  const results = {};
  for (const img of images) {
    try {
      console.log(`Uploading ${img.name} to Pixeldrain...`);
      const res = await uploadToPixeldrain(img);
      results[img.key] = res.url;
      console.log(`✅ Uploaded ${img.key}: ${res.url}`);
    } catch (e) {
      console.error(`❌ Failed ${img.key}:`, e.message);
    }
  }
  fs.writeFileSync(path.join(__dirname, 'pixeldrain_images.json'), JSON.stringify(results, null, 2));
  console.log('Saved pixeldrain_images.json:', results);
}

run();
