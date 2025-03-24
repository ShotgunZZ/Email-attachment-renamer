/**
 * Gmail Attachment Renamer - Background Script
 * 
 * This script handles the actual download and renaming of attachments.
 */

// Default filename pattern
const defaultPattern = 'YYYY-MM-DD_SenderName_OriginalFilename';

// Track pending downloads that we should rename
const pendingDownloads = new Map();

// License status
let licenseStatus = {
  isValid: true, // Start assuming valid until checked
  daysLeft: 7,
  isPaid: false
};

// Set up initialization
chrome.runtime.onInstalled.addListener(handleExtensionInstalled);
chrome.runtime.onStartup.addListener(initializeBackgroundScript);
initializeBackgroundScript(); // Also initialize on script load

/**
 * Handle extension installation or update
 */
function handleExtensionInstalled(details) {
  console.log("Gmail Attachment Renamer extension installed or updated:", details.reason);
  
  // Set default pattern if not already set
  chrome.storage.sync.get('pattern', (result) => {
    if (!result.pattern) {
      chrome.storage.sync.set({ pattern: defaultPattern }, () => {
        console.log("Default pattern set:", defaultPattern);
      });
    }
  });
  
  initializeBackgroundScript();
}

/**
 * Initialize the background script
 */
async function initializeBackgroundScript() {
  console.log("Initializing Gmail Attachment Renamer background script");
  
  // Clear any stale data that might be leftover from previous runs
  pendingDownloads.clear();
  
  // Check license status if license.js is loaded
  if (typeof window.licenseManager !== 'undefined') {
    try {
      licenseStatus = await window.licenseManager.init();
      console.log("License status:", licenseStatus);
    } catch (error) {
      console.error("Error checking license:", error);
    }
  }
  
  // Notify any open Gmail tabs that the background script is ready
  notifyGmailTabs();
}

/**
 * Notify all open Gmail tabs that the background script is ready
 */
function notifyGmailTabs() {
  chrome.tabs.query({ url: "https://mail.google.com/*" }, (tabs) => {
    for (const tab of tabs) {
      try {
        chrome.tabs.sendMessage(tab.id, { 
          action: 'backgroundReady',
          licenseStatus: licenseStatus
        }, (response) => {
          if (chrome.runtime.lastError) {
            // Ignore errors, tabs might not have content script loaded yet
            console.log(`Tab ${tab.id} not ready for messages`);
          } else if (response && response.status === 'ok') {
            console.log(`Tab ${tab.id} notified of background ready`);
          }
        });
      } catch (error) {
        console.error(`Error notifying tab ${tab.id}:`, error);
      }
    }
  });
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message.action);
  
  if (message.action === 'watchForDownloads') {
    // Check license before allowing operation
    if (!licenseStatus.isValid) {
      sendResponse({
        status: 'error',
        error: 'license_expired',
        message: 'Your trial period has expired. Please upgrade to continue using this extension.',
        licenseStatus: licenseStatus
      });
      return;
    }
    
    // Register this download to be monitored
    // Use the new downloadId if available, otherwise generate a key from filename
    const key = message.downloadId || generateDownloadKey(message.originalFilename);
    
    pendingDownloads.set(key, {
      downloadId: message.downloadId, // Store the new downloadId
      originalFilename: message.originalFilename,
      newFilename: message.newFilename,
      tabId: sender.tab.id,
      timestamp: Date.now()
    });
    
    // Clean up old pending downloads (older than 5 minutes)
    cleanupPendingDownloads();
    
    console.log("Now watching for download of:", message.originalFilename);
    console.log("Will rename to:", message.newFilename);
    console.log("Using tracking ID:", key);
    console.log("Current pending downloads:", pendingDownloads.size);
    
    sendResponse({status: 'watching', licenseStatus: licenseStatus});
  } else if (message.action === 'loadPattern') {
    // Load the pattern from storage
    chrome.storage.sync.get('pattern', (result) => {
      sendResponse({
        status: 'ok',
        pattern: result.pattern || defaultPattern,
        licenseStatus: licenseStatus
      });
    });
    return true; // Keep the message channel open for async response
  } else if (message.action === 'getLicenseStatus') {
    // Return current license status
    sendResponse({status: 'ok', licenseStatus: licenseStatus});
  } else if (message.action === 'activateLicense') {
    // Forward to license manager if available
    if (typeof window.licenseManager !== 'undefined') {
      window.licenseManager.activateLicense(message.licenseKey)
        .then(result => {
          if (result.success) {
            // Update license status
            licenseStatus = {
              isValid: true,
              daysLeft: 0,
              isPaid: true
            };
          }
          sendResponse({
            status: 'ok',
            activationResult: result,
            licenseStatus: licenseStatus
          });
        })
        .catch(error => {
          console.error("License activation error:", error);
          sendResponse({
            status: 'error',
            message: 'Failed to activate license',
            licenseStatus: licenseStatus
          });
        });
      return true;
    } else {
      sendResponse({
        status: 'error',
        message: 'License manager not available',
        licenseStatus: licenseStatus
      });
    }
  } else if (message.action === 'ping') {
    // Respond to ping requests (used for connection testing)
    sendResponse({status: 'ok', licenseStatus: licenseStatus});
  } else if (message.action === 'heartbeat') {
    // Respond to heartbeat messages (used for connection monitoring)
    sendResponse({status: 'ok', licenseStatus: licenseStatus});
  } else {
    // Unknown message
    console.warn('Unknown message received:', message);
    sendResponse({status: 'error', message: 'Unknown action'});
  }
  
  // For non-async responses
  return message.action === 'loadPattern' || message.action === 'activateLicense';
});

