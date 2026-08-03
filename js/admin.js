// ========================================

// food-showcase 管理后台逻辑

// 修复：COS签名双重HMAC、增加搜索+上下架

// ========================================




// ---- 北京时间转换 ----
function formatBeijingTime(isoStr) {
    if (!isoStr) return '-';
    var d = new Date(isoStr);
    if (isNaN(d.getTime())) {
        var m = isoStr.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
        return m ? m[1] + ' ' + m[2] : isoStr;
    }
    var bj = new Date(d.getTime() + 8 * 60 * 60 * 1000);
    var y = bj.getUTCFullYear();
    var mo = ('0' + (bj.getUTCMonth() + 1)).slice(-2);
    var day = ('0' + bj.getUTCDate()).slice(-2);
    var h = ('0' + bj.getUTCHours()).slice(-2);
    var mi = ('0' + bj.getUTCMinutes()).slice(-2);
    return y + '-' + mo + '-' + day + ' ' + h + ':' + mi;
}
// Supabase 配置（硬编码，不依赖 admin.html 的 module script）
var SUPABASE_URL = 'https://infsqrfqksvqzlapvott.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_2z92LEUAiZf6smg9aiufFg_p16OStvD';

var ADMIN_PASSWORD = '920615';
var TABLE_NAME = window.TABLE_NAME || 'food_showcase_products';
var BUCKET_NAME = 'product-media';

var COS_SECRET_ID = window.COS_SECRET_ID || '';
var COS_SECRET_KEY = window.COS_SECRET_KEY || '';
var COS_BUCKET = window.COS_BUCKET || 'foodshowcase-1308216845';
var COS_REGION = window.COS_REGION || 'ap-guangzhou';
var COS_CDN_URL = window.COS_CDN_URL || 'https://foodshowcase-1308216845.file.myqcloud.com';
var COS_UPLOAD_FOLDER = window.COS_UPLOAD_FOLDER || 'food-showcase';



let isLoggedIn = false;

let editingId = null;

let existingImageUrls = [];

let newImageFiles = [];

let existingVideoUrl = null;

let newVideoFile = null;

