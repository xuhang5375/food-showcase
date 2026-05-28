// ========================================
// 食材采购 - 前台展示页逻辑
// ========================================

var TABLE_NAME = window.TABLE_NAME || 'food_showcase_products';

let allProducts = [];
let categories = [];
let currentCategory = 'all';
let searchKeyword = '';

// ---- 初始化 ----
(async function init() {
    try {
        await loadProducts();
        buildCategoryNav();
        renderProducts();
        bindEvents();
    } catch (err) {
        console.error('初始化失败:', err);
        const el = document.getElementById('products');
        if (el) el.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>加载失败，<a href="javascript:location.reload()">点击刷新</a></p></div>';
    }
})();

var COS_CDN_URL = window.COS_CDN_URL || 'https://799195375-1306702381.cos.ap-guangzhou.myqcloud.com';

function mediaUrl(url) {
    if (!url) return url;
    // COS 图片 URL → 迁移到 Supabase Storage
    if (url.indexOf('799195375-1306702381') !== -1 && url.indexOf('.mp4') === -1) {
        var filename = url.split('/').pop();
        return 'https://infsqrfqksvqzlapvott.supabase.co/storage/v1/object/public/product-media/images/' + filename;
    }
    // COS 视频 URL（新增视频走 COS）或其他 URL 直接返回
    return url;
}

// ---- 加载商品数据 ----
async function loadProducts() {
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const { data, error } = await window.supabase
                .from(TABLE_NAME)
                .select('*')
                .neq('is_active', false)
                .order('created_at', { ascending: true });

            if (error) throw error;

            allProducts = data || [];
            if (allProducts.length === 0) {
                document.getElementById('products').innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>暂无商品</p></div>';
                return;
            }

            allProducts.sort((a, b) => {
                const priceA = a.price ? parseFloat(a.price.split('/')[0]) || 0 : 0;
                const priceB = b.price ? parseFloat(b.price.split('/')[0]) || 0 : 0;
                return priceA - priceB;
            });

            const catSet = new Set();
            allProducts.forEach(p => {
                const cat = (p.category || '').trim();
                if (!cat) return;
                catSet.add(cat);
            });

            categories = [{ name: 'all', label: '全部' }];
            const categoryOrder = ['黑千层', '白千层', '边角料', '毛肚片', '虾滑', '其他', '整肚'];
            const sortedCats = Array.from(catSet).sort((a, b) => {
                const ia = categoryOrder.indexOf(a);
                const ib = categoryOrder.indexOf(b);
                if (ia === -1 && ib === -1) return a.localeCompare(b, 'zh-CN');
                if (ia === -1) return 1;
                if (ib === -1) return -1;
                return ia - ib;
            });

            sortedCats.forEach(cat => {
                categories.push({ name: cat, label: cat });
            });
            return;
        } catch (e) {
            lastError = e;
            if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 1000));
        }
    }
    console.error('加载失败:', lastError);
    document.getElementById('products').innerHTML =
        '<div class="empty-state"><div class="empty-icon">⚠️</div><p>加载失败，请刷新重试</p></div>';
}

// ---- 构建分类导航 ----
function buildCategoryNav() {
    const nav = document.getElementById('categoryNav');
    if (!nav) return;
    let html = '';
    categories.forEach(cat => {
        html += '<div class="category-item' + (currentCategory === cat.name ? ' active' : '') +
            '" data-category="' + cat.name + '">' + cat.label + '</div>';
    });
    nav.innerHTML = html;
}

