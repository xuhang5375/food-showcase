// ========================================
// 椋熸潗閲囪喘 - 鍓嶅彴灞曠ず椤甸€昏緫
// 宸︿晶鍒嗙被瀵艰埅 + 鍙充晶鍟嗗搧鍒楄〃 + 鎼滅储 + 澶氬浘杞挱
// ========================================

function getSupabase() { return window.supabase; }
var TABLE_NAME = window.TABLE_NAME || 'food_showcase_products';

let allProducts = [];
let categories = [];
let currentCategory = 'all';
let searchKeyword = '';

// ---- 鍒濆鍖?----
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
                console.error('Supabase 鍒濆鍖栬秴鏃?);
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

var COS_CDN_URL = window.COS_CDN_URL || 'https://799195375-1306702381.cos.ap-guangzhou.myqcloud.com';

function mediaUrl(url) {
    if (!url) return url;
    // 宸叉槸 COS URL
    if (url.indexOf('799195375-1306702381') !== -1) return url;
    // 涓达拷锟斤細灏嗘棫 Supabase Storage URL 閲嶅啓涓?COS CDN锛堣縼绉诲畬鎴愬墠鍏滃簳锛?
    var supPrefix = 'infsqrfqksvqzlapvott.supabase.co/storage/v1/object/public/product-media/';
    if (url.indexOf(supPrefix) !== -1) {
        var rest = url.split(supPrefix)[1];
        if (rest) return 'https://799195375-1306702381.cos.ap-guangzhou.myqcloud.com/' + rest;
    }
    return url;
}

// ---- 鍔犺浇鍟嗗搧鏁版嵁 ----
async function loadProducts() {
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const { data, error } = await getSupabase()
                .from(TABLE_NAME)
                .select('*')
                .neq('is_active', false)
                .order('created_at', { ascending: true });

            if (error) throw error;

            allProducts = data || [];
            if (allProducts.length === 0) {
                document.getElementById('products').innerHTML = '<div class="empty-state"><div class="empty-icon">馃摝</div><p>鏆傛棤鍟嗗搧</p></div>';
                return;
            }

            allProducts.sort((a, b) => {
                const priceA = a.price ? parseFloat(a.price.split('/')[0]) || 0 : 0;
                const priceB = b.price ? parseFloat(b.price.split('/')[0]) || 0 : 0;
                return priceA - priceB;
            });

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

            categories = [{ name: 'all', label: '鍏ㄩ儴' }];
            const parentOrder = ['姣涜倸绯诲垪', '鍗冨眰绯诲垪', '榛戝崈灞?, '鐧藉崈灞?, '铏炬粦', '鑲夌被', '鍏朵粬'];
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

            buildCategoryNav();
            renderProducts();
            return;
        } catch (e) {
            lastError = e;
            if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 1000));
        }
    }

    console.error('鍔犺浇澶辫触:', lastError);
    document.getElementById('products').innerHTML =
        '<div class="empty-state"><div class="empty-icon">鈿狅笍</div><p>鍔犺浇澶辫触锛岃鍒锋柊閲嶈瘯</p></div>';
}

// ---- 鏋勫缓鍒嗙被瀵艰埅 ----
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

