document.addEventListener('DOMContentLoaded', function() {
  console.log('Popup loaded');
  
  // Load saved settings
  loadLastUsedSettings();
  loadAuthTokens();
  
  // Function to remove newlines from text
  function removeNewlines(text) {
    return text.replace(/[\r\n]+/g, ' ').trim();
  }

  // Function to get selected text with retry mechanism
  function getSelectedTextWithRetry(maxRetries = 3, currentRetry = 0) {
    console.log(`Attempting to get text (attempt ${currentRetry + 1}/${maxRetries + 1})`);
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs[0]) {
        console.error('No active tab found');
        return;
      }
      
      chrome.runtime.sendMessage({ type: 'getSelectedText' }, function(response) {
        console.log('Response received:', response);
        
        if (response && response.selectedText) {
          console.log('Text found:', response.selectedText);
          
          const fullText = response.selectedText;
          const bodyIndex = fullText.indexOf('{"body":');
          
          // Improved JIRA URL detection
          const jiraUrlMatch = fullText.match(/jira\.realtek\.com\/browse\/([A-Z0-9]+-[0-9]+)/);
          console.log('JIRA URL match:', jiraUrlMatch);
          
          if (jiraUrlMatch && bodyIndex !== -1) {
            const issueKey = jiraUrlMatch[1];
            console.log('Found JIRA issue key:', issueKey);
            
            // Set the comment URL
            document.getElementById('apiUrl').value = 
              `https://jira.realtek.com/rest/api/2/issue/${issueKey}/comment`;
            
            // Get the body part and remove newlines
            const bodyPart = removeNewlines(fullText.substring(bodyIndex));
            document.getElementById('selectedText').value = bodyPart;
            document.getElementById('secondText').value = '';
            
            // 移除這裡的 showIssueLinkButton 調用
            updateButtonVisibility();
            return;
          }
          
          // If not a JIRA URL with body, process as normal
          if (bodyIndex !== -1) {
            // Split the text into two parts and remove newlines
            const firstPart = removeNewlines(fullText.substring(0, bodyIndex).trim());
            const secondPart = removeNewlines(fullText.substring(bodyIndex).trim());
            
            // Update both text areas
            const firstTextarea = document.getElementById('selectedText');
            const secondTextarea = document.getElementById('secondText');
            
            if (firstTextarea && secondTextarea) {
              firstTextarea.value = firstPart;
              secondTextarea.value = secondPart;
              console.log('Both textareas updated');
            }
          } else {
            // If no {"body": found, put everything in the first textarea
            const textarea = document.getElementById('selectedText');
            if (textarea) {
              textarea.value = removeNewlines(fullText);
              console.log('First textarea updated');
            }
          }
        } else if (currentRetry < maxRetries) {
          console.log(`No text found, retrying in 200ms (${currentRetry + 1}/${maxRetries})`);
          setTimeout(() => {
            getSelectedTextWithRetry(maxRetries, currentRetry + 1);
          }, 200);
        } else {
          console.log('Max retries reached, no text found');
        }
      });
    });
  }

  // Initialize text retrieval
  getSelectedTextWithRetry();

  // Load saved settings function
  function loadLastUsedSettings() {
    chrome.storage.local.get(['lastUsedAuth', 'lastUsedUrl', 'authTokens'], function(result) {
      console.log('Loading saved settings:', result);
      
      // Load auth tokens and set last used auth
      if (result.authTokens) {
        const authSelect = document.getElementById('authSelect');
        authSelect.innerHTML = '<option value="">Select Authorization</option>';
        
        Object.keys(result.authTokens).forEach(alias => {
          const option = document.createElement('option');
          option.value = alias;
          option.textContent = alias;
          authSelect.appendChild(option);
        });

        // Set last used auth if it exists
        if (result.lastUsedAuth && result.authTokens[result.lastUsedAuth]) {
          authSelect.value = result.lastUsedAuth;
        }
      }

      // Load last used URL
      if (result.lastUsedUrl) {
        document.getElementById('apiUrl').value = result.lastUsedUrl;
      }
    });
  }

  // Save settings when changed
  document.getElementById('authSelect').addEventListener('change', function(e) {
    console.log('Auth changed to:', e.target.value);
    chrome.storage.local.set({ 'lastUsedAuth': e.target.value });
  });

  document.getElementById('apiUrl').addEventListener('change', function(e) {
    console.log('URL changed to:', e.target.value);
    chrome.storage.local.set({ 'lastUsedUrl': e.target.value });
  });

  document.getElementById('addAuth').addEventListener('click', function() {
    document.getElementById('authForm').classList.add('show');
  });

  document.getElementById('cancelAuth').addEventListener('click', function() {
    document.getElementById('authForm').classList.remove('show');
    document.getElementById('authAlias').value = '';
    document.getElementById('authToken').value = '';
  });

  document.getElementById('deleteAuth').addEventListener('click', function() {
    const select = document.getElementById('authSelect');
    const selectedValue = select.value;
    if (selectedValue) {
      chrome.storage.local.get('authTokens', function(result) {
        const tokens = result.authTokens || {};
        delete tokens[selectedValue];
        chrome.storage.local.set({ 'authTokens': tokens }, function() {
          loadAuthTokens();
        });
      });
    }
  });

  document.getElementById('saveAuth').addEventListener('click', function() {
    const alias = document.getElementById('authAlias').value;
    const token = document.getElementById('authToken').value;
    
    if (!alias || !token) {
      alert('Please enter both alias and token');
      return;
    }

    chrome.storage.local.get('authTokens', function(result) {
      const tokens = result.authTokens || {};
      tokens[alias] = token;
      chrome.storage.local.set({ 'authTokens': tokens }, function() {
        document.getElementById('authForm').classList.remove('show');
        document.getElementById('authAlias').value = '';
        document.getElementById('authToken').value = '';
        loadAuthTokens();
      });
    });
  });

  // Store the last issue key
  let lastIssueKey = '';

  // Send request function
  async function sendRequest() {
    console.log('sendRequest function called');
    const method = document.getElementById('method').value;
    const url = document.getElementById('apiUrl').value;
    const authAlias = document.getElementById('authSelect').value;
    const responseDiv = document.getElementById('response');
    const issueLinkDiv = document.getElementById('issueLink');
    
    console.log('Initial issueLink display:', issueLinkDiv.style.display);
    console.log('Request params:', { method, url, authAlias });
    
    issueLinkDiv.style.display = 'none';
    
    if (!url || !authAlias) {
      console.log('Missing required fields:', { url, authAlias });
      responseDiv.textContent = !url ? 'Please enter API URL' : 'Please select authorization';
      return;
    }

    try {
      console.log('Sending request...');
      const response = await sendApiRequest(method, url, authAlias);
      console.log('sendRequest response:', response);
      
      if (response && response.data) {
        console.log('Response data:', response.data);
        
        if (response.data.key) {
          console.log('Found key:', response.data.key);
          lastIssueKey = response.data.key;
          
          responseDiv.innerHTML = `<pre>${JSON.stringify(response.data, null, 2)}</pre>`;
          
          // 直接設置 issue 鏈接
          const issueUrl = `https://jira.realtek.com/browse/${lastIssueKey}`;
          console.log('Setting up issue link for:', issueUrl);
          
          issueLinkDiv.style.display = 'block';
          console.log('Set issueLink display to block');
          
          issueLinkDiv.innerHTML = `
            <a href="${issueUrl}" target="_blank" style="
              display: inline-block;
              padding: 8px 12px;
              background-color: #0052cc;
              color: white;
              text-decoration: none;
              border-radius: 3px;
              font-size: 13px;
              margin-top: 10px;
              margin-bottom: 10px;
              width: fit-content;
            ">Open in JIRA: ${lastIssueKey}</a>
          `;

          // 自動設置評論 URL
          const commentUrl = `https://jira.realtek.com/rest/api/2/issue/${lastIssueKey}/comment`;
          document.getElementById('apiUrl').value = commentUrl;
          document.getElementById('selectedText').value = '';
          
          // 更新按鈕顯示
          updateButtonVisibility();
        } else {
          console.log('No key found in response data');
          responseDiv.textContent = JSON.stringify(response.data, null, 2);
        }
      } else {
        console.log('No valid response data');
        responseDiv.textContent = 'Invalid response format';
      }
    } catch (error) {
      console.error('Request failed:', error);
      const issueLinkDiv = document.getElementById('issueLink');
      issueLinkDiv.style.display = 'none';  // 確保錯誤時隱藏鏈接按鈕
      
      responseDiv.innerHTML = `
        <div style="color: red; padding: 10px;">
          ${error.message === '請先登入 JIRA' ? 
            `- <a href="https://jira.realtek.com" target="_blank">登入 JIRA</a>` : 
            error.message}
        </div>
      `;
    }
    
    console.log('Final issueLink display:', issueLinkDiv.style.display);
  }

  // Add handler for second request
  document.getElementById('sendSecondRequest').addEventListener('click', async function() {
    const url = document.getElementById('apiUrl').value;
    const authAlias = document.getElementById('authSelect').value;
    const responseDiv = document.getElementById('response');
    const issueLinkDiv = document.getElementById('issueLink');
    issueLinkDiv.style.display = 'none';  // 在發送請求前先隱藏
    
    // Check if the URL is a comment URL
    if (!url.includes('/rest/api/2/issue/') || !url.includes('/comment')) {
      alert('Please create an issue first or select a valid JIRA issue.');
      return;
    }

    try {
      // Get the body from the first textarea if it contains {"body":
      const firstTextarea = document.getElementById('selectedText');
      const secondTextarea = document.getElementById('secondText');
      let commentBody;

      if (firstTextarea.value.includes('{"body":')) {
        commentBody = firstTextarea.value;
      } else {
        commentBody = secondTextarea.value;
      }

      const response = await sendApiRequest('POST', url, authAlias, commentBody);
      responseDiv.textContent = JSON.stringify(response.data, null, 2);

      // 從 URL 中提取 issue key 並在成功後顯示
      const issueKeyMatch = url.match(/issue\/([A-Z0-9]+-[0-9]+)/);
      if (issueKeyMatch && issueKeyMatch[1]) {
        showIssueLinkButton(issueKeyMatch[1]);
      }
    } catch (error) {
      console.error('Comment request failed:', error);
      responseDiv.innerHTML = `
        <div style="color: red; padding: 10px;">
          - <a href="https://jira.realtek.com" target="_blank">登入 JIRA</a>
        </div>
      `;
    }
  });

  // Helper function for sending API requests
  async function sendApiRequest(method, url, authAlias, body = null) {
    const tokens = await new Promise(resolve => {
      chrome.storage.local.get('authTokens', result => resolve(result.authTokens || {}));
    });
    
    const authToken = tokens[authAlias];
    const requestHeaders = {
      'Authorization': authToken,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    console.log('Using auth token:', authToken); // 添加這行來檢查認證令牌

    const options = {
      method: method,
      headers: requestHeaders
    };

    if (method === 'POST') {
      options.body = body || document.getElementById('selectedText').value;
    }

    return new Promise((resolve, reject) => {
      console.log('Sending message to background:', {
        type: 'makeRequest',
        url: url,
        options: options
      });

      chrome.runtime.sendMessage({
        type: 'makeRequest',
        url: url,
        options: options
      }, response => {
        console.log('Received response from background:', response);
        if (response && response.error) {
          reject(new Error(response.error));
        } else if (response && response.data) {
          resolve(response);
        } else {
          reject(new Error('Invalid response format'));
        }
      });
    });
  }

  // Add click handler for send request button
  const sendRequestButton = document.getElementById('sendRequest');
  console.log('Send Request button:', sendRequestButton);
  sendRequestButton.addEventListener('click', () => {
    console.log('Send Request button clicked');
    sendRequest();
  });

  // 在 DOMContentLoaded 事件監聽器中添加
  document.getElementById('reloadExt').addEventListener('click', function() {
    chrome.runtime.reload();
    window.close(); // 關閉 popup
  });

  // 監聽 URL 輸入框的變化
  document.getElementById('apiUrl').addEventListener('input', updateButtonVisibility);
  
  // 初始檢查按鈕顯示狀態
  updateButtonVisibility();
});

