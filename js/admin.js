var supabase = window.supabase;

// 管理后台逻辑
let isLoggedIn = false;
let editingId = null;
let currentImageUrl = null;
let currentVideoUrl = null;

// 备用配置（如果 config.js 加载失败）
if (typeof ADMIN_PASSWORD === "undefined") {
    window.ADMIN_PASSWORD = "920615";
    window.TABLE_NAME = "food_showcase_products";
    window.BUCKET_NAME = "product-media";
}

function checkPassword() {
    try {
        const pw = document.getElementById("passwordInput").value;
        if (!pw) {
            document.getElementById("loginError").textContent = "请输入密码";
            document.getElementById("loginError").style.display = "block";
            return;
        }
        if (pw === ADMIN_PASSWORD) {
            isLoggedIn = true;
            document.getElementById("loginSection").style.display = "none";
            document.getElementById("adminSection").style.display = "block";
            loadProducts();
        } else {
            document.getElementById("loginError").textContent = "密码错误";
            document.getElementById("loginError").style.display = "block";
        }
    } catch (e) {
        document.getElementById("loginError").textContent = "错误: " + e.message;
        document.getElementById("loginError").style.display = "block";
    }
}

// 回车登录
document.getElementById("passwordInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") checkPassword();
});
// 登录按钮
document.getElementById("loginBtn")?.addEventListener("click", checkPassword);

async function loadProducts() {
    if (!window.supabase) {
        alert("Supabase 未加载，请刷新页面");
        return;
    }
    const { data, error } = await supabase
        .from(TABLE_NAME)
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        alert("加载失败: " + error.message);
        return;
    }

    renderProductList(data || []);
}

function renderProductList(products) {
    const container = document.getElementById("productList");
    if (!products.length) {
        container.innerHTML = "<p style=\"text-align:center;padding:20px;\">暂无商品</p>";
        return;
    }

    container.innerHTML = products.map(p => `
        <div class="admin-product-card">
            <div class="admin-product-info">
                <h3>${p.name}</h3>
                <p>${p.category || "未分类"}</p>
                ${p.description ? `<p>${p.description}</p>` : ""}
            </div>
            <div class="admin-product-media">
                ${p.image_url ? `<img src="${p.image_url}" alt="${p.name}">` : ""}
                ${p.video_url ? "<span class=\"video-badge\">含视频</span>" : ""}
            </div>
            <div class="admin-product-actions">
                <button onclick="editProduct(\"${p.id}\")">编辑</button>
                <button class="btn-danger" onclick="deleteProduct(\"${p.id}\")">删除</button>
            </div>
        </div>
    `).join("");
}

function showAddForm() {
    editingId = null;
    currentImageUrl = null;
    currentVideoUrl = null;
    document.getElementById("formTitle").textContent = "添加商品";
    document.getElementById("productForm").style.display = "block";
    document.getElementById("productId").value = "";
    document.getElementById("productName").value = "";
    document.getElementById("productDesc").value = "";
    document.getElementById("productCategory").value = "肉类";
    document.getElementById("imageFile").value = "";
    document.getElementById("videoFile").value = "";
    document.getElementById("imagePreview").innerHTML = "";
    document.getElementById("videoPreview").innerHTML = "";
}

async function editProduct(id) {
    if (!window.supabase) {
        alert("Supabase 未加载，请刷新页面");
        return;
    }
    const { data } = await supabase.from(TABLE_NAME).select("*").eq("id", id).single();
    if (!data) return;

    editingId = id;
    currentImageUrl = data.image_url;
    currentVideoUrl = data.video_url;
    document.getElementById("formTitle").textContent = "编辑商品";
    document.getElementById("productForm").style.display = "block";
    document.getElementById("productId").value = id;
    document.getElementById("productName").value = data.name;
    document.getElementById("productDesc").value = data.description || "";
    document.getElementById("productCategory").value = data.category || "肉类";
    document.getElementById("imagePreview").innerHTML = currentImageUrl ? `<img src="${currentImageUrl}" style="max-width:150px;">` : "";
    document.getElementById("videoPreview").innerHTML = currentVideoUrl ? `<a href="${currentVideoUrl}" target="_blank">查看当前视频</a>` : "";
}

function hideForm() {
    document.getElementById("productForm").style.display = "none";
    editingId = null;
}

async function uploadFile(file) {
    const filename = `${Date.now()}_${file.name}`;
    const { data, error } = await supabase.storage.from(BUCKET_NAME).upload(filename, file);
    if (error) throw error;
    return supabase.storage.from(BUCKET_NAME).getPublicUrl(filename).publicUrl;
}

async function saveProduct() {
    const name = document.getElementById("productName").value.trim();
    if (!name) { alert("请输入商品名称"); return; }

    const imageFile = document.getElementById("imageFile").files[0];
    const videoFile = document.getElementById("videoFile").files[0];

    try {
        let imageUrl = currentImageUrl;
        let videoUrl = currentVideoUrl;

        if (imageFile) {
            const uploading = document.createElement("div");
            uploading.textContent = "上传图片中...";
            document.getElementById("imagePreview").appendChild(uploading);
            imageUrl = await uploadFile(imageFile);
        }

        if (videoFile) {
            const uploading = document.createElement("div");
            uploading.textContent = "上传视频中...";
            document.getElementById("videoPreview").appendChild(uploading);
            videoUrl = await uploadFile(videoFile);
        }

        const productData = {
            name,
            description: document.getElementById("productDesc").value.trim(),
            category: document.getElementById("productCategory").value,
            image_url: imageUrl,
            video_url: videoUrl
        };

        let result;
        if (editingId) {
            result = await supabase.from(TABLE_NAME).update(productData).eq("id", editingId);
        } else {
            result = await supabase.from(TABLE_NAME).insert(productData);
        }

        if (result.error) throw result.error;

        alert(editingId ? "修改成功" : "添加成功");
        hideForm();
        loadProducts();
    } catch (err) {
        alert("保存失败: " + err.message);
    }
}

async function deleteProduct(id) {
    if (!confirm("确定删除？")) return;
    const { error } = await supabase.from(TABLE_NAME).delete().eq("id", id);
    if (error) {
        alert("删除失败: " + error.message);
    } else {
        loadProducts();
    }
}

// 图片/视频预览
document.getElementById("imageFile")?.addEventListener("change", function() {
    const file = this.files[0];
    if (file) {
        document.getElementById("imagePreview").innerHTML = `<img src="${URL.createObjectURL(file)}" style="max-width:150px;">`;
    }
});
document.getElementById("videoFile")?.addEventListener("change", function() {
    const file = this.files[0];
    if (file) {
        document.getElementById("videoPreview").innerHTML = `<video src="${URL.createObjectURL(file)}" style="max-width:200px;max-height:120px;" controls></video>`;
    }
});