// ========================================
// 食材采购 - 前台展示页逻辑
// ========================================

// Supabase 配置（硬编码，不依赖 CDN）
var SUPABASE_URL = 'https://infsqrfqksvqzlapvott.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_2z92LEUAiZf6smg9aiufFg_p16OStvD';

var TABLE_NAME = window.TABLE_NAME || 'food_showcase_products';

let allProducts = [];
let categories = [];
let currentCategory = 'all';
let searchKeyword = '';
let videoEnabled = true;
let callEnabled = false;
let contactPhone = '';

// ---- 北京时间转换 ----
function formatBeijingTime(isoStr) {
    if (!isoStr) return '-';
    var d = new Date(isoStr);
    if (isNaN(d.getTime())) {
        // 兼容 "2026-08-03 10:06:00" 格式
        var m = isoStr.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
        return m ? m[1] + ' ' + m[2] : isoStr;
    }
    // UTC → UTC+8
    var bj = new Date(d.getTime() + 8 * 60 * 60 * 1000);
    var y = bj.getUTCFullYear();
    var mo = ('0' + (bj.getUTCMonth() + 1)).slice(-2);
    var day = ('0' + bj.getUTCDate()).slice(-2);
    var h = ('0' + bj.getUTCHours()).slice(-2);
    var mi = ('0' + bj.getUTCMinutes()).slice(-2);
    return y + '-' + mo + '-' + day + ' ' + h + ':' + mi;
}

// ---- 收藏管理 ----
function getFavorites() {
    try {
        var raw = localStorage.getItem('fav_products');
        return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
}
function isFavorited(id) { return getFavorites().indexOf(id) !== -1; }
function toggleFavorite(id) {
    var favs = getFavorites();
    var idx = favs.indexOf(id);
    if (idx === -1) { favs.push(id); return true; }
    else { favs.splice(idx, 1); return false; }
}

// ---- 初始化 ----
(async function init() {
    try {
        // 批量读取配置
        try {
            var _cfgResp = await fetch(SUPABASE_URL + '/rest/v1/app_config?select=key,value&key=in.(video_enabled,call_button_enabled,contact_phone,visitor_enabled)', {
                headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY }
            });
            var _cfgData = await _cfgResp.json();
            if (Array.isArray(_cfgData)) {
                _cfgData.forEach(function(c) {
                    if (c.key === 'video_enabled') videoEnabled = c.value !== 'false';
                    if (c.key === 'call_button_enabled') callEnabled = c.value === 'true';
                    if (c.key === 'contact_phone') contactPhone = c.value || '';
                });
            }
        } catch (e) {
            console.warn('读取配置失败，使用默认值:', e);
        }

        await loadProducts();
        buildCategoryNav();
        renderProducts();
        bindEvents();
    } catch (err) {
        console.error('初始化失败:', err);
        var el = document.getElementById('products');
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
            const _prodResp = await fetch(SUPABASE_URL + '/rest/v1/' + TABLE_NAME + '?select=*&is_active=eq.true&order=created_at.asc', {
                headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY }
            });
            const { data, error } = { data: await _prodResp.json(), error: !_prodResp.ok ? { message: 'HTTP ' + _prodResp.status } : null };

            if (error) throw error;

            allProducts = data || [];
            if (allProducts.length === 0) {
                document.getElementById('products').innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>暂无商品</p></div>';
                return;
            }

            // 按价格排序（price 是数字）
            allProducts.sort((a, b) => {
                const priceA = a.price ? parseFloat(a.price) || 0 : 0;
                const priceB = b.price ? parseFloat(b.price) || 0 : 0;
                return priceA - priceB;
            });

            // 收集分类（列名是 tag，不是 category）
            const catSet = new Set();
            allProducts.forEach(p => {
                const cat = (p.category || '').trim();
                if (!cat) return;
                catSet.add(cat);
            });

            categories = [{ name: 'all', label: '全部' }];
            const categoryOrder = ['黑千层', '白千层', '毛肚片', '整肚', '边角料', '虾滑', '火锅食材', '烧烤系列', '其他'];
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
            var priceStr = String(p.price);
            if (priceStr.indexOf('/') >= 0) {
                // price 已包含单位，如 "26.5/斤"
                priceText = '¥' + priceStr;
            } else {
                var priceNum = parseFloat(priceStr) || 0;
                var unit = p.unit || '';
                priceText = '¥' + priceNum + (unit ? '/' + unit : '');
            }
        }
        let firstImg = '';
        if (Array.isArray(p.images) && p.images.length > 0) {
            firstImg = mediaUrl(p.images[0]);
        } else if (p.image_url) {
            firstImg = mediaUrl(p.image_url);
        } else if (p.cover_image) {
            firstImg = mediaUrl(p.cover_image);
        }
        let coverHtml = firstImg
            ? '<img src="' + firstImg + '" onerror="this.style.display=\'none\'">'
            : '<div class="no-image">📋</div>';
        let multiBadge = '';
        if (Array.isArray(p.images) && p.images.length > 1) {
            multiBadge = '<div class="multi-badge">' + p.images.length + '图</div>';
        }
        html += '<div class="product-card" data-id="' + p.id + '">' +
            '<div class="product-cover">' + coverHtml + multiBadge + '</div>' +
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
        const product = allProducts.find(p => String(p.id) === card.dataset.id);
        if (product) showProductDetail(product);
    });
}