// Utility functions
function loadLastUrl() {
  chrome.storage.local.get('lastUsedUrl', function(result) {
    if (result.lastUsedUrl) {
      document.getElementById('apiUrl').value = result.lastUsedUrl;
    }
  });
}

function loadAuthTokens() {
  chrome.storage.local.get(['authTokens', 'lastUsedAuth'], function(result) {
    const tokens = result.authTokens || {};
    const lastUsed = result.lastUsedAuth;
    
    const select = document.getElementById('authSelect');
    select.innerHTML = '<option value="">Select Authorization</option>';
    
    Object.keys(tokens).forEach(alias => {
      const option = document.createElement('option');
      option.value = alias;
      option.textContent = alias;
      select.appendChild(option);
    });

    if (lastUsed && tokens[lastUsed]) {
      select.value = lastUsed;
    }
  });
}

// 在文件開頭添加一個函數來處理 issue 鏈接的顯示
function showIssueLinkButton(issueKey) {
  const issueLinkDiv = document.getElementById('issueLink');
  const issueUrl = `https://jira.realtek.com/browse/${issueKey}`;
  
  issueLinkDiv.style.display = 'block';  // 顯示鏈接
  issueLinkDiv.innerHTML = `
    <a href="${issueUrl}" target="_blank" style="
      display: inline-block;
      padding: 8px 12px;
      background-color: #0052cc;
      color: white;
      text-decoration: none;
      border-radius: 3px;
      font-size: 13px;
      margin-top: 10px;
      margin-bottom: 10px;
      width: fit-content;
    ">Open in JIRA: ${issueKey}</a>
  `;
}

// 添加一個函數來控制按鈕顯示
function updateButtonVisibility() {
  const url = document.getElementById('apiUrl').value;
  const sendRequestBtn = document.getElementById('sendRequest');
  const sendCommentBtn = document.getElementById('sendSecondRequest');
  
  // 檢查是否是評論 URL
  const isCommentUrl = url.includes('/rest/api/2/issue/') && url.includes('/comment');
  
  // 根據 URL 類型顯示/隱藏按鈕
  sendRequestBtn.style.display = isCommentUrl ? 'none' : 'inline-block';
  sendCommentBtn.style.display = isCommentUrl ? 'inline-block' : 'none';
}
