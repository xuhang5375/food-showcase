// ========================================
// food-showcase 管理后台逻辑
// ========================================

// Supabase 配置（硬编码）
var SUPABASE_URL = 'https://infsqrfqksvqzlapvott.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_2z92LEUAiZf6smg9aiufFg_p16OStvD';

var ADMIN_PASSWORD = '920615';
var TABLE_NAME = 'products';
var BUCKET_NAME = 'product-media';

// COS 配置（备用）
var COS_SECRET_ID = '';
var COS_SECRET_KEY = '';
var COS_BUCKET = 'foodshowcase-1308216845';
var COS_REGION = 'ap-guangzhou';
var COS_CDN_URL = 'https://foodshowcase-1308216845.file.myqcloud.com';
var COS_UPLOAD_FOLDER = 'food-showcase';

let isLoggedIn = false;
let editingId = null;
let existingImageUrls = [];
let newImageFiles = [];
let existingVideoUrl = null;
let newVideoFile = null;

// ---- REST API 封装 ----
function request(table, method, options = {}) {
  return new Promise((resolve, reject) => {
    const { select = '*', filter = '', order = '', data = null, single = false } = options;
    let url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}`;
    if (filter) url += `&${filter}`;
    if (order) url += `&order=${encodeURIComponent(order)}`;
    
    const header = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    };
    if (single && method !== 'GET') header['Prefer'] = 'return=representation';

    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.timeout = 15000;
    Object.keys(header).forEach(k => xhr.setRequestHeader(k, header[k]));
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const resp = JSON.parse(xhr.responseText);
          resolve(single && Array.isArray(resp) ? resp[0] : resp);
        } catch(e) {
          resolve(null);
        }
      } else {
        let errMsg = `数据库返回错误 ${xhr.status}`;
        try { const d = JSON.parse(xhr.responseText); if(d.message) errMsg += '：' + d.message; } catch(e) {}
        reject({ message: errMsg });
      }
    };
    xhr.onerror = () => reject({ message: '网络连接失败，请检查网络后刷新页面重试' });
    xhr.ontimeout = () => reject({ message: '请求超时（15秒），数据库响应太慢，请稍后重试' });
    xhr.send(data ? JSON.stringify(data) : null);
  });
}

// ---- 登录 ----
function checkPassword() {
  var pw = document.getElementById('passwordInput').value;
  if (pw === ADMIN_PASSWORD) {
    isLoggedIn = true;
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('adminSection').style.display = 'block';
    loadProducts();
    loadVideoToggle();
  } else {
    alert('密码错误');
    document.getElementById('passwordInput').value = '';
    document.getElementById('passwordInput').focus();
  }
}

document.addEventListener('DOMContentLoaded', function() {
  var pwInput = document.getElementById('passwordInput');
  if (pwInput) pwInput.addEventListener('keyup', function(e) { if (e.key === 'Enter') checkPassword(); });
  var imageFile = document.getElementById('imageFile');
  if (imageFile) imageFile.addEventListener('change', handleImageUpload);
  var videoFile = document.getElementById('videoFile');
  if (videoFile) videoFile.addEventListener('change', handleVideoUpload);
});

// ---- 视频开关 ----
async function loadVideoToggle() {
  var btn = document.getElementById('videoToggleBtn');
  if (!btn) return;
  btn.textContent = '视频功能: 加载中...';
  btn.disabled = true;
  try {
    const data = await request('app_config', 'GET', { 
      select: 'value', 
      filter: 'key=eq.video_enabled', 
      single: true 
    });
    if (!data) { btn.textContent = '视频功能: 未配置'; btn.disabled = false; return; }
    var enabled = data.value === 'true';
    btn.textContent = '视频功能: ' + (enabled ? '已开启' : '已关闭');
    btn.style.background = enabled ? '#4caf50' : '#f5f5f5';
    btn.style.color = enabled ? '#fff' : '#666';
    btn.disabled = false;
    btn.dataset.enabled = enabled ? 'true' : 'false';
  } catch (e) {
    btn.textContent = '视频功能: 加载失败';
    btn.disabled = false;
  }
}

async function toggleVideo() {
  var btn = document.getElementById('videoToggleBtn');
  if (!btn || btn.disabled) return;
  var currentEnabled = btn.dataset.enabled === 'true';
  var newEnabled = !currentEnabled;
  if (!confirm('确定' + (newEnabled ? '开启' : '关闭') + '视频功能？')) return;
  btn.disabled = true;
  btn.textContent = '切换中...';
  try {
    await request('app_config', 'PATCH', { 
      filter: 'key=eq.video_enabled', 
      data: { value: String(newEnabled) } 
    });
    btn.dataset.enabled = newEnabled ? 'true' : 'false';
    btn.textContent = '视频功能: ' + (newEnabled ? '已开启' : '已关闭');
    btn.style.background = newEnabled ? '#4caf50' : '#f5f5f5';
    btn.style.color = newEnabled ? '#fff' : '#666';
    showToast('视频功能已' + (newEnabled ? '开启' : '关闭'));
  } catch (e) {
    alert('切换失败: ' + e.message);
  }
  btn.disabled = false;
}

// ---- Toast ----
function showToast(msg, duration) {
  duration = duration || 2000;
  var t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 24px;border-radius:8px;z-index:9999;transition:opacity .3s'; document.body.appendChild(t); }
  t.textContent = msg; t.style.opacity = '1';
  setTimeout(function() { t.style.opacity = '0'; }, duration);
}

function showProgress(msg) {
  var t = document.getElementById('progressToast');
  if (!t) { t = document.createElement('div'); t.id = 'progressToast'; t.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:#2196F3;color:#fff;padding:12px 24px;border-radius:8px;z-index:9998;max-width:80%;word-break:break-all'; document.body.appendChild(t); }
  t.textContent = msg; t.style.display = 'block';
}
function hideProgress() { var t = document.getElementById('progressToast'); if (t) t.style.display = 'none'; }

// ---- 加载商品列表 ----
async function loadProducts() {
  var container = document.getElementById('productList');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:40px;color:#999">加载中...</div>';
  try {
    const data = await request(TABLE_NAME, 'GET', { order: 'created_at.desc' });
    if (!data || data.length === 0) { container.innerHTML = '<div style="text-align:center;padding:40px;color:#999">暂无商品</div>'; return; }

    var html = '<div style="padding:12px 16px;display:flex;gap:8px;align-items:center">' +
      '<input id="adminSearch" type="text" placeholder="搜索商品名称/分类..." oninput="filterProducts()" style="flex:1;padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:14px">' +
      '</div>';

    html += '<div class="product-list" id="productListItems">';
    data.forEach(function(p) {
      var priceText = '-';
      if (p.price != null) { var unit = p.unit ? '/' + p.unit : ''; priceText = '¥' + p.price + unit; }
      var firstImg = (Array.isArray(p.images) && p.images.length > 0) ? p.images[0] : (p.cover_image || '');
      var coverImg = firstImg ? '<img src="' + firstImg + '" style="width:60px;height:60px;object-fit:cover;border-radius:6px" onerror="this.style.display=\'none\'">' : '<div style="width:60px;height:60px;background:#eee;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:24px">📦</div>';
      html += '<div class="product-item" data-name="' + (p.name||'').toLowerCase() + '" data-tag="' + (p.tag||'').toLowerCase() + '" style="display:flex;align-items:center;padding:12px;border-bottom:1px solid #eee;gap:12px">' +
        coverImg +
        '<div style="flex:1;min-width:0">' +
        '<div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (p.name||'未命名') + '</div>' +
        '<div style="color:#888;font-size:13px">' + (p.tag||'未分类') + ' | ' + priceText + '</div></div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
        '<button onclick="editProduct(\'' + p.id + '\')" style="padding:6px 10px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;font-size:12px">编辑</button>' +
        '<button onclick="deleteProduct(\'' + p.id + '\')" style="padding:6px 10px;border:none;border-radius:6px;background:#ff4444;color:#fff;cursor:pointer;font-size:12px">删除</button>' +
        '</div></div>';
    });
    html += '</div>';
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<div style="color:red;padding:20px">网络错误: ' + e.message + '</div>';
  }
}

// ---- 搜索筛选 ----
function filterProducts() {
  var keyword = (document.getElementById('adminSearch').value || '').toLowerCase().trim();
  var items = document.querySelectorAll('#productListItems .product-item');
  var visibleCount = 0;
  items.forEach(function(el) {
    var name = el.getAttribute('data-name') || '';
    var tag = el.getAttribute('data-tag') || '';
    var matchKw = !keyword || name.indexOf(keyword) >= 0 || tag.indexOf(keyword) >= 0;
    el.style.display = matchKw ? 'flex' : 'none';
    if (matchKw) visibleCount++;
  });
  var tip = document.getElementById('noResultTip');
  if (visibleCount === 0 && keyword) {
    if (!tip) { tip = document.createElement('div'); tip.id = 'noResultTip'; tip.style.cssText = 'text-align:center;padding:40px;color:#999'; tip.textContent = '没有匹配的商品'; document.getElementById('productListItems').appendChild(tip); }
    tip.style.display = 'block';
  } else if (tip) { tip.style.display = 'none'; }
}

// ---- 上下架 ----
// products 表无 is_active 字段，上下架功能已禁用。如需恢复请在 Supabase SQL 编辑器加列：ALTER TABLE products ADD COLUMN is_active boolean DEFAULT true;

// ---- 显示/隐藏表单 ----
function showAddForm() {
  editingId = null; existingImageUrls = []; newImageFiles = []; existingVideoUrl = null; newVideoFile = null;
  document.getElementById('formTitle').textContent = '添加商品';
  document.getElementById('productName').value = '';
  document.getElementById('productDesc').value = '';
  document.getElementById('productCategory').value = '黑千层';
  document.getElementById('productPriceNum').value = '';
  document.getElementById('productPriceUnit').value = '箱';
  document.getElementById('productCode').value = '';
  document.getElementById('productSpec').value = '';
  document.getElementById('imagePreview').innerHTML = '';
  document.getElementById('videoPreview').innerHTML = '';
  document.getElementById('imageUploadText').textContent = '📷 点击上传图片（可多选）';
  document.getElementById('videoUploadText').textContent = '🎬 点击上传视频';
  document.getElementById('productForm').style.display = 'block';
  document.getElementById('productList').style.display = 'none';
}
function hideForm() { document.getElementById('productForm').style.display = 'none'; document.getElementById('productList').style.display = 'block'; loadProducts(); }

// ---- 多图上传 ----
function handleImageUpload(event) {
  var files = event.target.files; if (!files || files.length === 0) return;
  for (var i = 0; i < files.length; i++) { (function(file) { var reader = new FileReader(); reader.onload = function(e) { newImageFiles.push({ file: file, previewUrl: e.target.result }); renderImagePreview(); }; reader.readAsDataURL(file); })(files[i]); }
  document.getElementById('imageUploadText').textContent = '✅ 已选择 ' + newImageFiles.length + ' 张新图片';
}
function renderImagePreview() {
  var html = '';
  existingImageUrls.forEach(function(url, i) { html += '<div style="position:relative;display:inline-block;margin:4px"><img src="' + url + '" style="width:80px;height:80px;object-fit:cover;border-radius:6px"><button onclick="removeExistingImage(' + i + ')" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#ff4444;color:#fff;border:none;font-size:12px;cursor:pointer">×</button></div>'; });
  newImageFiles.forEach(function(img, i) { html += '<div style="position:relative;display:inline-block;margin:4px"><img src="' + img.previewUrl + '" style="width:80px;height:80px;object-fit:cover;border-radius:6px"><button onclick="removeNewImage(' + i + ')" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#ff4444;color:#fff;border:none;font-size:12px;cursor:pointer">×</button><div style="position:absolute;bottom:2px;left:2px;background:rgba(0,0,0,0.5);color:#fff;font-size:10px;padding:1px 4px;border-radius:3px">新</div></div>'; });
  document.getElementById('imagePreview').innerHTML = html;
  var total = existingImageUrls.length + newImageFiles.length;
  document.getElementById('imageUploadText').textContent = total > 0 ? '✅ 共 ' + total + ' 张图片' : '📷 点击上传图片（可多选）';
}
function removeExistingImage(index) { existingImageUrls.splice(index, 1); renderImagePreview(); }
function removeNewImage(index) { newImageFiles.splice(index, 1); renderImagePreview(); }

// ---- 视频上传 ----
function handleVideoUpload(event) {
  var file = event.target.files[0]; if (!file) return;
  newVideoFile = file; var url = URL.createObjectURL(file);
  var videoHtml = '<video src="' + url + '" style="width:100%;max-width:300px;height:auto;max-height:200px;border-radius:8px;background:#000" controls playsinline></video>';
  if (existingVideoUrl) { videoHtml += '<div style="margin-top:8px;display:flex;gap:8px"><button onclick="restoreExistingVideo()" style="padding:4px 12px;background:#2196F3;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">恢复原有视频</button><button onclick="removeNewVideo()" style="padding:4px 12px;background:#ff4444;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">删除新视频</button></div>'; }
  else { videoHtml += '<div style="margin-top:8px"><button onclick="removeNewVideo()" style="padding:4px 12px;background:#ff4444;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">删除视频</button></div>'; }
  document.getElementById('videoPreview').innerHTML = videoHtml;
  document.getElementById('videoUploadText').textContent = '✅ 已选择新视频: ' + (file.size / 1024 / 1024).toFixed(1) + 'MB';
}
function removeNewVideo() { newVideoFile = null; if (existingVideoUrl) { restoreExistingVideo(); } else { document.getElementById('videoPreview').innerHTML = ''; document.getElementById('videoUploadText').textContent = '🎬 点击上传视频'; } }
function restoreExistingVideo() {
  newVideoFile = null;
  document.getElementById('videoPreview').innerHTML = '<video src="' + existingVideoUrl + '" style="width:100%;max-width:300px;height:auto;max-height:200px;border-radius:8px;background:#000" controls playsinline></video><div style="margin-top:8px;display:flex;gap:8px"><button onclick="removeExistingVideo()" style="padding:4px 12px;background:#ff4444;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">删除视频</button><button onclick="document.getElementById(\'videoFile\').click()" style="padding:4px 12px;background:#2196F3;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">更换视频</button></div>';
  document.getElementById('videoUploadText').textContent = '✅ 使用原有视频';
}
function removeExistingVideo() { existingVideoUrl = null; newVideoFile = null; document.getElementById('videoPreview').innerHTML = ''; document.getElementById('videoUploadText').textContent = '🎬 点击上传视频'; }

// ---- 上传图片到 Supabase Storage ----
async function uploadImageToSupabase(file) {
  return new Promise(function(resolve, reject) {
    var ext = file.name.split('.').pop();
    var fileName = Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.' + ext;
    var url = SUPABASE_URL + '/storage/v1/object/product-media/images/' + fileName;

    var xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', function(ev) {
      if (ev.lengthComputable) { var pct = Math.round((ev.loaded / ev.total) * 100); showProgress('上传图片 ' + pct + '%'); }
    });
    xhr.addEventListener('load', function() {
      hideProgress();
      if (xhr.status >= 200 && xhr.status < 300) {
        var publicUrl = SUPABASE_URL + '/storage/v1/object/public/product-media/images/' + fileName;
        console.log('Supabase上传成功:', publicUrl);
        resolve(publicUrl);
      } else {
        console.error('Supabase上传失败:', xhr.status, xhr.responseText);
        reject(new Error('图片上传失败: ' + xhr.status));
      }
    });
    xhr.addEventListener('error', function() { hideProgress(); reject(new Error('网络错误')); });
    xhr.addEventListener('timeout', function() { hideProgress(); reject(new Error('上传超时')); });

    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', 'Bearer ' + SUPABASE_ANON_KEY);
    xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
    xhr.setRequestHeader('Content-Type', file.type || 'image/jpeg');
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.timeout = 120000;
    xhr.send(file);
  });
}

// ---- 上传视频到 Supabase Storage ----
async function uploadVideoToSupabase(file) {
  return new Promise(function(resolve, reject) {
    var ext = file.name.split('.').pop();
    var fileName = Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.' + ext;
    var url = SUPABASE_URL + '/storage/v1/object/product-media/videos/' + fileName;
    var fileSizeMB = (file.size / 1024 / 1024).toFixed(2);

    var xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', function(ev) {
      if (ev.lengthComputable) { var pct = Math.round((ev.loaded / ev.total) * 100); showProgress('上传视频 ' + pct + '% (' + fileSizeMB + 'MB)'); }
    });
    xhr.addEventListener('load', function() {
      hideProgress();
      if (xhr.status >= 200 && xhr.status < 300) {
        var publicUrl = SUPABASE_URL + '/storage/v1/object/public/product-media/videos/' + fileName;
        console.log('视频上传成功:', publicUrl);
        resolve(publicUrl);
      } else {
        console.error('视频上传失败:', xhr.status, xhr.responseText);
        reject(new Error('视频上传失败: ' + xhr.status));
      }
    });
    xhr.addEventListener('error', function() { hideProgress(); reject(new Error('网络错误')); });
    xhr.addEventListener('timeout', function() { hideProgress(); reject(new Error('上传超时')); });

    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', 'Bearer ' + SUPABASE_ANON_KEY);
    xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
    xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.timeout = 300000;
    xhr.send(file);
  });
}

// ---- 保存商品 ----
async function saveProduct() {
  var name = document.getElementById('productName').value.trim();
  if (!name) { alert('请输入商品名称'); return; }

  var desc = document.getElementById('productDesc').value.trim();
  var category = document.getElementById('productCategory').value || '黑千层';
  var priceNum = document.getElementById('productPriceNum').value.trim();
  var unit = document.getElementById('productPriceUnit').value || '箱';
  var code = document.getElementById('productCode').value.trim();
  var specification = document.getElementById('productSpec').value.trim();
  var priceStr = priceNum ? priceNum + '/' + unit : '';

  var btn = document.querySelector('.btn-save');
  if (btn) { btn.disabled = true; btn.textContent = '保存中...'; }

  try {
    var imageUrls = [...existingImageUrls];
    if (newImageFiles.length > 0) {
      showProgress('上传 ' + newImageFiles.length + ' 张图片到云存储...');
      for (var i = 0; i < newImageFiles.length; i++) {
        try {
          showProgress('上传图片 ' + (i+1) + '/' + newImageFiles.length + '...');
          var uploadedUrl = await uploadImageToSupabase(newImageFiles[i].file);
          if (uploadedUrl) imageUrls.push(uploadedUrl);
        } catch(e) { console.error('图片上传失败:', e); showToast('第' + (i+1) + '张图片上传失败'); }
      }
      hideProgress();
    }

    var videoUrl = existingVideoUrl;
    if (newVideoFile) {
      try {
        var uploadedVideoUrl = await uploadVideoToSupabase(newVideoFile);
        if (uploadedVideoUrl) videoUrl = uploadedVideoUrl;
      } catch(e) { console.error('视频上传失败:', e); showToast('视频上传失败'); }
    }

    var body = {
      name: name,
      description: desc,
      tag: category,
      price: priceNum ? Number(priceNum) : null,
      unit: unit,
      images: imageUrls.length > 0 ? imageUrls : null,
      cover_image: imageUrls.length > 0 ? imageUrls[0] : null,
      video: videoUrl
    };

    console.log('保存数据:', body);

    if (editingId) {
      await request(TABLE_NAME, 'PATCH', { filter: 'id=eq.' + editingId, data: body });
    } else {
      await request(TABLE_NAME, 'POST', { data: body });
    }

    showToast(editingId ? '修改成功' : '添加成功');
    hideForm();
  } catch (e) {
    hideProgress();
    console.error('保存异常:', e);
    alert('网络错误: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '保 存'; }
  }
}

// ---- 编辑商品 ----
async function editProduct(id) {
  try {
    const data = await request(TABLE_NAME, 'GET', { 
      filter: 'id=eq.' + id, 
      select: '*', 
      single: true 
    });
    if (!data) { alert('未找到该商品'); return; }

    editingId = id;
    document.getElementById('formTitle').textContent = '编辑商品';
    document.getElementById('productName').value = data.name || '';
    document.getElementById('productDesc').value = data.description || '';
    document.getElementById('productCategory').value = data.tag || '黑千层';
    document.getElementById('productSpec').value = data.unit || '';

    if (data.price != null) { document.getElementById('productPriceNum').value = data.price; document.getElementById('productPriceUnit').value = data.unit || '箱'; }
    else { document.getElementById('productPriceNum').value = ''; document.getElementById('productPriceUnit').value = '箱'; }

    existingImageUrls = []; newImageFiles = [];
    if (Array.isArray(data.images) && data.images.length > 0) existingImageUrls = [...data.images];
    else if (data.cover_image) existingImageUrls = [data.cover_image];

    existingVideoUrl = (data.video && data.video.trim()) ? data.video : null;
    newVideoFile = null;

    renderImagePreview();
    if (existingVideoUrl) restoreExistingVideo();
    else { document.getElementById('videoPreview').innerHTML = ''; document.getElementById('videoUploadText').textContent = '🎬 点击上传视频'; }

    document.getElementById('productForm').style.display = 'block';
    document.getElementById('productList').style.display = 'none';
  } catch (e) { alert('加载失败: ' + e.message); }
}

// ---- 删除商品 ----
async function deleteProduct(id) {
  if (!confirm('确定删除该商品？')) return;
  try {
    await request(TABLE_NAME, 'DELETE', { filter: 'id=eq.' + id });
    showToast('已删除');
    loadProducts();
  } catch (e) { alert('网络错误: ' + e.message); }
}

// ---- 退出登录 ----
function logoutAdmin() {
  isLoggedIn = false;
  document.getElementById('loginSection').style.display = 'block';
  document.getElementById('adminSection').style.display = 'none';
  document.getElementById('passwordInput').value = '';
}

// ---- 访客登记记录 ----
let allVisitorLogs = [];

async function showVisitorLogs() {
  document.getElementById('productList').style.display = 'none';
  document.getElementById('productForm').style.display = 'none';
  document.getElementById('visitorSection').style.display = 'block';
  await loadVisitorLogs();
}

function hideVisitorLogs() {
  document.getElementById('visitorSection').style.display = 'none';
  document.getElementById('productList').style.display = 'block';
}

async function loadVisitorLogs() {
  var container = document.getElementById('visitorList');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:40px;color:#999">加载中...</div>';
  try {
    const data = await request('visitor_logs', 'GET', { order: 'created_at.desc' });
    allVisitorLogs = data || [];
    renderVisitorList(allVisitorLogs);
  } catch (e) {
    container.innerHTML = '<div style="color:red;padding:20px">加载失败: ' + e.message + '</div>';
  }
}

function renderVisitorList(list) {
  var container = document.getElementById('visitorList');
  if (!list || list.length === 0) { container.innerHTML = '<div style="text-align:center;padding:40px;color:#999">暂无访客记录</div>'; return; }
  var html = '<div style="padding:8px 16px;color:#888;font-size:13px">共 ' + list.length + ' 条记录</div>';
  list.forEach(function(v) {
    var name = v.name || '-';
    var phone = v.phone || '-';
    var visitTime = v.visit_time ? v.visit_time.replace('T', ' ').substring(0, 16) : '-';
    html += '<div class="visitor-item" data-name="' + name.toLowerCase() + '" data-phone="' + phone + '" style="display:flex;align-items:center;padding:12px 16px;border-bottom:1px solid #eee;gap:12px">' +
      '<div style="width:40px;height:40px;border-radius:50%;background:#e3f2fd;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">👤</div>' +
      '<div style="flex:1;min-width:0">' +
      '<div style="font-weight:600;font-size:14px">' + name + '</div>' +
      '<div style="color:#888;font-size:12px;margin-top:2px">' + phone + '</div></div>' +
      '<div style="text-align:right;flex-shrink:0">' +
      '<div style="font-size:12px;color:#666">' + visitTime + '</div></div></div>';
  });
  container.innerHTML = html;
}

function filterVisitors() {
  var keyword = (document.getElementById('visitorSearch').value || '').toLowerCase().trim();
  if (!keyword) { renderVisitorList(allVisitorLogs); return; }
  var filtered = allVisitorLogs.filter(function(v) {
    return (v.name || '').toLowerCase().indexOf(keyword) >= 0 || (v.phone || '').indexOf(keyword) >= 0;
  });
  renderVisitorList(filtered);
}
