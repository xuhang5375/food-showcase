// ========================================
// 食材采购 - 前台展示页逻辑
// ========================================

// Supabase 配置（硬编码，不依赖 CDN）
var SUPABASE_URL = 'https://rihlfwgrqdxgygyvatda.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpaGxmd2dycWR4Z3lneXZhdGRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NTgwMTksImV4cCI6MjA5NzMzNDAxOX0.rwtwihYhMNtuW4xzemZUkeTD3YOhswpThr8A2ieJfZs';
var TABLE_NAME = 'food_showcase_products';

let allProducts = [];
let categories = [];
let currentCategory = 'all';
let searchKeyword = '';
let videoEnabled = true;
let visitorEnabled = false; // 访客弹窗开关，从 app_config 读取 // 默认显示视频，从 app_config 读取后覆盖

// ---- 初始化 ----
(async function init() {
    try {
        // 读取视频开关配置
        try {
            const _cfgResp = await fetch(SUPABASE_URL + '/rest/v1/app_config?select=value&key=eq.video_enabled&limit=1', {
                headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY }
            });
            const _cfgData = await _cfgResp.json();
            const data = Array.isArray(_cfgData) ? _cfgData[0] : _cfgData;
            if (!data) {
                console.warn('读取 video_enabled 配置失败，使用默认值');
            } else {
                videoEnabled = data.value === 'true';
            }
        } catch (e) {
            console.warn('读取 video_enabled 配置失败，使用默认值:', e);
        }
        await loadProducts();
        buildCategoryNav();
        renderProducts();
        bindEvents();


        // 访客弹窗

        if (visitorEnabled && !localStorage.getItem('visitor_submitted')) {

          showVisitorPopup();

        }
    } catch (err) {
        console.error('初始化失败:', err);
        const el = document.getElementById('products');
        if (el) el.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>加载失败，<a href="javascript:location.reload()">点击刷新</a></p></div>';
    }
})();

var COS_CDN_URL = window.COS_CDN_URL || 'https://799195375-1306702381.cos.ap-guangzhou.myqcloud.com';

function mediaUrl(url) {
    if (!url) return url;
    // 已是 http(s) URL
    if (url.indexOf('http://') === 0 || url.indexOf('https://') === 0) {
        // COS 图片 URL → 迁移到 Supabase Storage
        if (url.indexOf('799195375-1306702381') !== -1 && url.indexOf('.mp4') === -1) {
            var filename = url.split('/').pop();
            return 'https://rihlfwgrqdxgygyvatda.supabase.co/storage/v1/object/public/xiaochengxu/images/' + filename;
        }
        return url;
    }
    // 相对路径（如 "img/product_6_1.jpg" 或 "uploads/xxx.png"）
    if (url.indexOf('/') !== 0) {
        return 'https://rihlfwgrqdxgygyvatda.supabase.co/storage/v1/object/public/xiaochengxu/' + url;
    }
    return url;
}

