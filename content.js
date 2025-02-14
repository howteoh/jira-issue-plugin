let lastSelectedText = '';
let selectionTimeout = null;

// Create MutationObserver to watch for DOM changes
const observer = new MutationObserver((mutations) => {
  if (window.location.hostname === 'docs.google.com' && window.location.pathname.includes('/spreadsheets/')) {
    try {
      // Try different selectors for Google Sheets cells
      const selectors = [
        '.grid-cell[aria-selected="true"]',
        '.waffle-cell-focus',
        '.cell-selected',
        '.waffle-selected',
        '[role="gridcell"][aria-selected="true"]'
      ];

      for (const selector of selectors) {
        const cells = document.querySelectorAll(selector);
        if (cells.length > 0) {
          const text = Array.from(cells)
            .map(cell => {
              const content = 
                cell.getAttribute('aria-label') ||
                cell.querySelector('[dir="ltr"]')?.textContent ||
                cell.innerText ||
                cell.textContent;
              return content?.trim();
            })
            .filter(Boolean)
            .join('\n');

          if (text) {
            lastSelectedText = text;
            console.log('Observer found text:', text);
            break;
          }
        }
      }
    } catch (error) {
      console.error('Observer error:', error);
    }
  }
});

// Start observing with all possible changes
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  characterData: true,
  attributeFilter: ['aria-selected', 'class']
});

// Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Content script received message:', request);
  
  if (request.action === "getSelectedText") {
    // Use a promise to handle both immediate and delayed text
    new Promise((resolve) => {
      let selectedText = '';
      
      // First try to get the text immediately
      selectedText = window.getSelection().toString() || lastSelectedText;
      
      if (selectedText) {
        resolve(selectedText);
        return;
      }

      // If no text found, wait a short time and try again
      setTimeout(() => {
        selectedText = window.getSelection().toString() || lastSelectedText;
        resolve(selectedText);
      }, 100);
    })
    .then(selectedText => {
      console.log('Selected text to send:', selectedText);
      sendResponse({ selectedText: selectedText });
    });

    return true; // Keep the message channel open for async response
  }
});

// Add multiple event listeners to catch selection changes
['mouseup', 'keyup', 'selectionchange', 'copy'].forEach(eventType => {
  document.addEventListener(eventType, () => {
    // Clear any existing timeout
    if (selectionTimeout) {
      clearTimeout(selectionTimeout);
    }

    // Set a new timeout
    selectionTimeout = setTimeout(() => {
      const selection = window.getSelection().toString();
      if (selection) {
        lastSelectedText = selection;
        console.log(`Selection updated from ${eventType}:`, selection);
      }
    }, 50);
  });
});

// Add clipboard event listener
document.addEventListener('copy', (e) => {
  const selection = window.getSelection().toString();
  if (selection) {
    lastSelectedText = selection;
    console.log('Selection updated from copy event:', selection);
  }
});

console.log('Content script loaded on:', window.location.href);