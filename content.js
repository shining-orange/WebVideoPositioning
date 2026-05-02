/**
 * Web Video Positioning - Content Script
 * 检测页面视频元素，记录和恢复播放进度
 * 支持 iframe 内视频、DPlayer、HLS 流媒体等
 */

(function() {
  'use strict';

  // 配置项
  const CONFIG = {
    SAVE_INTERVAL: 2000,
    RESTORE_DELAY: 1500,
    MIN_DURATION: 5,
    AUTO_PLAY: true,
    SCAN_INTERVAL: 3000,
    DEBUG: true
  };

  const videoMap = new Map();
  let scanTimer = null;
  let isInitialized = false;

  function log(...args) {
    if (CONFIG.DEBUG) {
      const frameInfo = window.self !== window.top ? '[iframe]' : '[main]';
      console.log('[VP]' + frameInfo, ...args);
    }
  }

  function getFullUrl() {
    try {
      if (window.self !== window.top && window.frameElement) {
        return window.frameElement.src || window.location.href;
      }
      return window.location.href;
    } catch (e) {
      return window.location.href;
    }
  }

  function generateVideoId(video) {
    const domain = window.location.hostname;
    const pathname = window.location.pathname;
    let videoSrc = video.currentSrc || video.src || '';

    const sourceElements = video.querySelectorAll('source');
    if (!videoSrc && sourceElements.length > 0) {
      videoSrc = sourceElements[0].src || '';
    }

    let cleanSrc = videoSrc.replace('blob:', '');
    if (cleanSrc.includes('.m3u8')) {
      cleanSrc = cleanSrc.split('?')[0];
    }

    if (!cleanSrc) {
      const videos = document.querySelectorAll('video');
      const index = Array.from(videos).indexOf(video);
      cleanSrc = `page_video_${index}`;
    }

    const hash = simpleHash(domain + pathname + cleanSrc);
    return `vp_${hash}`;
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
    try {
      if (window.top && window.top.document) {
        return window.top.document.title || document.title || window.location.href;
      }
    } catch (e) {}
    return document.title || window.location.href;
  }

  function saveProgress(video, vid) {
    if (!video || isNaN(video.duration) || video.duration < CONFIG.MIN_DURATION) {
      return;
    }

    const progress = video.currentTime / video.duration;
    if (progress > 0.95) {
      return;
    }

    log('保存进度:', vid, video.currentTime.toFixed(2), '/', video.duration.toFixed(2));

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

    const vid = generateVideoId(video);
    videoMap.set(video, vid);

    log('设置视频监听器:', vid, {
      src: video.currentSrc || video.src,
      readyState: video.readyState,
      duration: video.duration
    });

    restoreProgress(video, vid);

    let saveTimer = null;

    video.addEventListener('play', () => {
      log('视频开始播放');
      if (saveTimer) clearInterval(saveTimer);
      saveTimer = setInterval(() => {
        saveProgress(video, vid);
      }, CONFIG.SAVE_INTERVAL);
    });

    video.addEventListener('pause', () => {
      log('视频暂停于', video.currentTime.toFixed(2));
      if (saveTimer) {
        clearInterval(saveTimer);
        saveTimer = null;
      }
      saveProgress(video, vid);
    });

    video.addEventListener('ended', () => {
      log('视频结束');
      if (saveTimer) {
        clearInterval(saveTimer);
        saveTimer = null;
      }
    });

    window.addEventListener('beforeunload', () => {
      saveProgress(video, vid);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        saveProgress(video, vid);
      }
    });
  }

  function scanVideos() {
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
    isInitialized = true;

    log('初始化，页面URL:', window.location.href);
    log('是否在iframe中:', window.self !== window.top);

    scanVideos();
    setTimeout(scanVideos, CONFIG.RESTORE_DELAY);
    setTimeout(scanVideos, CONFIG.RESTORE_DELAY * 2);
    setTimeout(scanVideos, CONFIG.RESTORE_DELAY * 3);

    scanTimer = setInterval(scanVideos, CONFIG.SCAN_INTERVAL);
    observeDOM();
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