// ---- 娓叉煋鍟嗗搧鍒楄〃 ----
function renderProducts() {
    const container = document.getElementById('products');
    if (!container) return;

    let filtered = allProducts;

    // 鍒嗙被绛涢€?
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

    // 鎼滅储绛涢€?
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
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">馃摝</div><p>鏆傛棤鍟嗗搧</p></div>';
        return;
    }

    let html = '<div class="product-grid">';
    filtered.forEach(p => {
        let priceText = '-';
        if (p.price) {
            const pp = p.price.split('/');
            priceText = pp[0] ? (pp[1] ? pp[0] + '/鍏? + pp[1] : pp[0]) : '-';
        }

        // 鑾峰彇绗竴寮犲浘鐗囦綔涓哄皝闈?
        let firstImg = '';
        if (Array.isArray(p.images) && p.images.length > 0) {
            firstImg = mediaUrl(p.images[0]);
        } else if (p.image_url) {
            firstImg = mediaUrl(p.image_url);
        }
        
        let coverHtml = firstImg
            ? '<img src="' + firstImg + '" onerror="this.style.display=\'none\'">'
            : '<div class="no-image">馃摝</div>';

        // 澶氬浘鏍囪
        let multiBadge = '';
        if (Array.isArray(p.images) && p.images.length > 1) {
            multiBadge = '<div class="multi-badge">' + p.images.length + '鍥?/div>';
        }

        // 瑙嗛鏍囪
        let videoBadge = '';
        if (p.video_url) {
            videoBadge = '<div class="video-badge">鈻?/div>';
        }

        html += '<div class="product-card" data-id="' + p.id + '">' +
            '<div class="product-cover">' + coverHtml + multiBadge + videoBadge + '</div>' +
            '<div class="product-info">' +
            '<div class="product-name">' + (p.name || '鏈懡鍚?) + '</div>' +
            '<div class="product-meta">' +
            '<span class="product-category">' + (p.category || '鏈垎绫?) + '</span>' +
            '</div>' +
            '<div class="product-price">' + priceText + '</div>' +
            (p.specification ? '<div class="product-spec" style="color:#666;font-size:12px;margin-top:2px">' + p.specification + '</div>' : '') +
            '</div>' +
            '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
}

// ---- 缁戝畾浜嬩欢 ----
function bindEvents() {
    // 鍒嗙被鐐瑰嚮
    document.getElementById('categoryNav').addEventListener('click', function(e) {
        const item = e.target.closest('.category-item');
        if (!item) return;
        currentCategory = item.dataset.category;
        document.querySelectorAll('.category-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        renderProducts();
    });

    // 鎼滅储
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            searchKeyword = e.target.value.trim();
            renderProducts();
        });
    }

    // 鍟嗗搧鍗＄墖鐐瑰嚮锛堟樉绀鸿鎯?瑙嗛锛?
    document.getElementById('products').addEventListener('click', function(e) {
        const card = e.target.closest('.product-card');
        if (!card) return;
        const id = card.dataset.id;
        const product = allProducts.find(p => p.id === id);
        if (product) showProductDetail(product);
    });
}

function showProductDetail(product) {
    // 绉婚櫎宸叉湁寮圭獥
    const existing = document.getElementById('detailModal');
    if (existing) existing.remove();

    let priceText = '-';
    if (product.price) {
        const pp = product.price.split('/');
        priceText = pp[0] ? (pp[1] ? pp[0] + '/鍏? + pp[1] : pp[0]) : '-';
    }

    // 鏀堕泦鎵€鏈夊獟浣?
    let allMedia = [];
    if (Array.isArray(product.images) && product.images.length > 0) {
        product.images.forEach(url => { allMedia.push({ type: 'image', url: url }); });
    } else if (product.image_url) {
        allMedia.push({ type: 'image', url: product.image_url });
    }
    if (product.video_url) {
        allMedia.push({ type: 'video', url: product.video_url });
    }

    // 鏋勫缓濯掍綋鍖哄煙
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
                '<button class="carousel-prev" onclick="carouselGo(-1)" style="position:absolute;left:4px;top:50%;transform:translateY(-50%);width:32px;height:32px;border:none;background:rgba(0,0,0,0.45);color:#fff;font-size:18px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2;opacity:0.7">鈥?/button>' +
                '<button class="carousel-next" onclick="carouselGo(1)" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);width:32px;height:32px;border:none;background:rgba(0,0,0,0.45);color:#fff;font-size:18px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2;opacity:0.7">鈥?/button>' +
                '<div class="carousel-counter" style="position:absolute;right:8px;top:8px;background:rgba(0,0,0,0.55);color:#fff;font-size:12px;padding:2px 7px;border-radius:10px;z-index:2">1/' + allMedia.length + '</div>' +
                '<div class="carousel-dots" style="text-align:center;margin-top:8px">' + dotsHtml + '</div>' +
                '</div>';
        } else {
            if (allMedia[0].type === 'video') {
                mediaHtml = '<div style="margin-bottom:12px"><video src="' + mediaUrl(allMedia[0].url) + '" controls playsinline preload="none" muted style="width:100%;max-height:300px;border-radius:8px;background:#000"></video></div>';
            } else {
                mediaHtml = '<div style="margin-bottom:12px"><img src="' + mediaUrl(allMedia[0].url) + '" style="width:100%;max-width:100%;height:auto;border-radius:8px"></div>';
            }
        }
    }

    const modal = document.createElement('div');
    modal.id = 'detailModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:1000';
    modal.innerHTML = '<div style="background:#fff;border-radius:12px;max-width:400px;width:90%;max-height:80vh;overflow-y:auto;padding:20px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
        '<h3 style="margin:0;font-size:18px">' + (product.name || '鍟嗗搧璇︽儏') + '</h3>' +
        '<button onclick="document.getElementById(\'detailModal\').remove()" style="border:none;background:#eee;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:16px">脳</button>' +
        '</div>' + mediaHtml +
        '<div style="color:#888;font-size:13px;margin-bottom:6px">鍒嗙被: ' + (product.category || '鏈垎绫?) + '</div>' +
        '<div style="color:#f60;font-size:20px;font-weight:600;margin-bottom:8px">' + priceText + '</div>' +
        (product.code ? '<div style="color:#888;font-size:12px">缂栫爜: ' + product.code + '</div>' : '') +
        (product.specification ? '<div style="color:#666;font-size:13px;margin-top:4px">瑙勬牸: ' + product.specification + '</div>' : '') +
        (product.description ? '<div style="color:#666;font-size:14px;margin-top:12px;line-height:1.5">' + product.description + '</div>' : '') +
        (product.remark ? '<div style="color:#e6a23c;font-size:13px;margin-top:8px;line-height:1.5">馃摑 ' + product.remark + '</div>' : '') +
        '</div>';

    // 鍦嗙偣鐐瑰嚮 + 瑙︽懜婊戝姩锛堢粺涓€鐢?carouselShow锛?
    if (allMedia.length > 1) {
        modal.querySelectorAll('.carousel-dot').forEach(dot => {
            dot.addEventListener('click', function() { carouselShow(parseInt(this.dataset.index)); });
        });
        _carouselIndex = 0;
        carouselShow(0);
        const carouselEl = modal.querySelector('#carouselContainer');
        if (carouselEl) {
            let startX = 0;
            carouselEl.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, {passive:true});
            carouselEl.addEventListener('touchend', (e) => {
                const diff = startX - e.changedTouches[0].clientX;
                if (Math.abs(diff) > 40) carouselGo(diff > 0 ? 1 : -1);
            }, {passive:true});
        }
    }

    modal.addEventListener('click', function(e) {
        if (e.target === modal) modal.remove();
    });
    document.body.appendChild(modal);
}

// ---- 杞挱瀵艰埅锛堝叏灞€鍑芥暟锛屼緵绠ご鎸夐挳鍜屾粦鍔ㄨ皟鐢級 ----
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
