// ========================================
// food-showcase 管理后台逻辑
// 修复：COS签名双重HMAC、增加搜索+上下架
// ========================================

function getSupabase() { return window.supabase; }
var ADMIN_PASSWORD = window.ADMIN_PASSWORD || '920615';
var TABLE_NAME = window.TABLE_NAME || 'food_showcase_products';
var BUCKET_NAME = window.BUCKET_NAME || 'product-media';
var COS_SECRET_ID = window.COS_SECRET_ID || '';
var COS_SECRET_KEY = window.COS_SECRET_KEY || '';
var COS_BUCKET = window.COS_BUCKET || '';
var COS_REGION = window.COS_REGION || '';
var COS_CDN_URL = window.COS_CDN_URL || '';
var COS_UPLOAD_FOLDER = window.COS_UPLOAD_FOLDER || 'food-showcase';

let isLoggedIn = false;
let editingId = null;
let existingImageUrls = [];
let newImageFiles = [];
let existingVideoUrl = null;
let newVideoFile = null;

// ---- 等待 Supabase 初始化 ----
function waitForSupabase() {
    return new Promise((resolve) => {
        if (window.supabase) { resolve(); return; }
        const check = setInterval(() => {
            if (window.supabase) { clearInterval(check); resolve(); }
        }, 50);
        setTimeout(() => { clearInterval(check); console.error('Supabase 初始化超时'); }, 5000);
    });
}