// ---- 渲染商品列表 ----
function renderProducts() {
    const container = document.getElementById('products');
    if (!container) return;

    let filtered = allProducts;
    if (currentCategory !== 'all') {
        filtered = filtered.filter(p => {
            const cat = (p.category || '').trim();
            return cat === currentCategory || cat.startsWith(currentCategory + '/');
        });
    }
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
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>暂无商品</p></div>';
        return;
    }

    let html = '<div class="product-grid">';
    filtered.forEach(p => {
        let priceText = '-';
        if (p.price) {
            const pp = p.price.split('/');
            priceText = pp[0] ? ('¥' + pp[0] + (pp[1] ? '/' + pp[1] : '')) : '-';
        }
        let firstImg = '';
        if (Array.isArray(p.images) && p.images.length > 0) {
            firstImg = mediaUrl(p.images[0]);
        } else if (p.image_url) {
            firstImg = mediaUrl(p.image_url);
        }
        let coverHtml = firstImg
            ? '<img src="' + firstImg + '" onerror="this.style.display=\'none\'">'
            : '<div class="no-image">📋</div>';
        let multiBadge = '';
        if (Array.isArray(p.images) && p.images.length > 1) {
            multiBadge = '<div class="multi-badge">' + p.images.length + '图</div>';
        }
        let videoBadge = '';
        if (p.video) {
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
            (p.specification ? '<div class="product-spec" style="color:#666;font-size:12px;margin-top:2px">' + p.specification + '</div>' : '') +
            '</div>' +
            '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
}

// ---- 绑定事件 ----
function bindEvents() {
    const nav = document.getElementById('categoryNav');
    if (nav) {
        nav.addEventListener('click', function(e) {
            const item = e.target.closest('.category-item');
            if (!item) return;
            currentCategory = item.dataset.category;
            document.querySelectorAll('.category-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            renderProducts();
        });
    }
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            searchKeyword = e.target.value.trim();
            renderProducts();
        });
    }
    document.getElementById('products').addEventListener('click', function(e) {
        const card = e.target.closest('.product-card');
        if (!card) return;
        const product = allProducts.find(p => p.id === card.dataset.id);
        if (product) showProductDetail(product);
    });
}

