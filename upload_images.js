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

function uploadFile(fileInfo) {
  return new Promise((resolve, reject) => {
    const fileBuffer = fs.readFileSync(fileInfo.path);
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);

    let header = `--${boundary}\r\n`;
    header += `Content-Disposition: form-data; name="file"; filename="${fileInfo.name}.jpg"\r\n`;
    header += `Content-Type: image/jpeg\r\n\r\n`;

    const footer = `\r\n--${boundary}--\r\n`;

    const payload = Buffer.concat([
      Buffer.from(header, 'utf8'),
      fileBuffer,
      Buffer.from(footer, 'utf8')
    ]);

    const req = https.request({
      hostname: 'tmpfiles.org',
      path: '/api/v1/upload',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': payload.length
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 'success' && json.data && json.data.url) {
            // tmpfiles.org returns page URL like https://tmpfiles.org/12345/image.jpg
            // Direct download link is https://tmpfiles.org/dl/12345/image.jpg
            const directUrl = json.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
            resolve({ key: fileInfo.key, url: directUrl });
          } else {
            reject(new Error(`Upload failed: ${data}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function uploadAll() {
  const results = {};
  for (const img of images) {
    try {
      console.log(`Uploading ${img.name}...`);
      const res = await uploadFile(img);
      results[img.key] = res.url;
      console.log(`Uploaded ${img.key}: ${res.url}`);
    } catch (e) {
      console.error(`Failed to upload ${img.key}:`, e.message);
    }
  }
  fs.writeFileSync(path.join(__dirname, 'uploaded_images.json'), JSON.stringify(results, null, 2));
  console.log('Saved uploaded_images.json');
}

uploadAll();