/**
 * Create a unique key for a download based on filename
 * @param {string} filename - Original filename
 * @returns {string} A key for the download
 */
function generateDownloadKey(filename) {
  return `download_${filename}_${Date.now()}`;
}

/**
 * Clean up old pending downloads
 */
function cleanupPendingDownloads() {
  const now = Date.now();
  const expirationTime = 5 * 60 * 1000; // 5 minutes
  
  pendingDownloads.forEach((download, key) => {
    if (now - download.timestamp > expirationTime) {
      pendingDownloads.delete(key);
      console.log("Removed expired pending download:", key);
    }
  });
}

// Helper function to safely send messages to tabs
function safelySendMessage(tabId, message) {
  try {
    // First check if tab still exists
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        console.warn(`Tab ${tabId} no longer exists:`, chrome.runtime.lastError.message);
        return;
      }
      
      // Tab exists, try to send message
      chrome.tabs.sendMessage(tabId, message, response => {
        if (chrome.runtime.lastError) {
          console.warn(`Could not send message to tab ${tabId}:`, chrome.runtime.lastError.message);
        }
      });
    });
  } catch (error) {
    console.error("Error sending message to tab:", error);
  }
}

// Monitor all downloads
chrome.downloads.onCreated.addListener(downloadItem => {
  try {
    console.log("Download created:", downloadItem.id, downloadItem.filename, downloadItem.url);
    
    // Log all pending downloads for debugging
    console.log("Current pending downloads:");
    pendingDownloads.forEach((download, key) => {
      console.log(`- Key: ${key}, Original: ${download.originalFilename}, New: ${download.newFilename}`);
    });
    
    // Check if this is a Gmail attachment (based on URL patterns)
    const isGmailDownload = downloadItem.url.includes('mail-attachment.googleusercontent.com') || 
        (downloadItem.url.includes('mail.google.com') && 
         (downloadItem.url.includes('/download/') || downloadItem.url.includes('attid=')));
         
    // Check if this might be a PDF viewer download
    const isPdfViewerDownload = 
        downloadItem.url.includes('docs.google.com/viewer') || 
        downloadItem.url.includes('drive.google.com') ||
        downloadItem.filename.toLowerCase().endsWith('.pdf');
    
    // Log even more details about the download for debugging
    console.log("Download details:", {
      id: downloadItem.id,
      filename: downloadItem.filename,
      url: downloadItem.url,
      mimeType: downloadItem.mime || 'unknown',
      isGmailDownload, 
      isPdfViewerDownload,
      pendingDownloadsCount: pendingDownloads.size
    });
    
    if (isGmailDownload || isPdfViewerDownload) {
      // Get the original filename without path
      let originalFilename = downloadItem.filename;
      if (originalFilename.includes('/') || originalFilename.includes('\\')) {
        originalFilename = originalFilename.split(/[/\\]/).pop();
      }
      
      console.log("Detected Gmail attachment download:", originalFilename);
      
      // Check if this matches any pending downloads we should rename
      let foundMatch = false;
      let matchedDownload = null;
      let matchedKey = null;
      
      // First try to match by explicit attachment ID shown in logs
      if (originalFilename.includes('attachment_')) {
        // Extract the attachment ID (format often like "attachment_17472493XXXXX")
        const attachIdMatch = originalFilename.match(/attachment_(\d+)/);
        if (attachIdMatch && attachIdMatch[1]) {
          const attachmentId = attachIdMatch[1];
          console.log("Looking for specific attachment ID:", attachmentId);
          
          pendingDownloads.forEach((download, key) => {
            if (download.originalFilename.includes(attachmentId)) {
              foundMatch = true;
              matchedDownload = download;
              matchedKey = key;
              console.log("Matched by attachment ID:", attachmentId);
            }
          });
        }
      }
      
      // If no match by ID, try the download ID approach (added in recent updates)
      if (!foundMatch) {
        pendingDownloads.forEach((download, key) => {
          // Try to find the download using the unique ID first (most reliable)
          if (download.downloadId && key.includes('download_')) {
            // Compare original filenames for verification
            if (originalFilename === download.originalFilename || 
                originalFilename.includes(download.originalFilename) ||
                download.originalFilename.includes(originalFilename)) {
              // We found a match with a tracked ID!
              foundMatch = true;
              matchedDownload = download;
              matchedKey = key;
              console.log("Found download ID match for:", download.originalFilename);
            }
          }
        });
      }
      
      // If still no match, fall back to filename matching (legacy approach)
      if (!foundMatch) {
        pendingDownloads.forEach((download, key) => {
          // Try to match by filename or partial filename since Gmail might modify it slightly
          if (originalFilename === download.originalFilename || 
              originalFilename.includes(download.originalFilename) ||
              download.originalFilename.includes(originalFilename)) {
            foundMatch = true;
            matchedDownload = download;
            matchedKey = key;
            console.log("Found matching pending download by filename:", download.originalFilename);
          }
        });
      }
      
      if (foundMatch && matchedDownload) {
        console.log("Found match! Will rename to:", matchedDownload.newFilename);
        
        // Remove the matched download from pending list
        if (matchedKey) {
          pendingDownloads.delete(matchedKey);
        }
        
        // Process download renaming
        processDownloadRename(downloadItem, matchedDownload);
      } else {
        console.log("No matching pending download found for:", originalFilename);
        
        // Special handling for PDF files from the viewer
        if (isPdfViewerDownload || originalFilename.toLowerCase().endsWith('.pdf')) {
          console.log("This appears to be a PDF download, attempting fuzzy match");
          
          // Try more aggressive matching specifically for PDFs
          tryFuzzyMatchAndRename(downloadItem, originalFilename);
        } else {
          // Try the regular fuzzy match for non-PDF files
          tryFuzzyMatchAndRename(downloadItem, originalFilename);
        }
      }
    }
  } catch (error) {
    console.error("Error processing download:", error);
    
    // Try to restart the download normally as a fallback
    chrome.downloads.download({
      url: downloadItem.url
    }, retryId => {
      console.log("Restarted original download with ID:", retryId);
    });
  }
});