function showProductDetail(product) {
    const existing = document.getElementById('detailModal');
    if (existing) existing.remove();

    let priceText = '-';
    if (product.price) {
        const pp = product.price.split('/');
        priceText = pp[0] ? ('¥' + pp[0] + (pp[1] ? '/' + pp[1] : '')) : '-';
    }

    let allMedia = [];
    if (Array.isArray(product.images) && product.images.length > 0) {
        product.images.forEach(url => { allMedia.push({ type: 'image', url: url }); });
    } else if (product.image_url) {
        allMedia.push({ type: 'image', url: product.image_url });
    }
    if (product.video) {
        allMedia.push({ type: 'video', url: product.video });
    }

    let mediaHtml = '';
    if (allMedia.length > 0) {
        if (allMedia.length > 1) {
            let slidesHtml = '';
            let dotsHtml = '';
            allMedia.forEach((media, i) => {
                let slideContent = '';
                if (media.type === 'video') {
                    slideContent = '<video src="' + mediaUrl(media.url) + '" controls playsinline preload="none" muted style="width:100%;height:200px;object-fit:contain;background:#000;border-radius:8px"></video>';
                } else {
                    slideContent = '<img src="' + mediaUrl(media.url) + '" style="width:100%;height:200px;object-fit:contain;background:#f5f5f5;border-radius:8px">';
                }
                slidesHtml += '<div class="carousel-slide" data-index="' + i + '" style="display:' + (i === 0 ? 'block' : 'none') + '">' + slideContent + '</div>';
                dotsHtml += '<span class="carousel-dot" data-index="' + i + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + (i === 0 ? '#f60' : '#ccc') + ';margin:0 4px;cursor:pointer"></span>';
            });
            mediaHtml = '<div class="carousel-container" style="position:relative;margin-bottom:12px" id="carouselContainer">' +
                slidesHtml +
                '<button class="carousel-prev" onclick="carouselGo(-1)" style="position:absolute;left:4px;top:50%;transform:translateY(-50%);width:32px;height:32px;border:none;background:rgba(0,0,0,0.45);color:#fff;font-size:18px;border-radius:50%;cursor:pointer;z-index:2;opacity:0.7">‹</button>' +
                '<button class="carousel-next" onclick="carouselGo(1)" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);width:32px;height:32px;border:none;background:rgba(0,0,0,0.45);color:#fff;font-size:18px;border-radius:50%;cursor:pointer;z-index:2;opacity:0.7">›</button>' +
                '<div class="carousel-counter" style="position:absolute;right:8px;top:8px;background:rgba(0,0,0,0.55);color:#fff;font-size:12px;padding:2px 7px;border-radius:10px;z-index:2">1/' + allMedia.length + '</div>' +
                '<div class="carousel-dots" style="text-align:center;margin-top:8px">' + dotsHtml + '</div>' +
                '</div>';
        } else {
            if (allMedia[0].type === 'video') {
                mediaHtml = '<div style="margin-bottom:12px"><video src="' + mediaUrl(allMedia[0].url) + '" controls playsinline preload="none" muted style="width:100%;max-height:300px;border-radius:8px;background:#000"></video></div>';
            } else {
                mediaHtml = '<div style="margin-bottom:12px"><img src="' + mediaUrl(allMedia[0].url) + '" style="width:100%;height:auto;border-radius:8px"></div>';
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
        '</div>' + mediaHtml +
        '<div style="color:#888;font-size:13px;margin-bottom:6px">分类: ' + (product.category || '未分类') + '</div>' +
        '<div style="color:#f60;font-size:20px;font-weight:600;margin-bottom:8px">' + priceText + '</div>' +
        (product.code ? '<div style="color:#888;font-size:12px">编码: ' + product.code + '</div>' : '') +
        (product.specification ? '<div style="color:#666;font-size:13px;margin-top:4px">规格: ' + product.specification + '</div>' : '') +
        (product.description ? '<div style="color:#666;font-size:14px;margin-top:12px;line-height:1.5">' + product.description + '</div>' : '') +
        (product.remark ? '<div style="color:#e6a23c;font-size:13px;margin-top:8px;line-height:1.5">📌 ' + product.remark + '</div>' : '') +
        '</div>';

    if (allMedia.length > 1) {
        modal.querySelectorAll('.carousel-dot').forEach(dot => {
            dot.addEventListener('click', function() { carouselShow(parseInt(this.dataset.index)); });
        });
        _carouselIndex = 0;
        carouselShow(0);
        const carouselEl = modal.querySelector('#carouselContainer');
        if (carouselEl) {
            let startX = 0;
            carouselEl.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
            carouselEl.addEventListener('touchend', (e) => {
                const diff = startX - e.changedTouches[0].clientX;
                if (Math.abs(diff) > 40) carouselGo(diff > 0 ? 1 : -1);
            }, { passive: true });
        }
    }

    modal.addEventListener('click', function(e) {
        if (e.target === modal) modal.remove();
    });
    document.body.appendChild(modal);
}

let _carouselIndex = 0;

function carouselShow(idx) {
    const slides = document.querySelectorAll('#detailModal .carousel-slide');
    const dots = document.querySelectorAll('#detailModal .carousel-dot');
    const counter = document.querySelector('#detailModal .carousel-counter');
    if (!slides.length) return;
    _carouselIndex = idx;
    slides.forEach((s, i) => s.style.display = i === idx ? 'block' : 'none');
    dots.forEach((d, i) => { d.style.background = i === idx ? '#f60' : '#ccc'; });
    if (counter) counter.textContent = (idx + 1) + '/' + slides.length;
    const prevBtn = document.querySelector('#detailModal .carousel-prev');
    const nextBtn = document.querySelector('#detailModal .carousel-next');
    if (prevBtn) prevBtn.style.opacity = idx === 0 ? '0.3' : '0.7';
    if (nextBtn) nextBtn.style.opacity = idx === slides.length - 1 ? '0.3' : '0.7';
}

function carouselGo(dir) {
    const slides = document.querySelectorAll('#detailModal .carousel-slide');
    if (!slides.length) return;
    let idx = _carouselIndex + dir;
    if (idx < 0 || idx >= slides.length) return;
    carouselShow(idx);
}

