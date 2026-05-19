// ========================================
// 椋熸潗閲囪喘 - 鍓嶅彴灞曠ず椤甸€昏緫
// 宸︿晶鍒嗙被瀵艰埅 + 鍙充晶鍟嗗搧鍒楄〃 + 鎼滅储
// ========================================

var supabase = window.supabase;
var TABLE_NAME = window.TABLE_NAME;

let allProducts = [];
let categories = [];       // [{name, label, parent?}]
let currentCategory = 'all';
let searchKeyword = '';

// ---- 鍒濆鍖?----
(async function init() {
    await loadProducts();
    buildCategoryNav();
    renderProducts();
    bindEvents();
})();

// ---- 鍔犺浇鍟嗗搧鏁版嵁 ----
async function loadProducts() {
    const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('*')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('鍔犺浇澶辫触:', error);
        document.getElementById('products').innerHTML =
            '<div class="empty-state"><div class="empty-icon">鈿?/div><p>鍔犺浇澶辫触锛岃鍒锋柊閲嶈瘯</p></div>';
        return;
    }

    allProducts = data || [];

    // 鎸変环鏍兼暟瀛楅儴鍒嗘帓搴忥紙浠庝綆鍒伴珮锛?
    allProducts.sort((a, b) => {
        const priceA = a.price ? parseFloat(a.price.split('/')[0]) || 0 : 0;
        const priceB = b.price ? parseFloat(b.price.split('/')[0]) || 0 : 0;
        return priceA - priceB;
    });

    // 浠庢暟鎹腑鎻愬彇鍒嗙被锛堟敮鎸佺埗瀛愬垎绫绘牸寮忥細鐖剁被/瀛愮被锛?
    const catSet = new Set();
    const subMap = {}; // 鐖剁被 -> [瀛愮被闆嗗悎]
    allProducts.forEach(p => {
        const cat = (p.category || '').trim();
        if (!cat) return;
        if (cat.includes('/')) {
            const parts = cat.split('/');
            const parent = parts[0].trim();
            const child = parts.slice(1).join('/').trim();
            catSet.add(parent);
            if (!subMap[parent]) subMap[parent] = new Set();
            subMap[parent].add(child);
        } else {
            catSet.add(cat);
        }
    });

    // 鏋勫缓鍒嗙被鏍?
    categories = [{ name: 'all', label: '鍏ㄩ儴' }];
    Array.from(catSet).sort().forEach(parent => {
        categories.push({ name: parent, label: parent });
        if (subMap[parent]) {
            Array.from(subMap[parent]).sort().forEach(sub => {
                categories.push({ name: parent + '/' + sub, label: sub, parent: parent });
            });
        }
    });
}

// ---- 鏋勫缓宸︿晶鍒嗙被瀵艰埅 ----
function buildCategoryNav() {
    const nav = document.getElementById('categoryNav');
    nav.innerHTML = categories.map((cat, i) => `
        <div class="category-item ${cat.name === currentCategory ? 'active' : ''} ${cat.parent ? 'sub' : ''}"
             data-cat="${cat.name}" onclick="selectCategory('${cat.name}')">
            ${cat.label}
        </div>
    `).join('');
}

// ---- 閫夋嫨鍒嗙被 ----
function selectCategory(catName) {
    currentCategory = catName;

    // 鏇存柊瀵艰埅楂樹寒
    document.querySelectorAll('.category-item').forEach(el => {
        el.classList.toggle('active', el.dataset.cat === catName);
    });

    // 鏇存柊鏍囬
    const cat = categories.find(c => c.name === catName);
    document.getElementById('currentCategoryTitle').textContent = cat ? cat.label : '鍏ㄩ儴';

    // 濡傛灉閫変腑鐨勬槸瀛愬垎绫伙紝婊氬姩鍒板搴旂埗鍒嗙被鍖哄煙
    if (cat && cat.parent) {
        const parentEl = document.querySelector(`.category-item[data-cat="${cat.parent}"]`);
        if (parentEl) parentEl.scrollIntoView({ block: 'nearest' });
    }

    renderProducts();
}

