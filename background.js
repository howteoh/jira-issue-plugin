// 添加自動更新檢查
function checkForDailyReload() {
  // 獲取上次更新時間
  chrome.storage.local.get('lastReloadTime', function(result) {
    const now = new Date();
    const lastReload = result.lastReloadTime ? new Date(result.lastReloadTime) : null;
    
    // 如果沒有上次更新時間，或者已經過了一天
    if (!lastReload || now.getDate() !== lastReload.getDate()) {
      console.log('Performing daily reload...');
      
      // 更新最後重載時間
      chrome.storage.local.set({ 'lastReloadTime': now.toString() }, function() {
        if (chrome.runtime.lastError) {
          console.error('Error saving reload time:', chrome.runtime.lastError);
          return;
        }
        chrome.runtime.reload();
      });
    }
  });
}

// 在背景腳本啟動時檢查（這會在 Chrome 啟動時執行）
checkForDailyReload();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);
  
  if (request.type === 'getSelectedText') {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs[0]) {
        console.error('No active tab found');
        sendResponse({ selectedText: '' });
        return;
      }
      
      // 添加錯誤處理
      try {
        chrome.tabs.sendMessage(tabs[0].id, {action: "getSelectedText"}, function(response) {
          if (chrome.runtime.lastError) {
            console.error('Communication error:', chrome.runtime.lastError);
            sendResponse({ 
              selectedText: '',
              error: 'Could not connect to page. Please refresh the page and try again.'
            });
            return;
          }
          console.log('Response from content script:', response);
          sendResponse(response);
        });
      } catch (error) {
        console.error('Error sending message:', error);
        sendResponse({ 
          selectedText: '',
          error: 'Communication error. Please refresh the page.'
        });
      }
    });
    return true;  // Keep the message channel open
  }

  if (request.type === 'makeRequest') {
    console.log('Processing API request:', request.url);
    console.log('Request options:', request.options);
    
    fetch(request.url, request.options)
      .then(async response => {
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            console.log('Auth error - redirecting to login');
            throw new Error('請先登入 JIRA');
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('Fetch response data:', data);
        sendResponse({data: data});
      })
      .catch(error => {
        console.error('Fetch error:', error);
        sendResponse({error: error.message});
      });

    return true;  // 保持背景腳本開啟，等待 `sendResponse`
  }
});
