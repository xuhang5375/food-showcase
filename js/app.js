// ========================================
// 食材采购 - 前台展示页逻辑
// 左侧分类导航 + 右侧商品列表 + 搜索
// ========================================

var supabase = window.supabase;
var TABLE_NAME = window.TABLE_NAME;

let allProducts = [];
let categories = [];       // [{name, label, parent?}]
let currentCategory = 'all';
let searchKeyword = '';

// ---- 初始化 ----
(async function init() {
    await loadProducts();
    buildCategoryNav();
    renderProducts();
    bindEvents();
})();

// ---- 加载商品数据 ----
async function loadProducts() {
    const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('*')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('加载失败:', error);
        document.getElementById('products').innerHTML =
            '<div class="empty-state"><div class="empty-icon">⚠</div><p>加载失败，请刷新重试</p></div>';
        return;
    }

    allProducts = data || [];

    // 从数据中提取分类（支持父子分类格式：父类/子类）
    const catSet = new Set();
    const subMap = {}; // 父类 -> [子类集合]
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

    // 构建分类树
    categories = [{ name: 'all', label: '全部' }];
    Array.from(catSet).sort().forEach(parent => {
        categories.push({ name: parent, label: parent });
        if (subMap[parent]) {
            Array.from(subMap[parent]).sort().forEach(sub => {
                categories.push({ name: parent + '/' + sub, label: sub, parent: parent });
            });
        }
    });
}

// ---- 构建左侧分类导航 ----
function buildCategoryNav() {
    const nav = document.getElementById('categoryNav');
    nav.innerHTML = categories.map((cat, i) => `
        <div class="category-item ${cat.name === currentCategory ? 'active' : ''} ${cat.parent ? 'sub' : ''}"
             data-cat="${cat.name}" onclick="selectCategory('${cat.name}')">
            ${cat.label}
        </div>
    `).join('');
}

// ---- 选择分类 ----
function selectCategory(catName) {
    currentCategory = catName;

    // 更新导航高亮
    document.querySelectorAll('.category-item').forEach(el => {
        el.classList.toggle('active', el.dataset.cat === catName);
    });

    // 更新标题
    const cat = categories.find(c => c.name === catName);
    document.getElementById('currentCategoryTitle').textContent = cat ? cat.label : '全部';

    // 如果选中的是子分类，滚动到对应父分类区域
    if (cat && cat.parent) {
        const parentEl = document.querySelector(`.category-item[data-cat="${cat.parent}"]`);
        if (parentEl) parentEl.scrollIntoView({ block: 'nearest' });
    }

    renderProducts();
}

// ---- 渲染商品列表 ----
function renderProducts() {
    let filtered = allProducts;

    // 分类筛选
    if (currentCategory !== 'all') {
        filtered = filtered.filter(p => {
            const pc = (p.category || '').trim();
            if (currentCategory.includes('/')) {
                return pc === currentCategory;
            }
            // 选中父类时，显示该父类下所有子类的商品
            return pc === currentCategory || pc.startsWith(currentCategory + '/');
        });
    }

    // 搜索过滤
    if (searchKeyword) {
        const kw = searchKeyword.toLowerCase();
        filtered = filtered.filter(p =>
            (p.name || '').toLowerCase().includes(kw) ||
            (p.code || '').toLowerCase().includes(kw) ||
            (p.spec || '').toLowerCase().includes(kw) ||
            (p.description || '').toLowerCase().includes(kw)
        );
    }

    const container = document.getElementById('products');

    if (!filtered.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><p>暂无商品</p></div>';
        return;
    }

    container.innerHTML = filtered.map(p => {
        // 价格显示：price 字段存 "数字/单位" 格式
        let priceHtml = '';
        if (p.price) {
            const priceParts = p.price.split('/');
            const num = priceParts[0] || '';
            const unit = priceParts[1] || '';
            priceHtml = `<span class="product-price">${num}<span class="price-unit">元/${unit}</span></span>`;
        }

        return `
        <div class="product-card" onclick="showDetail('${p.id}')">
            <div class="product-img-wrap">
                ${p.image_url
                    ? `<img src="${p.image_url}" alt="${escapeHtml(p.name)}" loading="lazy">`
                    : '<span class="no-img-text">暂无图片</span>'}
            </div>
            <div class="product-info">
                <div class="product-name">${escapeHtml(p.name)}</div>
                ${p.spec ? `<div class="product-spec">${escapeHtml(p.spec)}</div>` : ''}
                ${p.code ? `<div class="product-code">编号：${escapeHtml(p.code)}</div>` : ''}
                <div class="product-price-row">
                    ${priceHtml}
                    <span class="login-hint" onclick="event.stopPropagation()">登录查看价格 ▸</span>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

// ---- 商品详情弹窗 ----
function showDetail(id) {
    const p = allProducts.find(x => x.id === id);
    if (!p) return;

    let priceHtml = '';
    if (p.price) {
        const pp = p.price.split('/');
        priceHtml = `<span class="detail-price">${pp[0]}<span class="unit">元/${pp[1]}</span></span>`;
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
                ${p.category ? `<span>分类：${escapeHtml(p.category)}</span>` : ''}
                ${p.spec ? `<span>规格：${escapeHtml(p.spec)}</span>` : ''}
                ${p.code ? `<span>编号：${escapeHtml(p.code)}</span>` : ''}
            </div>
            ${priceHtml}
            ${videoHtml}
        </div>
    `;

    document.getElementById('detailModal').style.display = 'flex';

    // 阻止背景滚动
    document.body.style.overflow = 'hidden';
}

function closeDetailModal() {
    document.getElementById('detailModal').style.display = 'none';
    document.body.style.overflow = '';

    // 停止视频播放
    const v = document.querySelector('#modalBody video');
    if (v) { v.pause(); v.currentTime = 0; }
    document.getElementById('modalBody').innerHTML = '';
}

// ---- 搜索功能 ----
function handleSearch() {
    const input = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClear');

    searchKeyword = input.value.trim();
    clearBtn.style.display = searchKeyword ? 'block' : 'none';

    // 搜索时自动切换到"全部"
    if (searchKeyword && currentCategory !== 'all') {
        selectCategory('all');
    } else {
        renderProducts();
    }
}

// ---- 事件绑定 ----
function bindEvents() {
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');

    // 搜索输入（防抖）
    let searchTimer = null;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(handleSearch, 300);
    });

    // 清除搜索
    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchClear.style.display = 'none';
        searchKeyword = '';
        renderProducts();
    });

    // 点击遮罩关闭详情
    document.getElementById('detailModal').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeDetailModal();
    });

    // ESC 关闭
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeDetailModal();
    });
}

// ---- 工具函数 ----
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
