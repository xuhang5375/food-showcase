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
// ---- 网页访客埋点 ----
// 视图停留状态机：当前停留视图可以是「分类列表(category)」或「商品详情(detail)」
// 切换视图时自动结算上一个视图的停留时长（分类列表直接展示图文视频价格，不一定点详情）
var viewState = null; // { type:'category'|'detail', id, name, startTime, logPromise }

function getCurrentCatLabel(name) {
    var c = categories.find(function(x) { return x.name === name; });
    return c ? c.label : name;
}

// 结束上一个视图（记录停留时长），开始一个新视图
function startView(type, id, name) {
    if (viewState && viewState.startTime) flushView();
    viewState = { type: type, id: id, name: name, startTime: Date.now(), logPromise: logVisitor(type + '|||' + id + '|||' + name) };
}

// 结算当前视图停留时长（异步写库，不阻塞 UI）
function flushView() {
    if (!viewState || !viewState.startTime || !viewState.logPromise) return;
    var vs = viewState;
    var dur = Math.max(0, Math.round((Date.now() - vs.startTime) / 1000));
    vs.startTime = 0; // 标记已结算，防止重复结算
    vs.logPromise.then(function(id) {
        if (id) {
            fetch(SUPABASE_URL + '/rest/v1/visitor_logs?id=eq.' + encodeURIComponent(id), {
                method: 'PATCH',
                headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({ page: vs.type + '|||' + vs.id + '|||' + vs.name + '|||dur=' + dur + 's' })
            }).catch(function(e) { console.warn('停留时长记录失败:', e); });
        }
    }).catch(function() {});
}

// 结束当前视图（结算并清空）
function endView() {
    if (viewState && viewState.startTime) flushView();
    viewState = null;
}

function getWebVisitorId() {
    try {
        var id = localStorage.getItem('web_visitor_id');
        if (!id) {
            id = 'web_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
            localStorage.setItem('web_visitor_id', id);
        }
        return id;
    } catch (e) {
        return 'web_anon_' + Math.random().toString(36).slice(2, 8);
    }
}

// 记录一条访客日志，返回 Promise<rowId|null>
function logVisitor(pageVal) {
    // 过滤：进过管理后台的本机设备不计入访客（运营者自身流量排除）
    try { if (localStorage.getItem('wb_admin_device') === '1') return Promise.resolve(null); } catch (e) {}
    return fetch(SUPABASE_URL + '/rest/v1/visitor_logs', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify([{ openid: getWebVisitorId(), name: '网页访客', phone: '00000000000', visit_time: new Date().toISOString(), page: pageVal }])
    }).then(function(r) { return r.json(); })
      .then(function(d) { return (d && d[0]) ? d[0].id : null; })
      .catch(function(e) { console.warn('访客记录失败:', e); return null; });
}

