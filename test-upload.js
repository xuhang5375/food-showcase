const https = require('https');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://rihlfwgrqdxgygyvatda.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpaGxmd2dycWR4Z3lneXZhdGRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NTgwMTksImV4cCI6MjA5NzMzNDAxOX0.rwtwihYhMNtuW4xzemZUkeTD3YOhswpThr8A2ieJfZs';
const BUCKET = 'product-media';
const LOCAL_DIR = 'D:\\food-media-download\\files';

// 找第一张图片
const files = fs.readdirSync(LOCAL_DIR);
const testFile = files.find(f => /\.(jpg|png|webp)$/i.test(f));
console.log('测试文件:', testFile);

const localPath = path.join(LOCAL_DIR, testFile);
const fileBuffer = fs.readFileSync(localPath);
const contentType = testFile.endsWith('.png') ? 'image/png' : testFile.endsWith('.webp') ? 'image/webp' : 'image/jpeg';

const uploadPath = `${BUCKET}/images/${testFile}`;
const url = `${SUPABASE_URL}/storage/v1/object/${uploadPath}`;

const urlObj = new URL(url);
const reqOptions = {
  hostname: urlObj.hostname,
  path: urlObj.pathname + urlObj.search,
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'apikey': SUPABASE_ANON_KEY,
    'Content-Type': contentType,
    'Content-Length': fileBuffer.length,
    'x-upsert': 'true'
  }
};

console.log('上传到:', url);
const req = https.request(reqOptions, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('状态码:', res.statusCode);
    console.log('响应:', data);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('✓ 上传成功!');
      console.log('公网 URL:', `${SUPABASE_URL}/storage/v1/object/public/${uploadPath}`);
    }
  });
});
req.on('error', e => console.error('错误:', e.message));
req.write(fileBuffer);
req.end();