/**
 * Process download rename operation
 * @param {Object} downloadItem - The download item from Chrome API
 * @param {Object} matchedDownload - The matched download from our tracking
 */
function processDownloadRename(downloadItem, matchedDownload) {
  // Check license before proceeding
  if (!licenseStatus.isValid) {
    console.log("License invalid, cannot rename download");
    
    // Notify content script of the license issue
    if (matchedDownload.tabId) {
      safelySendMessage(matchedDownload.tabId, {
        action: 'downloadError',
        error: 'license_expired',
        message: 'Your trial period has expired. Please upgrade to continue using this extension.',
        originalFilename: matchedDownload.originalFilename,
        licenseStatus: licenseStatus
      });
    }
    return;
  }
  
  try {
    // Note: We don't send downloadStarted notification anymore
    // to avoid showing too many notifications to users
    
    // First cancel the current download
    chrome.downloads.cancel(downloadItem.id, () => {
      if (chrome.runtime.lastError) {
        console.error("Error canceling download:", chrome.runtime.lastError);
        // Try to continue anyway
      }
      
      // Make sure to preserve the correct file extension for the document type
      const newFilename = ensureCorrectExtension(matchedDownload.newFilename, downloadItem.filename);
      console.log("Starting new download with filename:", newFilename);
      
      chrome.downloads.download({
        url: downloadItem.url,
        filename: newFilename,
        conflictAction: 'uniquify'
      }, newDownloadId => {
        if (chrome.runtime.lastError) {
          console.error("Error renaming download:", chrome.runtime.lastError);
          
          // Try to restart the original download
          chrome.downloads.download({
            url: downloadItem.url
          }, retryId => {
            console.log("Restarted original download with ID:", retryId);
          });
          
          // Notify content script of the error
          if (matchedDownload.tabId) {
            safelySendMessage(matchedDownload.tabId, {
              action: 'downloadError',
              error: 'Failed to rename download: ' + chrome.runtime.lastError.message,
              originalFilename: matchedDownload.originalFilename
            });
          }
        } else {
          console.log("Successfully renamed download, new ID:", newDownloadId);
          
          // Notify content script of the success - simplified message
          if (matchedDownload.tabId) {
            safelySendMessage(matchedDownload.tabId, {
              action: 'downloadComplete',
              downloadId: newDownloadId,
              originalFilename: matchedDownload.originalFilename,
              newFilename: newFilename
            });
          }
        }
      });
    });
  } catch (error) {
    console.error("Error in processDownloadRename:", error);
    
    // Try to restart the original download as fallback
    chrome.downloads.download({
      url: downloadItem.url
    }, retryId => {
      console.log("Restarted original download with ID:", retryId);
    });
  }
}

