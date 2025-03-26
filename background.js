// Generate a device-based machine ID that stays consistent across reinstalls
function generateMachineId() {
  // Collect stable device characteristics (service worker safe)
  const cpuCores = navigator.hardwareConcurrency || '4';
  const platform = navigator.platform || '';
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const languages = navigator.languages ? navigator.languages.join(',') : '';
  const userAgent = navigator.userAgent || '';
  
  // Combine them into a single string (no screen props, which aren't available in service workers)
  const rawFingerprint = `${cpuCores}|${platform}|${timezone}|${languages}|${userAgent}`;
  
  // Create a simple hash of this string
  let hash = 0;
  for (let i = 0; i < rawFingerprint.length; i++) {
    const char = rawFingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Convert to alphanumeric ID
  return 'device_' + Math.abs(hash).toString(36);
}

// Set user to trial status on installation but preserve paid status
chrome.runtime.onInstalled.addListener(() => {
  // Generate a unique user ID if not already present
  chrome.storage.sync.get(['userId', 'userStatus'], (data) => {
    if (!data.userId) {
      const userId = generateMachineId();
      chrome.storage.sync.set({ userId });
    }
    
    // Only set to trial if no status exists yet
    if (!data.userStatus) {
      chrome.storage.sync.set({ userStatus: 'trial' });
    }
  });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'renameAttachment') {
    // Check if user is paid or in trial period
    chrome.storage.sync.get('userStatus', (data) => {
      if (data.userStatus === 'paid') {
        // Process download with renamed file
        processDownload(message.url, message.newFilename);
        sendResponse({ success: true });
      } else {
        // In trial mode, limit to 5 renames per day
        checkTrialLimits((withinLimits) => {
          if (withinLimits) {
            processDownload(message.url, message.newFilename);
            sendResponse({ success: true });
          } else {
            sendResponse({ 
              success: false, 
              reason: 'trial_limit_reached' 
            });
          }
        });
        return true; // Keep sendResponse valid for async callback
      }
    });
    return true; // Keep sendResponse valid for async response
  }
});

// Process the download with a new filename
function processDownload(url, newFilename) {
  chrome.downloads.download({
    url: url,
    filename: newFilename,
    saveAs: false
  });
}

// Check if user is within trial limits
function checkTrialLimits(callback) {
  chrome.storage.sync.get(['trialUsage'], (data) => {
    // Initialize trial usage if not exists
    const today = new Date().toDateString();
    const trialUsage = data.trialUsage || {};
    
    // Check if today's usage exists
    if (!trialUsage[today]) {
      trialUsage[today] = 0;
    }
    
    // Check if within limit (5 per day)
    const withinLimits = trialUsage[today] < 5;
    
    // Increment usage if within limits
    if (withinLimits) {
      trialUsage[today]++;
      chrome.storage.sync.set({ trialUsage });
    }
    
    callback(withinLimits);
  });
} 