// ---- 娓叉煋鍟嗗搧鍒楄〃 ----
function renderProducts() {
    let filtered = allProducts;

    // 鍒嗙被绛涢€?
    if (currentCategory !== 'all') {
        filtered = filtered.filter(p => {
            const pc = (p.category || '').trim();
            if (currentCategory.includes('/')) {
                return pc === currentCategory;
            }
            // 閫変腑鐖剁被鏃讹紝鏄剧ず璇ョ埗绫讳笅鎵€鏈夊瓙绫荤殑鍟嗗搧
            return pc === currentCategory || pc.startsWith(currentCategory + '/');
        });
    }

    // 鎼滅储杩囨护
    if (searchKeyword) {
        const kw = searchKeyword.toLowerCase();
        filtered = filtered.filter(p =>
            (p.name || '').toLowerCase().includes(kw) ||
            (p.code || '').toLowerCase().includes(kw) ||
            (p.specification || '').toLowerCase().includes(kw) ||
            (p.description || '').toLowerCase().includes(kw)
        );
    }

    const container = document.getElementById('products');

    if (!filtered.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">馃摝</div><p>鏆傛棤鍟嗗搧</p></div>';
        return;
    }

    container.innerHTML = filtered.map(p => {
        // 浠锋牸鏄剧ず锛歱rice 瀛楁瀛?"鏁板瓧/鍗曚綅" 鏍煎紡
        let priceHtml = '';
        if (p.price) {
            const priceParts = p.price.split('/');
            const num = priceParts[0] || '';
            const unit = priceParts[1] || '';
            priceHtml = `<span class="product-price">${num}<span class="price-unit">鍏?${unit}</span></span>`;
        }

        return `
        <div class="product-card" onclick="showDetail('${p.id}')">
            <div class="product-img-wrap">
                ${p.image_url
                    ? `<img src="${p.image_url}" alt="${escapeHtml(p.name)}" loading="lazy">`
                    : '<span class="no-img-text">鏆傛棤鍥剧墖</span>'}
            </div>
            <div class="product-info">
                <div class="product-name">${escapeHtml(p.name)}</div>
                ${p.specification ? `<div class="product-spec">${escapeHtml(p.specification)}</div>` : ''}
                ${p.code ? `<div class="product-code">缂栧彿锛?{escapeHtml(p.code)}</div>` : ''}
                <div class="product-price-row">
                    ${priceHtml}
                    <span class="login-hint" onclick="event.stopPropagation()">鐧诲綍鏌ョ湅浠锋牸 鈻?/span>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

// ---- 鍟嗗搧璇︽儏寮圭獥 ----
function showDetail(id) {
    const p = allProducts.find(x => x.id === id);
    if (!p) return;

    let priceHtml = '';
    if (p.price) {
        const pp = p.price.split('/');
        priceHtml = `<span class="detail-price">${pp[0]}<span class="unit">鍏?${pp[1]}</span></span>`;
    }

    let videoHtml = '';
    if (p.video_url) {
        videoHtml = `
        <div class="detail-video">
            <video controls preload="metadata" poster="${p.image_url || ''}">
                <source src="${p.video_url}" type="video/mp4">
            </video>
        </div>`;
    }

    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        ${p.image_url ? `<img class="detail-img" src="${p.image_url}" alt="${escapeHtml(p.name)}">` : ''}
        <div class="detail-content">
            <div class="detail-name">${escapeHtml(p.name)}</div>
            ${p.description ? `<div class="detail-desc">${escapeHtml(p.description).replace(/\n/g, '<br>')}</div>` : ''}
            <div class="detail-meta">
                ${p.category ? `<span>鍒嗙被锛?{escapeHtml(p.category)}</span>` : ''}
                ${p.specification ? `<span>瑙勬牸锛?{escapeHtml(p.specification)}</span>` : ''}
                ${p.code ? `<span>缂栧彿锛?{escapeHtml(p.code)}</span>` : ''}
            </div>
            ${priceHtml}
            ${videoHtml}
        </div>
    `;

    document.getElementById('detailModal').style.display = 'flex';

    // 闃绘鑳屾櫙婊氬姩
    document.body.style.overflow = 'hidden';
}

function closeDetailModal() {
    document.getElementById('detailModal').style.display = 'none';
    document.body.style.overflow = '';

    // 鍋滄瑙嗛鎾斁
    const v = document.querySelector('#modalBody video');
    if (v) { v.pause(); v.currentTime = 0; }
    document.getElementById('modalBody').innerHTML = '';
}

// ---- 鎼滅储鍔熻兘 ----
function handleSearch() {
    const input = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClear');

    searchKeyword = input.value.trim();
    clearBtn.style.display = searchKeyword ? 'block' : 'none';

    // 鎼滅储鏃惰嚜鍔ㄥ垏鎹㈠埌"鍏ㄩ儴"
    if (searchKeyword && currentCategory !== 'all') {
        selectCategory('all');
    } else {
        renderProducts();
    }
}

// ---- 浜嬩欢缁戝畾 ----
function bindEvents() {
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');

    // 鎼滅储杈撳叆锛堥槻鎶栵級
    let searchTimer = null;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(handleSearch, 300);
    });

    // 娓呴櫎鎼滅储
    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchClear.style.display = 'none';
        searchKeyword = '';
        renderProducts();
    });

    // 鐐瑰嚮閬僵鍏抽棴璇︽儏
    document.getElementById('detailModal').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeDetailModal();
    });

    // ESC 鍏抽棴
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeDetailModal();
    });
}

// ---- 宸ュ叿鍑芥暟 ----
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
