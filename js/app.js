// ========================================
// 食材采购 - 前台展示页逻辑
// 左侧分类导航 + 右侧商品列表 + 搜索 + 多图轮播
// ========================================

function getSupabase() { return window.supabase; }
var TABLE_NAME = window.TABLE_NAME || 'food_showcase_products';

let allProducts = [];
let categories = [];
let currentCategory = 'all';
let searchKeyword = '';

// ---- 初始化 ----
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

(async function init() {
    await waitForSupabase();
    await loadProducts();
    buildCategoryNav();
    renderProducts();
    bindEvents();
})();

// ---- 加载商品数据 ----
async function loadProducts() {
    try {
        const { data, error } = await getSupabase()
            .from(TABLE_NAME)
            .select('*')
            .order('created_at', { ascending: true });

        if (error) {
            console.error('加载失败:', error);
            document.getElementById('products').innerHTML =
                '<div class="empty-state"><div class="empty-icon">⚠️</div><p>加载失败，请刷新重试</p></div>';
            return;
        }

        allProducts = data || [];

        // 按价格数字部分排序（从低到高）
        allProducts.sort((a, b) => {
            const priceA = a.price ? parseFloat(a.price.split('/')[0]) || 0 : 0;
            const priceB = b.price ? parseFloat(b.price.split('/')[0]) || 0 : 0;
            return priceA - priceB;
        });

        // 从数据中提取分类
        const catSet = new Set();
        const subMap = {};
        allProducts.forEach(p => {
            const cat = (p.category || '').trim();
            if (!cat) return;
            if (cat.includes('/')) {
                const parts = cat.split('/');
                const parent = parts[0].trim();
                const child = parts[1].trim();
                catSet.add(parent);
                if (!subMap[parent]) subMap[parent] = new Set();
                subMap[parent].add(child);
            } else {
                catSet.add(cat);
            }
        });

        categories = [{ name: 'all', label: '全部' }];
        const parentOrder = ['毛肚系列', '千层系列', '黑千层', '白千层', '虾滑', '肉类', '其他'];
        const sortedParents = Array.from(catSet).sort((a, b) => {
            const ia = parentOrder.indexOf(a);
            const ib = parentOrder.indexOf(b);
            if (ia === -1 && ib === -1) return a.localeCompare(b, 'zh-CN');
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });

        sortedParents.forEach(parent => {
            categories.push({ name: parent, label: parent });
            if (subMap[parent]) {
                Array.from(subMap[parent]).forEach(sub => {
                    categories.push({ name: parent + '/' + sub, label: sub, parent: parent });
                });
            }
        });

    } catch (e) {
        console.error('加载异常:', e);
        document.getElementById('products').innerHTML =
            '<div class="empty-state"><div class="empty-icon">⚠️</div><p>网络错误，请刷新重试</p></div>';
    }
}

// ---- 构建分类导航 ----
function buildCategoryNav() {
    const nav = document.getElementById('categoryNav');
    if (!nav) return;

    let html = '';
    categories.forEach(cat => {
        if (cat.parent) {
            html += '<div class="category-item sub-category' + (currentCategory === cat.name ? ' active' : '') +
                '" data-category="' + cat.name + '">' + cat.label + '</div>';
        } else {
            html += '<div class="category-item' + (currentCategory === cat.name ? ' active' : '') +
                '" data-category="' + cat.name + '">' + cat.label + '</div>';
        }
    });
    nav.innerHTML = html;
}

// ---- 渲染商品列表 ----
function renderProducts() {
    const container = document.getElementById('products');
    if (!container) return;

    let filtered = allProducts;

    // 分类筛选
    if (currentCategory !== 'all') {
        if (currentCategory.includes('/')) {
            filtered = filtered.filter(p => p.category === currentCategory);
        } else {
            filtered = filtered.filter(p => {
                const cat = (p.category || '').trim();
                return cat === currentCategory || cat.startsWith(currentCategory + '/');
            });
        }
    }

    // 搜索筛选
    if (searchKeyword) {
        const kw = searchKeyword.toLowerCase();
        filtered = filtered.filter(p =>
            (p.name || '').toLowerCase().includes(kw) ||
            (p.description || '').toLowerCase().includes(kw) ||
            (p.code || '').toLowerCase().includes(kw) ||
            (p.category || '').toLowerCase().includes(kw)
        );
    }

    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><p>暂无商品</p></div>';
        return;
    }

    let html = '<div class="product-grid">';
    filtered.forEach(p => {
        let priceText = '-';
        if (p.price) {
            const pp = p.price.split('/');
            priceText = pp[0] ? (pp[1] ? pp[0] + '/元' + pp[1] : pp[0]) : '-';
        }

        // 获取第一张图片作为封面
        let firstImg = '';
        if (Array.isArray(p.images) && p.images.length > 0) {
            firstImg = p.images[0];
        } else if (p.image_url) {
            firstImg = p.image_url;
        }
        
        let coverHtml = firstImg
            ? '<img src="' + firstImg + '" onerror="this.style.display=\'none\'">'
            : '<div class="no-image">📦</div>';

        // 多图标记
        let multiBadge = '';
        if (Array.isArray(p.images) && p.images.length > 1) {
            multiBadge = '<div class="multi-badge">' + p.images.length + '图</div>';
        }

        // 视频标记
        let videoBadge = '';
        if (p.video_url) {
            videoBadge = '<div class="video-badge">▶</div>';
        }

        html += '<div class="product-card" data-id="' + p.id + '">' +
            '<div class="product-cover">' + coverHtml + multiBadge + videoBadge + '</div>' +
            '<div class="product-info">' +
            '<div class="product-name">' + (p.name || '未命名') + '</div>' +
            '<div class="product-meta">' +
            '<span class="product-category">' + (p.category || '未分类') + '</span>' +
            '</div>' +
            '<div class="product-price">' + priceText + '</div>' +
            '</div>' +
            '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
}

// ---- 绑定事件 ----
function bindEvents() {
    // 分类点击
    document.getElementById('categoryNav').addEventListener('click', function(e) {
        const item = e.target.closest('.category-item');
        if (!item) return;
        currentCategory = item.dataset.category;
        document.querySelectorAll('.category-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        renderProducts();
    });

    // 搜索
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            searchKeyword = e.target.value.trim();
            renderProducts();
        });
    }

    // 商品卡片点击（显示详情/视频）
    document.getElementById('products').addEventListener('click', function(e) {
        const card = e.target.closest('.product-card');
        if (!card) return;
        const id = card.dataset.id;
        const product = allProducts.find(p => p.id === id);
        if (product) showProductDetail(product);
    });
}

