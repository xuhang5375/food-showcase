// 主展示页逻辑
let allProducts = [];

async function loadProducts() {
    const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('加载失败:', error);
        return;
    }

    allProducts = data || [];
    renderFilters();
    renderProducts(allProducts);
}

function renderFilters() {
    const categories = [...new Set(allProducts.map(p => p.category).filter(Boolean))];
    const filterDiv = document.getElementById('filters');
    filterDiv.innerHTML = '<button class="filter-btn active" data-category="all">全部</button>';
    
    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'filter-btn';
        btn.dataset.category = cat;
        btn.textContent = cat;
        btn.onclick = () => filterByCategory(cat);
        filterDiv.appendChild(btn);
    });
}

function filterByCategory(category) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');

    if (category === 'all') {
        renderProducts(allProducts);
    } else {
        renderProducts(allProducts.filter(p => p.category === category));
    }
}

function renderProducts(products) {
    const container = document.getElementById('products');
    if (!products.length) {
        container.innerHTML = '<p style="text-align:center;padding:40px;">暂无商品</p>';
        return;
    }

    container.innerHTML = products.map(p => `
        <div class="product-card" onclick="toggleDetail(${p.id})">
            ${p.image_url ? `<img src="${p.image_url}" alt="${p.name}" loading="lazy">` : '<div class="no-image">暂无图片</div>'}
            <div class="product-info">
                <h3>${p.name}</h3>
                ${p.description ? `<p>${p.description}</p>` : ''}
                ${p.video_url ? '<span class="video-badge">含视频</span>' : ''}
            </div>
        </div>
    `).join('');
}

// 商品详情弹窗
async function toggleDetail(id) {
    const p = allProducts.find(x => x.id === id);
    if (!p) return;

    const modal = document.getElementById('videoModal');
    const video = document.getElementById('modalVideo');

    if (p.video_url) {
        video.innerHTML = `<source src="${p.video_url}" type="video/mp4">`;
        video.load();
        modal.style.display = 'flex';
    } else if (p.image_url) {
        // 无视频时点击图片放大
        alert(p.description || '无描述');
    }
}

function closeVideoModal() {
    const video = document.getElementById('modalVideo');
    video.pause();
    video.innerHTML = '';
    document.getElementById('videoModal').style.display = 'none';
}

// ESC 关闭弹窗
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeVideoModal();
});

loadProducts();