function checkPassword() {
    var pw = document.getElementById('passwordInput').value;
    if (pw === ADMIN_PASSWORD) {
        isLoggedIn = true;
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('adminSection').style.display = 'block';
        loadProducts();
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

// ---- Toast ----
function showToast(msg, duration) {
    duration = duration || 2000;
    var t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 24px;border-radius:8px;z-index:9999;transition:opacity .3s'; document.body.appendChild(t); }
    t.textContent = msg; t.style.opacity = '1';
    setTimeout(function() { t.style.opacity = '0'; }, duration);
}

// ---- 显示上传进度 ----
function showProgress(msg) {
    var t = document.getElementById('progressToast');
    if (!t) { t = document.createElement('div'); t.id = 'progressToast'; t.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:#2196F3;color:#fff;padding:12px 24px;border-radius:8px;z-index:9998;max-width:80%;word-break:break-all'; document.body.appendChild(t); }
    t.textContent = msg; t.style.display = 'block';
}
function hideProgress() { var t = document.getElementById('progressToast'); if (t) t.style.display = 'none'; }

// ---- 加载商品列表 ----
async function loadProducts() {
    await waitForSupabase();
    var container = document.getElementById('productList');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#999">加载中...</div>';
    try {
        var { data, error } = await getSupabase().from(TABLE_NAME).select('*').order('created_at', { ascending: false });
        if (error) { container.innerHTML = '<div style="color:red;padding:20px">加载失败: ' + error.message + '</div>'; return; }
        if (!data || data.length === 0) { container.innerHTML = '<div style="text-align:center;padding:40px;color:#999">暂无商品</div>'; return; }

        // 搜索栏 + 状态筛选
        var html = '<div style="padding:12px 16px;display:flex;gap:8px;align-items:center">' +
            '<input id="adminSearch" type="text" placeholder="搜索商品名称/分类..." oninput="filterProducts()" style="flex:1;padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:14px">' +
            '<select id="adminStatusFilter" onchange="filterProducts()" style="padding:8px;border:1px solid #ddd;border-radius:6px;font-size:14px">' +
            '<option value="all">全部</option><option value="active">已上架</option><option value="inactive">已下架</option></select></div>';

        html += '<div class="product-list" id="productListItems">';
        data.forEach(function(p) {
            var isActive = p.is_active !== false;
            var priceText = '-';
            if (p.price) { var pp = String(p.price).split('/'); priceText = pp[0] ? (pp[1] ? pp[0] + '/' + pp[1] : pp[0]) : '-'; }
            var firstImg = (Array.isArray(p.images) && p.images.length > 0) ? p.images[0] : (p.image_url || '');
            var coverImg = firstImg ? '<img src="' + firstImg + '" style="width:60px;height:60px;object-fit:cover;border-radius:6px" onerror="this.style.display=\'none\'">' : '<div style="width:60px;height:60px;background:#eee;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:24px">📦</div>';
            var badge = isActive ? '<span style="font-size:11px;padding:2px 6px;background:#4caf50;color:#fff;border-radius:3px">上架</span>' : '<span style="font-size:11px;padding:2px 6px;background:#999;color:#fff;border-radius:3px">下架</span>';
            html += '<div class="product-item" data-name="' + (p.name||'').toLowerCase() + '" data-category="' + (p.category||'').toLowerCase() + '" data-active="' + isActive + '" style="display:flex;align-items:center;padding:12px;border-bottom:1px solid #eee;gap:12px">' +
                coverImg +
                '<div style="flex:1;min-width:0">' +
                '<div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (p.name||'未命名') + ' ' + badge + '</div>' +
                '<div style="color:#888;font-size:13px">' + (p.category||'未分类') + ' | ' + priceText + '</div></div>' +
                '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
                '<button onclick="toggleActive(\'' + p.id + '\',' + isActive + ')" style="padding:6px 10px;border:none;border-radius:6px;background:' + (isActive?'#ff9800':'#4caf50') + ';color:#fff;cursor:pointer;font-size:12px">' + (isActive?'下架':'上架') + '</button>' +
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

// ---- 搜索与筛选 ----
function filterProducts() {
    var keyword = (document.getElementById('adminSearch').value || '').toLowerCase().trim();
    var statusFilter = document.getElementById('adminStatusFilter').value;
    var items = document.querySelectorAll('#productListItems .product-item');
    var visibleCount = 0;
    items.forEach(function(el) {
        var name = el.getAttribute('data-name') || '';
        var cat = el.getAttribute('data-category') || '';
        var isActive = el.getAttribute('data-active') === 'true';
        var matchKw = !keyword || name.indexOf(keyword) >= 0 || cat.indexOf(keyword) >= 0;
        var matchSt = statusFilter === 'all' || (statusFilter === 'active' && isActive) || (statusFilter === 'inactive' && !isActive);
        var show = matchKw && matchSt;
        el.style.display = show ? 'flex' : 'none';
        if (show) visibleCount++;
    });
    var tip = document.getElementById('noResultTip');
    if (visibleCount === 0 && (keyword || statusFilter !== 'all')) {
        if (!tip) { tip = document.createElement('div'); tip.id = 'noResultTip'; tip.style.cssText = 'text-align:center;padding:40px;color:#999'; tip.textContent = '没有匹配的商品'; document.getElementById('productListItems').appendChild(tip); }
        tip.style.display = 'block';
    } else if (tip) { tip.style.display = 'none'; }
}

// ---- 上下架 ----
async function toggleActive(id, currentActive) {
    await waitForSupabase();
    var newActive = !currentActive;
    var action = newActive ? '上架' : '下架';
    if (!confirm('确定' + action + '该商品？')) return;
    try {
        var { error } = await getSupabase().from(TABLE_NAME).update({ is_active: newActive }).eq('id', id);
        if (error) { alert(action + '失败: ' + error.message); return; }
        showToast(action + '成功');
        loadProducts();
    } catch (e) { alert('网络错误: ' + e.message); }
}

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

// ---- COS 签名工具（修复双重HMAC）----
function _cosHmacSha1(key, data) {
    return CryptoJS.enc.Base64.stringify(CryptoJS.HmacSHA1(data, key));
}
function _cosAuth(method, pathname) {
    var now = Math.floor(Date.now() / 1000); var exp = now + 3600; var keyTime = now + ';' + exp;
    var signKey = _cosHmacSha1(COS_SECRET_KEY, keyTime);
    var httpString = method.toLowerCase() + '\n' + pathname + '\n\n';
    var stringToSign = 'sha1\n' + keyTime + '\n' + CryptoJS.SHA1(httpString).toString() + '\n';
    var signature = _cosHmacSha1(signKey, stringToSign);
    return 'q-sign-algorithm=sha1&q-ak=' + COS_SECRET_ID + '&q-sign-time=' + keyTime + '&q-key-time=' + keyTime + '&q-header-list=&q-url-param-list=&q-signature=' + signature;
}

// ---- 上传文件到腾讯云 COS（带进度）----
async function uploadToCOS(file, folder) {
    var ext = file.name.split('.').pop();
    var key = COS_UPLOAD_FOLDER + '/' + folder + '/' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.' + ext;
    var fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
    var host = COS_BUCKET + '.cos.' + COS_REGION + '.myqcloud.com';
    var pathname = '/' + key; var url = 'https://' + host + pathname;
    console.log('开始上传到COS:', key, '文件大小:', fileSizeMB, 'MB');
    showProgress('正在上传 ' + fileSizeMB + 'MB，请稍候...');
    try {
        var authorization = _cosAuth('PUT', pathname);
        return await new Promise(function(resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.upload.addEventListener('progress', function(e) { if (e.lengthComputable) { var percent = Math.round((e.loaded / e.total) * 100); showProgress('上传中 ' + percent + '% (' + fileSizeMB + 'MB)'); } });
            xhr.addEventListener('load', function() { hideProgress(); if (xhr.status >= 200 && xhr.status < 300) { var publicUrl = COS_CDN_URL + '/' + key; console.log('COS上传成功:', publicUrl); resolve(publicUrl); } else { console.error('COS上传失败:', xhr.status, xhr.responseText); reject(new Error('上传失败: ' + xhr.status)); } });
            xhr.addEventListener('error', function() { hideProgress(); reject(new Error('网络错误，上传失败')); });
            xhr.addEventListener('timeout', function() { hideProgress(); reject(new Error('上传超时，请检查网络')); });
            xhr.open('PUT', url); xhr.setRequestHeader('Authorization', authorization); xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream'); xhr.timeout = 120000; xhr.send(file);
        });
    } catch (e) { hideProgress(); console.error('COS upload exception:', e); return null; }
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
        if (newImageFiles.length > 0) { showProgress('上传 ' + newImageFiles.length + ' 张图片...'); for (var i = 0; i < newImageFiles.length; i++) { showProgress('上传图片 ' + (i+1) + '/' + newImageFiles.length + '...'); var uploadedUrl = await uploadToCOS(newImageFiles[i].file, 'images'); if (uploadedUrl) imageUrls.push(uploadedUrl); } hideProgress(); }
        var videoUrl = existingVideoUrl || null;
        if (newVideoFile) { showProgress('上传视频...'); var uploadedVideoUrl = await uploadToCOS(newVideoFile, 'videos'); if (uploadedVideoUrl) videoUrl = uploadedVideoUrl; hideProgress(); }
        var body = { name: name, description: desc, category: category, price: priceStr, code: code || null, specification: specification || null, images: imageUrls.length > 0 ? imageUrls : null, image_url: imageUrls.length > 0 ? imageUrls[0] : null, video_url: videoUrl || null };
        if (!editingId) body.is_active = true;
        console.log('保存数据:', body);
        var error;
        if (editingId) { var result = await getSupabase().from(TABLE_NAME).update(body).eq('id', editingId); error = result.error; }
        else { var result = await getSupabase().from(TABLE_NAME).insert(body); error = result.error; }
        if (error) { alert('保存失败: ' + error.message); return; }
        showToast(editingId ? '修改成功' : '添加成功'); hideForm();
    } catch (e) { hideProgress(); console.error('保存异常:', e); alert('网络错误: ' + e.message); }
    finally { if (btn) { btn.disabled = false; btn.textContent = '保 存'; } }
}

// ---- 编辑商品 ----
async function editProduct(id) {
    await waitForSupabase();
    try {
        var { data, error } = await getSupabase().from(TABLE_NAME).select('*').eq('id', id).single();
        if (error || !data) { alert('未找到该商品'); return; }
        editingId = id;
        document.getElementById('formTitle').textContent = '编辑商品';
        document.getElementById('productName').value = data.name || '';
        document.getElementById('productDesc').value = data.description || '';
        document.getElementById('productCategory').value = data.category || '黑千层';
        document.getElementById('productCode').value = data.code || '';
        document.getElementById('productSpec').value = data.specification || '';
        if (data.price) { var pp = data.price.split('/'); document.getElementById('productPriceNum').value = pp[0] || ''; document.getElementById('productPriceUnit').value = pp[1] || '箱'; }
        else { document.getElementById('productPriceNum').value = ''; document.getElementById('productPriceUnit').value = '箱'; }
        existingImageUrls = []; newImageFiles = [];
        if (Array.isArray(data.images) && data.images.length > 0) existingImageUrls = [...data.images];
        else if (data.image_url) existingImageUrls = [data.image_url];
        existingVideoUrl = data.video_url || null; newVideoFile = null;
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
    await waitForSupabase();
    try { var { error } = await getSupabase().from(TABLE_NAME).delete().eq('id', id); if (error) { alert('删除失败: ' + error.message); return; } showToast('已删除'); loadProducts(); }
    catch (e) { alert('网络错误: ' + e.message); }
}

// ---- 退出登录 ----
function logoutAdmin() { isLoggedIn = false; document.getElementById('loginSection').style.display = 'block'; document.getElementById('adminSection').style.display = 'none'; document.getElementById('passwordInput').value = ''; }

// ========================================
// 媒体迁移到 COS（浏览器内执行）
// ========================================
var SUPABASE_STORAGE_HOST = 'infsqrfqksvqzlapvott.supabase.co';
function _mLog(msg, color) { var el = document.getElementById('migrateLog'); if (!el) return; var span = document.createElement('div'); span.style.color = color || '#0f0'; span.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg; el.appendChild(span); el.scrollTop = el.scrollHeight; }
async function _downloadFile(url) { var res = await fetch(url); if (!res.ok) throw new Error('下载失败 ' + res.status + ': ' + url); return res.blob(); }
function _getExtFromUrl(url) { var m = url.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm|mov)(\?|$)/i); return m ? m[1].toLowerCase() : 'bin'; }
function _getMimeType(ext) { return { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif', webp:'image/webp', mp4:'video/mp4', webm:'video/webm', mov:'video/quicktime' }[ext] || 'application/octet-stream'; }
function _cosKeyFromUrl(oldUrl) { var m = oldUrl.match(/product-media\/(images|videos)\/.+\.([a-zA-Z0-9]+)$/); if (!m) return null; return 'food-showcase/' + m[1] + '/' + Date.now() + '_' + Math.random().toString(36).substring(2, 8) + '.' + m[2]; }

async function _uploadBlob(blob, cosKey) {
    var ext = _getExtFromUrl(cosKey); var mimeType = _getMimeType(ext);
    var fakeFile = new File([blob], cosKey.split('/').pop(), { type: mimeType });
    var host = COS_BUCKET + '.cos.' + COS_REGION + '.myqcloud.com'; var pathname = '/' + cosKey; var url = 'https://' + host + pathname;
    var authorization = _cosAuth('PUT', pathname);
    return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.addEventListener('load', function() { if (xhr.status >= 200 && xhr.status < 300) resolve(COS_CDN_URL + '/' + cosKey); else reject(new Error('COS ' + xhr.status + ': ' + xhr.responseText.substring(0, 100))); });
        xhr.addEventListener('error', function() { reject(new Error('网络错误')); });
        xhr.open('PUT', url); xhr.setRequestHeader('Authorization', authorization); xhr.setRequestHeader('Content-Type', mimeType); xhr.timeout = 120000; xhr.send(fakeFile);
    });
}

async function migrateMedia() {
    if (!isLoggedIn) { alert('请先登录'); return; }
    if (!COS_SECRET_ID || COS_SECRET_ID === '[YOUR_COS_SECRET_ID]') { alert('COS 未配置，请在 CI 中注入 Secrets'); return; }
    var panel = document.getElementById('migratePanel'); var log = document.getElementById('migrateLog');
    panel.style.display = 'block'; log.innerHTML = ''; _mLog('开始迁移...');
    try {
        await waitForSupabase();
        _mLog('获取商品列表...');
        var res = await getSupabase().from(TABLE_NAME).select('id,name,images,video_url');
        if (res.error) throw res.error;
        var products = res.data; _mLog('共 ' + products.length + ' 个商品');
        var tasks = [];
        for (var i = 0; i < products.length; i++) {
            var p = products[i]; var imgUrls = p.images || [];
            for (var j = 0; j < imgUrls.length; j++) { var img = imgUrls[j]; var imgUrl = typeof img === 'string' ? img : (img && img.url); if (imgUrl && imgUrl.includes(SUPABASE_STORAGE_HOST)) tasks.push({ productId: p.id, productName: p.name, oldUrl: imgUrl, type: 'image' }); }
            if (p.video_url && p.video_url.includes(SUPABASE_STORAGE_HOST)) tasks.push({ productId: p.id, productName: p.name, oldUrl: p.video_url, type: 'video' });
        }
        var seen = {}; tasks = tasks.filter(function(t) { if (seen[t.oldUrl]) return false; seen[t.oldUrl] = true; return true; });
        _mLog('待迁移文件: ' + tasks.length + ' 个');
        if (tasks.length === 0) { _mLog('没有需要迁移的文件', '#ff0'); return; }
        var urlMap = {}; var success = 0, failed = 0;
        for (var k = 0; k < tasks.length; k++) {
            var task = tasks[k]; _mLog('[' + (k+1) + '/' + tasks.length + '] ' + task.type + ' ' + task.oldUrl.split('/').pop().substring(0, 30));
            try {
                var cosKey = _cosKeyFromUrl(task.oldUrl); if (!cosKey) { _mLog('  ⚠ 无法解析COS key', '#ff0'); failed++; continue; }
                _mLog('  ↓ 下载中...'); var blob = await _downloadFile(task.oldUrl); _mLog('  ↓ ' + (blob.size/1024/1024).toFixed(1) + 'MB -> 上传COS...');
                var newUrl = await _uploadBlob(blob, cosKey); urlMap[task.oldUrl] = newUrl; _mLog('  ✅ ' + newUrl.split('/').pop().substring(0, 30), '#0f0'); success++;
            } catch (e) { _mLog('  ❌ ' + e.message.substring(0, 80), '#f55'); failed++; }
        }
        _mLog('迁移完成: ' + success + ' 成功, ' + failed + ' 失败', success > 0 ? '#0f0' : '#ff0');
        if (Object.keys(urlMap).length === 0) return;
        _mLog('更新数据库...');
        var productUpdates = {};
        for (var t = 0; t < tasks.length; t++) { var tk = tasks[t]; var newU = urlMap[tk.oldUrl]; if (!newU) continue; if (!productUpdates[tk.productId]) productUpdates[tk.productId] = { id: tk.productId, images: [], video_url: null }; if (tk.type === 'video') productUpdates[tk.productId].video_url = newU; else productUpdates[tk.productId].images.push(newU); }
        var dbOk = 0, dbFail = 0; var productIds = Object.keys(productUpdates);
        for (var pi = 0; pi < productIds.length; pi++) { var upd = productUpdates[productIds[pi]]; var body = {}; if (upd.images.length > 0) { body.images = upd.images; body.image_url = upd.images[0]; } if (upd.video_url) body.video_url = upd.video_url; var r = await getSupabase().from(TABLE_NAME).update(body).eq('id', upd.id); if (r.error) { _mLog('  ⚠ 商品 ' + upd.id + ' 更新失败: ' + r.error.message, '#ff0'); dbFail++; } else { _mLog('  ✅ 商品 ' + upd.id + ' 更新成功', '#0f0'); dbOk++; } }
        _mLog('数据库更新: ' + dbOk + ' 成功, ' + dbFail + ' 失败', '#0f0'); _mLog('=== 全部完成 ===', '#ff0');
    } catch (e) { _mLog('异常: ' + e.message, '#f55'); }
}