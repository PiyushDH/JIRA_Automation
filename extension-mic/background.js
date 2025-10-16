// Background service worker for Audio Transcription Extension

chrome.runtime.onInstalled.addListener(() => {
  console.log('Audio Transcription Extension installed');
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // This will open the popup automatically
  chrome.action.openPopup();
});

// Optional: Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveTranscription') {
    // Save transcription to storage or send to external API
    chrome.storage.local.set({
      [`transcription_${Date.now()}`]: {
        text: request.transcription,
        timestamp: new Date().toISOString(),
        tabId: sender.tab?.id
      }
    });
    sendResponse({ success: true });
  }
  
  if (request.action === 'getApiKey') {
    chrome.storage.sync.get(['falApiKey'], (result) => {
      sendResponse({ apiKey: result.falApiKey });
    });
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'sendToN8n') {
    // Handle webhook request from background script to avoid CORS
    chrome.storage.sync.get(['n8nWebhookUrl'], async (result) => {
      const webhookUrl = result.n8nWebhookUrl || 'https://masterskywalker.app.n8n.cloud/webhook-test/n8n-JIRA';
      
      console.log('Background script: Sending to webhook URL:', webhookUrl);
      console.log('Background script: Transcription data:', request.transcription);
      
      try {
        const payload = {
          transcription: request.transcription,
          timestamp: new Date().toISOString(),
          source: 'chrome-extension-mic'
        };
        
        console.log('Background script: Sending payload:', payload);
        
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload)
        });
        
        console.log('Background script: Response status:', response.status);
        console.log('Background script: Response headers:', response.headers);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Background script: Error response body:', errorText);
          throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
        }
        
        const responseText = await response.text();
        console.log('Background script: Success response body:', responseText);
        
        sendResponse({ success: true, message: 'Successfully sent to n8n webhook' });
      } catch (error) {
        console.error('Background script webhook error:', error);
        sendResponse({ success: false, error: error.message });
      }
    });
    return true; // Keep message channel open for async response
  }
});

// Handle storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (changes.falApiKey) {
    console.log('FAL API key updated');
  }
}); 