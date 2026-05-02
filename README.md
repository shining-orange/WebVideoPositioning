# Web Video Positioning

一款轻量级、跨平台的浏览器扩展程序，自动记录网页视频播放进度，下次访问时自动恢复至上次观看位置。

## 功能特性

- **智能断点续播** - 自动检测页面中的 HTML5 视频元素，实时监听播放进度
- **多策略进度保存** - 定时保存、暂停保存、跳转保存、页面卸载保存等多重保障
- **iframe 视频支持** - 支持 DPlayer、iframe 嵌入视频、HLS 流媒体等
- **全局唯一标识** - 采用"主页面 URL + 视频资源URL"的组合哈希算法生成唯一键值
- **一键开关控制** - 可随时启用/禁用视频检测功能
- **进度管理面板** - 可视化管理所有保存的视频进度
- **本地隐私存储** - 所有数据存储在用户本地浏览器中，确保隐私安全
- **广泛兼容性** - 支持 Chrome、Edge、Brave、Opera 等 Chromium 内核浏览器

## 安装方法

### 开发者模式安装

1. 下载或克隆本项目到本地
2. 打开 Chrome/Edge 浏览器，访问 `chrome://extensions/`
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"，选择项目根目录
5. 安装完成，扩展图标会出现在浏览器工具栏

### 打包安装

```bash
# 在浏览器扩展管理页面点击"打包扩展程序"
# 生成 .crx 文件进行分发
```

## 使用方法

### 基本使用

1. 安装扩展后，访问任意包含 HTML5 视频的网页
2. 播放视频，扩展会自动记录播放进度
3. 关闭页面或刷新后，再次打开同一视频页面
4. 视频会自动跳转至上次观看位置，并显示恢复提示

### 进度管理面板

点击扩展图标打开管理面板，可以：

- **开关控制** - 一键启用/禁用视频检测功能
- **查看进度** - 显示所有已保存的视频进度列表
- **搜索视频** - 按标题或 URL 搜索特定视频
- **跳转播放** - 点击记录跳转到对应视频页面
- **删除记录** - 删除单条或清空所有记录

### 支持的视频类型

| 类型 | 支持情况 |
|------|----------|
| HTML5 `<video>` | ✅ 完全支持 |
| DPlayer 播放器 | ✅ 支持 |
| iframe 嵌入视频 | ✅ 支持 |
| HLS (m3u8) 流媒体 | ✅ 支持 |
| blob: URL 视频 | ✅ 支持 |

## 项目结构

```
WebVideoPositioning/
├── manifest.json      # 扩展配置文件 (Manifest V3)
├── background.js      # 后台服务脚本
├── content.js         # 内容脚本（注入页面）
├── popup.html         # 弹窗页面
├── popup.js           # 弹窗脚本
├── popup.css          # 弹窗样式
├── icons/             # 扩展图标
│   ├── icon.svg
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── examples/          # 测试页面
│   └── basic.html
└── README.md          # 项目文档
```

## 技术栈

- **核心框架**: Manifest V3
- **开发语言**: 原生 JavaScript (ES6+)
- **存储方案**: chrome.storage.local
- **关键 API**: 
  - chrome.runtime (消息通信)
  - chrome.storage (数据存储)
  - chrome.tabs (标签页管理)
  - MutationObserver (DOM 监听)

## 核心逻辑

### 唯一标识符生成

使用主页面 URL + 视频源生成唯一 ID，确保 iframe 内的视频也能正确关联到原网站：

```javascript
function generateVideoId(video) {
  const mainUrl = getMainPageUrl();  // 获取主页面 URL
  const videoSrc = video.currentSrc || video.src;
  const hash = simpleHash(mainUrl + videoSrc);
  return `vpos_${hash}`;
}
```

### 多策略进度保存

| 策略 | 触发时机 | 说明 |
|------|----------|------|
| 定时保存 | 播放期间每 3 秒 | 持续记录进度 |
| timeupdate | 每隔 5 秒 | 视频时间变化时触发 |
| seeked | 用户拖动进度条后 | 立即保存跳转位置 |
| 跳转检测 | 时间变化超过 10 秒 | 自动检测大幅度跳转 |
| 暂停保存 | 视频暂停时 | 立即保存当前位置 |
| 页面卸载 | beforeunload | 关闭页面前保存 |
| 页面隐藏 | visibilitychange | 切换标签页时保存 |
| 窗口失焦 | blur | 窗口失去焦点时保存 |

### 防抖机制

500ms 内不会重复保存同一视频的进度，避免性能问题。

## 常见问题

### 为什么某些网站的视频没有被记录？

1. **广告拦截器干扰** - 如 AdGuard 可能拦截扩展请求，请在广告拦截器中添加例外规则
2. **视频在跨域 iframe 中** - 部分网站的安全策略可能阻止访问
3. **视频时长过短** - 小于 5 秒的视频不会被记录

### 如何在 AdGuard 中添加例外？

1. 打开 AdGuard 设置
2. 找到"用户过滤器"
3. 添加规则：`@@||chrome-extension://*$xmlhttprequest`

### 进度数据存储在哪里？

所有数据存储在浏览器的 `chrome.storage.local` 中，不会上传到任何服务器。

## 未来规划

- [ ] 云端同步 - 支持 Chrome Sync 或自建后端
- [ ] 快捷键支持 - 快速跳转进度（后退/前进 10 秒）
- [ ] 排除规则 - 允许用户排除特定网站
- [ ] 进度导出 - 导出/导入观看记录
- [ ] Firefox 支持 - 适配 Firefox 扩展 API

## 更新日志

### v1.0.0
- 初始版本发布
- 支持智能断点续播
- 支持进度管理面板
- 支持一键开关控制
- 支持 iframe 内视频
- 支持 HLS 流媒体

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！