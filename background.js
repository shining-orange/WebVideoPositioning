/**
 * Web Video Positioning - Background Service Worker
 */

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
      sendResponse(items);
    });
    return true;
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Web Video Positioning 已安装');
  } else if (details.reason === 'update') {
    console.log('Web Video Positioning 已更新');
  }
});