/**
 * Web Video Positioning - Content Script
 * 检测页面视频元素，记录和恢复播放进度
 * 支持 iframe 内视频、DPlayer、HLS 流媒体等
 */

(function() {
  'use strict';

  // 配置项
  const CONFIG = {
    SAVE_INTERVAL: 3000,
    TIME_UPDATE_INTERVAL: 5,
    MIN_DURATION: 5,
    AUTO_PLAY: true,
    SCAN_INTERVAL: 3000,
    DEBUG: true
  };

  const videoMap = new Map();
  let scanTimer = null;
  let isInitialized = false;
  let isEnabled = true;  // 是否启用检测
  let excludedSites = []; // 排除站点列表
  let currentUrlExcluded = false; // 当前页面是否被排除

  function log(...args) {
    if (CONFIG.DEBUG) {
      const frameInfo = window.self !== window.top ? '[iframe]' : '[main]';
      console.log('[VP]' + frameInfo, ...args);
    }
  }

  // 检查当前页面是否被排除
  function checkCurrentUrlExcluded(callback) {
    const mainUrl = getMainPageUrl();
    chrome.runtime.sendMessage({ type: 'checkExcluded', url: mainUrl }, (response) => {
      if (chrome.runtime.lastError) {
        log('检查排除状态失败:', chrome.runtime.lastError);
        callback(false);
        return;
      }
      currentUrlExcluded = response ? response.excluded : false;
      log('页面排除状态:', currentUrlExcluded ? '已排除' : '未排除', mainUrl);
      if (callback) callback(currentUrlExcluded);
    });
  }

  // 检查是否启用
  function checkEnabled(callback) {
    chrome.storage.local.get('vp_enabled', (result) => {
      isEnabled = result.vp_enabled !== false;
      log('检测状态:', isEnabled ? '已启用' : '已禁用');
      if (callback) callback(isEnabled);
    });
  }

  // 监听来自 background 的开关消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'toggleEnabled') {
      isEnabled = message.enabled;
      log('状态切换:', isEnabled ? '已启用' : '已禁用');

      if (!isEnabled) {
        // 禁用时停止扫描
        if (scanTimer) {
          clearInterval(scanTimer);
          scanTimer = null;
        }
        videoMap.clear();
        log('已停止视频检测');
      } else {
        // 启用时重新检查排除状态并扫描
        checkCurrentUrlExcluded((excluded) => {
          if (!excluded && !scanTimer) {
            scanTimer = setInterval(scanVideos, CONFIG.SCAN_INTERVAL);
            scanVideos();
            log('已恢复视频检测');
          }
        });
      }

      sendResponse({ success: true });
    }

    // 更新排除列表
    if (message.type === 'updateExcludedSites') {
      excludedSites = message.sites || [];
      checkCurrentUrlExcluded((excluded) => {
        if (excluded) {
          // 当前页面被排除，停止检测
          if (scanTimer) {
            clearInterval(scanTimer);
            scanTimer = null;
          }
          videoMap.clear();
          log('页面被排除，已停止视频检测');
        } else if (isEnabled && !scanTimer) {
          // 当前页面不再被排除，恢复检测
          scanTimer = setInterval(scanVideos, CONFIG.SCAN_INTERVAL);
          scanVideos();
          log('页面不再被排除，已恢复视频检测');
        }
      });
      sendResponse({ success: true });
    }

    return true;
  });

  // 获取主页面 URL（用户实际访问的网站）
  function getMainPageUrl() {
    try {
      // 尝试获取顶层窗口的 URL
      if (window.top && window.top !== window.self) {
        return window.top.location.href;
      }
    } catch (e) {
      // 跨域限制，使用当前页面 URL
    }
    return window.location.href;
  }

  // 获取主页面标题
  function getMainPageTitle() {
    try {
      if (window.top && window.top !== window.self && window.top.document) {
        return window.top.document.title || document.title || getMainPageUrl();
      }
    } catch (e) {}
    return document.title || window.location.href;
  }

  function getFullUrl() {
    // 始终返回主页面 URL，方便用户跳转回原网站
    return getMainPageUrl();
  }

  function generateVideoId(video) {
    // 使用主页面 URL 生成 ID，确保同一视频在不同 iframe 情况下 ID 一致
    const mainUrl = getMainPageUrl();
    let videoSrc = video.currentSrc || video.src || '';

    const sourceElements = video.querySelectorAll('source');
    if (!videoSrc && sourceElements.length > 0) {
      videoSrc = sourceElements[0].src || '';
    }

    // 清理页面 URL，移除动态参数，只保留核心路径
    let cleanUrl = mainUrl;
    try {
      const urlObj = new URL(mainUrl);
      // 只保留路径，移除查询参数和哈希
      cleanUrl = urlObj.origin + urlObj.pathname;
    } catch (e) {}

    // 判断视频源是否有效（非 blob URL）
    let cleanSrc = '';
    if (videoSrc && !videoSrc.startsWith('blob:')) {
      cleanSrc = videoSrc;
      // 移除查询参数
      if (cleanSrc.includes('?')) {
        cleanSrc = cleanSrc.split('?')[0];
      }
    }

    // 如果无法获取有效视频源，只用页面 URL 生成 ID
    if (!cleanSrc) {
      // 对于 blob URL 或空视频源，只用清理后的页面 URL
      const hash = simpleHash(cleanUrl);
      return `vpos_${hash}`;
    }

    // 使用清理后的 URL + 视频源生成唯一 ID
    const hash = simpleHash(cleanUrl + '|' + cleanSrc);
    return `vpos_${hash}`;
  }

  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  function getPageTitle() {
    return getMainPageTitle();
  }

  const lastSaveTime = new Map();

  function saveProgress(video, vid, reason = '') {
    // 如果已禁用或页面被排除，不保存
    if (!isEnabled || currentUrlExcluded) return;

    if (!video || isNaN(video.duration) || video.duration < CONFIG.MIN_DURATION) {
      return;
    }

    const now = Date.now();
    const last = lastSaveTime.get(vid) || 0;
    if (now - last < 500) {
      return;
    }
    lastSaveTime.set(vid, now);

    const progress = video.currentTime / video.duration;
    if (progress > 0.95) {
      return;
    }

    log('保存进度:', vid, video.currentTime.toFixed(2), '/', video.duration.toFixed(2), reason);

    chrome.runtime.sendMessage({
      type: 'saveVP',
      key: vid,
      currentTime: video.currentTime,
      duration: video.duration,
      url: getFullUrl(),
      title: getPageTitle()
    }, (response) => {
      if (chrome.runtime.lastError) {
        log('保存进度失败:', chrome.runtime.lastError.message);
      }
    });
  }

  function restoreProgress(video, vid) {
    // 如果已禁用或页面被排除，不恢复
    if (!isEnabled || currentUrlExcluded) return;

    log('尝试恢复进度:', vid);

    chrome.runtime.sendMessage({ type: 'getVP', key: vid }, (progressData) => {
      if (chrome.runtime.lastError) {
        log('获取进度失败:', chrome.runtime.lastError.message);
        return;
      }

      log('获取到进度数据:', progressData);

      if (progressData && progressData.currentTime > 0) {
        tryApplyProgress(video, progressData, 0);
      }
    });
  }

  function tryApplyProgress(video, progressData, attempt) {
    if (!isEnabled || currentUrlExcluded) return;

    const maxAttempts = 5;
    const attemptDelay = 1000;

    if (attempt >= maxAttempts) {
      log('达到最大尝试次数，放弃恢复');
      return;
    }

    if (video.readyState >= 1 && !isNaN(video.duration) && video.duration > 0) {
      applyProgress(video, progressData);
    } else {
      log(`视频未就绪 (readyState=${video.readyState})，尝试 ${attempt + 1}/${maxAttempts}`);

      const timeout = setTimeout(() => {
        tryApplyProgress(video, progressData, attempt + 1);
      }, attemptDelay);

      const onCanPlay = () => {
        clearTimeout(timeout);
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('loadedmetadata', onCanPlay);
        video.removeEventListener('durationchange', onCanPlay);
        applyProgress(video, progressData);
      };

      video.addEventListener('canplay', onCanPlay, { once: true });
      video.addEventListener('loadedmetadata', onCanPlay, { once: true });
      video.addEventListener('durationchange', onCanPlay, { once: true });
    }
  }

  function applyProgress(video, progressData) {
    if (!isEnabled || currentUrlExcluded) return;

    const savedTime = progressData.currentTime;
    const duration = video.duration;

    if (savedTime > 0 && savedTime < duration && !isNaN(duration)) {
      log('应用进度:', savedTime.toFixed(2), '/', duration.toFixed(2));
      video.currentTime = savedTime;
      showRestoreNotification(video, savedTime, duration);

      if (CONFIG.AUTO_PLAY) {
        video.play().catch((e) => {
          log('自动播放被阻止:', e.message);
        });
      }
    }
  }

  function showRestoreNotification(video, savedTime, duration) {
    const container = video.parentElement;
    if (!container) return;

    if (container.querySelector('.vp-notify')) return;

    const notification = document.createElement('div');
    notification.className = 'vp-notify';
    notification.innerHTML = `
      <span>已恢复至上次播放位置: ${formatTime(savedTime)} / ${formatTime(duration)}</span>
      <button class="vp-close">&times;</button>
    `;

    if (!document.querySelector('#vp-styles')) {
      const style = document.createElement('style');
      style.id = 'vp-styles';
      style.textContent = `
        .vp-notify {
          position: absolute;
          top: 50px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0, 0, 0, 0.85);
          color: #fff;
          padding: 10px 20px;
          border-radius: 6px;
          font-size: 14px;
          z-index: 2147483647;
          display: flex;
          align-items: center;
          gap: 12px;
          animation: vp-in 0.3s ease;
          pointer-events: auto;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .vp-close {
          background: none;
          border: none;
          color: #fff;
          cursor: pointer;
          font-size: 20px;
          padding: 0 4px;
          line-height: 1;
        }
        .vp-close:hover { color: #ff6b6b; }
        @keyframes vp-in {
          from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `;
      document.head.appendChild(style);
    }

    const computedStyle = window.getComputedStyle(container);
    if (computedStyle.position === 'static') {
      container.style.position = 'relative';
    }

    container.appendChild(notification);

    notification.querySelector('.vp-close').addEventListener('click', (e) => {
      e.stopPropagation();
      notification.remove();
    });

    setTimeout(() => {
      if (notification.parentElement) {
        notification.style.animation = 'vp-in 0.3s ease reverse';
        setTimeout(() => notification.remove(), 300);
      }
    }, 5000);
  }

  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function setupVideoListeners(video) {
    if (videoMap.has(video)) return;

    // 如果已禁用或页面被排除，不设置监听器
    if (!isEnabled || currentUrlExcluded) return;

    const vid = generateVideoId(video);
    videoMap.set(video, vid);

    log('设置视频监听器:', vid, {
      src: video.currentSrc || video.src,
      readyState: video.readyState,
      duration: video.duration
    });

    restoreProgress(video, vid);

    let saveTimer = null;
    let lastTimeUpdateSave = 0;
    let lastKnownTime = 0;

    video.addEventListener('play', () => {
      if (!isEnabled) return;
      log('视频开始播放');
      if (saveTimer) clearInterval(saveTimer);
      saveTimer = setInterval(() => {
        if (!video.paused && isEnabled) {
          saveProgress(video, vid, '[定时]');
        }
      }, CONFIG.SAVE_INTERVAL);
    });

    video.addEventListener('pause', () => {
      if (!isEnabled) return;
      log('视频暂停于', video.currentTime.toFixed(2));
      if (saveTimer) {
        clearInterval(saveTimer);
        saveTimer = null;
      }
      saveProgress(video, vid, '[暂停]');
    });

    video.addEventListener('timeupdate', () => {
      if (!isEnabled) return;

      const now = Date.now();
      if (now - lastTimeUpdateSave > CONFIG.TIME_UPDATE_INTERVAL * 1000) {
        lastTimeUpdateSave = now;
        if (!video.paused && video.currentTime > 0) {
          saveProgress(video, vid, '[timeupdate]');
        }
      }

      const timeDiff = Math.abs(video.currentTime - lastKnownTime);
      if (timeDiff > 10 && lastKnownTime > 0) {
        log('检测到跳转:', lastKnownTime.toFixed(2), '->', video.currentTime.toFixed(2));
        saveProgress(video, vid, '[跳转]');
      }
      lastKnownTime = video.currentTime;
    });

    video.addEventListener('seeked', () => {
      if (!isEnabled) return;
      log('用户跳转到', video.currentTime.toFixed(2));
      saveProgress(video, vid, '[seeked]');
    });

    video.addEventListener('ended', () => {
      log('视频结束');
      if (saveTimer) {
        clearInterval(saveTimer);
        saveTimer = null;
      }
    });

    window.addEventListener('beforeunload', () => {
      if (isEnabled) saveProgress(video, vid, '[卸载]');
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && isEnabled) {
        saveProgress(video, vid, '[隐藏]');
      }
    });

    window.addEventListener('blur', () => {
      if (!video.paused && isEnabled) {
        saveProgress(video, vid, '[失焦]');
      }
    });
  }

  function scanVideos() {
    if (!isEnabled || currentUrlExcluded) return;

    const videos = document.querySelectorAll('video');
    log('扫描到视频数量:', videos.length);

    videos.forEach((video, index) => {
      if (!videoMap.has(video)) {
        log(`发现新视频 [${index}]:`, video.currentSrc || video.src || '无src');
        setupVideoListeners(video);
      }
    });
  }

  function observeDOM() {
    if (!document.body) return;

    const observer = new MutationObserver((mutations) => {
      if (!isEnabled || currentUrlExcluded) return;

      let hasNewVideo = false;

      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeName === 'VIDEO') {
            hasNewVideo = true;
          } else if (node.querySelectorAll) {
            try {
              const videos = node.querySelectorAll('video');
              if (videos.length > 0) hasNewVideo = true;
            } catch (e) {}
          }
        });
      });

      if (hasNewVideo) {
        log('DOM变化检测到新视频');
        setTimeout(scanVideos, 100);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    log('DOM监听器已启动');
  }

  function init() {
    if (isInitialized) return;

    // 先检查是否启用
    checkEnabled((enabled) => {
      isInitialized = true;

      log('初始化，页面URL:', window.location.href);
      log('是否在iframe中:', window.self !== window.top);

      if (enabled) {
        // 检查当前页面是否被排除
        checkCurrentUrlExcluded((excluded) => {
          if (!excluded) {
            scanVideos();
            setTimeout(scanVideos, 1500);
            setTimeout(scanVideos, 3000);
            setTimeout(scanVideos, 5000);

            scanTimer = setInterval(scanVideos, CONFIG.SCAN_INTERVAL);
            observeDOM();
          } else {
            log('当前页面在排除列表中，跳过视频检测');
          }
        });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('unload', () => {
    if (scanTimer) clearInterval(scanTimer);
  });
})();