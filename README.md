# Web Video Positioning

一款轻量级、跨平台的浏览器扩展程序，自动记录网页视频播放进度，下次访问时自动恢复至上次观看位置。

## 功能特性

- **智能断点续播** - 自动检测页面中的 HTML5 视频元素，实时监听播放进度
- **全局唯一标识** - 采用"域名 + 视频资源URL"的组合哈希算法生成唯一键值
- **极速跳转** - 视频元数据加载完成后立即执行跳转操作
- **本地隐私存储** - 所有数据存储在用户本地浏览器中，确保隐私安全
- **广泛兼容性** - 支持 Chrome、Edge、Brave、Opera、Firefox 等主流浏览器

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
# 或使用命令行工具生成 .crx 文件
```

## 使用方法

1. 安装扩展后，访问任意包含 HTML5 视频的网页
2. 播放视频，扩展会自动记录播放进度
3. 关闭页面或刷新后，再次打开同一视频页面
4. 视频会自动跳转至上次观看位置

### 进度管理面板

点击扩展图标打开管理面板，可以：
- 查看所有已保存的视频进度
- 搜索特定视频
- 删除单条记录
- 清空所有记录
- 点击记录跳转到对应视频页面

## 项目结构

```
WebVideoPositioning/
├── manifest.json      # 扩展配置文件
├── background.js      # 后台服务脚本
├── content.js         # 内容脚本（注入页面）
├── popup.html         # 弹窗页面
├── popup.js           # 弹窗脚本
├── popup.css          # 弹窗样式
├── icons/             # 扩展图标
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── examples/          # 测试页面
    └── basic.html
```

## 技术栈

- **核心框架**: Manifest V3
- **开发语言**: 原生 JavaScript
- **存储方案**: chrome.storage.local
- **关键 API**: chrome.tabs, MutationObserver

## 核心逻辑

### 唯一标识符生成

```javascript
function generateVideoId(video) {
  const domain = window.location.hostname;
  const videoSrc = video.currentSrc || video.src;
  const hash = simpleHash(domain + videoSrc);
  return `vpos_${hash}`;
}
```

### 进度监听与恢复

- 使用 `timeupdate` 事件进行高频记录
- 使用 `loadedmetadata` 事件进行恢复
- 定时保存间隔：2秒
- 暂停时立即保存

## 未来规划

- [ ] 云端同步 - 支持 Chrome Sync 或自建后端
- [ ] 快捷键支持 - 快速跳转进度（后退/前进 10 秒）
- [ ] 排除规则 - 允许用户排除特定网站
- [ ] 进度导出 - 导出/导入观看记录

## 许可证

MIT License
