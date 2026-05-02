/**
 * MediaHelper - Popup Script
 * 进度管理面板逻辑
 */

(function() {
  'use strict';

  const videoList = document.getElementById('videoList');
  const emptyState = document.getElementById('emptyState');
  const totalVideos = document.getElementById('totalVideos');
  const searchInput = document.getElementById('searchInput');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const enableToggle = document.getElementById('enableToggle');

  // Tab elements
  const tabBtns = document.querySelectorAll('.tab-btn');
  const videosTab = document.getElementById('videosTab');
  const exclusionsTab = document.getElementById('exclusionsTab');
  const exclusionList = document.getElementById('exclusionList');
  const newSiteDomain = document.getElementById('newSiteDomain');
  const newSiteName = document.getElementById('newSiteName');
  const newSiteScope = document.getElementById('newSiteScope');
  const addSiteBtn = document.getElementById('addSiteBtn');

  let allProgress = {};
  let excludedSites = [];

  /**
   * Tab switching
   */
  function switchTab(tabName) {
    tabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    videosTab.classList.toggle('active', tabName === 'videos');
    exclusionsTab.classList.toggle('active', tabName === 'exclusions');

    if (tabName === 'exclusions') {
      loadExcludedSites();
    }
  }

  /**
   * Load excluded sites list
   */
  function loadExcludedSites() {
    chrome.runtime.sendMessage({ type: 'getExc' }, (sites) => {
      if (chrome.runtime.lastError) {
        console.error('获取排除列表失败:', chrome.runtime.lastError);
        return;
      }
      excludedSites = sites || [];
      renderExclusionList(excludedSites);
    });
  }

  /**
   * Render exclusion list
   */
  function renderExclusionList(sites) {
    if (!sites || sites.length === 0) {
      exclusionList.innerHTML = '<div class="exclusion-empty">暂无排除的网站</div>';
      return;
    }

    // Sort: enabled first, then by name
    const sorted = [...sites].sort((a, b) => {
      if (a.enabled !== b.enabled) return b.enabled - a.enabled;
      return (a.name || a.domain).localeCompare(b.name || b.domain);
    });

    const scopeOptions = {
      'domain': '域名与子页面',
      'subdomain': '仅域名本身',
      'path': '仅子页面'
    };

    exclusionList.innerHTML = sorted.map(site => {
      const scopeSelectHtml = Object.entries(scopeOptions).map(([value, label]) =>
        `<option value="${value}" ${site.scope === value ? 'selected' : ''}>${label}</option>`
      ).join('');

      return `
        <div class="exclusion-item ${site.enabled ? '' : 'disabled'}" data-domain="${site.domain}">
          <input type="checkbox" class="exclusion-checkbox" ${site.enabled ? 'checked' : ''}>
          <div class="exclusion-info">
            <div class="exclusion-name">${site.name || site.domain}</div>
            <div class="exclusion-domain">${site.domain}</div>
          </div>
          <select class="scope-select-item" data-domain="${site.domain}">
            ${scopeSelectHtml}
          </select>
          <button class="exclusion-delete" title="删除">
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/>
            </svg>
          </button>
        </div>
      `;
    }).join('');

    bindExclusionEvents();
  }

  /**
   * Bind exclusion events
   */
  function bindExclusionEvents() {
    // Checkbox toggle
    document.querySelectorAll('.exclusion-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const item = checkbox.closest('.exclusion-item');
        const domain = item.dataset.domain;

        // Update site enabled status
        const site = excludedSites.find(s => s.domain === domain);
        if (site) {
          site.enabled = checkbox.checked;
          item.classList.toggle('disabled', !checkbox.checked);

          chrome.runtime.sendMessage({ type: 'updExc', sites: excludedSites }, () => {
            // Re-render to maintain sort order
            renderExclusionList(excludedSites);
          });
        }
      });
    });

    // Scope select change
    document.querySelectorAll('.scope-select-item').forEach(select => {
      select.addEventListener('change', (e) => {
        const domain = select.dataset.domain;
        const site = excludedSites.find(s => s.domain === domain);
        if (site) {
          site.scope = select.value;
          chrome.runtime.sendMessage({ type: 'updExc', sites: excludedSites });
        }
      });
    });

    // Delete button
    document.querySelectorAll('.exclusion-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.exclusion-item');
        const domain = item.dataset.domain;

        if (confirm(`确定要删除 ${domain} 的排除规则吗？`)) {
          chrome.runtime.sendMessage({ type: 'rmExc', domain }, (response) => {
            if (response.success) {
              excludedSites = response.sites;
              renderExclusionList(excludedSites);
            }
          });
        }
      });
    });
  }

  /**
   * Add new excluded site
   */
  function addExcludedSite() {
    const domain = newSiteDomain.value.trim();
    const name = newSiteName.value.trim();
    const scope = newSiteScope.value;

    if (!domain) {
      alert('请输入域名');
      return;
    }

    // Simple domain/path validation
    const domainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*(\/[a-zA-Z0-9\-._~%!$&'()*+,;=:@]*)*$/;
    if (!domainPattern.test(domain)) {
      alert('请输入有效的域名格式 (如: example.com 或 example.com/path)');
      return;
    }

    chrome.runtime.sendMessage({ type: 'addExc', domain, name, scope }, (response) => {
      if (response.success) {
        excludedSites = response.sites;
        renderExclusionList(excludedSites);
        newSiteDomain.value = '';
        newSiteName.value = '';
      } else if (response.reason === 'exists') {
        alert('该域名已存在于排除列表中');
      }
    });
  }

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

    bindEvents();
  }

  /**
   * 绑定事件
   */
  function bindEvents() {
    document.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.video-item');
        const key = item.dataset.key;

        if (confirm('确定要删除这条记录吗？')) {
          chrome.runtime.sendMessage({ type: 'deleteMH', key }, () => {
            item.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(loadProgress, 300);
          });
        }
      });
    });

    document.querySelectorAll('.btn-jump').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.video-item');
        const url = item.dataset.url;
        if (url) chrome.tabs.create({ url });
      });
    });

    document.querySelectorAll('.video-item').forEach(item => {
      item.addEventListener('click', () => {
        const url = item.dataset.url;
        if (url) chrome.tabs.create({ url });
      });
    });
  }

  /**
   * 加载进度数据
   */
  function loadProgress() {
    chrome.runtime.sendMessage({ type: 'getAllMH' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('获取进度失败:', chrome.runtime.lastError);
        return;
      }
      allProgress = response || {};
      renderVideoList(allProgress);
    });
  }

  /**
   * 加载启用状态
   */
  function loadEnabledState() {
    chrome.storage.local.get('mh_enabled', (result) => {
      const enabled = result.mh_enabled !== false; // 默认启用
      enableToggle.checked = enabled;
    });
  }

  /**
   * 切换启用状态
   */
  function toggleEnabled(enabled) {
    chrome.storage.local.set({ mh_enabled: enabled }, () => {
      // 通知所有 content script 更新状态
      chrome.runtime.sendMessage({ type: 'tglEn', enabled });
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
      chrome.runtime.sendMessage({ type: 'clearAllMH' }, () => {
        loadProgress();
      });
    }
  }

  // 初始化
  loadProgress();
  loadEnabledState();

  // Tab switching
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });

  // Add site button
  addSiteBtn.addEventListener('click', addExcludedSite);

  // Enter key to add site
  newSiteDomain.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addExcludedSite();
  });
  newSiteName.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addExcludedSite();
  });

  // 搜索事件
  searchInput.addEventListener('input', (e) => {
    filterVideos(e.target.value);
  });

  // 清空按钮
  clearAllBtn.addEventListener('click', clearAll);

  // 开关按钮
  enableToggle.addEventListener('change', (e) => {
    toggleEnabled(e.target.checked);
  });
})();