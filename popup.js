/**
 * Web Video Positioning - Popup Script
 * 进度管理面板逻辑
 */

(function() {
  'use strict';

  const videoList = document.getElementById('videoList');
  const emptyState = document.getElementById('emptyState');
  const totalVideos = document.getElementById('totalVideos');
  const searchInput = document.getElementById('searchInput');
  const clearAllBtn = document.getElementById('clearAllBtn');

  let allProgress = {};

  /**
   * 格式化时间
   */
  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  /**
   * 格式化日期
   */
  function formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    // 一天内显示相对时间
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;

    return date.toLocaleDateString('zh-CN');
  }

  /**
   * 计算进度百分比
   */
  function getProgressPercent(currentTime, duration) {
    if (!duration) return 0;
    return Math.min(100, Math.round((currentTime / duration) * 100));
  }

  /**
   * 渲染视频列表
   */
  function renderVideoList(progressData) {
    const entries = Object.entries(progressData);

    if (entries.length === 0) {
      videoList.style.display = 'none';
      emptyState.style.display = 'block';
      totalVideos.textContent = '0';
      return;
    }

    videoList.style.display = 'block';
    emptyState.style.display = 'none';
    totalVideos.textContent = entries.length;

    // 按时间倒序排序
    entries.sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));

    videoList.innerHTML = entries.map(([key, data]) => {
      const percent = getProgressPercent(data.currentTime, data.duration);
      const title = data.title || '未知视频';
      const timeStr = formatTime(data.currentTime);
      const durationStr = formatTime(data.duration);
      const dateStr = formatDate(data.timestamp);

      return `
        <div class="video-item" data-key="${key}" data-url="${data.url || ''}">
          <div class="video-info">
            <div class="video-title" title="${title}">${title}</div>
            <div class="video-meta">
              <span class="time">${timeStr} / ${durationStr}</span>
              <span class="date">${dateStr}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${percent}%"></div>
            </div>
          </div>
          <div class="video-actions">
            <button class="btn-icon btn-jump" title="跳转到视频页面">
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3m-2 16H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7z"/>
              </svg>
            </button>
            <button class="btn-icon btn-delete" title="删除记录">
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // 绑定事件
    bindEvents();
  }

  /**
   * 绑定事件
   */
  function bindEvents() {
    // 删除按钮
    document.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.video-item');
        const key = item.dataset.key;

        if (confirm('确定要删除这条记录吗？')) {
          chrome.runtime.sendMessage(
            { type: 'deleteVP', key },
            () => {
              item.style.animation = 'slideOut 0.3s ease forwards';
              setTimeout(() => {
                loadProgress();
              }, 300);
            }
          );
        }
      });
    });

    // 跳转按钮
    document.querySelectorAll('.btn-jump').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.video-item');
        const url = item.dataset.url;

        if (url) {
          chrome.tabs.create({ url });
        }
      });
    });

    // 点击项目跳转
    document.querySelectorAll('.video-item').forEach(item => {
      item.addEventListener('click', () => {
        const url = item.dataset.url;
        if (url) {
          chrome.tabs.create({ url });
        }
      });
    });
  }

  /**
   * 加载进度数据
   */
  function loadProgress() {
    chrome.runtime.sendMessage({ type: 'getAllVP' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('获取进度失败:', chrome.runtime.lastError);
        return;
      }

      allProgress = response || {};
      renderVideoList(allProgress);
    });
  }

  /**
   * 搜索过滤
   */
  function filterVideos(keyword) {
    if (!keyword) {
      renderVideoList(allProgress);
      return;
    }

    const filtered = {};
    const lowerKeyword = keyword.toLowerCase();

    Object.entries(allProgress).forEach(([key, data]) => {
      const title = (data.title || '').toLowerCase();
      const url = (data.url || '').toLowerCase();

      if (title.includes(lowerKeyword) || url.includes(lowerKeyword)) {
        filtered[key] = data;
      }
    });

    renderVideoList(filtered);
  }

  /**
   * 清空所有记录
   */
  function clearAll() {
    if (confirm('确定要清空所有视频进度记录吗？此操作不可恢复。')) {
      chrome.storage.local.clear(() => {
        loadProgress();
      });
    }
  }

  // 初始化
  loadProgress();

  // 搜索事件
  searchInput.addEventListener('input', (e) => {
    filterVideos(e.target.value);
  });

  // 清空按钮
  clearAllBtn.addEventListener('click', clearAll);
})();
