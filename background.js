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

// Check trial usage from server based on machine ID
function checkExistingTrialUsage(machineId) {
  // Netlify function endpoint for trial usage check
  const endpoint = 'https://steady-manatee-6a2fdc.netlify.app/.netlify/functions/check-trial-usage';
  
  // Call the endpoint with machine ID
  fetch(`${endpoint}?machineId=${encodeURIComponent(machineId)}`)
    .then(response => response.json())
    .then(data => {
      // If machine has previous trial usage, restore it
      if (data.exists && data.trialUsage) {
        chrome.storage.sync.set({ trialUsage: data.trialUsage });
      }
    })
    .catch(error => {
      // Silently fail - this is non-critical functionality
      console.error('Error checking trial usage:', error);
    });
}

// Set user to trial status on installation but preserve paid status
chrome.runtime.onInstalled.addListener(() => {
  // Generate machine ID first
  const machineId = generateMachineId();
  
  // Generate a unique user ID if not already present
  chrome.storage.sync.get(['userId', 'userStatus'], (data) => {
    if (!data.userId) {
      const userId = machineId;
      chrome.storage.sync.set({ userId, machineId });
      
      // Check if this machine has previous trial usage
      checkExistingTrialUsage(machineId);
    } else {
      // Ensure we have machineId stored
      chrome.storage.sync.set({ machineId });
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
  chrome.storage.sync.get(['trialUsage', 'machineId'], (data) => {
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
      
      // If we've reached the limit, sync with server
      if (trialUsage[today] >= 5 && data.machineId) {
        syncTrialUsageWithServer(data.machineId, today, trialUsage[today]);
      }
    }
    
    callback(withinLimits);
  });
}

// Sync trial usage with server when limit reached
function syncTrialUsageWithServer(machineId, date, count) {
  const endpoint = 'https://steady-manatee-6a2fdc.netlify.app/.netlify/functions/update-trial-usage';
  
  fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      machineId,
      date,
      count
    })
  }).catch(error => {
    // Silent fail - this is non-critical
    console.error('Error syncing trial usage:', error);
  });
} 