/**
 * Ensure that the renamed file maintains the correct file extension
 * @param {string} newFilename - The renamed filename
 * @param {string} originalFilename - The original filename from the download
 * @returns {string} - Filename with correct extension
 */
function ensureCorrectExtension(newFilename, originalFilename) {
  try {
    // Get extensions from filenames
    const getExtension = (filename) => {
      const match = filename.match(/\.([^.]+)$/);
      return match ? match[1].toLowerCase() : '';
    };
    
    const originalExt = getExtension(originalFilename);
    const newExt = getExtension(newFilename);
    
    // If original has a real extension and new doesn't match, use the original extension
    if (originalExt && originalExt !== newExt) {
      // Common document extensions
      const docExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'jpg', 'jpeg', 'png', 'gif'];
      
      // Only replace if the original extension is a common document type
      if (docExtensions.includes(originalExt)) {
        console.log(`Correcting extension from .${newExt} to .${originalExt}`);
        
        // If new filename has an extension, replace it
        if (newExt) {
          return newFilename.replace(/\.[^.]+$/, `.${originalExt}`);
        } else {
          // Otherwise add the extension
          return `${newFilename}.${originalExt}`;
        }
      }
    }
    
    return newFilename;
  } catch (error) {
    console.error("Error ensuring correct extension:", error);
    return newFilename; // Return original filename in case of error
  }
}

/**
 * Try to match a download using fuzzy matching when exact match fails
 * @param {Object} downloadItem - The download item
 * @param {string} originalFilename - The original filename
 */
function tryFuzzyMatchAndRename(downloadItem, originalFilename) {
  // Check license before proceeding with fuzzy matching
  if (!licenseStatus.isValid) {
    console.log("License invalid, cannot perform fuzzy matching");
    return;
  }
  
  console.log("Attempting fuzzy matching for:", originalFilename);

  // If no exact match, try partial matching based on filename parts
  let bestMatch = null;
  let bestMatchScore = 0;
  let bestMatchKey = null;
  
  // Special handling for PDF viewer files which might have generic names
  const isPossiblePdfViewerFile = originalFilename.includes('pdf') || 
                                 originalFilename.startsWith('attachment_') || 
                                 originalFilename.includes('document') ||
                                 originalFilename.includes('agreement');
  
  if (isPossiblePdfViewerFile) {
    console.log("Possible PDF viewer file detected, using relaxed matching");
  }
  
  // Log what we're comparing against
  console.log("Comparing against pending downloads:");
  
  pendingDownloads.forEach((download, key) => {
    // Log the comparison
    console.log(`Comparing original: "${originalFilename}" with pending: "${download.originalFilename}"`);
    
    // For PDF viewers, use a lower threshold
    const threshold = isPossiblePdfViewerFile ? 0.2 : 0.6;
    
    // Calculate a simple similarity score
    const score = calculateSimilarity(originalFilename, download.originalFilename);
    console.log(`Similarity score: ${score.toFixed(2)} (threshold: ${threshold})`);
    
    if (score > bestMatchScore && score > threshold) {
      bestMatch = download;
      bestMatchScore = score;
      bestMatchKey = key;
      console.log(`New best match: ${download.originalFilename} (score: ${score.toFixed(2)})`);
    }
    
    // Special case: if the names are very different but this could be a PDF viewer file
    // and the original is a generic attachment name, consider it a match
    if (isPossiblePdfViewerFile && score > 0.1) {
      // For PDF files, we'll be more lenient
      if (!bestMatch || score > bestMatchScore) {
        console.log("Using relaxed matching for PDF viewer file");
        bestMatch = download;
        bestMatchScore = score;
        bestMatchKey = key;
      }
    }
  });
  
  if (bestMatch) {
    console.log(`Found fuzzy match (score: ${bestMatchScore.toFixed(2)}) for:`, originalFilename);
    console.log("Will rename to:", bestMatch.newFilename);
    
    // Remove from pending downloads
    if (bestMatchKey) {
      pendingDownloads.delete(bestMatchKey);
    }
    
    // Process the rename
    processDownloadRename(downloadItem, bestMatch);
  } else {
    console.log("No fuzzy match found for:", originalFilename);
    
    // Check if we should try again with even more relaxed criteria for PDFs
    if (isPossiblePdfViewerFile && pendingDownloads.size === 1) {
      console.log("Single pending download and PDF detected - using it as a match");
      // Just use the only pending download
      for (const [key, download] of pendingDownloads.entries()) {
        console.log("Using the only pending download as match:", download.originalFilename);
        pendingDownloads.delete(key);
        processDownloadRename(downloadItem, download);
        return;
      }
    }
  }
}