function showProductDetail(product) {
    var existing = document.getElementById('detailModal');
    if (existing) existing.remove();

    // 价格显示
    var priceText = '-';
    if (product.price != null) {
        var pStr = String(product.price);
        if (pStr.indexOf('/') >= 0) {
            // price 已包含单位，如 "26.5/斤"
            priceText = '¥' + pStr;
        } else {
            var pp = pStr.split('/');
            if (pp[0]) {
                var unit = product.unit || (pp[1] || '');
                priceText = '¥' + pp[0] + (unit ? '/' + unit : '');
            }
        }
    }

    // 收集所有图片
    var images = [];
    if (Array.isArray(product.images) && product.images.length > 0) {
        product.images.forEach(function(url) { images.push(url); });
    } else if (product.image_url) {
        images.push(product.image_url);
    } else if (product.cover_image) {
        images.push(product.cover_image);
    }

    var hasVideo = videoEnabled && !!product.video;
    var collected = isFavorited(product.id);
    var showBottomBar = callEnabled && contactPhone;

    // 图片轮播（仅图片，不含视频）
    var mediaHtml = '';
    if (images.length > 0) {
        if (images.length > 1) {
            var slidesHtml = '';
            var dotsHtml = '';
            images.forEach(function(url, i) {
                slidesHtml += '<div class="carousel-slide" data-index="' + i + '" style="display:' + (i === 0 ? 'block' : 'none') + '">' +
                    '<img src="' + mediaUrl(url) + '" style="width:100%;height:280px;object-fit:contain;background:#f8f8f8;border-radius:12px;cursor:zoom-in" onclick="showBigImg(this.src)">' +
                    '</div>';
                dotsHtml += '<span class="carousel-dot" data-index="' + i + '" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + (i === 0 ? '#e4393c' : '#d9d9d9') + ';margin:0 4px;cursor:pointer;transition:background 0.2s"></span>';
            });
            mediaHtml = '<div class="carousel-container" id="carouselContainer" style="position:relative">' +
                slidesHtml +
                '<button class="carousel-prev" onclick="carouselGo(-1)" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);width:44px;height:44px;border:none;background:rgba(0,0,0,0.5);color:#fff;font-size:24px;border-radius:50%;cursor:pointer;z-index:2;opacity:0.85;line-height:44px;text-align:center;padding:0">‹</button>' +
                '<button class="carousel-next" onclick="carouselGo(1)" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);width:44px;height:44px;border:none;background:rgba(0,0,0,0.5);color:#fff;font-size:24px;border-radius:50%;cursor:pointer;z-index:2;opacity:0.85;line-height:44px;text-align:center;padding:0">›</button>' +
                '<div class="carousel-counter" style="position:absolute;right:10px;top:10px;background:rgba(0,0,0,0.6);color:#fff;font-size:13px;padding:3px 12px;border-radius:12px;z-index:2;font-weight:500">1/' + images.length + '</div>' +
                '<div class="carousel-dots" style="text-align:center;padding:8px 0">' + dotsHtml + '</div>' +
                '</div>';
        } else {
            mediaHtml = '<div style="margin-bottom:12px"><img src="' + mediaUrl(images[0]) + '" style="width:100%;height:auto;max-height:300px;object-fit:contain;border-radius:12px;background:#f8f8f8;cursor:zoom-in" onclick="showBigImg(this.src)"></div>';
        }
    }

    // 视频区域 — 点击按钮后开始加载并播放
    var videoHtml = '';
    if (hasVideo) {
        videoHtml = '<div style="margin-bottom:12px">' +
            '<button id="videoPlayCard" onclick="playDetailVideo(\'' + mediaUrl(product.video).replace(/'/g, "\\'") + '\')" style="width:100%;border:none;background:#1a1a1a;color:#fff;padding:14px 20px;border-radius:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-size:15px;transition:background 0.2s">' +
            '<span style="font-size:20px">▶</span><span>点击播放产品视频</span>' +
            '</button>' +
            '<div id="detailVideoWrap" style="display:none;margin-top:8px">' +
            '<video id="detailVideo" src="" controls playsinline preload="none" style="width:100%;max-height:360px;border-radius:12px;background:#000;opacity:0;transition:opacity 0.3s"></video>' +
            '</div>' +
            '</div>';
    }

    // 底部操作栏
    var bottomBarHtml = '';
    if (showBottomBar) {
        bottomBarHtml = '<div class="detail-bottom-bar">' +
            '<div class="detail-bottom-left">' +
            '<div class="detail-collect-btn' + (collected ? ' collected' : '') + '" id="detailCollectBtn" onclick="toggleDetailCollect(\'' + product.id + '\')">' +
            '<span class="collect-icon">' + (collected ? '★' : '☆') + '</span>' +
            '<span class="collect-text">' + (collected ? '已收藏' : '收藏') + '</span>' +
            '</div>' +
            '</div>' +
            '<div class="detail-call-btn" onclick="callMerchant(\'' + contactPhone + '\')">📞 一键拨号咨询</div>' +
            '</div>';
    }

    // 组装弹窗
    var infoHtml = '<div class="detail-info-card">' +
        '<div class="detail-price">' + priceText + '</div>' +
        '<div class="detail-meta-row">' +
        '<span class="detail-meta-tag">' + (product.category || '未分类') + '</span>' +
        (product.code ? '<span class="detail-meta-code">编码: ' + product.code + '</span>' : '') +
        '</div>' +
        (product.specification ? '<div class="detail-spec-row"><span class="detail-label">规格</span><span class="detail-value">' + product.specification + '</span></div>' : '') +
        '</div>';

    if (product.description) {
        infoHtml += '<div class="detail-desc-card">' +
            '<div class="detail-desc-title">商品描述</div>' +
            '<div class="detail-desc-text">' + product.description + '</div>' +
            '</div>';
    }

    if (product.remark) {
        infoHtml += '<div class="detail-remark-card">📌 ' + product.remark + '</div>';
    }

    var modal = document.createElement('div');
    modal.id = 'detailModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#fff;z-index:1000;overflow-y:auto';
    modal.innerHTML = '<div style="background:#fff;width:100%;max-width:500px;margin:0 auto;min-height:100%;padding-bottom:' + (showBottomBar ? '70px' : 'env(safe-area-inset-bottom, 20px)') + '">' +
        '<div style="position:sticky;top:0;z-index:10;display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#fff;border-bottom:1px solid #f0f0f0">' +
        '<h3 style="margin:0;font-size:17px;font-weight:600;color:#1a1a1a;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (product.name || '商品详情') + '</h3>' +
        '<button onclick="document.getElementById(\'detailModal\').remove()" style="border:none;background:#f0f0f0;border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:18px;color:#666;line-height:32px;text-align:center;flex-shrink:0;margin-left:8px">✕</button>' +
        '</div>' +
        '<div style="padding:16px">' + mediaHtml + videoHtml + infoHtml + '</div>' +
        '</div>' +
        (showBottomBar ? bottomBarHtml : '');

    // 轮播图初始化
    if (images.length > 1) {
        setTimeout(function() {
            var dots = modal.querySelectorAll('.carousel-dot');
            dots.forEach(function(dot) {
                dot.addEventListener('click', function() { carouselShow(parseInt(this.dataset.index)); });
            });
            _carouselIndex = 0;
            carouselShow(0);
            var carouselEl = modal.querySelector('#carouselContainer');
            if (carouselEl) {
                var startX = 0;
                carouselEl.addEventListener('touchstart', function(e) { startX = e.touches[0].clientX; }, { passive: true });
                carouselEl.addEventListener('touchend', function(e) {
                    var diff = startX - e.changedTouches[0].clientX;
                    if (Math.abs(diff) > 40) carouselGo(diff > 0 ? 1 : -1);
                }, { passive: true });
            }
        }, 100);
    }

    // 点击遮罩关闭
    modal.addEventListener('click', function(e) {
        if (e.target === modal) modal.remove();
    });

    document.body.appendChild(modal);
}

// ---- 视频点击播放 ----
function playDetailVideo(videoUrl) {
    var card = document.getElementById('videoPlayCard');
    var wrap = document.getElementById('detailVideoWrap');
    var video = document.getElementById('detailVideo');
    if (!video || !videoUrl) return;

    // 先把按钮变成加载中状态（旋转动画）
    if (card) {
        card.disabled = true;
        card.style.opacity = '0.85';
        card.innerHTML = '<span class="video-spinner"></span><span>视频加载中...</span>';
    }
    if (wrap) wrap.style.display = 'block';

    // 关键：覆盖 preload="none"，否则浏览器不下载视频
    video.preload = 'auto';
    video.src = videoUrl;

    // 强制浏览器开始加载
    video.load();

    // 加载成功后自动播放
    video.addEventListener('canplay', function onCanPlay() {
        video.removeEventListener('canplay', onCanPlay);
        if (card) card.style.display = 'none';
        video.style.opacity = '1';
        video.play().catch(function() {});
    }, { once: true });

    // 错误处理
    video.addEventListener('error', function onErr() {
        video.removeEventListener('error', onErr);
        if (card) {
            card.disabled = false;
            card.style.opacity = '1';
            card.innerHTML = '<span style="font-size:20px">▶</span><span>视频加载失败，点击重试</span>';
        }
    }, { once: true });

    // 超时处理：15秒还没加载出来就提示
    var timeout = setTimeout(function() {
        if (card && card.style.display !== 'none') {
            card.disabled = false;
            card.style.opacity = '1';
            card.innerHTML = '<span style="font-size:20px">▶</span><span>加载慢了，点击重试</span>';
        }
    }, 15000);
    video.addEventListener('canplay', function() { clearTimeout(timeout); }, { once: true });
    video.addEventListener('error', function() { clearTimeout(timeout); }, { once: true });
}

// ---- 收藏切换 ----
function toggleDetailCollect(id) {
    var added = toggleFavorite(id);
    var favs = getFavorites();
    localStorage.setItem('fav_products', JSON.stringify(favs));
    var btn = document.getElementById('detailCollectBtn');
    if (btn) {
        if (added) {
            btn.classList.add('collected');
            btn.querySelector('.collect-icon').textContent = '★';
            btn.querySelector('.collect-text').textContent = '已收藏';
        } else {
            btn.classList.remove('collected');
            btn.querySelector('.collect-icon').textContent = '☆';
            btn.querySelector('.collect-text').textContent = '收藏';
        }
    }
}

// ---- 一键拨号 ----
function callMerchant(phone) {
    if (!phone) return;
    window.location.href = 'tel:' + phone;
}

let _carouselIndex = 0;

function carouselShow(idx) {
    const slides = document.querySelectorAll('#detailModal .carousel-slide');
    const dots = document.querySelectorAll('#detailModal .carousel-dot');
    const counter = document.querySelector('#detailModal .carousel-counter');
    if (!slides.length) return;
    _carouselIndex = idx;
    slides.forEach((s, i) => s.style.display = i === idx ? 'block' : 'none');
    dots.forEach((d, i) => { d.style.background = i === idx ? '#e4393c' : '#d9d9d9'; });
    if (counter) counter.textContent = (idx + 1) + '/' + slides.length;
    const prevBtn = document.querySelector('#detailModal .carousel-prev');
    const nextBtn = document.querySelector('#detailModal .carousel-next');
    if (prevBtn) prevBtn.style.opacity = idx === 0 ? '0.3' : '0.85';
    if (nextBtn) nextBtn.style.opacity = idx === slides.length - 1 ? '0.3' : '0.85';
}

function carouselGo(dir) {
    const slides = document.querySelectorAll('#detailModal .carousel-slide');
    if (!slides.length) return;
    let idx = _carouselIndex + dir;
    if (idx < 0 || idx >= slides.length) return;
    carouselShow(idx);
}

// img fullscreen
function showBigImg(src){var v=document.createElement("div");v.style.cssText="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,1);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:zoom-out";var img=document.createElement("img");img.src=src;img.style.cssText="max-width:100%;max-height:100%;object-fit:contain";v.appendChild(img);v.addEventListener("click",function(){v.remove()});document.body.appendChild(v)}