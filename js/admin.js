// ========================================
// food-showcase 管理后台逻辑
// ========================================

function getSupabase() { return window.supabase; }
var ADMIN_PASSWORD = window.ADMIN_PASSWORD || '920615';
var TABLE_NAME = window.TABLE_NAME || 'food_showcase_products';
var BUCKET_NAME = window.BUCKET_NAME || 'product-media';

let isLoggedIn = false;
let editingId = null;
let currentImageUrl = null;
let currentVideoUrl = null;

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
    if (pwInput) {
        pwInput.addEventListener('keyup', function(e) {
            if (e.key === 'Enter') checkPassword();
        });
    }
});

// ---- Toast ----
function showToast(msg) {
    var t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 24px;border-radius:8px;z-index:9999;transition:opacity .3s'; document.body.appendChild(t); }
    t.textContent = msg;
    t.style.opacity = '1';
    setTimeout(function() { t.style.opacity = '0'; }, 2000);
}

// ---- 加载商品列表 ----
async function loadProducts() {
    var container = document.getElementById('productList');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#999">加载中...</div>';
    try {
        var { data, error } = await getSupabase().from(TABLE_NAME).select('*').order('created_at', { ascending: false });
        if (error) { container.innerHTML = '<div style="color:red;padding:20px">加载失败: ' + error.message + '</div>'; return; }
        if (!data || data.length === 0) { container.innerHTML = '<div style="text-align:center;padding:40px;color:#999">暂无商品</div>'; return; }
        var html = '<div class="product-list">';
        data.forEach(function(p) {
            var priceText = '-';
            if (p.price) {
                var pp = String(p.price).split('/');
                priceText = pp[0] ? (pp[1] ? pp[0] + '/元' + pp[1] : pp[0]) : '-';
            }
            var coverImg = p.image_url ? '<img src="' + p.image_url + '" style="width:60px;height:60px;object-fit:cover;border-radius:6px" onerror="this.style.display=\'none\'">' : '<div style="width:60px;height:60px;background:#eee;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:24px">📦</div>';
            html += '<div class="product-item" style="display:flex;align-items:center;padding:12px;border-bottom:1px solid #eee;gap:12px">' +
                coverImg +
                '<div style="flex:1;min-width:0">' +
                '<div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (p.name || '未命名') + '</div>' +
                '<div style="color:#888;font-size:13px">' + (p.category || '未分类') + ' | ' + priceText + '</div>' +
                '</div>' +
                '<div style="display:flex;gap:8px">' +
                '<button onclick="editProduct(\'' + p.id + '\')" style="padding:6px 12px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;font-size:13px">编辑</button>' +
                '<button onclick="deleteProduct(\'' + p.id + '\')" style="padding:6px 12px;border:none;border-radius:6px;background:#ff4444;color:#fff;cursor:pointer;font-size:13px">删除</button>' +
                '</div></div>';
        });
        html += '</div>';
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<div style="color:red;padding:20px">网络错误: ' + e.message + '</div>';
    }
}

// ---- 显示/隐藏表单 ----
function showAddForm() {
    editingId = null;
    currentImageUrl = null;
    currentVideoUrl = null;
    document.getElementById('formTitle').textContent = '添加商品';
    document.getElementById('productName').value = '';
    document.getElementById('productDesc').value = '';
    document.getElementById('productCategory').value = '毛肚叶片';
    document.getElementById('productPrice').value = '';
    document.getElementById('productPriceUnit').value = '箱';
    document.getElementById('productCode').value = '';
    document.getElementById('imagePreview').innerHTML = '';
    document.getElementById('videoPreview').innerHTML = '';
    document.getElementById('productForm').style.display = 'block';
    document.getElementById('productList').style.display = 'none';
}

function hideForm() {
    document.getElementById('productForm').style.display = 'none';
    document.getElementById('productList').style.display = 'block';
    loadProducts();
}

// ---- 图片上传 ----
function handleImageUpload(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        currentImageUrl = e.target.result;
        document.getElementById('imagePreview').innerHTML = '<img src="' + e.target.result + '" style="max-width:200px;max-height:200px;border-radius:8px">';
    };
    reader.readAsDataURL(file);
}

// ---- 视频上传 ----
function handleVideoUpload(event) {
    var file = event.target.files[0];
    if (!file) return;
    var url = URL.createObjectURL(file);
    currentVideoUrl = file;
    document.getElementById('videoPreview').innerHTML = '<video src="' + url + '" style="max-width:200px;max-height:150px;border-radius:8px" controls></video>';
}