/**
 * Calculate similarity between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score (0-1)
 */
function calculateSimilarity(str1, str2) {
  // Special case for empty strings
  if (!str1 && !str2) return 1.0;
  if (!str1 || !str2) return 0.0;
  
  // Special case: PDF viewer often downloads as "agreement", "document.pdf", etc.
  if ((str1.includes('agreement') && str2.includes('pdf')) ||
      (str2.includes('agreement') && str1.includes('pdf')) ||
      (str1.includes('document.pdf') && str2.includes('attachment_')) ||
      (str2.includes('document.pdf') && str1.includes('attachment_'))) {
    console.log("Special case match for PDF document");
    return 0.7; // High enough to match
  }
  
  // Normalize strings for comparison
  const normalize = (s) => s.toLowerCase().replace(/[^\w\s]/g, '');
  
  const norm1 = normalize(str1);
  const norm2 = normalize(str2);
  
  // Special case for attachment IDs
  const attachId1 = str1.match(/attachment_(\d+)/);
  const attachId2 = str2.match(/attachment_(\d+)/);
  
  if (attachId1 && attachId2) {
    // If both have attachment IDs, compare those specifically
    return attachId1[1] === attachId2[1] ? 1.0 : 0.0;
  }
  
  // If one has an attachment ID but the other doesn't, check if the ID appears anywhere
  if (attachId1 && str2.includes(attachId1[1])) return 0.8;
  if (attachId2 && str1.includes(attachId2[1])) return 0.8;
  
  // Check for file extensions - if they match, increase base similarity
  const ext1 = str1.match(/\.([^.]+)$/);
  const ext2 = str2.match(/\.([^.]+)$/);
  let extensionBonus = 0;
  
  if (ext1 && ext2 && ext1[1].toLowerCase() === ext2[1].toLowerCase()) {
    // Same extension
    extensionBonus = 0.2;
    
    // Special bonus for PDFs
    if (ext1[1].toLowerCase() === 'pdf') {
      extensionBonus = 0.3;
    }
  }
  
  // Calculate Levenshtein distance
  const len1 = norm1.length;
  const len2 = norm2.length;
  const matrix = Array(len1 + 1).fill().map(() => Array(len2 + 1).fill(0));
  
  for (let i = 0; i <= len1; i++) {
    matrix[i][0] = i;
  }
  
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = norm1[i - 1] === norm2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  // Normalize the distance by the longer string length
  const maxLen = Math.max(len1, len2);
  if (maxLen === 0) return 1.0;
  
  const distance = matrix[len1][len2];
  const baseSimilarity = 1 - (distance / maxLen);
  
  // Add the extension bonus but cap at 1.0
  return Math.min(baseSimilarity + extensionBonus, 1.0);
}

// Listen for download state changes
chrome.downloads.onChanged.addListener(delta => {
  if (delta.state && delta.state.current === 'complete') {
    console.log(`Download ${delta.id} completed`);
    
    // Try to get the actual filename used
    chrome.downloads.search({id: delta.id}, (downloads) => {
      if (downloads && downloads.length > 0) {
        const download = downloads[0];
        console.log(`Download completed with actual filename: ${download.filename}`);
      }
    });
  }
  
  if (delta.error) {
    console.error(`Download ${delta.id} failed:`, delta.error.current);
  }
}); 