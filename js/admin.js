// ========================================
// 食材采购 - 管理后台逻辑
// 支持商品增删改 + 图片/视频上传
// ========================================

var supabase = window.supabase;
var ADMIN_PASSWORD = window.ADMIN_PASSWORD;
var TABLE_NAME = window.TABLE_NAME;
var BUCKET_NAME = window.BUCKET_NAME;

let isLoggedIn = false;
let editingId = null;
let currentImageUrl = null;
let currentVideoUrl = null;

// ---- 登录 ----
function checkPassword() {
    const pw = document.getElementById('passwordInput').value;
    if (pw === ADMIN_PASSWORD) {
        isLoggedIn = true;
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('adminSection').style.display = 'block';
        loadProducts();
    } else {
        alert('密码错误');
    }
}

// ---- 加载商品列表 ----
async function loadProducts() {
    const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        alert('加载失败: ' + error.message);
        return;
    }

    renderProductList(data || []);
}

function renderProductList(products) {
    const container = document.getElementById('productList');

    if (!products.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><p>暂无商品，点击上方按钮添加</p></div>';
        return;
    }

    container.innerHTML = products.map(p => {
        // 价格解析
        let priceText = '-';
        if (p.price) {
            const pp = p.price.split('/');
            priceText = pp[0] ? (pp[1] ? pp[0] + '元/' + pp[1] : pp[0] + '元') : '-';
        }

        return `
        <div class="admin-card">
            <div class="admin-card-left">
                <div class="admin-card-img">
                    ${p.image_url
                        ? `<img src="${p.image_url}" alt="${escapeHtml(p.name)}" loading="lazy">`
                        : '<span class="no-img">无图</span>'}
                </div>
                <div class="admin-card-info">
                    <h4>${escapeHtml(p.name)}</h4>
                    <div class="admin-meta">
                        ${p.code ? `<span>🏷 ${escapeHtml(p.code)}</span>` : ''}
                        ${p.category ? `<span>📂 ${escapeHtml(p.category)}</span>` : ''}
                        ${p.spec ? `<span>📐 ${escapeHtml(p.spec)}</span>` : ''}
                    </div>
                    <div class="admin-price">${priceText}</div>
                </div>
            </div>
            <div class="admin-card-actions">
                <button class="btn-edit" onclick="editProduct('${p.id}')">编辑</button>
                <button class="btn-del" onclick="deleteProduct('${p.id}')">删除</button>
            </div>
        </div>`;
    }).join('');
}

// ---- 显示添加表单 ----
function showAddForm() {
    editingId = null;
    currentImageUrl = null;
    currentVideoUrl = null;

    resetForm();
    document.getElementById('formTitle').textContent = '添加商品';
    document.getElementById('productForm').style.display = 'block';
    document.getElementById('productForm').scrollIntoView({ behavior: 'smooth' });
}

function resetForm() {
    document.getElementById('productId').value = '';
    document.getElementById('productName').value = '';
    document.getElementById('productCode').value = '';
    document.getElementById('productCategory').value = '鲜毛肚';
    document.getElementById('productSpec').value = '';
    document.getElementById('productPriceNum').value = '';
    document.getElementById('productPriceUnit').value = '箱';
    document.getElementById('productDesc').value = '';
    document.getElementById('imageFile').value = '';
    document.getElementById('videoFile').value = '';
    document.getElementById('imagePreview').innerHTML = '';
    document.getElementById('videoPreview').innerHTML = '';
    document.getElementById('imageUploadText').style.display = '';
    document.getElementById('videoUploadText').style.display = '';
}

// ---- 编辑商品 ----
async function editProduct(id) {
    const { data } = await supabase.from(TABLE_NAME).select('*').eq('id', id).single();
    if (!data) { alert('未找到该商品'); return; }

    editingId = id;
    currentImageUrl = data.image_url;
    currentVideoUrl = data.video_url;

    resetForm();

    document.getElementById('formTitle').textContent = '编辑商品';
    document.getElementById('productId').value = id;
    document.getElementById('productName').value = data.name || '';
    document.getElementById('productCode').value = data.code || '';
    document.getElementById('productCategory').value = data.category || '鲜毛肚';
    document.getElementById('productSpec').value = data.spec || '';
    document.getElementById('productDesc').value = data.description || '';

    // 价格解析
    if (data.price) {
        const pp = data.price.split('/');
        document.getElementById('productPriceNum').value = pp[0] || '';
        document.getElementById('productPriceUnit').value = pp[1] || '箱';
    }

    // 当前图片/视频预览
    if (currentImageUrl) {
        document.getElementById('imagePreview').innerHTML =
            `<img src="${currentImageUrl}" style="max-width:120px;max-height:80px;border-radius:6px;">`;
        document.getElementById('imageUploadText').style.display = 'none';
    }
    if (currentVideoUrl) {
        document.getElementById('videoPreview').innerHTML =
            `<video src="${currentVideoUrl}" style="max-width:200px;max-height:100px;border-radius:6px;" controls></video>`;
        document.getElementById('videoUploadText').style.display = 'none';
    }

    document.getElementById('productForm').style.display = 'block';
    document.getElementById('productForm').scrollIntoView({ behavior: 'smooth' });
}

