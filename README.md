# 辞舟 cizhou · 高中实词背诵系统

## 运行方式（二选一）

### 方式 A：本地服务器（推荐用于开发 / 在 Mac 上跑）
```bash
cd cizhou
python3 -m http.server 8000
```
浏览器打开 http://localhost:8000

### 方式 B：双击 index.html（无服务器）
需要先把 data.json 嵌入成 JS 文件：

**macOS / Linux：**
```bash
cd cizhou
printf "window.RAW_DATA = " > scripts/data-embed.js
cat data.json >> scripts/data-embed.js
printf ";" >> scripts/data-embed.js
```

之后双击 `index.html` 即可。`data-embed.js` 不存在时不会报错（已用 onerror 兜底）。

## 部署到 GitHub Pages（用于 iPad）
1. 把整个目录推到 GitHub
2. Settings → Pages → Source 选 main 分支
3. 用 iPad Safari 打开链接，分享菜单 → 添加到主屏幕

## 数据同步
本系统使用 localStorage，跨设备需要手动同步：
- 在「我的」中点击「导出进度 JSON」保存到 iCloud Drive
- 另一设备打开网页 → 「我的」→「导入进度 JSON」

## 文件结构
```
cizhou/
├── index.html
├── manifest.json
├── data.json
├── assets/favicon.svg
├── styles/{base,layout,components}.css
└── scripts/{utils,store,data,ui-browse,ui-quiz,ui-profile,main}.js
```
