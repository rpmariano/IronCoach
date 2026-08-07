const fs = require('fs');
const https = require('https');
const path = require('path');

const images = [
  { key: 'home', name: 'ironhealth_home_dashboard', path: 'C:\\Users\\rpmar\\.gemini\\antigravity\\brain\\08473867-0bd6-4615-bd7b-12c1f42fb54f\\ironhealth_home_dashboard_1785581724286.jpg' },
  { key: 'nutrition', name: 'ironhealth_nutrition_dashboard', path: 'C:\\Users\\rpmar\\.gemini\\antigravity\\brain\\08473867-0bd6-4615-bd7b-12c1f42fb54f\\ironhealth_nutrition_dashboard_1785581735152.jpg' },
  { key: 'gym', name: 'ironhealth_gym_dashboard', path: 'C:\\Users\\rpmar\\.gemini\\antigravity\\brain\\08473867-0bd6-4615-bd7b-12c1f42fb54f\\ironhealth_gym_dashboard_1785581743168.jpg' },
  { key: 'body', name: 'ironhealth_body_dashboard', path: 'C:\\Users\\rpmar\\.gemini\\antigravity\\brain\\08473867-0bd6-4615-bd7b-12c1f42fb54f\\ironhealth_body_dashboard_1785581754474.jpg' },
  { key: 'run', name: 'ironhealth_run_dashboard', path: 'C:\\Users\\rpmar\\.gemini\\antigravity\\brain\\08473867-0bd6-4615-bd7b-12c1f42fb54f\\ironhealth_run_dashboard_1785581765507.jpg' },
  { key: 'coach', name: 'ironhealth_coach_dashboard', path: 'C:\\Users\\rpmar\\.gemini\\antigravity\\brain\\08473867-0bd6-4615-bd7b-12c1f42fb54f\\ironhealth_coach_dashboard_1785581776569.jpg' }
];

function uploadToCatbox(fileInfo) {
  return new Promise((resolve, reject) => {
    const fileBuffer = fs.readFileSync(fileInfo.path);
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);

    let body = '';
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="reqtype"\r\n\r\nfileupload\r\n`;
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="fileToUpload"; filename="${fileInfo.name}.jpg"\r\n`;
    body += `Content-Type: image/jpeg\r\n\r\n`;

    const footer = `\r\n--${boundary}--\r\n`;

    const payload = Buffer.concat([
      Buffer.from(body, 'utf8'),
      fileBuffer,
      Buffer.from(footer, 'utf8')
    ]);

    const req = https.request({
      hostname: 'catbox.moe',
      path: '/user/api.php',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': payload.length
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 200 && data.startsWith('http')) {
          resolve({ key: fileInfo.key, url: data.trim() });
        } else {
          reject(new Error(`Catbox upload failed (${res.statusCode}): ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function run() {
  const results = {};
  for (const img of images) {
    try {
      console.log(`Uploading ${img.name} to Catbox...`);
      const res = await uploadToCatbox(img);
      results[img.key] = res.url;
      console.log(`✅ Uploaded ${img.key}: ${res.url}`);
    } catch (e) {
      console.error(`❌ Failed ${img.key}:`, e.message);
    }
  }
  fs.writeFileSync(path.join(__dirname, 'catbox_images.json'), JSON.stringify(results, null, 2));
  console.log('Saved catbox_images.json:', results);
}

run();
