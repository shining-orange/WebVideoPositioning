/**
 * Web Video Positioning - Background Service Worker
 */

// 存储键名前缀
const VIDEO_KEY_PREFIX = 'vpos_';
const ENABLED_KEY = 'vp_enabled';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getVP') {
    chrome.storage.local.get(message.key, (result) => {
      sendResponse(result[message.key] || null);
    });
    return true;
  }

  if (message.type === 'saveVP') {
    const data = {};
    data[message.key] = {
      currentTime: message.currentTime,
      duration: message.duration,
      url: message.url,
      title: message.title,
      timestamp: Date.now()
    };
    chrome.storage.local.set(data, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'deleteVP') {
    chrome.storage.local.remove(message.key, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'getAllVP') {
    chrome.storage.local.get(null, (items) => {
      // 只返回视频进度数据，排除配置项
      const filtered = {};
      Object.entries(items).forEach(([key, value]) => {
        // 只保留以 vpos_ 开头的视频记录
        if (key.startsWith(VIDEO_KEY_PREFIX) && key !== ENABLED_KEY) {
          // 验证数据有效性
          if (value && typeof value.currentTime === 'number' && typeof value.duration === 'number') {
            filtered[key] = value;
          }
        }
      });
      sendResponse(filtered);
    });
    return true;
  }

  if (message.type === 'clearAllVP') {
    chrome.storage.local.get(null, (items) => {
      // 只删除视频进度，保留配置
      const keysToDelete = Object.keys(items).filter(key =>
        key.startsWith(VIDEO_KEY_PREFIX) && key !== ENABLED_KEY
      );
      chrome.storage.local.remove(keysToDelete, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (message.type === 'toggleEnabled') {
    // 广播到所有标签页
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { type: 'toggleEnabled', enabled: message.enabled }).catch(() => {});
      });
    });
    sendResponse({ success: true });
    return true;
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({ vp_enabled: true });
    console.log('Web Video Positioning 已安装');
  } else if (details.reason === 'update') {
    console.log('Web Video Positioning 已更新');
  }
});