// ---- 加载商品数据 ----
async function loadProducts() {
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const _resp = await fetch(SUPABASE_URL + '/rest/v1/' + TABLE_NAME + '?select=*&order=created_at.asc', {
                headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY }
            });
            if (!_resp.ok) throw new Error('HTTP ' + _resp.status);
            const data = await _resp.json();

            // products 表结构: id, name, price(数字), tag, unit, images[], cover_image, video, created_at
            // 过滤：保留有名称的商品
            allProducts = (data || []).filter(p => p.name);
            if (allProducts.length === 0) {
                document.getElementById('products').innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>暂无商品</p></div>';
                return;
            }

            allProducts.sort((a, b) => {
                const priceA = parseFloat(a.price) || 0;
                const priceB = parseFloat(b.price) || 0;
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
            (p.category || '').toLowerCase().includes(kw) ||
            (p.unit || '').toLowerCase().includes(kw)
        );
    }
    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>暂无商品</p></div>';
        return;
    }

    let html = '<div class="product-grid">';
    filtered.forEach(p => {
        let priceText = '-';
        if (p.price != null) {
            const unit = p.unit ? '/' + p.unit : '';
            priceText = '¥' + p.price + unit;
        }
        let firstImg = '';
        if (Array.isArray(p.images) && p.images.length > 0) {
            firstImg = mediaUrl(p.images[0]);
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
        let videoBadge = '';
        if (videoEnabled && p.video) {
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
            (p.unit ? '<div class="product-spec" style="color:#666;font-size:12px;margin-top:2px">' + p.unit + '</div>' : '') +
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
    if (product.price != null) {
        const unit = product.unit ? '/' + product.unit : '';
        priceText = '¥' + product.price + unit;
    }

    let allMedia = [];
    if (Array.isArray(product.images) && product.images.length > 0) {
        product.images.forEach(url => { allMedia.push({ type: 'image', url: url }); });
    } else if (product.cover_image) {
        allMedia.push({ type: 'image', url: product.cover_image });
    }
    if (videoEnabled && product.video) {
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
                '<button class="carousel-prev" onclick="carouselGo(-1)" style="position:absolute;left:4px;top:50%;transform:translateY(-50%);width:36px;height:36px;border:none;background:rgba(0,0,0,0.6);color:#fff;font-size:20px;border-radius:50%;cursor:pointer;z-index:2;opacity:0.85;box-shadow:0 2px 6px rgba(0,0,0,0.3);font-weight:bold">‹</button>' +
                '<button class="carousel-next" onclick="carouselGo(1)" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);width:36px;height:36px;border:none;background:rgba(0,0,0,0.6);color:#fff;font-size:20px;border-radius:50%;cursor:pointer;z-index:2;opacity:0.85;box-shadow:0 2px 6px rgba(0,0,0,0.3);font-weight:bold">›</button>' +
                '<div class="carousel-counter" style="position:absolute;right:8px;top:8px;background:rgba(0,0,0,0.55);color:#fff;font-size:12px;padding:2px 7px;border-radius:10px;z-index:2">1/' + allMedia.length + '</div>' +
                '<div class="carousel-dots" style="text-align:center;margin-top:8px">' + dotsHtml + '</div>' +
                '<div style="text-align:center;color:#999;font-size:12px;margin-top:4px">← 左右滑动或点击箭头切换 →</div>' +
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
        (product.unit ? '<div style="color:#666;font-size:13px;margin-top:4px">规格: ' + product.unit + '</div>' : '') +
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


  // ---- 访客弹窗 ----
  function showVisitorPopup() {
    // 创建遮罩
    var overlay = document.createElement('div');
    overlay.id = 'visitorPopup';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
    
    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:12px;padding:28px 24px;width:90%;max-width:340px;box-shadow:0 8px 32px rgba(0,0,0,0.18);position:relative;';
    
    box.innerHTML = `
      <h3 style="margin:0 0 18px 0;font-size:18px;color:#333;text-align:center;">访客登记</h3>
      <div style="margin-bottom:14px;">
        <input id="visitorName" type="text" placeholder="您的姓名（选填）" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:6px;font-size:15px;box-sizing:border-box;">
      </div>
      <div style="margin-bottom:18px;">
        <input id="visitorPhone" type="tel" placeholder="联系电话（必填）" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:6px;font-size:15px;box-sizing:border-box;">
      </div>
      <button id="visitorSubmitBtn" onclick="submitVisitor()" style="width:100%;padding:11px 0;background:#4caf50;color:#fff;border:none;border-radius:6px;font-size:16px;cursor:pointer;">提交</button>
      <button onclick="closeVisitorPopup()" style="width:100%;padding:9px 0;background:transparent;color:#999;border:1px solid #ddd;border-radius:6px;font-size:14px;cursor:pointer;margin-top:10px;">暂不登记</button>
    `;
    
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    
    // 点击遮罩关闭
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeVisitorPopup();
    });
  }
  
  function closeVisitorPopup() {
    var el = document.getElementById('visitorPopup');
    if (el) el.remove();
  }
  
  async function submitVisitor() {
    var name = (document.getElementById('visitorName').value || '').trim();
    var phone = (document.getElementById('visitorPhone').value || '').trim();
    if (!phone) { alert('请填写联系电话'); return; }
    var btn = document.getElementById('visitorSubmitBtn');
    btn.disabled = true;
    btn.textContent = '提交中...';
    try {
      var now = new Date().toISOString();
      var body = { name: name || '匿名', phone: phone, visit_time: now, page: '前台', openid: 'web' };
      var resp = await fetch(SUPABASE_URL + '/rest/v1/visitor_logs', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(body)
      });
      if (!resp.ok) throw new Error('提交失败(' + resp.status + ')');
      localStorage.setItem('visitor_submitted', 'true');
      closeVisitorPopup();
      // 轻提示
      var t = document.createElement('div');
      t.textContent = '登记成功，感谢！';
      t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 24px;border-radius:8px;z-index:10001;font-size:14px;';
      document.body.appendChild(t);
      setTimeout(function() { t.remove(); }, 2000);
    } catch (e) {
      alert('提交失败: ' + e.message);
      btn.disabled = false;
      btn.textContent = '提交';
    }
  }
  
