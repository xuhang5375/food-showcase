# 稳定后台部署包（deploy-admin · EdgeOne Pages 版）

解决原 GitHub Pages 后台（`xuhang5375.github.io/food-showcase/admin.html`）在国内经常加载失败的问题。
本包已去除 esm.sh 国外 CDN 依赖、supabase 客户端本地化，纯静态，可直接部署到
**腾讯云 EdgeOne Pages（免费、国内稳、可自动部署）**。

## 已做的稳定化改造
- 去除 `admin.html` 对 esm.sh 的依赖（国内常超时，是后台加载失败主因）
- supabase 客户端改为本地 `js/supabase-full.js`（supabase-js@2.106.1 UMD 构建）
- 追加 `index.html`（admin.html 副本）作为根路径入口，访问域名即直接进后台
- 数据仍来自 Supabase（香港节点）；页面与 JS 库均国内加载，仅数据请求跨境

## 部署到腾讯云 EdgeOne Pages（免费）

### 方式一：上传目录（最简单，无需 GitHub、无需 push）
1. 打开 https://console.cloud.tencent.com/edgeone/pages 并登录腾讯云
2. 点「创建项目」→ 选择「直接上传文件夹」
3. 选择本目录 `deploy-admin/`（含 admin.html、index.html、css/、js/）
4. 框架预设选「其他 / 静态网站」，构建命令留空，输出目录留空（根即部署根）
5. 点「开始部署」，约 1 分钟得到 `https://xxx.edgeonepages.com` 国内可访问地址
6. 打开该地址 → 输入管理密码 `920615` 即为稳定后台

### 方式二：连接 GitHub 自动部署（推荐，后续 push 自动上线）
1. 先把 `deploy-admin/` 推到你的 GitHub 仓库（本目录已在仓库内，需 push）
2. EdgeOne Pages 控制台 → 「创建项目」→ 授权连接 GitHub → 选 `food-showcase` 仓库
3. Root Directory 填 `deploy-admin`，框架预设「其他」，构建命令留空，输出目录 `deploy-admin`
4. 完成，每次 push 自动部署；后台地址为 `https://xxx.edgeonepages.com`

> 注：方式二依赖 GitHub 上已有 deploy-admin 目录。如需代 push，请让我执行。

## 注意事项
- 商品列表 / 访客记录来自 Supabase 香港节点，跨境加载偶尔偏慢，可点页面「刷新」重试
- 后台为内部管理页、有密码保护，不会被公开刷量，EdgeOne 免费额度足够（不限量加速流量）
- EdgeOne Pages 免费版不含大文件/视频分发；本后台纯静态（supabase-full.js 约 200KB），完全在免费范围内

## 与原 GitHub Pages 后台的关系
- 原 `https://xuhang5375.github.io/food-showcase/admin.html` 保留不动（也已去除 esm.sh）
- 本包为其国内稳定镜像，日常使用本 EdgeOne 地址即可