// ---- 上传文件到 Supabase Storage ----
async function uploadToStorage(file, folder) {
    var ext = file.name.split('.').pop();
    var path = folder + '/' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.' + ext;
    try {
        var { data, error } = await getSupabase().storage.from(BUCKET_NAME).upload(path, file, { cacheControl: '3600', upsert: false });
        if (error) { console.error('Storage upload error:', error); return null; }
        var { data: publicUrl } = getSupabase().storage.from(BUCKET_NAME).getPublicUrl(path);
        return publicUrl;
    } catch (e) {
        console.error('Storage upload exception:', e);
        return null;
    }
}

// ---- 保存商品 ----
async function saveProduct() {
    var name = document.getElementById('productName').value.trim();
    if (!name) { alert('请输入商品名称'); return; }

    var desc = document.getElementById('productDesc').value.trim();
    var category = document.getElementById('productCategory').value || '毛肚叶片';
    var price = document.getElementById('productPrice').value.trim();
    var unit = document.getElementById('productPriceUnit').value || '箱';
    var code = document.getElementById('productCode').value.trim();
    var priceStr = price ? price + '/元' + unit : '';

    var btn = document.querySelector('#saveBtn');
    if (btn) { btn.disabled = true; btn.textContent = '保存中...'; }

    try {
        var imageUrl = currentImageUrl;
        var videoUrl = '';

        // Upload image if it's a file (base64 data URL means local file)
        if (currentImageUrl && currentImageUrl.startsWith('data:')) {
            var imgBlob = await fetch(currentImageUrl).then(function(r) { return r.blob(); });
            var blobFile = new File([imgBlob], 'image.jpg', { type: 'image/jpeg' });
            var uploaded = await uploadToStorage(blobFile, 'images');
            if (uploaded) imageUrl = uploaded;
        }

        // Upload video if selected
        if (currentVideoUrl instanceof File) {
            var uploadedVideo = await uploadToStorage(currentVideoUrl, 'videos');
            if (uploadedVideo) videoUrl = uploadedVideo;
        }

        var body = {
            name: name,
            description: desc,
            category: category,
            price: priceStr,
            code: code || null,
            image_url: imageUrl || null,
            video_url: videoUrl || null
        };

        var error;
        if (editingId) {
            var result = await getSupabase().from(TABLE_NAME).update(body).eq('id', editingId);
            error = result.error;
        } else {
            var result = await getSupabase().from(TABLE_NAME).insert(body);
            error = result.error;
        }

        if (error) { alert('保存失败: ' + error.message); return; }
        showToast(editingId ? '修改成功' : '添加成功');
        hideForm();
    } catch (e) {
        alert('网络错误: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '保存'; }
    }
}

// ---- 编辑商品 ----
async function editProduct(id) {
    try {
        var { data, error } = await getSupabase().from(TABLE_NAME).select('*').eq('id', id).single();
        if (!data) { alert('未找到该商品'); return; }
        editingId = id;
        document.getElementById('formTitle').textContent = '编辑商品';
        document.getElementById('productName').value = data.name || '';
        document.getElementById('productDesc').value = data.description || '';
        document.getElementById('productCategory').value = data.category || '毛肚叶片';
        document.getElementById('productCode').value = data.code || '';

        if (data.price) {
            var pp = data.price.split('/元');
            document.getElementById('productPrice').value = pp[0] || '';
            document.getElementById('productPriceUnit').value = pp[1] || '箱';
        } else {
            document.getElementById('productPrice').value = '';
            document.getElementById('productPriceUnit').value = '箱';
        }

        currentImageUrl = data.image_url || null;
        currentVideoUrl = data.video_url || null;

        document.getElementById('imagePreview').innerHTML = data.image_url ? '<img src="' + data.image_url + '" style="max-width:200px;max-height:200px;border-radius:8px">' : '';
        document.getElementById('videoPreview').innerHTML = data.video_url ? '<video src="' + data.video_url + '" style="max-width:200px;max-height:150px;border-radius:8px" controls></video>' : '';

        document.getElementById('productForm').style.display = 'block';
        document.getElementById('productList').style.display = 'none';
    } catch (e) {
        alert('加载失败: ' + e.message);
    }
}

// ---- 删除商品 ----
async function deleteProduct(id) {
    if (!confirm('确定删除该商品？')) return;
    try {
        var { error } = await getSupabase().from(TABLE_NAME).delete().eq('id', id);
        if (error) { alert('删除失败: ' + error.message); return; }
        showToast('已删除');
        loadProducts();
    } catch (e) {
        alert('网络错误: ' + e.message);
    }
}

// ---- 退出登录 ----
function logoutAdmin() {
    isLoggedIn = false;
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('adminSection').style.display = 'none';
    document.getElementById('passwordInput').value = '';
}
