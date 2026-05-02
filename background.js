/**
 * Web Video Positioning - Background Service Worker
 */

// 存储键名前缀
const VIDEO_KEY_PREFIX = 'vpos_';
const ENABLED_KEY = 'vp_enabled';
const EXCLUDED_SITES_KEY = 'vp_excluded_sites';

// 默认排除的主流视频/直播网站
// scope: domain = 域名与子页面(全部排除), subdomain = 仅域名本身(只排除首页), path = 仅子页面(只排除子页面)
// enabled: 默认不启用，用户可自行勾选
const DEFAULT_EXCLUDED_SITES = [
  // 国际视频平台 - 这些平台主要业务就是视频，用 domain
  { domain: 'youtube.com', name: 'YouTube', scope: 'domain', enabled: false },
  { domain: 'netflix.com', name: 'Netflix', scope: 'domain', enabled: false },
  { domain: 'primevideo.com', name: 'Amazon Prime Video', scope: 'domain', enabled: false },
  { domain: 'twitch.tv', name: 'Twitch', scope: 'domain', enabled: false },
  { domain: 'vimeo.com', name: 'Vimeo', scope: 'domain', enabled: false },
  { domain: 'dailymotion.com', name: 'Dailymotion', scope: 'domain', enabled: false },

  // 短视频平台 - 主要业务就是短视频，用 domain
  { domain: 'tiktok.com', name: 'TikTok', scope: 'domain', enabled: false },
  { domain: 'douyin.com', name: '抖音', scope: 'domain', enabled: false },

  // 国内视频平台 - 有多个子域名，用 subdomain 精确匹配
  { domain: 'www.bilibili.com', name: '哔哩哔哩', scope: 'subdomain', enabled: false },
  { domain: 'www.youku.com', name: '优酷', scope: 'subdomain', enabled: false },
  { domain: 'www.iqiyi.com', name: '爱奇艺', scope: 'subdomain', enabled: false },
  { domain: 'v.qq.com', name: '腾讯视频', scope: 'subdomain', enabled: false },
  { domain: 'www.mgtv.com', name: '芒果TV', scope: 'subdomain', enabled: false },
  { domain: 'tv.cctv.com', name: '央视网', scope: 'subdomain', enabled: false },

  // 直播平台
  { domain: 'live.bilibili.com', name: '哔哩哔哩直播', scope: 'subdomain', enabled: false },
  { domain: 'www.douyu.com', name: '斗鱼直播', scope: 'subdomain', enabled: false },
  { domain: 'www.huya.com', name: '虎牙直播', scope: 'subdomain', enabled: false }
];

// 获取排除站点列表
function getExcludedSites(callback) {
  chrome.storage.local.get(EXCLUDED_SITES_KEY, (result) => {
    if (result[EXCLUDED_SITES_KEY]) {
      callback(result[EXCLUDED_SITES_KEY]);
    } else {
      // 首次获取时初始化默认排除列表
      chrome.storage.local.set({ [EXCLUDED_SITES_KEY]: DEFAULT_EXCLUDED_SITES }, () => {
        callback(DEFAULT_EXCLUDED_SITES);
      });
    }
  });
}

// 检查URL是否在排除列表中
function isUrlExcluded(url, callback) {
  getExcludedSites((sites) => {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      const pathname = urlObj.pathname.toLowerCase();

      const isExcluded = sites.some(site => {
        if (!site.enabled) return false;

        const siteDomain = site.domain.toLowerCase();
        const scope = site.scope || 'domain';

        // 解析 site.domain，可能包含路径
        let siteHostname = siteDomain;
        let sitePath = '';

        if (siteDomain.includes('/')) {
          const parts = siteDomain.split('/');
          siteHostname = parts[0];
          sitePath = '/' + parts.slice(1).join('/');
        }

        // 精确域名匹配（不含子域名）
        const isExactHostnameMatch = hostname === siteHostname;
        // 域名匹配（含子域名）
        const isHostnameWithSubdomainMatch = isExactHostnameMatch || hostname.endsWith('.' + siteHostname);
        // 是否有子页面（路径不是 / 或空）
        const hasSubpage = pathname !== '/' && pathname !== '';

        if (scope === 'domain') {
          // 域名与子页面：该域名下的所有页面（不含其他子域名）
          return isExactHostnameMatch;
        } else if (scope === 'subdomain') {
          // 仅域名本身：只排除首页
          return isExactHostnameMatch && !hasSubpage;
        } else if (scope === 'path') {
          // 仅子页面：只排除子页面
          return isExactHostnameMatch && hasSubpage;
        }

        return false;
      });

      callback(isExcluded);
    } catch (e) {
      callback(false);
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getVP') {
    chrome.storage.local.get(message.key, (result) => {
      sendResponse(result[message.key] || null);
    });
    return true;
  }

  if (message.type === 'saveVP') {
    // 检查是否在排除列表中
    isUrlExcluded(message.url, (excluded) => {
      if (excluded) {
        sendResponse({ success: false, reason: 'excluded' });
        return;
      }
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
        if (key.startsWith(VIDEO_KEY_PREFIX) && key !== ENABLED_KEY && key !== EXCLUDED_SITES_KEY) {
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
        key.startsWith(VIDEO_KEY_PREFIX) && key !== ENABLED_KEY && key !== EXCLUDED_SITES_KEY
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

  // 获取排除站点列表
  if (message.type === 'getExcludedSites') {
    getExcludedSites((sites) => {
      sendResponse(sites);
    });
    return true;
  }

  // 更新排除站点
  if (message.type === 'updateExcludedSites') {
    chrome.storage.local.set({ [EXCLUDED_SITES_KEY]: message.sites }, () => {
      // 广播到所有标签页更新排除列表
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { type: 'updateExcludedSites', sites: message.sites }).catch(() => {});
        });
      });
      sendResponse({ success: true });
    });
    return true;
  }

  // 添加排除站点
  if (message.type === 'addExcludedSite') {
    getExcludedSites((sites) => {
      const newSite = {
        domain: message.domain,
        name: message.name || message.domain,
        scope: message.scope || 'domain',
        enabled: true
      };
      // 检查是否已存在
      const exists = sites.some(s => s.domain.toLowerCase() === message.domain.toLowerCase());
      if (!exists) {
        sites.push(newSite);
        chrome.storage.local.set({ [EXCLUDED_SITES_KEY]: sites }, () => {
          chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
              chrome.tabs.sendMessage(tab.id, { type: 'updateExcludedSites', sites }).catch(() => {});
            });
          });
          sendResponse({ success: true, sites });
        });
      } else {
        sendResponse({ success: false, reason: 'exists' });
      }
    });
    return true;
  }

  // 删除排除站点
  if (message.type === 'removeExcludedSite') {
    getExcludedSites((sites) => {
      const filtered = sites.filter(s => s.domain.toLowerCase() !== message.domain.toLowerCase());
      chrome.storage.local.set({ [EXCLUDED_SITES_KEY]: filtered }, () => {
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { type: 'updateExcludedSites', sites: filtered }).catch(() => {});
          });
        });
        sendResponse({ success: true, sites: filtered });
      });
    });
    return true;
  }

  // 检查当前页面是否被排除
  if (message.type === 'checkExcluded') {
    isUrlExcluded(message.url, (excluded) => {
      sendResponse({ excluded });
    });
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
