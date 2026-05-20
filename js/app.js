// ========================================
// 食材采购 - 前台展示页逻辑
// 左侧分类导航 + 右侧商品列表 + 搜索
// ========================================

function getSupabase() { return window.supabase; }
var TABLE_NAME = window.TABLE_NAME || 'food_showcase_products';

let allProducts = [];
let categories = [];
let currentCategory = 'all';
let searchKeyword = '';

// ---- 初始化 ----
// 等待 window.supabase 初始化完成（module 异步加载）
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
            // 超时 5 秒后放弃
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

        let coverHtml = p.image_url
            ? '<img src="' + p.image_url + '" onerror="this.style.display=\'none\'">'
            : '<div class="no-image">📦</div>';

        html += '<div class="product-card" data-id="' + p.id + '">' +
            '<div class="product-cover">' + coverHtml + '</div>' +
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

    let mediaHtml = '';
    if (product.video_url) {
        mediaHtml = '<video src="' + product.video_url + '" controls playsinline preload="metadata" style="width:100%;max-height:300px;border-radius:8px;background:#000"></video>';
    } else if (product.image_url) {
        mediaHtml = '<img src="' + product.image_url + '" style="width:100%;max-width:100%;height:auto;border-radius:8px">';
    }

    const modal = document.createElement('div');
    modal.id = 'detailModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:1000';
    modal.innerHTML = '<div style="background:#fff;border-radius:12px;max-width:400px;width:90%;max-height:80vh;overflow-y:auto;padding:20px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
        '<h3 style="margin:0;font-size:18px">' + (product.name || '商品详情') + '</h3>' +
        '<button onclick="document.getElementById(\'detailModal\').remove()" style="border:none;background:#eee;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:16px">×</button>' +
        '</div>' +
        (mediaHtml ? '<div style="margin-bottom:12px">' + mediaHtml + '</div>' : '') +
        '<div style="color:#888;font-size:13px;margin-bottom:6px">分类: ' + (product.category || '未分类') + '</div>' +
        '<div style="color:#f60;font-size:20px;font-weight:600;margin-bottom:8px">' + priceText + '</div>' +
        (product.code ? '<div style="color:#888;font-size:12px">编码: ' + product.code + '</div>' : '') +
        (product.description ? '<div style="color:#666;font-size:14px;margin-top:12px;line-height:1.5">' + product.description + '</div>' : '') +
        '</div>';

    modal.addEventListener('click', function(e) {
        if (e.target === modal) modal.remove();
    });
    document.body.appendChild(modal);
}