function hideForm() {
    document.getElementById('productForm').style.display = 'none';
    editingId = null;
}

// ---- 文件上传 ----
async function uploadFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { data, error } = await supabase.storage.from(BUCKET_NAME).upload(filename, file, {
        cacheControl: '3600',
        upsert: false
    });

    if (error) throw error;

    const publicUrl = `https://infsqrfqksvqzlapvott.supabase.co/storage/v1/object/public/${BUCKET_NAME}/${filename}`;
    return publicUrl;
}

// ---- 保存商品 ----
async function saveProduct() {
    const name = document.getElementById('productName').value.trim();
    if (!name) { alert('请输入商品名称'); return; }

    const imageFile = document.getElementById('imageFile').files[0];
    const videoFile = document.getElementById('videoFile').files[0];

    try {
        let imageUrl = currentImageUrl;
        let videoUrl = currentVideoUrl;

        // 上传图片
        if (imageFile) {
            showUploading('imagePreview', '上传图片中...');
            imageUrl = await uploadFile(imageFile);
            clearUploading('imagePreview');
            document.getElementById('imagePreview').innerHTML =
                `<img src="${imageUrl}" style="max-width:120px;max-height:80px;border-radius:6px;">`;
            document.getElementById('imageUploadText').style.display = 'none';
        }

        // 上传视频
        if (videoFile) {
            showUploading('videoPreview', '上传视频中...');
            videoUrl = await uploadFile(videoFile);
            clearUploading('videoPreview');
            document.getElementById('videoPreview').innerHTML =
                `<video src="${videoUrl}" style="max-width:200px;max-height:100px;border-radius:6px;" controls></video>`;
            document.getElementById('videoUploadText').style.display = 'none';
        }

        // 拼接价格
        const priceNum = document.getElementById('productPriceNum').value.trim();
        const priceUnit = document.getElementById('productPriceUnit').value;
        const priceStr = priceNum ? `${priceNum}/${priceUnit}` : '';

        const productData = {
            name,
            code: document.getElementById('productCode').value.trim(),
            category: document.getElementById('productCategory').value,
            spec: document.getElementById('productSpec').value.trim(),
            description: document.getElementById('productDesc').value.trim(),
            price: priceStr,
            image_url: imageUrl,
            video_url: videoUrl
        };

        let result;
        if (editingId) {
            result = await supabase.from(TABLE_NAME).update(productData).eq('id', editingId);
        } else {
            result = await supabase.from(TABLE_NAME).insert(productData);
        }

        if (result.error) throw result.error;

        alert(editingId ? '修改成功！' : '添加成功！');
        hideForm();
        loadProducts();
    } catch (err) {
        console.error('保存失败:', err);
        alert('保存失败: ' + err.message);
    }
}

// ---- 删除商品 ----
async function deleteProduct(id) {
    if (!confirm('确定删除此商品？')) return;

    const { error } = await supabase.from(TABLE_NAME).delete().eq('id', id);
    if (error) {
        alert('删除失败: ' + error.message);
    } else {
        loadProducts();
    }
}

// ---- 辅助函数 ----
function showUploading(containerId, text) {
    const el = document.getElementById(containerId);
    const tip = document.createElement('div');
    tip.className = 'upload-tip';
    tip.textContent = text;
    el.appendChild(tip);
}

function clearUploading(containerId) {
    const el = document.getElementById(containerId);
    const tip = el.querySelector('.upload-tip');
    if (tip) tip.remove();
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ---- 图片/视频预览（文件选择后即时预览）----
document.getElementById('imageFile')?.addEventListener('change', function() {
    const file = this.files[0];
    if (file) {
        document.getElementById('imagePreview').innerHTML =
            `<img src="${URL.createObjectURL(file)}" style="max-width:120px;max-height:80px;border-radius:6px;">`;
        document.getElementById('imageUploadText').style.display = 'none';
    }
});

document.getElementById('videoFile')?.addEventListener('change', function() {
    const file = this.files[0];
    if (file) {
        document.getElementById('videoPreview').innerHTML =
            `<video src="${URL.createObjectURL(file)}" style="max-width:200px;max-height:100px;border-radius:6px;" controls></video>`;
        document.getElementById('videoUploadText').style.display = 'none';
    }
});

// 回车登录
document.getElementById('passwordInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') checkPassword();
});