// ---- 显示商品详情（弹窗） ----
function showProductDetail(product) {
    // 移除已有弹窗
    const existing = document.getElementById('detailModal');
    if (existing) existing.remove();

    let priceText = '-';
    if (product.price) {
        const pp = product.price.split('/');
        priceText = pp[0] ? (pp[1] ? pp[0] + '/元' + pp[1] : pp[0]) : '-';
    }

    // 收集所有媒体
    let allMedia = [];
    
    // 多图
    if (Array.isArray(product.images) && product.images.length > 0) {
        product.images.forEach(url => {
            allMedia.push({ type: 'image', url: url });
        });
    } else if (product.image_url) {
        allMedia.push({ type: 'image', url: product.image_url });
    }
    
    // 视频
    if (product.video_url) {
        allMedia.push({ type: 'video', url: product.video_url });
    }

    // 构建媒体区域
    let mediaHtml = '';
    if (allMedia.length > 0) {
        // 多图轮播
        if (allMedia.length > 1) {
            let slidesHtml = '';
            let dotsHtml = '';
            allMedia.forEach((media, i) => {
                let slideContent = '';
                if (media.type === 'video') {
                    slideContent = '<video src="' + media.url + '" controls playsinline preload="metadata" style="width:100%;height:200px;object-fit:contain;background:#000;border-radius:8px"></video>';
                } else {
                    slideContent = '<img src="' + media.url + '" style="width:100%;height:200px;object-fit:contain;background:#f5f5f5;border-radius:8px">';
                }
                slidesHtml += '<div class="carousel-slide" data-index="' + i + '" style="display:' + (i === 0 ? 'block' : 'none') + '">' + slideContent + '</div>';
                dotsHtml += '<span class="carousel-dot' + (i === 0 ? ' active' : '') + '" data-index="' + i + '"></span>';
            });
            
            mediaHtml = '<div class="carousel-container" style="position:relative;margin-bottom:12px">' +
                slidesHtml +
                '<div class="carousel-dots" style="text-align:center;margin-top:8px">' + dotsHtml + '</div>' +
                '</div>';
        } else {
            // 单图或单视频
            if (allMedia[0].type === 'video') {
                mediaHtml = '<div style="margin-bottom:12px">' +
                    '<video src="' + allMedia[0].url + '" controls playsinline preload="metadata" style="width:100%;max-height:300px;border-radius:8px;background:#000"></video>' +
                    '</div>';
            } else {
                mediaHtml = '<div style="margin-bottom:12px">' +
                    '<img src="' + allMedia[0].url + '" style="width:100%;max-width:100%;height:auto;border-radius:8px">' +
                    '</div>';
            }
        }
    }

    const modal = document.createElement('div');
    modal.id = 'detailModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:1000';
    modal.innerHTML = '<div style="background:#fff;border-radius:12px;max-width:400px;width:90%;max-height:80vh;overflow-y:auto;padding:20px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
        '<h3 style="margin:0;font-size:18px">' + (product.name || '商品详情') + '</h3>' +
        '<button onclick="document.getElementById(\'detailModal\').remove()" style="border:none;background:#eee;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:16px">×</button>' +
        '</div>' +
        mediaHtml +
        '<div style="color:#888;font-size:13px;margin-bottom:6px">分类: ' + (product.category || '未分类') + '</div>' +
        '<div style="color:#f60;font-size:20px;font-weight:600;margin-bottom:8px">' + priceText + '</div>' +
        (product.code ? '<div style="color:#888;font-size:12px">编码: ' + product.code + '</div>' : '') +
                (product.specification ? '<div style="color:#666;font-size:13px;margin-top:4px">规格: ' + product.specification + '</div>' : '') +
        (product.description ? '<div style="color:#666;font-size:14px;margin-top:12px;line-height:1.5">' + product.description + '</div>' : '') +
        '</div>';

    // 轮播事件
    if (allMedia.length > 1) {
        modal.querySelectorAll('.carousel-dot').forEach(dot => {
            dot.style.cssText = 'display:inline-block;width:8px;height:8px;border-radius:50%;background:#ccc;margin:0 4px;cursor:pointer';
            dot.addEventListener('click', function() {
                const idx = parseInt(this.dataset.index);
                modal.querySelectorAll('.carousel-slide').forEach((s, i) => {
                    s.style.display = i === idx ? 'block' : 'none';
                });
                modal.querySelectorAll('.carousel-dot').forEach((d, i) => {
                    d.style.background = i === idx ? '#f60' : '#ccc';
                });
            });
        });
        // 默认激活第一个点
        modal.querySelector('.carousel-dot').style.background = '#f60';
    }

    modal.addEventListener('click', function(e) {
        if (e.target === modal) modal.remove();
    });
    document.body.appendChild(modal);
}
