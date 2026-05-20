// ========================================
// food-showcase 管理后台逻辑
// 支持多图上传 + 上传进度
// ========================================

function getSupabase() { return window.supabase; }
var ADMIN_PASSWORD = window.ADMIN_PASSWORD || '920615';
var TABLE_NAME = window.TABLE_NAME || 'food_showcase_products';
var BUCKET_NAME = window.BUCKET_NAME || 'product-media';

let isLoggedIn = false;
let editingId = null;
let currentImages = [];
let currentVideoFile = null;

// ---- 等待 Supabase 初始化 ----
function waitForSupabase() {
    return new Promise((resolve) => {
        if (window.supabase) {
            resolve();
        } else {
            const check = setInterval(() => {
                if (window.supabase) {
                    clearInterval(check);
                    resolve();
                }
            }, 50);
            setTimeout(() => {
                clearInterval(check);
                console.error('Supabase 初始化超时');
            }, 5000);
        }
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
    if (pwInput) {
        pwInput.addEventListener('keyup', function(e) {
            if (e.key === 'Enter') checkPassword();
        });
    }
    
    var imageFile = document.getElementById('imageFile');
    if (imageFile) imageFile.addEventListener('change', handleImageUpload);
    var videoFile = document.getElementById('videoFile');
    if (videoFile) videoFile.addEventListener('change', handleVideoUpload);
});

// ---- Toast ----
function showToast(msg, duration) {
    duration = duration || 2000;
    var t = document.getElementById('toast');
    if (!t) { 
        t = document.createElement('div'); 
        t.id = 'toast'; 
        t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 24px;border-radius:8px;z-index:9999;transition:opacity .3s;max-width:80%;word-break:break-all'; 
        document.body.appendChild(t); 
    }
    t.textContent = msg;
    t.style.opacity = '1';
    setTimeout(function() { t.style.opacity = '0'; }, duration);
}

// ---- 显示上传进度 ----
function showProgress(msg) {
    var t = document.getElementById('progressToast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'progressToast';
        t.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:#2196F3;color:#fff;padding:12px 24px;border-radius:8px;z-index:9998;max-width:80%;word-break:break-all';
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.display = 'block';
}

function hideProgress() {
    var t = document.getElementById('progressToast');
    if (t) t.style.display = 'none';
}

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
        var html = '<div class="product-list">';
        data.forEach(function(p) {
            var priceText = '-';
            if (p.price) {
                var pp = String(p.price).split('/');
                priceText = pp[0] ? (pp[1] ? pp[0] + '/' + pp[1] : pp[0]) : '-';
            }
            var firstImg = '';
            if (Array.isArray(p.images) && p.images.length > 0) {
                firstImg = p.images[0];
            } else if (p.image_url) {
                firstImg = p.image_url;
            }
            var coverImg = firstImg ? '<img src="' + firstImg + '" style="width:60px;height:60px;object-fit:cover;border-radius:6px" onerror="this.style.display=\'none\'">' : '<div style="width:60px;height:60px;background:#eee;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:24px">📦</div>';
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
    currentImages = [];
    currentVideoFile = null;
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

function hideForm() {
    document.getElementById('productForm').style.display = 'none';
    document.getElementById('productList').style.display = 'block';
    loadProducts();
}

// ---- 多图上传 ----
function handleImageUpload(event) {
    var files = event.target.files;
    if (!files || files.length === 0) return;
    
    currentImages = [];
    var previewHtml = '';
    var loadedCount = 0;
    
    for (var i = 0; i < files.length; i++) {
        (function(file, index) {
            var reader = new FileReader();
            reader.onload = function(e) {
                currentImages.push({
                    file: file,
                    dataUrl: e.target.result
                });
                
                previewHtml += '<div style="position:relative;display:inline-block;margin:4px">' +
                    '<img src="' + e.target.result + '" style="width:80px;height:80px;object-fit:cover;border-radius:6px">' +
                    '<button onclick="removeImage(' + index + ')" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#ff4444;color:#fff;border:none;font-size:12px;cursor:pointer">×</button>' +
                    '</div>';
                
                loadedCount++;
                if (loadedCount === files.length) {
                    document.getElementById('imagePreview').innerHTML = previewHtml;
                    document.getElementById('imageUploadText').textContent = '✅ 已选择 ' + files.length + ' 张图片';
                }
            };
            reader.readAsDataURL(file);
        })(files[i], i);
    }
}

function removeImage(index) {
    currentImages.splice(index, 1);
    var html = '';
    currentImages.forEach(function(img, i) {
        html += '<div style="position:relative;display:inline-block;margin:4px">' +
            '<img src="' + img.dataUrl + '" style="width:80px;height:80px;object-fit:cover;border-radius:6px">' +
            '<button onclick="removeImage(' + i + ')" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#ff4444;color:#fff;border:none;font-size:12px;cursor:pointer">×</button>' +
            '</div>';
    });
    document.getElementById('imagePreview').innerHTML = html;
    document.getElementById('imageUploadText').textContent = currentImages.length > 0 ? '✅ 已选择 ' + currentImages.length + ' 张图片' : '📷 点击上传图片（可多选）';
}

// ---- 视频上传 ----
function handleVideoUpload(event) {
    var file = event.target.files[0];
    if (!file) return;
    
    currentVideoFile = file;
    var url = URL.createObjectURL(file);
    
    console.log('视频文件:', file.name, '大小:', (file.size / 1024 / 1024).toFixed(2), 'MB', '类型:', file.type);
    
    document.getElementById('videoPreview').innerHTML = '<video src="' + url + '" style="width:100%;max-width:300px;height:auto;max-height:200px;border-radius:8px;background:#000" controls playsinline></video>';
    document.getElementById('videoUploadText').textContent = '✅ 已选择视频: ' + (file.size / 1024 / 1024).toFixed(1) + 'MB';
}

// ---- 上传文件到 Supabase Storage（带进度）----
async function uploadToStorage(file, folder) {
    var ext = file.name.split('.').pop();
    var path = folder + '/' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.' + ext;
    var fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
    
    console.log('开始上传:', path, '文件大小:', fileSizeMB, 'MB');
    showProgress('正在上传 ' + fileSizeMB + 'MB，请稍候...');
    
    try {
        // 使用 XMLHttpRequest 来支持上传进度
        return await new Promise((resolve, reject) => {
            var xhr = new XMLHttpRequest();
            var url = getSupabase().supabaseUrl + '/storage/v1/object/' + BUCKET_NAME + '/' + path;
            
            xhr.upload.addEventListener('progress', function(e) {
                if (e.lengthComputable) {
                    var percent = Math.round((e.loaded / e.total) * 100);
                    showProgress('上传中 ' + percent + '% (' + fileSizeMB + 'MB)');
                }
            });
            
            xhr.addEventListener('load', function() {
                hideProgress();
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        var response = JSON.parse(xhr.responseText);
                        console.log('上传成功:', response);
                        var publicUrl = getSupabase().supabaseUrl + '/storage/v1/object/public/' + BUCKET_NAME + '/' + path;
                        resolve(publicUrl);
                    } catch (e) {
                        reject(new Error('解析响应失败'));
                    }
                } else {
                    console.error('上传失败:', xhr.status, xhr.responseText);
                    reject(new Error('上传失败: ' + xhr.status));
                }
            });
            
            xhr.addEventListener('error', function() {
                hideProgress();
                reject(new Error('网络错误，上传失败'));
            });
            
            xhr.addEventListener('timeout', function() {
                hideProgress();
                reject(new Error('上传超时，请检查网络'));
            });
            
            xhr.open('POST', url);
            xhr.setRequestHeader('apikey', getSupabase().supabaseKey);
            xhr.setRequestHeader('Authorization', 'Bearer ' + getSupabase().supabaseKey);
            xhr.timeout = 120000; // 2分钟超时
            xhr.send(file);
        });
    } catch (e) {
        hideProgress();
        console.error('Storage upload exception:', e);
        return null;
    }
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
        // 上传所有图片
        showProgress('准备上传图片...');
        var imageUrls = [];
        for (var i = 0; i < currentImages.length; i++) {
            var img = currentImages[i];
            var fileToUpload;
            
            if (img.file) {
                fileToUpload = img.file;
            } else if (img.dataUrl && img.dataUrl.startsWith('data:')) {
                var imgBlob = await fetch(img.dataUrl).then(function(r) { return r.blob(); });
                fileToUpload = new File([imgBlob], 'image.jpg', { type: 'image/jpeg' });
            }
            
            if (fileToUpload) {
                var uploadedUrl = await uploadToStorage(fileToUpload, 'images');
                if (uploadedUrl) imageUrls.push(uploadedUrl);
            }
        }
        
        // 上传视频
        var videoUrl = '';
        if (currentVideoFile) {
            console.log('开始上传视频...');
            videoUrl = await uploadToStorage(currentVideoFile, 'videos');
            console.log('视频上传结果:', videoUrl);
            if (!videoUrl) {
                alert('视频上传失败，请检查文件大小或格式');
            }
        }

        hideProgress();

        var body = {
            name: name,
            description: desc,
            category: category,
            price: priceStr,
            code: code || null,
            specification: specification || null,
            images: imageUrls.length > 0 ? imageUrls : null,
            image_url: imageUrls.length > 0 ? imageUrls[0] : null,
            video_url: videoUrl || null
        };

        console.log('保存数据:', body);

        var error;
        if (editingId) {
            var result = await getSupabase().from(TABLE_NAME).update(body).eq('id', editingId);
            error = result.error;
        } else {
            var result = await getSupabase().from(TABLE_NAME).insert(body);
            error = result.error;
        }

        if (error) { 
            alert('保存失败: ' + error.message); 
            return; 
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

        if (data.price) {
            var pp = data.price.split('/');
            document.getElementById('productPriceNum').value = pp[0] || '';
            document.getElementById('productPriceUnit').value = pp[1] || '箱';
        } else {
            document.getElementById('productPriceNum').value = '';
            document.getElementById('productPriceUnit').value = '箱';
        }

        // 多图预览
        currentImages = [];
        var imgPreviewHtml = '';
        
        if (Array.isArray(data.images) && data.images.length > 0) {
            data.images.forEach(function(url, i) {
                currentImages.push({ url: url });
                imgPreviewHtml += '<div style="position:relative;display:inline-block;margin:4px">' +
                    '<img src="' + url + '" style="width:80px;height:80px;object-fit:cover;border-radius:6px">' +
                    '<button onclick="removeImage(' + i + ')" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#ff4444;color:#fff;border:none;font-size:12px;cursor:pointer">×</button>' +
                    '</div>';
            });
        } else if (data.image_url) {
            currentImages.push({ url: data.image_url });
            imgPreviewHtml = '<img src="' + data.image_url + '" style="width:80px;height:80px;object-fit:cover;border-radius:6px">';
        }
        
        document.getElementById('imagePreview').innerHTML = imgPreviewHtml;
        document.getElementById('imageUploadText').textContent = currentImages.length > 0 ? '✅ 已有 ' + currentImages.length + ' 张图片' : '📷 点击上传图片（可多选）';
        
        // 视频预览
        currentVideoFile = null;
        document.getElementById('videoPreview').innerHTML = data.video_url ? '<video src="' + data.video_url + '" style="width:100%;max-width:300px;height:auto;max-height:200px;border-radius:8px;background:#000" controls playsinline></video>' : '';
        document.getElementById('videoUploadText').textContent = data.video_url ? '✅ 已有视频' : '🎬 点击上传视频';

        document.getElementById('productForm').style.display = 'block';
        document.getElementById('productList').style.display = 'none';
    } catch (e) {
        alert('加载失败: ' + e.message);
    }
}

// ---- 删除商品 ----
async function deleteProduct(id) {
    if (!confirm('确定删除该商品？')) return;
    await waitForSupabase();
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