// 批量编辑状态
let batchMode = false;
let selectedIds = [];



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

        var _vtUrl = SUPABASE_URL + '/rest/v1/app_config?key=eq.video_enabled&select=value&limit=1';
        var _vtResp = await fetch(_vtUrl, { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY } });
        var data = null, error = null;
        if (!_vtResp.ok) { error = { message: 'HTTP ' + _vtResp.status }; }
        else { try { var _vtArr = await _vtResp.json(); data = _vtArr.length > 0 ? _vtArr[0] : null; } catch(e) { error = e; } }

        if (error || !data) { btn.textContent = '视频功能: 未配置'; btn.disabled = false; return; }

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

        var _tvBody = JSON.stringify({ value: String(newEnabled) });
        var _tvResp = await fetch(SUPABASE_URL + '/rest/v1/app_config?key=eq.video_enabled', {
            method: 'PATCH',
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
            body: _tvBody
        });
        var error = null;
        if (!_tvResp.ok) { error = { message: 'HTTP ' + _tvResp.status }; }

        if (error) { alert('切换失败: ' + error.message); btn.disabled = false; return; }

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

        // Direct REST API call to bypass PostgREST schema cache issue
        var _sbUrl = SUPABASE_URL + '/rest/v1/' + TABLE_NAME + '?select=*&order=created_at.desc';
        var _resp = await fetch(_sbUrl, {
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY }
        });
        var data = null, error = null;
        if (!_resp.ok) { error = { message: 'HTTP ' + _resp.status }; }
        else { try { data = await _resp.json(); } catch(e) { error = e; } }

        if (error) { container.innerHTML = '<div style="color:red;padding:20px">加载失败: ' + error.message + '</div>'; return; }

        if (!data || data.length === 0) { container.innerHTML = '<div style="text-align:center;padding:40px;color:#999">暂无商品</div>'; return; }



        // 搜索栏 + 状态筛选

        var html = '<div style="padding:12px 16px;display:flex;gap:8px;align-items:center">' +

            '<input id="adminSearch" type="text" placeholder="搜索商品名称/分类..." oninput="filterProducts()" style="flex:1;padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:14px">' +

            '<select id="adminStatusFilter" onchange="filterProducts()" style="padding:8px;border:1px solid #ddd;border-radius:6px;font-size:14px">' +

            '<option value="all">全部</option><option value="active">已上架</option><option value="inactive">已下架</option></select></div>';



        html += '<div class="product-list" id="productListItems">';

        data.forEach(function(p) {

            // 使用 is_active 列
            var isActive = p.is_active !== false;

            // 价格显示
            var priceText = '-';
            if (p.price) { 
                var pStr = String(p.price);
                if (pStr.indexOf('/') >= 0) {
                    priceText = '¥' + pStr;
                } else {
                    priceText = '¥' + pStr + (p.unit ? '/' + p.unit : ''); 
                }
            }

            // 图片：优先用 images[0]，其次 image_url，最后 cover_image
            var firstImg = (Array.isArray(p.images) && p.images.length > 0) ? p.images[0] : (p.image_url || p.cover_image || '');

            var coverImg = firstImg ? '<img src="' + firstImg + '" style="width:60px;height:60px;object-fit:cover;border-radius:6px" onerror="this.style.display=\'none\'">' : '<div style="width:60px;height:60px;background:#eee;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:24px">📦</div>';

            var badge = isActive ? '<span style="font-size:11px;padding:2px 6px;background:#4caf50;color:#fff;border-radius:3px">上架</span>' : '<span style="font-size:11px;padding:2px 6px;background:#999;color:#fff;border-radius:3px">下架</span>';

            var isSelected = batchMode && selectedIds.indexOf(p.id) > -1;
            var itemStyle = 'display:flex;align-items:center;padding:12px;border-bottom:1px solid #eee;gap:12px';
            if (batchMode) itemStyle += ';cursor:pointer';
            html += '<div class="product-item' + (isSelected ? ' batch-selected' : '') + '" data-id="' + p.id + '" data-name="' + (p.name||'').toLowerCase() + '" data-category="' + (p.category||'').toLowerCase() + '" data-active="' + isActive + '" id="productItem_' + p.id + '" style="' + itemStyle + '"' + (batchMode ? ' onclick="toggleSelect(\'' + p.id + '\')"' : '') + '>' +

                (batchMode ? '<input type="checkbox" id="batchCb_' + p.id + '" style="width:18px;height:18px;flex-shrink:0;accent-color:#ff9800;pointer-events:none"' + (isSelected ? ' checked' : '') + '>' : '') +

                coverImg +

                '<div style="flex:1;min-width:0">' +

                '<div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (p.name||'未命名') + ' ' + badge + '</div>' +

                '<div style="color:#888;font-size:13px">' + (p.category||'未分类') + ' | ' + priceText + '</div></div>' +

                (batchMode ? '' : '<div style="display:flex;gap:6px;flex-wrap:wrap">' +


                '<button onclick="event.stopPropagation();editProduct(\'' + p.id + '\')" style="padding:6px 10px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;font-size:12px">编辑</button>' +

                '<button onclick="event.stopPropagation();deleteProduct(\'' + p.id + '\')" style="padding:6px 10px;border:none;border-radius:6px;background:#ff4444;color:#fff;cursor:pointer;font-size:12px">删除</button>' +

                '</div>') + '</div>';

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



// ---- 批量编辑 ----
function toggleBatchMode() {
    batchMode = !batchMode;
    selectedIds = [];
    var btn = document.getElementById('batchToggleBtn');
    if (btn) {
        btn.textContent = batchMode ? '退出批量' : '✎ 批量操作';
        btn.style.background = batchMode ? '#ff9800' : '#fff';
        btn.style.color = batchMode ? '#fff' : '#ff9800';
    }
    var bar = document.getElementById('batchBar');
    if (bar) bar.style.display = batchMode ? 'block' : 'none';
    // 重新渲染列表（带 checkbox）
    loadProducts();
}

function toggleSelect(id) {
    var idx = selectedIds.indexOf(id);
    if (idx > -1) {
        selectedIds.splice(idx, 1);
    } else {
        selectedIds.push(id);
    }
    updateBatchUI();
    // 更新该商品的 checkbox 视觉
    var cb = document.getElementById('batchCb_' + id);
    if (cb) cb.checked = (selectedIds.indexOf(id) > -1);
    var item = document.getElementById('productItem_' + id);
    if (item) {
        if (selectedIds.indexOf(id) > -1) {
            item.classList.add('batch-selected');
        } else {
            item.classList.remove('batch-selected');
        }
    }
}

function selectAll() {
    var items = document.querySelectorAll('#productListItems .product-item');
    selectedIds = [];
    items.forEach(function(el) {
        var id = el.getAttribute('data-id');
        if (id && el.style.display !== 'none') {
            selectedIds.push(id);
        }
    });
    updateBatchUI();
    // 更新所有 checkbox
    items.forEach(function(el) {
        var id = el.getAttribute('data-id');
        if (id) {
            var cb = document.getElementById('batchCb_' + id);
            if (cb) cb.checked = true;
            if (el.style.display !== 'none') el.classList.add('batch-selected');
        }
    });
}

function deselectAll() {
    selectedIds = [];
    updateBatchUI();
    var items = document.querySelectorAll('#productListItems .product-item');
    items.forEach(function(el) {
        var id = el.getAttribute('data-id');
        if (id) {
            var cb = document.getElementById('batchCb_' + id);
            if (cb) cb.checked = false;
        }
        el.classList.remove('batch-selected');
    });
}

function updateBatchUI() {
    var countEl = document.getElementById('batchCount');
    if (countEl) countEl.textContent = selectedIds.length;
}

async function doBatchApply() {
    if (selectedIds.length === 0) {
        alert('请先选择商品');
        return;
    }
    var category = document.getElementById('batchCategory').value;
    var price = document.getElementById('batchPrice').value.trim();
    var unit = document.getElementById('batchUnit').value;
    if (!category && !price && !unit) {
        alert('请至少选择一项要修改的内容');
        return;
    }
    var data = {};
    var actions = [];
    if (category) { data.category = category; actions.push('分类 → ' + category); }
    if (price) { 
        if (unit) { data.price = price + '/' + unit; }
        else { data.price = price; }
        actions.push('价格 → ¥' + price); 
    }
    if (unit) { data.unit = unit; actions.push('单位 → ' + unit); }
    if (!confirm('将修改 ' + selectedIds.length + ' 个商品：\n' + actions.join('，') + '\n\n确定执行？')) return;

    var ok = 0, fail = 0;
    for (var i = 0; i < selectedIds.length; i++) {
        try {
            var _bUrl = SUPABASE_URL + '/rest/v1/' + TABLE_NAME + '?id=eq.' + selectedIds[i];
            var _bResp = await fetch(_bUrl, {
                method: 'PATCH',
                headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (_bResp.ok) { ok++; } else { fail++; }
        } catch (e) { fail++; }
    }
    showToast('成功 ' + ok + ' 个' + (fail > 0 ? '，失败 ' + fail + ' 个' : ''));
    // 退出批量模式
    batchMode = false;
    selectedIds = [];
    var btn = document.getElementById('batchToggleBtn');
    if (btn) { btn.textContent = '✎ 批量操作'; btn.style.background = '#fff'; btn.style.color = '#ff9800'; }
    var bar = document.getElementById('batchBar');
    if (bar) bar.style.display = 'none';
    loadProducts();
}

// ---- 上下架 ----

// is_active 列不存在，上下架功能已移除
// ---- 显示/隐藏表单 ----

function showAddForm() {

    editingId = null; existingImageUrls = []; newImageFiles = []; existingVideoUrl = null; newVideoFile = null;

    document.getElementById('formTitle').textContent = '添加商品';

    document.getElementById('productName').value = '';

    document.getElementById('productDesc').value = '';

    document.getElementById('productCategory').value = '黑千层';

    document.getElementById('productPriceNum').value = '';

    document.getElementById('productPriceUnit').value = '箱';

    var specEl = document.getElementById('productSpec');
    if (specEl) specEl.value = '';
    var codeEl = document.getElementById('productCode');
    if (codeEl) codeEl.value = '';

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



// ---- 腾讯云 COS v1 签名辅助函数 ----

// 正确实现：严格按腾讯云 COS v1 文档

function _cosAuth(method, pathname) {

    var now = Math.floor(Date.now() / 1000);

    var exp = now + 3600;

    var keyTime = now + ';' + exp;

    var host = (COS_BUCKET + '.cos.' + COS_REGION + '.myqcloud.com').toLowerCase();



    // Step1: SignKey = HMAC-SHA1(SecretKey, KeyTime) -> hex 字符串

    // CryptoJS.HmacSHA1(data, key) 参数顺序是 (data, key)

    var signKeyHex = CryptoJS.enc.Hex.stringify(CryptoJS.HmacSHA1(keyTime, COS_SECRET_KEY));



    // Step2: HttpString = HttpMethod\nHttpURI\nHttpParameters\nHttpHeaders\n

    // HttpHeaders 格式: key=value\n （原始字符串，不是哈希！）

    var httpString = method.toLowerCase() + '\n' + pathname + '\n\n' + 'host=' + host + '\n';

    var httpStringHash = CryptoJS.enc.Hex.stringify(CryptoJS.SHA1(httpString));



    // Step3: StringToSign = sha1\nKeyTime\nSHA1(HttpString)\n

    var stringToSign = 'sha1\n' + keyTime + '\n' + httpStringHash + '\n';



    // Step4: Signature = HMAC-SHA1(SignKey<bytes>, StringToSign) -> hex

    // signKeyHex 是 hex 字符串，按官方文档以【字符串形式】当 HMAC key（UTF-8 编码，40字节）

    // 官方 Node.js SDK: crypto.createHmac('sha1', signKey).update(stringToSign).digest('hex')

    // 其中 signKey 是 40 字符的 hex 字符串，Node.js 以 UTF-8 字节传入 HMAC

    var signKeyWA = CryptoJS.enc.Utf8.parse(signKeyHex);

    var signature = CryptoJS.enc.Hex.stringify(CryptoJS.HmacSHA1(stringToSign, signKeyWA));



    // Step5: 组装 Authorization

    return 'q-sign-algorithm=sha1' +

        '&q-ak=' + COS_SECRET_ID +

        '&q-sign-time=' + keyTime +

        '&q-key-time=' + keyTime +

        '&q-header-list=host' +

        '&q-url-param-list=' +

        '&q-signature=' + signature;

}



// ---- 上传文件到腾讯云 COS（带进度）----

async function uploadToCOS(file, folder) {

    var ext = (file.name.split('.').pop() || '').toLowerCase();

    var mimeMap = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };

    var contentType = mimeMap[ext] || file.type || 'application/octet-stream';

    var key = COS_UPLOAD_FOLDER + '/' + folder + '/' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.' + ext;

    var fileSizeMB = (file.size / 1024 / 1024).toFixed(2);

    var host = COS_BUCKET + '.cos.' + COS_REGION + '.myqcloud.com';

    var pathname = '/' + key; var url = 'https://' + host + pathname;

    console.log('开始上传到COS:', key, '文件大小:', fileSizeMB, 'MB');

    showProgress('正在上传 ' + fileSizeMB + 'MB，请稍候...');

    try {

        var authorization = _cosAuth('PUT', pathname);

        console.log('COS upload - URL:', url);

        console.log('COS upload - Authorization:', authorization.substring(0, 80) + '...');

        return await new Promise(function(resolve, reject) {

            var xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', function(e) { if (e.lengthComputable) { var percent = Math.round((e.loaded / e.total) * 100); showProgress('上传中 ' + percent + '% (' + fileSizeMB + 'MB)'); } });

            xhr.addEventListener('load', function() { hideProgress(); if (xhr.status >= 200 && xhr.status < 300) { var publicUrl = COS_CDN_URL + '/' + key; console.log('COS上传成功:', publicUrl); resolve(publicUrl); } else { console.error('COS上传失败:', xhr.status, xhr.responseText); reject(new Error('上传失败: ' + xhr.status)); } });

            xhr.addEventListener('error', function() { hideProgress(); reject(new Error('网络错误，上传失败')); });

            xhr.addEventListener('timeout', function() { hideProgress(); reject(new Error('上传超时，请检查网络')); });

            xhr.open('PUT', url); xhr.setRequestHeader('Authorization', authorization); xhr.setRequestHeader('Host', host); xhr.setRequestHeader('Content-Type', contentType); xhr.timeout = 120000; xhr.send(file);

        });

    } catch (e) { hideProgress(); console.error('COS upload exception:', e); return null; }

}



// ---- 保存商品 ----

async function saveProduct() {

    var name = document.getElementById('productName').value.trim();

    if (!name) { alert('请输入商品名称'); return; }

    var desc = document.getElementById('productDesc').value.trim();

    var tag = document.getElementById('productCategory').value || '黑千层';

    var priceNum = document.getElementById('productPriceNum').value.trim();

    var unit = document.getElementById('productPriceUnit').value || '箱';

    var spec = (document.getElementById('productSpec') ? document.getElementById('productSpec').value : '').trim();
    var code = (document.getElementById('productCode') ? document.getElementById('productCode').value : '').trim();

    // food_showcase_products 价格存为 "26.5/斤" 格式
    var priceVal = priceNum ? (priceNum + '/' + unit) : null;

    var btn = document.querySelector('.btn-save');

    if (btn) { btn.disabled = true; btn.textContent = '保存中...'; }

    try {

        var imageUrls = [...existingImageUrls];

        if (newImageFiles.length > 0) { showProgress('上传 ' + newImageFiles.length + ' 张图片到云存储...'); for (var i = 0; i < newImageFiles.length; i++) { try { showProgress('上传图片 ' + (i+1) + '/' + newImageFiles.length + '...'); var uploadedUrl = await uploadImageToSupabase(newImageFiles[i].file); if (uploadedUrl) imageUrls.push(uploadedUrl); } catch(e) { console.error('图片上传失败:', e); showToast('第' + (i+1) + '张图片上传失败'); } } hideProgress(); }

        // 保留原有视频URL，只有上传新视频或��确删除时才覆盖

        var videoUrl = existingVideoUrl;

        if (newVideoFile) { try { var uploadedVideoUrl = await uploadVideoToSupabase(newVideoFile); if (uploadedVideoUrl) videoUrl = uploadedVideoUrl; } catch(e) { console.error('视频上传失败:', e); showToast('视频上传失败'); } }

        var body = { name: name, description: desc, category: tag, price: priceVal,
            unit: unit || null, specification: spec || null, code: code || null,
            images: imageUrls.length > 0 ? imageUrls : null, image_url: imageUrls.length > 0 ? imageUrls[0] : null, video: videoUrl };

        console.log('保存数据:', body);

        var error;

        if (editingId) {
            var _spUrl2 = SUPABASE_URL + '/rest/v1/' + TABLE_NAME + '?id=eq.' + editingId;
            var _spResp2 = await fetch(_spUrl2, {
                method: 'PATCH',
                headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            var result = { error: !_spResp2.ok ? { message: 'HTTP ' + _spResp2.status } : null };
            error = result.error;
        }

        else {
            var _siResp = await fetch(SUPABASE_URL + '/rest/v1/' + TABLE_NAME, {
                method: 'POST',
                headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            var result = { error: !_siResp.ok ? { message: 'HTTP ' + _siResp.status } : null };
            error = result.error;
        }

        if (error) { alert('保存失败: ' + error.message); return; }

        showToast(editingId ? '修改成功' : '添加成功'); hideForm();

    } catch (e) { hideProgress(); console.error('保存异常:', e); alert('网络错误: ' + e.message); }

    finally { if (btn) { btn.disabled = false; btn.textContent = '保 存'; } }

}



// ---- 编辑商品 ----

async function editProduct(id) {

    await waitForSupabase();

    try {

        var _epUrl = SUPABASE_URL + '/rest/v1/' + TABLE_NAME + '?id=eq.' + id + '&select=*&limit=1';
        var _epResp = await fetch(_epUrl, { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY } });
        var data = null, error = null;
        if (!_epResp.ok) { error = { message: 'HTTP ' + _epResp.status }; }
        else { try { var _epArr = await _epResp.json(); data = _epArr.length > 0 ? _epArr[0] : null; } catch(e) { error = e; } }

        if (error || !data) { alert('未找到该商品'); return; }

        editingId = id;

        document.getElementById('formTitle').textContent = '编辑商品';

        document.getElementById('productName').value = data.name || '';

        document.getElementById('productDesc').value = data.description || '';

        document.getElementById('productCategory').value = data.category || '黑千层';

        // 解析价格 "26.5/斤" → priceNum=26.5, unit=斤
        if (data.price) {
            var pStr = String(data.price);
            var slashIdx = pStr.indexOf('/');
            if (slashIdx >= 0) {
                document.getElementById('productPriceNum').value = pStr.substring(0, slashIdx);
                var priceUnit = pStr.substring(slashIdx + 1);
                document.getElementById('productPriceUnit').value = priceUnit || (data.unit || '箱');
            } else {
                document.getElementById('productPriceNum').value = pStr;
                document.getElementById('productPriceUnit').value = data.unit || '箱';
            }
        }

        else { document.getElementById('productPriceNum').value = ''; document.getElementById('productPriceUnit').value = '箱'; }

        // 规格和编码
        var specEl = document.getElementById('productSpec');
        if (specEl) specEl.value = data.specification || '';
        var codeEl = document.getElementById('productCode');
        if (codeEl) codeEl.value = data.code || '';

        existingImageUrls = []; newImageFiles = [];

        if (Array.isArray(data.images) && data.images.length > 0) existingImageUrls = [...data.images];

        else if (data.image_url) existingImageUrls = [data.image_url];

        // 正确读取视频URL：空字符串视为无视频，保留有效URL

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

    await waitForSupabase();

    try {
            var _dpResp = await fetch(SUPABASE_URL + '/rest/v1/' + TABLE_NAME + '?id=eq.' + id, {
                method: 'DELETE',
                headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY }
            });
            var error = !_dpResp.ok ? { message: 'HTTP ' + _dpResp.status } : null;
            if (error) { alert('删除失败: ' + error.message); return; } showToast('已删除'); loadProducts(); }

    catch (e) { alert('网络错误: ' + e.message); }

}



// ---- 退出登录 ----

function logoutAdmin() { isLoggedIn = false; document.getElementById('loginSection').style.display = 'block'; document.getElementById('adminSection').style.display = 'none'; document.getElementById('passwordInput').value = ''; }











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
    await waitForSupabase();
    var container = document.getElementById('visitorList');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#999">加载中...</div>';
    try {
        var _vlUrl = SUPABASE_URL + '/rest/v1/visitor_logs?select=*&order=created_at.desc';
        var _vlResp = await fetch(_vlUrl, { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY } });
        var data = null, error = null;
        if (!_vlResp.ok) { error = { message: 'HTTP ' + _vlResp.status }; }
        else { try { data = await _vlResp.json(); } catch(e) { error = e; } }
        if (error) { container.innerHTML = '<div style="color:red;padding:20px">加载失败: ' + error.message + '</div>'; return; }
        allVisitorLogs = data || [];
        renderVisitorList(allVisitorLogs);
    } catch (e) {
        container.innerHTML = '<div style="color:red;padding:20px">网络错误: ' + e.message + '</div>';
    }
}

function renderVisitorList(list) {
    var container = document.getElementById('visitorList');
    if (!list || list.length === 0) { container.innerHTML = '<div style="text-align:center;padding:40px;color:#999">暂无访客记录</div>'; return; }
    var html = '<div style="padding:8px 16px;color:#888;font-size:13px">共 ' + list.length + ' 条记录</div>';
    list.forEach(function(v) {
        var name = v.name || '-';
        var phone = v.phone || '-';
        var visitTime = formatBeijingTime(v.visit_time);
        var created = formatBeijingTime(v.created_at);
        var page = v.page || '-';
        html += '<div class="visitor-item" data-name="' + name.toLowerCase() + '" data-phone="' + phone + '" style="display:flex;align-items:center;padding:12px 16px;border-bottom:1px solid #eee;gap:12px">' +
            '<div style="width:40px;height:40px;border-radius:50%;background:#e3f2fd;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">👤</div>' +
            '<div style="flex:1;min-width:0">' +
            '<div style="font-weight:600;font-size:14px">' + name + '</div>' +
            '<div style="color:#888;font-size:12px;margin-top:2px">' + phone + '</div></div>' +
            '<div style="text-align:right;flex-shrink:0">' +
            '<div style="font-size:12px;color:#666">' + visitTime + '</div>' +
            '<div style="font-size:11px;color:#aaa;margin-top:2px">' + page + '</div></div></div>';
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