/**
 * 迁移脚本：将 D:\food-media-download\files\ 下的图片
 * 上传到 Supabase Storage product-media/images/
 * 并更新数据库 images 字段的 URL
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://infsqrfqksvqzlapvott.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2z92LEUAiZf6smg9aiufFg_p16OStvD';
const BUCKET = 'product-media';
const LOCAL_DIR = 'D:\\food-media-download\\files';
const TABLE_NAME = 'food_showcase_products';

// 递归读取所有图片文件
function walkDir(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(f => {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) {
      results = results.concat(walkDir(full));
    } else if (/\.(jpg|jpeg|png|webp|gif)$/i.test(f)) {
      results.push(full);
    }
  });
  return results;
}

// Supabase Storage 上传（用 anon key，走 public bucket）
function uploadToSupabase(localPath, storagePath) {
  return new Promise((resolve, reject) => {
    const fileBuffer = fs.readFileSync(localPath);
    const fileName = path.basename(localPath);
    const contentType = fileName.endsWith('.png') ? 'image/png'
      : fileName.endsWith('.webp') ? 'image/webp'
      : fileName.endsWith('.gif') ? 'image/gif'
      : 'image/jpeg';

    const uploadPath = `${BUCKET}/images/${storagePath}`;
    const url = `${SUPABASE_URL}/storage/v1/object/${uploadPath}`;

    const options = new URL(url);
    const reqOptions = {
      hostname: options.hostname,
      path: options.pathname + options.search,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': contentType,
        'Cache-Control': 'max-age=3600',
        'Content-Length': fileBuffer.length,
        'x-upsert': 'true'
      }
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(`https://infsqrfqksvqzlapvott.supabase.co/storage/v1/object/public/${uploadPath}`);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(fileBuffer);
    req.end();
  });
}

// 查询所有商品
function fetchProducts() {
  return new Promise((resolve, reject) => {
    const url = `${SUPABASE_URL}/rest/v1/${TABLE_NAME}?select=id,name,images`;
    const options = new URL(url);
    const reqOptions = {
      hostname: options.hostname,
      path: options.pathname + options.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// 更新单个商品的 images 字段
function updateProductImages(id, images) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ images });
    const url = `${SUPABASE_URL}/rest/v1/${TABLE_NAME}?id=eq.${id}`;
    const options = new URL(url);
    const reqOptions = {
      hostname: options.hostname,
      path: options.pathname + options.search,
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Prefer': 'return=minimal'
      }
    };
    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`HTTP ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// 主流程
async function main() {
  console.log('扫描本地图片...');
  const files = walkDir(LOCAL_DIR);
  console.log(`找到 ${files.length} 张图片`);

  // 建立文件名 → 本地路径的映射（不含路径，只比文件名）
  const fileMap = {};
  files.forEach(f => {
    const name = path.basename(f);
    fileMap[name] = f;
  });

  console.log('\n获取数据库商品...');
  const products = await fetchProducts();
  console.log(`数据库共 ${products.length} 个商品`);

  let uploaded = 0;
  let updated = 0;
  let skipped = 0;
  let errors = [];

  for (const p of products) {
    if (!p.images || !Array.isArray(p.images) || p.images.length === 0) {
      skipped++;
      continue;
    }

    const newImages = [];
    let changed = false;

    for (const oldUrl of p.images) {
      // 已经是 Supabase URL，跳过
      if (oldUrl && oldUrl.includes('supabase')) {
        newImages.push(oldUrl);
        continue;
      }

      // 从 COS URL 提取文件名
      const fileName = oldUrl ? oldUrl.split('/').pop() : '';
      if (!fileName || !fileMap[fileName]) {
        // 本地没有这个文件，保留原 URL（可能还能从 COS 访问）
        newImages.push(oldUrl);
        console.log(`  ⚠ 本地无此文件: ${fileName}`);
        continue;
      }

      try {
        console.log(`  上传: ${fileName}`);
        const newUrl = await uploadToSupabase(fileMap[fileName], fileName);
        newImages.push(newUrl);
        uploaded++;
        changed = true;
      } catch (e) {
        console.log(`  ✗ 上传失败 ${fileName}: ${e.message}`);
        newImages.push(oldUrl); // 失败保留原 URL
        errors.push({ product: p.name, file: fileName, error: e.message });
      }
    }

    if (changed) {
      try {
        await updateProductImages(p.id, newImages);
        updated++;
        console.log(`  ✓ 更新商品: ${p.name}`);
      } catch (e) {
        console.log(`  ✗ 更新数据库失败 ${p.name}: ${e.message}`);
        errors.push({ product: p.name, error: `DB更新失败: ${e.message}` });
      }
    }
  }

  console.log('\n===== 完成 =====');
  console.log(`上传图片: ${uploaded}`);
  console.log(`更新商品: ${updated}`);
  console.log(`跳过: ${skipped}`);
  if (errors.length) {
    console.log(`错误: ${errors.length} 条`);
    errors.forEach(e => console.log(`  ${e.product}: ${e.error}`));
  }
}

main().catch(e => {
  console.error('致命错误:', e);
  process.exit(1);
});
