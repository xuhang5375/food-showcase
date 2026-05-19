// ========================================
// 椋熸潗閲囪喘 - 绠＄悊鍚庡彴閫昏緫
// 鏀寔鍟嗗搧澧炲垹鏀?+ 鍥剧墖/瑙嗛涓婁紶
// ========================================

var supabase = window.supabase;
var ADMIN_PASSWORD = window.ADMIN_PASSWORD;
var TABLE_NAME = window.TABLE_NAME;
var BUCKET_NAME = window.BUCKET_NAME;

let isLoggedIn = false;
let editingId = null;
let currentImageUrl = null;
let currentVideoUrl = null;

// ---- 鐧诲綍 ----
function checkPassword() {
    const pw = document.getElementById('passwordInput').value;
    if (pw === ADMIN_PASSWORD) {
        isLoggedIn = true;
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('adminSection').style.display = 'block';
        loadProducts();
    } else {
        alert('瀵嗙爜閿欒');
    }
}

// ---- 鍔犺浇鍟嗗搧鍒楄〃 ----
async function loadProducts() {
    const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        alert('鍔犺浇澶辫触: ' + error.message);
        return;
    }

    renderProductList(data || []);
}

function renderProductList(products) {
    const container = document.getElementById('productList');

    if (!products.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">馃摝</div><p>鏆傛棤鍟嗗搧锛岀偣鍑讳笂鏂规寜閽坊鍔?/p></div>';
        return;
    }

    container.innerHTML = products.map(p => {
        // 浠锋牸瑙ｆ瀽
        let priceText = '-';
        if (p.price) {
            const pp = p.price.split('/');
            priceText = pp[0] ? (pp[1] ? pp[0] + '鍏?' + pp[1] : pp[0] + '鍏?) : '-';
        }

        return `
        <div class="admin-card">
            <div class="admin-card-left">
                <div class="admin-card-img">
                    ${p.image_url
                        ? `<img src="${p.image_url}" alt="${escapeHtml(p.name)}" loading="lazy">`
                        : '<span class="no-img">鏃犲浘</span>'}
                </div>
                <div class="admin-card-info">
                    <h4>${escapeHtml(p.name)}</h4>
                    <div class="admin-meta">
                        ${p.code ? `<span>馃彿 ${escapeHtml(p.code)}</span>` : ''}
                        ${p.category ? `<span>馃搨 ${escapeHtml(p.category)}</span>` : ''}
                        ${p.specification ? `<span>馃搻 ${escapeHtml(p.specification)}</span>` : ''}
                    </div>
                    <div class="admin-price">${priceText}</div>
                </div>
            </div>
            <div class="admin-card-actions">
                <button class="btn-edit" onclick="editProduct('${p.id}')">缂栬緫</button>
                <button class="btn-del" onclick="deleteProduct('${p.id}')">鍒犻櫎</button>
            </div>
        </div>`;
    }).join('');
}

// ---- 鏄剧ず娣诲姞琛ㄥ崟 ----
function showAddForm() {
    editingId = null;
    currentImageUrl = null;
    currentVideoUrl = null;

    resetForm();
    document.getElementById('formTitle').textContent = '娣诲姞鍟嗗搧';
    document.getElementById('productForm').style.display = 'block';
    document.getElementById('productForm').scrollIntoView({ behavior: 'smooth' });
}

function resetForm() {
    document.getElementById('productId').value = '';
    document.getElementById('productName').value = '';
    document.getElementById('productCode').value = '';
    document.getElementById('productCategory').value = '椴滄瘺鑲?;
    document.getElementById('productSpec').value = '';
    document.getElementById('productPriceNum').value = '';
    document.getElementById('productPriceUnit').value = '绠?;
    document.getElementById('productDesc').value = '';
    document.getElementById('imageFile').value = '';
    document.getElementById('videoFile').value = '';
    document.getElementById('imagePreview').innerHTML = '';
    document.getElementById('videoPreview').innerHTML = '';
    document.getElementById('imageUploadText').style.display = '';
    document.getElementById('videoUploadText').style.display = '';
}

// ---- 缂栬緫鍟嗗搧 ----
async function editProduct(id) {
    const { data } = await supabase.from(TABLE_NAME).select('*').eq('id', id).single();
    if (!data) { alert('鏈壘鍒拌鍟嗗搧'); return; }

    editingId = id;
    currentImageUrl = data.image_url;
    currentVideoUrl = data.video_url;

    resetForm();

    document.getElementById('formTitle').textContent = '缂栬緫鍟嗗搧';
    document.getElementById('productId').value = id;
    document.getElementById('productName').value = data.name || '';
    document.getElementById('productCode').value = data.code || '';
    document.getElementById('productCategory').value = data.category || '椴滄瘺鑲?;
    document.getElementById('productSpec').value = data.specification || '';
    document.getElementById('productDesc').value = data.description || '';

    // 浠锋牸瑙ｆ瀽
    if (data.price) {
        const pp = data.price.split('/');
        document.getElementById('productPriceNum').value = pp[0] || '';
        document.getElementById('productPriceUnit').value = pp[1] || '绠?;
    }

    // 褰撳墠鍥剧墖/瑙嗛棰勮
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

// ---- 鏂囦欢涓婁紶 ----
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

// ---- 淇濆瓨鍟嗗搧 ----
async function saveProduct() {
    const name = document.getElementById('productName').value.trim();
    if (!name) { alert('璇疯緭鍏ュ晢鍝佸悕绉?); return; }

    const imageFile = document.getElementById('imageFile').files[0];
    const videoFile = document.getElementById('videoFile').files[0];

    try {
        let imageUrl = currentImageUrl;
        let videoUrl = currentVideoUrl;

        // 涓婁紶鍥剧墖
        if (imageFile) {
            showUploading('imagePreview', '涓婁紶鍥剧墖涓?..');
            imageUrl = await uploadFile(imageFile);
            clearUploading('imagePreview');
            document.getElementById('imagePreview').innerHTML =
                `<img src="${imageUrl}" style="max-width:120px;max-height:80px;border-radius:6px;">`;
            document.getElementById('imageUploadText').style.display = 'none';
        }

        // 涓婁紶瑙嗛
        if (videoFile) {
            showUploading('videoPreview', '涓婁紶瑙嗛涓?..');
            videoUrl = await uploadFile(videoFile);
            clearUploading('videoPreview');
            document.getElementById('videoPreview').innerHTML =
                `<video src="${videoUrl}" style="max-width:200px;max-height:100px;border-radius:6px;" controls></video>`;
            document.getElementById('videoUploadText').style.display = 'none';
        }

        // 鎷兼帴浠锋牸
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

        alert(editingId ? '淇敼鎴愬姛锛? : '娣诲姞鎴愬姛锛?);
        hideForm();
        loadProducts();
    } catch (err) {
        console.error('淇濆瓨澶辫触:', err);
        alert('淇濆瓨澶辫触: ' + err.message);
    }
}

// ---- 鍒犻櫎鍟嗗搧 ----
async function deleteProduct(id) {
    if (!confirm('纭畾鍒犻櫎姝ゅ晢鍝侊紵')) return;

    const { error } = await supabase.from(TABLE_NAME).delete().eq('id', id);
    if (error) {
        alert('鍒犻櫎澶辫触: ' + error.message);
    } else {
        loadProducts();
    }
}

// ---- 杈呭姪鍑芥暟 ----
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

// ---- 鍥剧墖/瑙嗛棰勮锛堟枃浠堕€夋嫨鍚庡嵆鏃堕瑙堬級----
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

// 鍥炶溅鐧诲綍
document.getElementById('passwordInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') checkPassword();
});