// 关闭商品详情弹层：结算详情停留，回到列表重新开始计当前分类停留
async function closeDetailModal() {
    var modal = document.getElementById('detailModal');
    if (!modal) return;
    modal.remove();
    endView(); // 结算详情停留
    startView('category', currentCategory, getCurrentCatLabel(currentCategory)); // 回到列表继续计分类停留
}

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
        // 记录一次网页访问（每会话仅一次，避免刷新刷屏）
        try { if (!sessionStorage.getItem('web_visit_logged')) { logVisitor('index'); sessionStorage.setItem('web_visit_logged', '1'); } } catch (e) {}
        // 开始记录「全部」分类列表的停留时长
        startView('category', 'all', '全部');
        // 标签页切走/切回：精确结算停留（避免后台挂着仍计时）
        document.addEventListener('visibilitychange', function() {
            var dm = document.getElementById('detailModal');
            if (document.hidden) {
                endView();
            } else if (dm) {
                var pid = dm.dataset.pid;
                var p = allProducts.find(function(x) { return String(x.id) === String(pid); });
                if (p) startView('detail', p.id, p.name || '');
            } else {
                startView('category', currentCategory, getCurrentCatLabel(currentCategory));
            }
        });
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
            startView('category', currentCategory, item.textContent.trim()); // 结算旧分类停留，开始新分类计时
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

    // 记录商品浏览开始：暂停列表停留，开始详情停留计时
    startView('detail', product.id, product.name || '');

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

    // 视频区域 — 渲染时即预载视频（preload=auto），点击按钮即播放，几乎无等待
    // 保留「点击播放产品视频」按钮作为覆盖层 UI，但底层 video 已在后台缓冲
    var videoHtml = '';
    if (hasVideo) {
        // 首帧封面：用商品第一张图作 poster，点开先看到图不黑屏（缓冲期间也显示）
        var _poster = (images && images.length > 0) ? mediaUrl(images[0]) : '';
        videoHtml = '<div style="position:relative;margin-bottom:12px;background:#000;border-radius:12px;overflow:hidden">' +
            '<video id="detailVideo" src="' + mediaUrl(product.video) + '" poster="' + _poster + '" controls playsinline preload="auto" style="width:100%;max-height:360px;display:block;background:#000"></video>' +
            '<button id="videoPlayCard" onclick="playDetailVideo()" style="position:absolute;inset:0;width:100%;height:100%;border:none;background:rgba(0,0,0,0.45);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-size:15px;transition:opacity 0.2s">' +
            '<span style="font-size:22px">▶</span><span>点击播放产品视频</span>' +
            '</button>' +
            '<div id="videoLoading" style="position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(0,0,0,0.55);color:#fff;font-size:14px">' +
            '<div style="width:34px;height:34px;border:3px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.8s linear infinite"></div>' +
            '<span>视频加载中…</span>' +
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
    modal.dataset.pid = product.id; // 供标签页切回时重开详情计时
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#fff;z-index:1000;overflow-y:auto';
    modal.innerHTML = '<div style="background:#fff;width:100%;max-width:500px;margin:0 auto;min-height:100%;padding-bottom:' + (showBottomBar ? '70px' : 'env(safe-area-inset-bottom, 20px)') + '">' +
        '<div style="position:sticky;top:0;z-index:10;display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#fff;border-bottom:1px solid #f0f0f0">' +
        '<h3 style="margin:0;font-size:17px;font-weight:600;color:#1a1a1a;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (product.name || '商品详情') + '</h3>' +
        '<button onclick="closeDetailModal()" style="border:none;background:#f0f0f0;border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:18px;color:#666;line-height:32px;text-align:center;flex-shrink:0;margin-left:8px">✕</button>' +
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
        if (e.target === modal) closeDetailModal();
    });

    document.body.appendChild(modal);
}

// ---- 视频点击播放 ----
// 视频在渲染时已经 preload=auto 后台缓冲，这里隐藏按钮 + 显示加载提示 + 直接播放
function playDetailVideo() {
    var card = document.getElementById('videoPlayCard');
    var video = document.getElementById('detailVideo');
    var loading = document.getElementById('videoLoading');
    if (!video) return;

    // 隐藏「点击播放」覆盖层
    if (card) {
        card.style.opacity = '0';
        setTimeout(function() { if (card) card.style.display = 'none'; }, 200);
    }

    // 缓冲期间显示「视频加载中」提示
    if (loading) loading.style.display = 'flex';

    // 缓冲完成/可播放时隐藏提示；播放中再次缓冲（卡顿）时重新显示
    video.addEventListener('playing', function() { if (loading) loading.style.display = 'none'; });
    video.addEventListener('canplay', function() { if (loading) loading.style.display = 'none'; });
    video.addEventListener('waiting', function() { if (loading) loading.style.display = 'flex'; });

    // 已缓冲好，直接播放；没缓冲完浏览器会自动等 canplay 再播
    var p = video.play();
    if (p && p.catch) {
        p.catch(function() {
            // 自动播放被拦截（如未静音），用户手动点一下控制条即可
            if (loading) loading.style.display = 'none';
        });
    }
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