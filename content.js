/**
 * Gmail Attachment Renamer - Content Script
 * 
 * This script runs on mail.google.com pages and handles:
 * 1. Detecting email metadata (sender, date)
 * 2. Intercepting attachment download clicks
 * 3. Using the pattern to generate new filenames
 */

// Current email metadata for active email
let currentEmailMetadata = {};

// Track connection status to background
let bgConnectionActive = false;
let connectionCheckInterval = null;
let recoveryAttemptInterval = null;
let lastContextInvalidatedTime = 0;
const RECOVERY_ATTEMPT_DELAY = 10000; // 10 seconds between recovery attempts
const MAX_RECOVERY_ATTEMPTS = 3; // Maximum number of auto-recovery attempts
let recoveryAttempts = 0;

// Track last checked URL to detect navigation
let lastCheckedUrl = window.location.href;

// Initialize the extension
function init() {
  console.log("Gmail Attachment Renamer initialized");
  
  // Reset recovery counter on fresh initialization
  recoveryAttempts = 0;
  
  // Make sure to clean up any existing state
  clearProcessedMarkers();
  
  initBackgroundConnection();
  observeEmails();
  
  // Set up auto-recovery for extension context
  setupExtensionRecovery();
  
  // Set up global download monitoring for PDF viewer downloads
  setupGlobalDownloadMonitoring();
  
  // Periodically clean up stale data and check for new attachments
  // This helps with Gmail's dynamic UI that might change without triggering our observers
  setInterval(() => {
    // Clean up old session storage items (older than 1 hour)
    cleanupSessionStorage();
    
    // Re-scan for attachments periodically
    if (document.visibilityState === 'visible') {
      setupAttachmentListeners();
    }
  }, 60000); // Every minute
}

/**
 * Set up auto-recovery for extension context invalidation
 */
function setupExtensionRecovery() {
  // Clean up any existing recovery interval
  if (recoveryAttemptInterval) {
    clearInterval(recoveryAttemptInterval);
  }
  
  // Set up listener for extension state
  window.addEventListener('focus', attemptExtensionRecovery);
  
  // Also check periodically if the window doesn't get focus events
  recoveryAttemptInterval = setInterval(attemptExtensionRecovery, 30000);
}

/**
 * Attempt to recover the extension connection if it was invalidated
 */
function attemptExtensionRecovery() {
  const now = Date.now();
  
  // Only try recovery if we previously detected an invalidated context 
  // and enough time has passed since the last attempt
  if (!bgConnectionActive && 
      lastContextInvalidatedTime > 0 && 
      now - lastContextInvalidatedTime > RECOVERY_ATTEMPT_DELAY) {
    
    // Limit the number of auto-recovery attempts
    if (recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
      console.log("Max recovery attempts reached, will not attempt further automatic recovery");
      return;
    }
    
    recoveryAttempts++;
    console.log(`Attempting extension recovery (attempt ${recoveryAttempts}/${MAX_RECOVERY_ATTEMPTS})`);
    
    try {
      // Try to re-establish connection
      initBackgroundConnection();
      lastContextInvalidatedTime = now; // Update timestamp even on failed attempts
    } catch (error) {
      console.error("Error during recovery attempt:", error);
    }
  }
}

/**
 * Initialize connection to background script
 */
function initBackgroundConnection() {
  try {
    // Check if background script is available
    chrome.runtime.sendMessage({ action: 'ping' }, response => {
      // Check for extension context invalidated error
      if (chrome.runtime.lastError) {
        console.warn("Error connecting to background:", chrome.runtime.lastError.message);
        
        if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
          handleContextInvalidated("initialization");
          return;
        }
      }
      
      bgConnectionActive = !chrome.runtime.lastError && response && response.status === 'ok';
      console.log("Background connection status:", bgConnectionActive);
      
      // Reset recovery attempts on successful connection
      if (bgConnectionActive) {
        recoveryAttempts = 0;
        lastContextInvalidatedTime = 0;
      }
      
      // Setup regular connection checks
      if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
      }
      
      connectionCheckInterval = setInterval(checkBackgroundConnection, 30000); // Check every 30 seconds
    });
  } catch (error) {
    console.error("Error initializing background connection:", error);
    
    // Handle the extension context invalidated error
    if (error.message && error.message.includes('Extension context invalidated')) {
      handleContextInvalidated("initialization");
    }
  }
}

/**
 * Handle extension context invalidated error
 * @param {string} source - Where the error occurred
 */
function handleContextInvalidated(source) {
  console.log(`Extension context invalidated during ${source}`);
  
  // Update connection status
  bgConnectionActive = false;
  
  // Record the time of this invalidation
  lastContextInvalidatedTime = Date.now();
  
  // Clear any existing intervals
  if (connectionCheckInterval) {
    clearInterval(connectionCheckInterval);
    connectionCheckInterval = null;
  }
  
  // Show notification to the user (only if this is the first detection)
  if (recoveryAttempts === 0) {
    try {
      showNotification(
        'warning',
        'Extension needs to be reconnected. Attempting to recover automatically... If downloads are not renamed, please reload Gmail.'
      );
    } catch (notificationError) {
      console.error("Could not show notification:", notificationError);
    }
  }
}

/**
 * Check connection to background script
 */
function checkBackgroundConnection() {
  try {
    chrome.runtime.sendMessage({ action: 'heartbeat' }, response => {
      const wasActive = bgConnectionActive;
      
      // Check for specific extension context invalidated error
      if (chrome.runtime.lastError && chrome.runtime.lastError.message.includes('Extension context invalidated')) {
        handleContextInvalidated("connection check");
        return;
      }
      
      bgConnectionActive = !chrome.runtime.lastError && response && response.status === 'ok';
      
      // If connection status changed, log it
      if (wasActive !== bgConnectionActive) {
        console.log("Background connection status changed:", bgConnectionActive);
        
        // If connection was restored, re-initialize
        if (bgConnectionActive && !wasActive) {
          observeEmails();
          // Reset recovery state
          recoveryAttempts = 0;
          lastContextInvalidatedTime = 0;
        }
      }
    });
  } catch (error) {
    console.error("Error checking background connection:", error);
    
    // Handle the specific extension context invalidated error
    if (error.message && error.message.includes('Extension context invalidated')) {
      handleContextInvalidated("connection check");
    }
  }
}

/**
 * Set up mutation observer to detect when new emails are opened
 */
function observeEmails() {
  // Look for email containers
  const emailContainer = document.querySelector('div[role="main"]');
  if (!emailContainer) {
    console.log("Email container not found, will retry");
    setTimeout(observeEmails, 1000);
    return;
  }
  
  // Create an observer to watch for email changes
  const observer = new MutationObserver(mutations => {
    // Check for attachment containers on mutations
    let shouldCheckAttachments = false;
    let shouldClearMarkers = false;
    
    // Track URL/hash changes to detect navigation
    const currentUrl = window.location.href;
    if (currentUrl !== lastCheckedUrl) {
      console.log("URL changed, resetting attachment tracking");
      lastCheckedUrl = currentUrl;
      shouldClearMarkers = true;
      shouldCheckAttachments = true;
    }
    
    mutations.forEach(mutation => {
      // If attributes changed on main container, check if it's a view change
      if (mutation.type === 'attributes' && 
          (mutation.target.matches('div[role="main"]') || 
           mutation.target.matches('div[role="list"]'))) {
        shouldClearMarkers = true;
        shouldCheckAttachments = true;
      }
      
      if (mutation.addedNodes && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // If the email view has changed, try to extract metadata
            if (node.matches('div[role="main"] div[role="list"]') || 
                node.matches('div[role="main"] div.adn') ||
                node.matches('[role="tabpanel"]')) {
              shouldClearMarkers = true;
              shouldCheckAttachments = true;
            }
            
            // Look for preview dialogs opening
            if (node.matches('div[role="dialog"]') || 
                node.querySelector('div[role="dialog"]')) {
              console.log("Detected preview dialog, checking for download buttons");
              shouldCheckAttachments = true;
            }
            
            // Or if just attachments were added
            if (node.querySelector('div[role="listitem"] div[data-tooltip*="Download"]') ||
                node.querySelector('div[role="listitem"] div[data-action-data*="attach"]') ||
                node.querySelector('div.bAK') ||
                node.querySelector('[aria-label*="attachment"]') ||
                node.querySelector('[aria-label="Download"]')) {
              shouldCheckAttachments = true;
            }
          }
        }
      }
    });
    
    // Process detected changes
    if (shouldClearMarkers) {
      clearProcessedMarkers();
      extractCurrentEmailMetadata();
    }
    
    if (shouldCheckAttachments) {
      // Delay to allow Gmail to finish rendering
      setTimeout(setupAttachmentListeners, 300);
    }
  });
  
  // Also observe the body for dialogs that might appear (like preview dialogs)
  const bodyObserver = new MutationObserver(mutations => {
    let dialogAdded = false;
    
    mutations.forEach(mutation => {
      if (mutation.addedNodes && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check for dialog elements added to the body
            if (node.matches('div[role="dialog"]') || 
                node.querySelector('div[role="dialog"]')) {
              dialogAdded = true;
              break;
            }
          }
        }
      }
    });
    
    if (dialogAdded) {
      console.log("Preview dialog detected, setting up attachment listeners");
      // Give a moment for the dialog to fully initialize
      setTimeout(() => {
        setupPreviewDialogListeners();
      }, 500);
    }
  });
  
  // Start observing with more comprehensive options
  observer.observe(emailContainer, { 
    childList: true, 
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-expanded', 'data-active', 'aria-selected'] 
  });
  
  // Observe body for preview dialogs and class changes
  bodyObserver.observe(document.body, {
    childList: true,
    attributes: true,
    attributeFilter: ['class']
  });
  
  // Also listen for hashchange and popstate events (navigation)
  window.addEventListener('hashchange', () => {
    console.log("Hash changed, checking for attachments");
    clearProcessedMarkers();
    extractCurrentEmailMetadata();
    setTimeout(setupAttachmentListeners, 300);
  });
  
  window.addEventListener('popstate', () => {
    console.log("Navigation occurred, checking for attachments");
    clearProcessedMarkers();
    extractCurrentEmailMetadata();
    setTimeout(setupAttachmentListeners, 300);
  });
  
  console.log("Email observers started");
  
  // Initial check
  clearProcessedMarkers();
  extractCurrentEmailMetadata();
  setupAttachmentListeners();
  
  // Set up recurring attachment check (as a fallback)
  setInterval(() => {
    setupAttachmentListeners();
  }, 5000); // Check every 5 seconds
}

/**
 * Clear processed markers from previous emails
 */
function clearProcessedMarkers() {
  console.log("Clearing processed markers from previous emails");
  
  // Clean up old event listeners first to prevent memory leaks
  cleanupAttachmentListeners();
  
  // Remove data-renamer-processed attribute from all elements
  const processedElements = document.querySelectorAll('[data-renamer-processed="true"]');
  processedElements.forEach(el => {
    el.removeAttribute('data-renamer-processed');
  });
}

/**
 * Clean up attachment listeners to prevent memory leaks and duplicates
 */
function cleanupAttachmentListeners() {
  // Find all elements with attached listeners
  const elementsWithHoverListeners = document.querySelectorAll('[data-renamer-processed="true"]');
  
  elementsWithHoverListeners.forEach(el => {
    // Remove hover listener if exists
    if (el.renamerHoverListener) {
      el.removeEventListener('mouseover', el.renamerHoverListener);
      delete el.renamerHoverListener;
    }
    
    // Remove click listener if exists
    if (el.renamerClickListener) {
      el.removeEventListener('click', el.renamerClickListener);
      delete el.renamerClickListener;
    }
  });
  
  console.log(`Cleaned up listeners from ${elementsWithHoverListeners.length} elements`);
}

/**
 * Extract metadata from the current email
 */
function extractCurrentEmailMetadata() {
  try {
    // Look for the sender information
    const senderElement = document.querySelector('.gD');
    let sender = 'unknown_sender';
    
    if (senderElement) {
      // Prefer the email attribute for the full email address
      sender = senderElement.getAttribute('email') || senderElement.textContent.trim();
      
      // Also check if this is in the format "Name <email@domain.com>"
      if (!sender.includes('@') && senderElement.parentElement) {
        // Try to get the full sender element text which might include the email
        const fullSenderText = senderElement.parentElement.textContent.trim();
        const emailMatch = fullSenderText.match(/\s*<([^>]+@[^>]+)>/);
        if (emailMatch && emailMatch[1]) {
          sender = emailMatch[1]; // Use the extracted email address
        }
      }
      
      console.log("Found sender:", sender);
    } else {
      // Alternative selectors for sender
      const altSenderElement = document.querySelector('.go, .gI, [data-hovercard-id*="@"]');
      if (altSenderElement) {
        // Prefer the data-hovercard-id which often contains the email
        sender = altSenderElement.getAttribute('data-hovercard-id') || 
                 altSenderElement.getAttribute('email') || 
                 altSenderElement.textContent.trim();
                 
        // If it's not an email address, try to find one in the parent element
        if (!sender.includes('@') && altSenderElement.parentElement) {
          const parentText = altSenderElement.parentElement.textContent.trim();
          const emailMatch = parentText.match(/\s*<([^>]+@[^>]+)>/);
          if (emailMatch && emailMatch[1]) {
            sender = emailMatch[1];
          }
        }
        
        console.log("Found sender from alternative element:", sender);
      }
    }
    
    // Look for the date
    const dateElement = document.querySelector('.g3');
    let date = formatDate(new Date()); // Default to current date
    
    if (dateElement) {
      // Try to parse the date from the email
      const dateText = dateElement.textContent.trim();
      try {
        const parsedDate = new Date(dateText);
        if (!isNaN(parsedDate.getTime())) {
          date = formatDate(parsedDate);
        }
      } catch (dateError) {
        console.warn("Could not parse date:", dateError);
      }
      console.log("Found date:", date);
    }
    
    // Look for the subject
    const subjectElement = document.querySelector('h2.hP');
    const subject = subjectElement ? subjectElement.textContent.trim() : '';
    console.log("Found subject:", subject);
    
    // Store metadata
    currentEmailMetadata = {
      sender: sender,
      date: date,
      subject: subject,
      attachments: findAttachmentFilenames() // Get all attachment filenames
    };
    
    console.log("Extracted email metadata:", currentEmailMetadata);
    
    // Store for potential later use
    sessionStorage.setItem('lastEmailMetadata', JSON.stringify(currentEmailMetadata));
  } catch (error) {
    console.error("Error extracting email metadata:", error);
    currentEmailMetadata = {
      sender: 'unknown_sender',
      date: formatDate(new Date()),
      subject: '',
      attachments: []
    };
  }
}

/**
 * Find all attachment filenames in the current email
 * @returns {Array} Array of attachment filenames
 */
function findAttachmentFilenames() {
  try {
    const attachments = [];
    
    // Look for attachment elements in the email - more specific selectors
    const attachmentElements = document.querySelectorAll('.aVp, .aZo, .aV3, .aQH, .brc-cls');
    
    console.log(`Found ${attachmentElements.length} potential attachment elements`);
    
    // Known patterns that should not be treated as filenames
    const invalidPatterns = [
      /^inbox/i,
      /^sent/i, 
      /^draft/i,
      /^mail$/i,
      /^gmail$/i,
      /^[0-9]+\s*kb$/i, // File size patterns
      /^[0-9]+\s*mb$/i,
      /^download$/i,
      /^attachment$/i,
      /^image$/i,
      /^preview$/i
    ];
    
    attachmentElements.forEach(element => {
      // Try to extract the filename
      const text = element.textContent.trim();
      if (text && text.length > 0 && text.length < 200) {
        // Skip if the text matches any invalid patterns
        const isInvalid = invalidPatterns.some(pattern => pattern.test(text));
        
        if (!isInvalid) {
          // Only accept as filename if it has an extension or looks like a document name
          const hasExtension = text.includes('.') && text.match(/\.\w{2,4}$/);
          const looksLikeDocument = text.match(/report|document|presentation|spreadsheet|agreement|contract|form|invoice/i);
          
          if (hasExtension || looksLikeDocument) {
            // Clean up the filename
            const filename = cleanupFilename(text);
            if (filename) {
              attachments.push({
                element: element,
                filename: filename
              });
              console.log("Found valid attachment:", filename);
            }
          } else {
            console.log("Skipping non-filename text:", text);
          }
        } else {
          console.log("Skipping invalid filename pattern:", text);
        }
      }
    });
    
    // Also look for visible attachment names in the email view, with more filtering
    const spanElements = document.querySelectorAll('span[download], span[aria-label*="Download"], span[aria-label*="attachment"]');
    spanElements.forEach(span => {
      const text = span.textContent.trim();
      if (text && text.length > 0 && text.length < 200) {
        // Skip if the text matches any invalid patterns
        const isInvalid = invalidPatterns.some(pattern => pattern.test(text));
        
        if (!isInvalid) {
          // Only accept as filename if it has an extension or looks like a document name
          const hasExtension = text.includes('.') && text.match(/\.\w{2,4}$/);
          const looksLikeDocument = text.match(/report|document|presentation|spreadsheet|agreement|contract|form|invoice/i);
          
          if (hasExtension || looksLikeDocument) {
            const filename = cleanupFilename(text);
            if (filename) {
              attachments.push({
                element: span,
                filename: filename
              });
              console.log("Found valid attachment from span:", filename);
            }
          }
        }
      }
    });
    
    // Look for more reliable attachment indicators (the download buttons in the attachment area)
    const downloadButtons = document.querySelectorAll('.T-I.J-J5-Ji[role="button"], [data-tooltip*="Download"], [aria-label*="Download"]');
    downloadButtons.forEach(button => {
      // Check nearby elements for the filename
      const parent = button.closest('.brc-cls') || button.closest('[role="listitem"]');
      if (parent) {
        // Find text elements within this container that might be filenames
        const textNodes = Array.from(parent.querySelectorAll('*'))
          .filter(el => el.childNodes.length === 1 && el.firstChild.nodeType === Node.TEXT_NODE)
          .map(el => el.textContent.trim())
          .filter(text => text && text.length > 0 && text.length < 200);
        
        for (const text of textNodes) {
          // Skip if the text matches any invalid patterns
          const isInvalid = invalidPatterns.some(pattern => pattern.test(text));
          
          if (!isInvalid) {
            // Check if it has a file extension or looks like a document
            const hasExtension = text.includes('.') && text.match(/\.\w{2,4}$/);
            const looksLikeDocument = text.match(/report|document|presentation|spreadsheet|agreement|contract|form|invoice/i);
            
            if (hasExtension || looksLikeDocument) {
              const filename = cleanupFilename(text);
              if (filename) {
                attachments.push({
                  element: parent,
                  filename: filename
                });
                console.log("Found valid attachment near download button:", filename);
                break;
              }
            }
          }
        }
      }
    });
    
    return attachments;
  } catch (error) {
    console.error("Error finding attachment filenames:", error);
    return [];
  }
}

/**
 * Format a Date object as YYYY-MM-DD
 * @param {Date} date - The date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Set up attachment click listeners for download buttons
 */
function setupAttachmentListeners() {
  console.log("Setting up attachment listeners");
  
  try {
    // Find all attachment containers
    const attachmentContainers = findAttachmentContainers();
    
    if (attachmentContainers && attachmentContainers.length > 0) {
      console.log(`Found ${attachmentContainers.length} attachment containers`);
      
      // Process each container
      attachmentContainers.forEach(container => {
        setupListenersForContainer(container);
      });
    } else {
      // No attachments found
      console.log("No attachment containers found");
      
      // Set up a mutation observer to detect when Gmail adds attachments dynamically
      setupAttachmentMutationObserver();
    }
  } catch (error) {
    console.error("Error setting up attachment listeners:", error);
  }
}

/**
 * Set up mutation observer specifically for attachment containers
 */
function setupAttachmentMutationObserver() {
  // Look for likely parent elements where Gmail might add attachments
  const possibleParents = [
    document.querySelector('div[role="main"]'),
    document.querySelector('.aQH'), // Gmail attachment area
    document.querySelector('.gs')   // Gmail message body
  ].filter(Boolean); // Remove nulls
  
  if (possibleParents.length === 0) {
    console.log("No possible attachment parent elements found");
    return;
  }
  
  console.log(`Setting up attachment mutation observers on ${possibleParents.length} elements`);
  
  // Create observer for attachment containers
  const observer = new MutationObserver(mutations => {
    let shouldCheck = false;
    
    mutations.forEach(mutation => {
      if (mutation.addedNodes && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check for attachment-like elements
            if (
              node.matches('.aQA') || // Attachment wrapper
              node.matches('.bAK') || // Hover area for attachments
              node.matches('[role="listitem"]') || // Attachment item
              node.matches('[data-tooltip*="Download"]') || // Download button
              node.matches('.VYDae-JX-I') || // Button class from screenshots
              node.querySelector('.VYDae-JX-I') // Container with buttons
            ) {
              shouldCheck = true;
              break;
            }
          }
        }
      }
    });
    
    if (shouldCheck) {
      console.log("Detected new attachment elements, setting up listeners");
      setTimeout(setupAttachmentListeners, 100);
    }
  });
  
  // Observe each potential parent
  possibleParents.forEach(parent => {
    observer.observe(parent, {
      childList: true,
      subtree: true
    });
  });
}

/**
 * Find all attachment containers in the current email
 * @returns {Array} Array of attachment container elements
 */
function findAttachmentContainers() {
  // Try all known Gmail attachment container selectors
  const containers = [
    // Main attachment container
    ...Array.from(document.querySelectorAll('div[role="listitem"][data-tooltip*="Download"]')),
    
    // Alternative selectors
    ...Array.from(document.querySelectorAll('div.aQH')), // Attachment section
    ...Array.from(document.querySelectorAll('div.aXw')), // Individual attachments in older layouts
    ...Array.from(document.querySelectorAll('div[data-tooltip*="download"]')), // Download tooltips
    ...Array.from(document.querySelectorAll('div[data-tooltip*="save"]')), // Save tooltips
    
    // Embedded image attachments
    ...Array.from(document.querySelectorAll('div[data-legacy-attachment-id]')),
    
    // Attachments in the Gmail's new UI
    ...Array.from(document.querySelectorAll('div[data-attachid]')),
    
    // Specific download wrappers
    ...Array.from(document.querySelectorAll('span[download_url]')),
    
    // The specific container shown in your screenshot
    ...Array.from(document.querySelectorAll('div.bAK')), // Gmail attachment area
    ...Array.from(document.querySelectorAll('div.VYDae-JX-axR')), // Another attachment container class
    
    // General attachment containers
    ...Array.from(document.querySelectorAll('[role="listitem"][aria-label*="attachment"]')),
    ...Array.from(document.querySelectorAll('[data-message-id] [role="listitem"]')),
    
    // Gmail's newest UI attachment elements
    ...Array.from(document.querySelectorAll('[jscontroller][data-tooltip*="Download"]')),
    ...Array.from(document.querySelectorAll('[jscontroller="PIVaYb"]')),
    ...Array.from(document.querySelectorAll('.VYDae-JX-I-J')), // Attachment icon containers
    
    // Hover areas that might contain download buttons
    ...Array.from(document.querySelectorAll('.VYDae-JX-aXB')), // Hover area
    
    // Preview mode download buttons (from email list view)
    ...Array.from(document.querySelectorAll('[aria-label="Download"]')), // Direct download button in preview
    ...Array.from(document.querySelectorAll('[data-tooltip="Download"]')), // Another variation
    ...Array.from(document.querySelectorAll('.aFB')), // Download button in preview dialog
    ...Array.from(document.querySelectorAll('div[role="dialog"] .aFe-aFf')), // Preview dialog container
    ...Array.from(document.querySelectorAll('div[role="dialog"] [jscontroller]')), // Generic controllers in dialog
  ];
  
  // Remove duplicates
  return [...new Set(containers)];
}

/**
 * Set up listeners for a specific attachment container
 * @param {Element} container - The attachment container element
 */
function setupListenersForContainer(container) {
  try {
    // Extract attachment information without requiring the download button first
    const attachmentInfo = extractAttachmentInfoFromContainer(container);
    
    if (!attachmentInfo.filename) {
      console.log("Could not extract filename from attachment");
      return;
    }
    
    console.log("Found attachment:", attachmentInfo.filename);
    
    // Don't add duplicate listeners to the container
    if (container.getAttribute('data-renamer-processed') === 'true') {
      // For already processed containers, check if the download button might be new
      // This handles cases where Gmail creates buttons dynamically
      const downloadButton = findAttachmentDownloadLink(container);
      
      // If we find a button that's not processed, add listeners to it
      if (downloadButton && !downloadButton.getAttribute('data-renamer-processed')) {
        console.log("Found new download button in already processed container");
        // Add listeners to this new button
        addButtonListeners(downloadButton, attachmentInfo);
      } else {
        console.log("Container already processed:", attachmentInfo.filename);
      }
      return;
    }
    
    // Mark container as processed
    container.setAttribute('data-renamer-processed', 'true');
    
    // Add hover listener to detect when Gmail creates the download button dynamically
    const hoverListener = event => {
      // Small delay to let Gmail create the download button
      setTimeout(() => {
        const downloadButton = findAttachmentDownloadLink(container);
        if (downloadButton && !downloadButton.getAttribute('data-renamer-processed')) {
          console.log("Found download button after hover:", downloadButton);
          addButtonListeners(downloadButton, attachmentInfo);
        }
      }, 100);
    };
    
    container.addEventListener('mouseover', hoverListener);
    
    // Store the listener reference for cleanup
    container.renamerHoverListener = hoverListener;
    
    // Also try to find a download button directly (for non-hover cases)
    const downloadButton = findAttachmentDownloadLink(container);
    if (downloadButton) {
      console.log("Found download button immediately:", downloadButton);
      addButtonListeners(downloadButton, attachmentInfo);
    } else {
      console.log("No immediate download button found, will detect on hover for:", attachmentInfo.filename);
    }
    
    console.log("Added listeners for:", attachmentInfo.filename);
  } catch (error) {
    console.error("Error setting up container listener:", error);
  }
}

/**
 * Extract attachment info from container for preview mode
 * @param {Element} container - The attachment container
 * @returns {Object} Attachment info object with filename
 */
function extractAttachmentInfoFromContainer(container) {
  try {
    console.log("Extracting attachment info from container");
    
    // First try to find the download button directly
    const downloadButton = findAttachmentDownloadLink(container);
    if (downloadButton) {
      const downloadUrl = downloadButton.href || downloadButton.getAttribute('download') || '';
      console.log("Found download button with URL:", downloadUrl);
      
      // Try to extract filename from URL
      if (downloadUrl && downloadUrl.includes('/')) {
        const urlParts = downloadUrl.split('/');
        const lastPart = urlParts[urlParts.length - 1].split('?')[0];
        if (lastPart && lastPart.includes('.')) {
          console.log("Extracted filename from URL:", lastPart);
          return { filename: lastPart };
        }
      }
    }
    
    // Look for the attachment name in the container
    const filenameElements = container.querySelectorAll('.aV3, .aQA, span[download], [aria-label*="Download"]');
    for (const el of filenameElements) {
      const text = el.textContent.trim();
      if (text && text.length > 0 && text.length < 200) {
        console.log("Found filename in container:", text);
        return { filename: cleanupFilename(text) };
      }
    }
    
    // Try to match with our stored attachment list from email metadata
    if (currentEmailMetadata.attachments && currentEmailMetadata.attachments.length > 0) {
      // Try to find a match based on container position or content
      const containerText = container.textContent;
      for (const attachment of currentEmailMetadata.attachments) {
        if (containerText.includes(attachment.filename)) {
          console.log("Matched attachment from email metadata:", attachment.filename);
          return { filename: attachment.filename };
        }
      }
      
      // If only one attachment in the email, use it
      if (currentEmailMetadata.attachments.length === 1) {
        console.log("Using the only attachment from email metadata:", currentEmailMetadata.attachments[0].filename);
        return { filename: currentEmailMetadata.attachments[0].filename };
      }
    }
    
    // If no filename found, generate a default
    console.log("Could not find filename, using fallback");
    return { filename: "attachment_" + Date.now() };
  } catch (error) {
    console.error("Error extracting attachment info:", error);
    return { filename: "attachment_" + Date.now() };
  }
}

/**
 * Find the download link/button within an attachment container
 * @param {Element} container - The attachment container element
 * @returns {Element|null} The download button element, or null if not found
 */
function findAttachmentDownloadLink(container) {
  // Try various ways to find the download button
  
  // 1. Direct download links or buttons with download attributes
  let downloadButton = container.querySelector('a[download], button[download]');
  
  // 2. Elements with download roles or data attributes
  if (!downloadButton) {
    downloadButton = container.querySelector('[role="button"][data-tooltip*="Download"], [role="button"][aria-label*="Download"]');
  }
  
  // 3. Elements with download actions (Gmail-specific)
  if (!downloadButton) {
    downloadButton = container.querySelector('[data-action-data*="download"], [jsaction*="download"]');
  }
  
  // 4. Gmail's specific attachment buttons
  if (!downloadButton) {
    downloadButton = container.querySelector('div[data-tooltip*="download"], span[data-tooltip*="download"]');
  }
  
  // 5. Gmail's new UI download buttons by their controller
  if (!downloadButton) {
    downloadButton = container.querySelector('[jscontroller][data-tooltip*="Save"]');
  }
  
  // 6. New Gmail UI "Save to Drive" and "Download" icons
  if (!downloadButton) {
    downloadButton = container.querySelector('[aria-label*="Download"], [aria-label*="Save"]');
  }
  
  // 7. Buttons with specific Gmail classes from your screenshot
  if (!downloadButton) {
    // The specific class from the screenshot
    downloadButton = container.querySelector('.VYDae-JX-I[jscontroller="PIVaYb"]');
    
    // More general selectors for that type of button
    if (!downloadButton) {
      downloadButton = container.querySelector('.VYDae-JX-I');
    }
    
    if (!downloadButton) {
      downloadButton = container.querySelector('[jscontroller="PIVaYb"]');
    }
    
    // Look for any button-like element within the container
    if (!downloadButton) {
      downloadButton = container.querySelector('div[role="button"], span[role="button"], button, .T-I');
    }
  }
  
  // 8. Look for the three-dot menu button which contains the download option
  if (!downloadButton) {
    downloadButton = container.querySelector('[data-tooltip="More options"], [aria-label="More options"], [data-tooltip="More"]');
  }
  
  // 9. If container itself is clickable for download
  if (!downloadButton && (
    container.hasAttribute('download') || 
    container.getAttribute('role') === 'button' || 
    container.getAttribute('data-tooltip')?.includes('Download') ||
    container.getAttribute('jsaction')?.includes('click')
  )) {
    downloadButton = container;
  }
  
  // Log result
  if (downloadButton) {
    // Add debug info about the button
    const classes = downloadButton.className || 'no-class';
    const jsaction = downloadButton.getAttribute('jsaction') || 'no-jsaction';
    const jscontroller = downloadButton.getAttribute('jscontroller') || 'no-jscontroller';
    
    console.log(`Found download button: classes=${classes}, jsaction=${jsaction}, jscontroller=${jscontroller}`);
  } else {
    console.log("No download button found in container:", container);
  }
  
  return downloadButton;
}

/**
 * Generate filename based on pattern and trigger download
 * @param {Event} event - The click event
 * @param {Element} downloadButton - The clicked download button
 * @param {Object} attachmentInfo - Information about the attachment
 */
function generateAndSendDownload(event, downloadButton, attachmentInfo) {
  try {
    console.log("Processing download for:", attachmentInfo.filename);
    
    // Check if background connection is active
    if (!bgConnectionActive) {
      console.error("No connection to background script, skipping renamer");
      
      // Try to recover if this is due to context invalidation
      if (lastContextInvalidatedTime > 0) {
        attemptExtensionRecovery();
      }
      
      // Show notification to user
      showNotification(
        'warning',
        'Extension connection lost. Please reload Gmail if downloads are not renamed.'
      );
      
      return; // Let Gmail handle the download normally
    }
    
    // Ensure the filename has an extension based on the content type
    if (!attachmentInfo.filename.includes('.')) {
      // Try to find the current dialog to guess the file type
      const dialog = document.querySelector('div[role="dialog"]');
      if (dialog) {
        const fileType = guessFileTypeFromContent(dialog);
        attachmentInfo.filename += '.' + fileType;
      } else {
        attachmentInfo.filename += '.pdf'; // Default to PDF
      }
    }
    
    // Generate new filename based on pattern and metadata
    const newFilename = generateFilename(attachmentInfo.filename);
    
    console.log("Generated new filename:", newFilename);
    
    // Create a unique ID for this download to avoid conflicts
    const downloadId = 'download_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    // Store information about the download we expect
    const downloadData = {
      originalFilename: attachmentInfo.filename,
      newFilename: newFilename,
      timestamp: Date.now(),
      buttonInfo: {
        tag: downloadButton.tagName,
        id: downloadButton.id || 'none',
        class: downloadButton.className || 'none',
        jscontroller: downloadButton.getAttribute('jscontroller') || 'none'
      }
    };
    
    console.log("Storing download data:", downloadData);
    sessionStorage.setItem(downloadId, JSON.stringify(downloadData));
    
    // Store this download ID in a list of pending downloads
    let pendingDownloads = JSON.parse(sessionStorage.getItem('pendingDownloads') || '[]');
    pendingDownloads.push({
      id: downloadId,
      originalFilename: attachmentInfo.filename,
      timestamp: Date.now()
    });
    
    // Clean up old pending downloads (older than 5 minutes)
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    pendingDownloads = pendingDownloads.filter(download => download.timestamp > fiveMinutesAgo);
    
    // Save updated list
    sessionStorage.setItem('pendingDownloads', JSON.stringify(pendingDownloads));
    
    // Tell background script to watch for this download
    try {
      chrome.runtime.sendMessage({
        action: 'watchForDownloads',
        downloadId: downloadId,
        originalFilename: attachmentInfo.filename,
        newFilename: newFilename
      }, response => {
        // Log response if any (this is optional - the background script will work even without a response)
        if (response) {
          console.log("Background script response:", response);
        }
      });
      
      console.log("Sent watch request to background script for:", attachmentInfo.filename, "with ID:", downloadId);
      
      // We don't show info notifications to users anymore, but still log them
      console.log(`Processing download: ${attachmentInfo.filename} → ${newFilename}`);
    } catch (error) {
      console.error("Exception sending message to background:", error);
      
      // Handle context invalidation
      if (error.message && error.message.includes('Extension context invalidated')) {
        handleContextInvalidated("download request");
      }
      
      // Show error notification
      showNotification(
        'error', 
        `Error processing download: ${error.message}`
      );
    }
    
    // Let Gmail handle the actual download click
    // Do NOT mark the download button as processed after click - this allows multiple clicks
  } catch (error) {
    console.error("Error in generateAndSendDownload:", error);
    
    // Show error notification
    showNotification(
      'error', 
      `Error processing download: ${error.message}`
    );
    
    // Let Gmail handle the download normally
  }
}

/**
 * Generate filename based on pattern and metadata
 * @param {string} originalFilename - The original filename
 * @returns {string} The new filename
 */
function generateFilename(originalFilename) {
  try {
    // Get the filename pattern from localStorage or use default
    const pattern = localStorage.getItem('filenamePattern') || 'YYYY-MM-DD_SenderName_OriginalFilename';
    
    // Make a copy of the pattern to modify
    let newFilename = pattern;
    
    // Format the current date
    const now = new Date();
    const dateString = formatDate(now);
    
    // Get sender name from metadata or use unknown_sender
    let senderName = 'unknown_sender';
    if (currentEmailMetadata.sender) {
      // Try to extract the full email address
      const emailMatch = currentEmailMetadata.sender.match(/<([^>]+)>/);
      
      if (emailMatch && emailMatch[1]) {
        // Use the full email address from <>
        senderName = emailMatch[1].trim();
      } else if (currentEmailMetadata.sender.includes('@')) {
        // If the sender is already just an email, use it as is
        senderName = currentEmailMetadata.sender.trim();
      } else {
        // Just use the sender string as is if no email found
        senderName = currentEmailMetadata.sender;
      }
      
      // Clean up the sender name for use in a filename
      senderName = sanitizeFilename(senderName);
    }
    
    // Extract subject for potential use
    const subject = currentEmailMetadata.subject || '';
    const cleanSubject = sanitizeFilename(subject).substring(0, 30); // Limit length
    
    // Check if we need to replace the original filename
    let cleanOriginalFilename = originalFilename;
    let useSequenceNumber = false;
    
    // These patterns suggest we don't have a real filename
    const genericFilenamePattern = /^(attachment|document|file|untitled|image|img|chart|agreement|unknown)_?\d*$/i;
    const hasNoExtension = !originalFilename.includes('.');
    const isTemporaryName = originalFilename.includes('temp') || originalFilename.match(/^\d+$/);
    
    // Determine if we need to find a better filename
    const needsBetterFilename = genericFilenamePattern.test(originalFilename) || 
                               hasNoExtension || 
                               isTemporaryName || 
                               originalFilename.toLowerCase().includes('inbox');
    
    if (needsBetterFilename) {
      console.log("Original filename needs improvement:", originalFilename);
      
      // Try to find a matching attachment in the email metadata
      if (currentEmailMetadata.attachments && currentEmailMetadata.attachments.length > 0) {
        console.log(`Email has ${currentEmailMetadata.attachments.length} known attachments`);
        
        // If we have exactly one attachment, use its name
        if (currentEmailMetadata.attachments.length === 1) {
          cleanOriginalFilename = currentEmailMetadata.attachments[0].filename;
          console.log("Using the only known attachment name:", cleanOriginalFilename);
        } else {
          // Get the download sequence number from session storage for this email
          let emailKey = (currentEmailMetadata.sender + "_" + dateString).replace(/[^a-z0-9_]/gi, '_');
          let downloadCount = parseInt(sessionStorage.getItem('downloadCounter_' + emailKey) || '0');
          downloadCount++;
          sessionStorage.setItem('downloadCounter_' + emailKey, downloadCount.toString());
          
          // Try to use the attachment at this index if it exists
          const index = (downloadCount - 1) % currentEmailMetadata.attachments.length;
          cleanOriginalFilename = currentEmailMetadata.attachments[index].filename;
          console.log(`Using attachment #${index + 1}/${currentEmailMetadata.attachments.length}:`, cleanOriginalFilename);
        }
      } else {
        // If no attachments found in metadata, generate a filename from subject or use sequence
        if (subject && subject.length > 3) {
          // Use the subject as a basis for the filename
          cleanOriginalFilename = cleanSubject;
          
          // Add extension based on content
          if (!cleanOriginalFilename.includes('.')) {
            // Determine file extension based on dialog content if available
            let extension = '.pdf'; // Default
            const dialog = document.querySelector('div[role="dialog"]');
            if (dialog) {
              const fileType = guessFileTypeFromContent(dialog);
              extension = fileType ? `.${fileType}` : '.pdf';
            } else if (originalFilename.includes('.')) {
              // Keep the original extension if it has one
              extension = originalFilename.substring(originalFilename.lastIndexOf('.'));
            }
            
            cleanOriginalFilename += extension;
          }
          
          console.log("Generated filename from email subject:", cleanOriginalFilename);
        } else {
          // No subject, use sequence number
          useSequenceNumber = true;
        }
      }
    }
    
    // If we still need a sequence-based filename
    if (useSequenceNumber || cleanOriginalFilename === originalFilename && needsBetterFilename) {
      // Use a more specific counter based on the sender+date
      let emailKey = (currentEmailMetadata.sender + "_" + dateString).replace(/[^a-z0-9_]/gi, '_');
      let downloadCount = parseInt(sessionStorage.getItem('downloadCounter_' + emailKey) || '0');
      downloadCount++;
      sessionStorage.setItem('downloadCounter_' + emailKey, downloadCount.toString());
      
      // Determine file extension based on dialog content if available
      let extension = '.pdf'; // Default
      const dialog = document.querySelector('div[role="dialog"]');
      if (dialog) {
        const fileType = guessFileTypeFromContent(dialog);
        extension = fileType ? `.${fileType}` : '.pdf';
      } else if (originalFilename.includes('.')) {
        // Keep the original extension if it has one
        extension = originalFilename.substring(originalFilename.lastIndexOf('.'));
      }
      
      // Add sequence number to filename
      cleanOriginalFilename = `file${downloadCount}${extension}`;
      console.log("Using sequence-based filename:", cleanOriginalFilename);
    }
    
    // Replace pattern variables with actual values
    newFilename = newFilename
      .replace(/YYYY-MM-DD/g, dateString)
      .replace(/SenderName/g, senderName)
      .replace(/OriginalFilename/g, cleanOriginalFilename);
    
    // Sanitize the filename (remove invalid characters)
    return sanitizeFilename(newFilename);
  } catch (error) {
    console.error("Error generating filename:", error);
    // Fallback to a simple format
    const now = new Date();
    return `${formatDate(now)}_${originalFilename}`;
  }
}

/**
 * Sanitize a filename component, removing invalid characters
 * @param {string} filename - The filename part to sanitize
 * @returns {string} The sanitized filename
 */
function sanitizeFilename(filename) {
  if (!filename) return 'unnamed';
  
  // Special handling for email addresses - preserve the @ symbol
  if (filename.includes('@')) {
    // Replace all invalid characters except @ symbol
    return filename
      .replace(/[\\/:*?"<>|]/g, '_')  // Replace invalid filename chars
      .replace(/\s+/g, '_')           // Replace spaces with underscores
      .trim();
  } else {
    // Standard sanitization for non-email strings
    return filename
      .replace(/[\\/:*?"<>|@]/g, '_') // Replace invalid filename chars including @
      .replace(/\s+/g, '_')           // Replace spaces with underscores
      .trim();
  }
}

// Handle messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    console.log("Content script received message:", message.action);
    
    if (message.action === 'getMetadata') {
      // Return the current email metadata
      sendResponse({ 
        status: 'ok',
        metadata: currentEmailMetadata
      });
    } else if (message.action === 'patternUpdated') {
      // Pattern has been updated, we'll use it for new downloads
      sendResponse({ status: 'ok' });
    } else if (message.action === 'downloadStarted') {
      // We don't show "in progress" notifications anymore
      console.log(`Download started: ${message.originalFilename} → ${message.newFilename}`);
      sendResponse({ status: 'ok' });
    } else if (message.action === 'downloadComplete') {
      // Show simplified success notification
      showNotification(
        'success', 
        `Download renamed successfully`
      );
      sendResponse({ status: 'ok' });
    } else if (message.action === 'downloadError') {
      // Show error notification
      showNotification(
        'error', 
        `Download error: ${message.error}`
      );
      sendResponse({ status: 'ok' });
    } else if (message.action === 'backgroundReady') {
      // Background script has been initialized/restarted
      console.log("Background script is ready");
      
      // Reset connection status
      bgConnectionActive = true;
      
      // Reset recovery attempts
      recoveryAttempts = 0;
      lastContextInvalidatedTime = 0;
      
      // Re-initialize connection and setup
      initBackgroundConnection();
      
      // Show notification to user
      showNotification(
        'success',
        'Gmail Attachment Renamer is active'
      );
      
      sendResponse({ status: 'ok' });
    } else {
      sendResponse({ 
        status: 'error',
        message: 'Unknown action'
      });
    }
  } catch (error) {
    console.error("Error handling message:", error);
    
    // Check for extension context invalidated error
    if (error.message && error.message.includes('Extension context invalidated')) {
      handleContextInvalidated("message handling");
    }
    
    // Try to send a response if possible
    try {
      sendResponse({ 
        status: 'error',
        message: 'Error processing message: ' + error.message
      });
    } catch (responseError) {
      console.error("Could not send response:", responseError);
    }
  }
  
  return true;
});

/**
 * Show a notification to the user
 * @param {string} type - The type of notification ('success', 'error', 'warning', 'info')
 * @param {string} message - The message to display
 */
function showNotification(type, message) {
  try {
    console.log(`Notification (${type}):`, message);
    
    // Only show success and error notifications to the user
    // Skip info and warning notifications as requested
    if (type === 'info' || type === 'warning') {
      return;
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.classList.add('gmail-attachment-renamer-notification');
    notification.classList.add(`gmail-attachment-renamer-${type}`);
    notification.textContent = message;
    
    // Add styles
    notification.style.position = 'fixed';
    notification.style.bottom = '20px';
    notification.style.right = '20px';
    notification.style.padding = '10px 15px';
    notification.style.backgroundColor = 
      type === 'success' ? '#4CAF50' : '#F44336'; // Only success (green) or error (red)
    notification.style.color = '#FFF';
    notification.style.borderRadius = '4px';
    notification.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    notification.style.zIndex = '9999';
    notification.style.maxWidth = '80%';
    notification.style.wordBreak = 'break-word';
    
    // Add to DOM
    document.body.appendChild(notification);
    
    // Remove after a delay
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transition = 'opacity 0.5s ease';
      
      setTimeout(() => {
        if (notification.parentNode) {
          document.body.removeChild(notification);
        }
      }, 500);
    }, 3000); // Shorter display time - 3 seconds
  } catch (error) {
    console.error("Error showing notification:", error);
  }
}

/**
 * Add click listeners to a download button
 * @param {Element} downloadButton - The download button element
 * @param {Object} attachmentInfo - Information about the attachment
 */
function addButtonListeners(downloadButton, attachmentInfo) {
  // Skip if already processed
  if (downloadButton.getAttribute('data-renamer-processed') === 'true') {
    return;
  }
  
  // Mark button as processed
  downloadButton.setAttribute('data-renamer-processed', 'true');
  
  // Log button details for debugging
  console.log("Adding listeners to button:", {
    tag: downloadButton.tagName,
    id: downloadButton.id || 'none',
    class: downloadButton.className || 'none',
    jscontroller: downloadButton.getAttribute('jscontroller') || 'none',
    jsaction: downloadButton.getAttribute('jsaction') || 'none',
    ariaLabel: downloadButton.getAttribute('aria-label') || 'none',
    tooltip: downloadButton.getAttribute('data-tooltip') || 'none',
    role: downloadButton.getAttribute('role') || 'none',
    type: downloadButton.getAttribute('type') || 'none'
  });
  
  // Add the click listener - capture phase to get events before default behavior
  const clickListener = event => {
    console.log("Download button clicked for:", attachmentInfo.filename);
    console.log("Click event details:", {
      target: event.target.tagName,
      currentTarget: event.currentTarget.tagName,
      buttonProcessed: downloadButton.getAttribute('data-renamer-processed') === 'true'
    });
    
    // Generate and send the download request
    generateAndSendDownload(event, downloadButton, attachmentInfo);
    
    // Important: Don't clear processed markers here, so it can work for future clicks too
  };
  
  // Use capture phase to get the event before Gmail's handlers
  downloadButton.addEventListener('click', clickListener, true);
  
  // Store the listener reference for cleanup
  downloadButton.renamerClickListener = clickListener;
}

/**
 * Clean up old session storage items
 */
function cleanupSessionStorage() {
  try {
    // Clean up pending downloads
    const pendingDownloads = JSON.parse(sessionStorage.getItem('pendingDownloads') || '[]');
    
    if (pendingDownloads.length > 0) {
      // Remove downloads older than 1 hour
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      const filteredDownloads = pendingDownloads.filter(download => download.timestamp > oneHourAgo);
      
      // If we removed any items, save the updated list
      if (filteredDownloads.length !== pendingDownloads.length) {
        console.log(`Cleaned up ${pendingDownloads.length - filteredDownloads.length} old pending downloads`);
        sessionStorage.setItem('pendingDownloads', JSON.stringify(filteredDownloads));
      }
    }
    
    // Check for any other old download items
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('download_')) {
        try {
          const item = JSON.parse(sessionStorage.getItem(key));
          if (item.timestamp && (Date.now() - item.timestamp > 60 * 60 * 1000)) {
            // Remove items older than 1 hour
            sessionStorage.removeItem(key);
            console.log(`Removed old session storage item: ${key}`);
          }
        } catch (parseError) {
          console.error(`Error parsing session storage item ${key}:`, parseError);
        }
      }
    }
  } catch (error) {
    console.error("Error cleaning up session storage:", error);
  }
}

/**
 * Set up global monitoring for download events that might come from PDF viewers
 */
function setupGlobalDownloadMonitoring() {
  // Add a specific global click monitor for the top-right download button
  // This runs at a higher level than specific dialog monitors
  window.addEventListener('click', event => {
    console.log("Window click detected at:", 
      {x: event.clientX, y: event.clientY, target: event.target.tagName});
      
    // Check if we have a dialog open 
    const dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) return;
    
    // Check if this is a download button in the specific location from the screenshot
    // We need to check specifically for the top-right area where the download button is
    const dialogRect = dialog.getBoundingClientRect();
    const clickX = event.clientX;
    const clickY = event.clientY;
    
    // Define the top-right corner rectangle where the download button appears
    const topRight = {
      left: dialogRect.right - 100, // 100px from right edge
      top: dialogRect.top,
      right: dialogRect.right,
      bottom: dialogRect.top + 50 // 50px from top edge
    };
    
    const clickInTopRight = 
      clickX >= topRight.left && 
      clickX <= topRight.right && 
      clickY >= topRight.top && 
      clickY <= topRight.bottom;
      
    if (clickInTopRight) {
      console.log("Click detected in top-right download area of dialog");
      
      // Try to extract the filename
      const filename = extractFilenameFromPreviewDialog(dialog) || "document.pdf";
      console.log("Extracted filename for potential download:", filename);
      
      // Get the element at the click position to see if it looks like a download button
      const elementAtPoint = document.elementFromPoint(clickX, clickY);
      if (elementAtPoint) {
        // Check if it's a download-like element
        let target = elementAtPoint;
        let isDownloadElement = false;
        
        // Walk up the DOM tree to find any download-related attributes
        for (let i = 0; i < 5 && target; i++) {
          if (target.getAttribute('aria-label') === 'Download' || 
              target.getAttribute('data-tooltip') === 'Download' ||
              target.getAttribute('jsaction')?.includes('npT2md') || // Common download jsaction
              target.className?.includes('ndfHFb-c4YZDc')) {
            isDownloadElement = true;
            break;
          }
          target = target.parentElement;
        }
        
        // If it's a download element, or just in the download area of PDF viewer
        if (isDownloadElement || 
            (dialog.querySelector('iframe[src*="pdf"]') || dialog.querySelector('.ndfHFb-c4YZDc-cYSp0e-DARUcf'))) {
          console.log("Detected potential PDF download click");
          
          // Process this as a download
          const attachmentInfo = { filename };
          generateAndSendDownload(event, elementAtPoint, attachmentInfo);
        }
      }
    }
  }, true); // Use capture phase

  // Create a MutationObserver to detect when download buttons are created
  const downloadObserver = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.addedNodes && mutation.addedNodes.length) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if this is a download button in the PDF viewer
            if (node.matches('[aria-label="Download"], [data-tooltip="Download"]') ||
                node.className.includes('ndfHFb-c4YZDc') || 
                (node.getAttribute && node.getAttribute('jscontroller') === 'PIVaYb')) {
              console.log("Detected new download button added to DOM:", node);
              
              // Try to get the filename from any visible dialog
              const dialog = document.querySelector('div[role="dialog"]');
              let attachmentInfo = { filename: "document.pdf" };
              
              if (dialog) {
                attachmentInfo.filename = extractFilenameFromPreviewDialog(dialog) || "document.pdf";
                console.log("Extracted filename for PDF download:", attachmentInfo.filename);
              }
              
              // Add listeners to this button
              addButtonListeners(node, attachmentInfo);
            }
          }
        }
      }
    });
  });
  
  // Observe the whole document for download buttons
  downloadObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false
  });
  
  // Also listen for main document downloads (for PDF viewer)
  document.addEventListener('click', event => {
    // Check if the click is on or within the PDF download UI
    let target = event.target;
    let isPdfDownloadClick = false;
    let pdfDialogAttachmentInfo = null;
    
    // Check if this click is inside a PDF viewer download button
    // We need to walk up a few levels to check parent elements
    for (let i = 0; i < 5; i++) {
      if (!target) break;
      
      // Check if this is a download button
      if ((target.getAttribute('aria-label') === 'Download' || 
           target.getAttribute('data-tooltip') === 'Download' ||
           target.className.includes('ndfHFb-c4YZDc') ||
           target.getAttribute('jscontroller') === 'PIVaYb') && 
          target.closest('div[role="dialog"]')) {
        
        isPdfDownloadClick = true;
        
        // Try to get the filename from the dialog
        const dialog = target.closest('div[role="dialog"]');
        if (dialog) {
          pdfDialogAttachmentInfo = {
            filename: extractFilenameFromPreviewDialog(dialog) || "document.pdf"
          };
          console.log("PDF download detected with filename:", pdfDialogAttachmentInfo.filename);
        } else {
          pdfDialogAttachmentInfo = { filename: "document.pdf" };
        }
        
        break;
      }
      
      target = target.parentElement;
    }
    
    // Also check if the click is specifically in the top-right area of a PDF preview
    // This handles the case where the button is in a different document context
    const previewDialog = document.querySelector('div[role="dialog"]');
    if (previewDialog && !isPdfDownloadClick) {
      // Check if this is a click in the top-right corner of the dialog where the download button usually is
      const dialogRect = previewDialog.getBoundingClientRect();
      const isTopRightArea = 
        event.clientX > (dialogRect.right - 100) && 
        event.clientX < dialogRect.right && 
        event.clientY > dialogRect.top && 
        event.clientY < (dialogRect.top + 50);
      
      if (isTopRightArea) {
        console.log("Detected click in top-right corner of PDF preview dialog");
        
        // Check if this dialog contains a PDF based on elements or URL
        const isPdfViewer = 
          previewDialog.querySelector('.ndfHFb-c4YZDc-cYSp0e-DARUcf') || 
          previewDialog.querySelector('iframe[src*="pdf"]') ||
          (window.location.href.includes('attachment') && 
           (window.location.hash.includes('pdf') || 
            document.title.toLowerCase().includes('pdf')));
        
        if (isPdfViewer) {
          console.log("PDF viewer detected, capturing download click");
          isPdfDownloadClick = true;
          pdfDialogAttachmentInfo = {
            filename: extractFilenameFromPreviewDialog(previewDialog) || "document.pdf"
          };
        }
      }
    }
    
    if (isPdfDownloadClick && pdfDialogAttachmentInfo) {
      console.log("Detected PDF viewer download click:", pdfDialogAttachmentInfo.filename);
      
      // Don't prevent default - let the download happen normally
      // But still track it for renaming
      generateAndSendDownload(event, event.target, pdfDialogAttachmentInfo);
    }
  }, true); // Use capture phase to get events early
  
  // Also monitor for any iframes added to the document that could contain previews
  const iframeObserver = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.addedNodes && mutation.addedNodes.length) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'IFRAME') {
            console.log("Detected new iframe added to DOM:", node.src || 'no-src');
            
            try {
              // Try to access iframe content and add listeners
              setTimeout(() => {
                try {
                  const iframeDoc = node.contentDocument || node.contentWindow?.document;
                  if (iframeDoc) {
                    console.log("Successfully accessed iframe document");
                    
                    // Try to find the preview dialog for context
                    const parentDialog = node.closest('div[role="dialog"]');
                    let attachmentInfo = { filename: "document.pdf" };
                    
                    if (parentDialog) {
                      attachmentInfo.filename = extractFilenameFromPreviewDialog(parentDialog) || "document.pdf";
                      console.log("Extracted filename for iframe content:", attachmentInfo.filename);
                    }
                    
                    // Add a click listener to the iframe document
                    iframeDoc.addEventListener('click', event => {
                      console.log("Click detected in iframe");
                      
                      // Check if this is a download button
                      let target = event.target;
                      let isDownloadButton = false;
                      
                      for (let i = 0; i < 5 && target; i++) {
                        if (target.getAttribute('aria-label') === 'Download' || 
                            target.getAttribute('data-tooltip') === 'Download' ||
                            target.className?.includes('ndfHFb-c4YZDc')) {
                          isDownloadButton = true;
                          break;
                        }
                        target = target.parentElement;
                      }
                      
                      if (isDownloadButton) {
                        console.log("Download button clicked in iframe for:", attachmentInfo.filename);
                        generateAndSendDownload(event, target, attachmentInfo);
                      }
                    }, true);
                    
                    // Also try to find and add listeners to download buttons in the iframe
                    const iframeButtons = iframeDoc.querySelectorAll('[aria-label="Download"], [data-tooltip="Download"]');
                    iframeButtons.forEach(button => {
                      console.log("Found download button in iframe:", button);
                      // Add click listener directly to the button
                      button.addEventListener('click', event => {
                        console.log("iframe download button clicked for:", attachmentInfo.filename);
                        generateAndSendDownload(event, button, attachmentInfo);
                      }, true);
                    });
                  }
                } catch (frameError) {
                  // This is normal for cross-origin iframes
                  console.log("Could not access iframe contents (likely cross-origin):", frameError.message);
                }
              }, 1000); // Delay to ensure iframe is loaded
            } catch (error) {
              console.log("Error handling iframe:", error);
            }
          }
        }
      }
    });
  });
  
  // Start observing for iframe additions
  iframeObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Set up a listener for when download events happen through other means
  document.addEventListener('beforeunload', (event) => {
    // Check if there's a PDF dialog open
    const pdfDialog = document.querySelector('div[role="dialog"] iframe[src*="pdf"], div[role="dialog"] .ndfHFb-c4YZDc-cYSp0e-DARUcf');
    if (pdfDialog) {
      // This might be navigation triggered by a download
      const dialog = pdfDialog.closest('div[role="dialog"]');
      if (dialog) {
        const filename = extractFilenameFromPreviewDialog(dialog) || "document.pdf";
        console.log("Possible download triggered navigation for PDF:", filename);
        
        // Register this potential download
        const downloadId = 'download_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const newFilename = generateFilename(filename);
        
        chrome.runtime.sendMessage({
          action: 'watchForDownloads',
          downloadId: downloadId,
          originalFilename: filename,
          newFilename: newFilename
        });
      }
    }
  });
  
  console.log("Global download monitoring set up for PDF viewer downloads");
}

/**
 * Set up listeners specifically for preview dialog download buttons
 */
function setupPreviewDialogListeners() {
  try {
    // Find the preview dialog
    const previewDialog = document.querySelector('div[role="dialog"]');
    if (!previewDialog) {
      console.log("No preview dialog found");
      return;
    }
    
    // Don't process if already handled
    if (previewDialog.getAttribute('data-renamer-processed') === 'true') {
      console.log("Preview dialog already processed");
      return;
    }
    
    console.log("Setting up preview dialog listeners");
    
    // Mark the dialog as processed
    previewDialog.setAttribute('data-renamer-processed', 'true');
    
    // Extract email metadata if needed
    if (Object.keys(currentEmailMetadata).length === 0) {
      // Try to extract from the dialog itself
      extractMetadataFromDialog(previewDialog);
    }
    
    // Debug output of dialog structure to identify download elements
    console.log("Preview dialog structure:");
    logElementTree(previewDialog, 2); // Log 2 levels deep
    
    // Extract filename from dialog first before trying to find buttons
    const attachmentInfo = {
      filename: extractFilenameFromPreviewDialog(previewDialog) || "document.pdf"
    };
    console.log("Extracted filename from preview dialog:", attachmentInfo.filename);
    
    // Look specifically for the download button shown in the screenshot (top right corner)
    // This includes the actual button class observed in the screenshot
    const toolbarDownloadButton = document.querySelector('div[role="button"][aria-label="Download"]');
    if (toolbarDownloadButton) {
      console.log("Found the exact top-right download button");
      addButtonListeners(toolbarDownloadButton, attachmentInfo);
    }
    
    // Special handling for PDF toolbar download buttons like the one in the screenshot
    const toolbarButtons = previewDialog.querySelectorAll('.ndfHFb-c4YZDc-Wrql6b, .ndfHFb-c4YZDc-to915-LgbsSe-xHTbBc');
    if (toolbarButtons.length > 0) {
      console.log(`Found ${toolbarButtons.length} toolbar buttons in PDF viewer`);
      toolbarButtons.forEach(button => {
        console.log(`Adding listener to PDF toolbar button: ${button.className}`);
        addButtonListeners(button, attachmentInfo);
      });
    }
    
    // Top-right corner buttons in the PDF viewer
    const topRightButtons = previewDialog.querySelectorAll('div[role="button"][aria-label="Download"], div[aria-label="Download"], [data-tooltip="Download"]');
    if (topRightButtons.length > 0) {
      console.log(`Found ${topRightButtons.length} top-right download buttons`);
      topRightButtons.forEach(button => {
        console.log(`Adding listener to top-right download button: ${button.className}`);
        addButtonListeners(button, attachmentInfo);
      });
    }
    
    // Find all icons that might be download buttons in the toolbar
    const downloadIcons = previewDialog.querySelectorAll('svg, .ndfHFb-c4YZDc-DARUcf-NnAfwf-i5oIFb, [aria-label*="download" i], [data-tooltip*="download" i]');
    downloadIcons.forEach(icon => {
      // Look for parent buttons of icons
      let parent = icon;
      // Go up to 3 levels to find a clickable parent
      for (let i = 0; i < 3; i++) {
        parent = parent.parentElement;
        if (!parent) break;
        
        if (parent.getAttribute('role') === 'button' || 
            parent.tagName === 'BUTTON' || 
            parent.className.includes('LgbsSe') || 
            parent.className.includes('Wrql6b')) {
          console.log(`Found button parent for icon: ${parent.className}`);
          addButtonListeners(parent, attachmentInfo);
          break;
        }
      }
    });
    
    // Find download buttons in the dialog - expanded selector list based on your screenshot
    const downloadButtons = [
      // Standard download buttons
      ...Array.from(previewDialog.querySelectorAll('[aria-label="Download"], [data-tooltip="Download"]')),
      ...Array.from(previewDialog.querySelectorAll('.aFB')), // Download class
      
      // PDF viewer specific download button (seen in your screenshot)
      ...Array.from(previewDialog.querySelectorAll('.ndfHFb-c4YZDc-Wrql6b')), // PDF download icons
      ...Array.from(previewDialog.querySelectorAll('.ndfHFb-c4YZDc-to915-LgbsSe')), // PDF viewer buttons
      ...Array.from(previewDialog.querySelectorAll('[aria-label="save"]')), // Case-insensitive
      ...Array.from(previewDialog.querySelectorAll('[aria-label="Save"]')),
      
      // Generic download controls
      ...Array.from(previewDialog.querySelectorAll('[jscontroller="PIVaYb"]')), // Controller often used for downloads
      ...Array.from(previewDialog.querySelectorAll('[jsaction*="mousedown:npT2md"]')), // Action often used for downloads
      ...Array.from(previewDialog.querySelectorAll('[jsaction*="download"]')), // Any element with download action
      ...Array.from(previewDialog.querySelectorAll('.T-I-ax7, .T-I.J-J5-Ji')), // Common Gmail button classes
      ...Array.from(previewDialog.querySelectorAll('svg[class*="Xy"]')), // Download icon in SVG (usually within button)
    ];
    
    // Log found buttons with details for debugging
    if (downloadButtons.length > 0) {
      console.log(`Found ${downloadButtons.length} potential download buttons in preview dialog:`);
      downloadButtons.forEach((btn, i) => {
        console.log(`Button ${i+1}: classList=${btn.className}, jscontroller=${btn.getAttribute('jscontroller') || 'none'}, aria-label=${btn.getAttribute('aria-label') || 'none'}`);
      });
    }
    
    // Process standard download buttons found earlier
    downloadButtons.forEach(button => {
      addButtonListeners(button, attachmentInfo);
    });
    
    // Handle the special case where PDF viewer is in an iframe
    // Add a listener specifically for that download button
    const dialogClickListener = event => {
      // Log all clicks in the preview dialog for debugging
      console.log("Preview dialog click detected at:", 
        {x: event.clientX, y: event.clientY, 
         target: event.target.tagName, 
         targetClass: event.target.className,
         targetId: event.target.id
        });
        
      // Build a click path to see if this could be a download
      const clickPath = [];
      let current = event.target;
      for (let i = 0; i < 5 && current; i++) {
        clickPath.push({
          tag: current.tagName,
          class: current.className,
          ariaLabel: current.getAttribute('aria-label') || 'none',
          tooltip: current.getAttribute('data-tooltip') || 'none',
          role: current.getAttribute('role') || 'none'
        });
        current = current.parentElement;
      }
      
      console.log("Click path in dialog:", clickPath);
      
      // Check if this is a download-related click
      const isDownloadClick = clickPath.some(item => 
        (item.ariaLabel && item.ariaLabel.toLowerCase().includes('download')) ||
        (item.tooltip && item.tooltip.toLowerCase().includes('download')) ||
        (item.class && (
          item.class.includes('ndfHFb') || 
          item.class.includes('Wrql6b') ||
          item.class.includes('LgbsSe')
        ))
      );
      
      if (isDownloadClick) {
        console.log("Detected download click in preview dialog");
        // Don't prevent default but track the download
        generateAndSendDownload(event, event.target, attachmentInfo);
      }
    };
    
    // Add the dialog click listener with capture phase to get all clicks
    previewDialog.addEventListener('click', dialogClickListener, true);
    
    // Store the listener for cleanup
    previewDialog.renamerClickListener = dialogClickListener;
  } catch (error) {
    console.error("Error setting up preview dialog listeners:", error);
  }
}

/**
 * Log element tree for debugging
 * @param {Element} element - Root element to log
 * @param {number} depth - Maximum depth to log
 * @param {number} currentDepth - Current depth (internal use)
 */
function logElementTree(element, depth, currentDepth = 0) {
  if (!element || currentDepth > depth) return;
  
  const indent = ' '.repeat(currentDepth * 2);
  const classes = element.className || 'no-class';
  const id = element.id ? `id="${element.id}"` : '';
  const jscontroller = element.getAttribute('jscontroller') ? `jscontroller="${element.getAttribute('jscontroller')}"` : '';
  const role = element.getAttribute('role') ? `role="${element.getAttribute('role')}"` : '';
  
  console.log(`${indent}${element.tagName}: ${classes} ${id} ${jscontroller} ${role}`);
  
  if (currentDepth < depth) {
    Array.from(element.children).forEach(child => {
      logElementTree(child, depth, currentDepth + 1);
    });
  }
}

/**
 * Extract metadata from a preview dialog
 * @param {Element} dialog - The preview dialog element
 */
function extractMetadataFromDialog(dialog) {
  try {
    // Reset metadata if we can't find it
    if (Object.keys(currentEmailMetadata).length === 0) {
      currentEmailMetadata = {};
    }
    
    // Try to find sender in the dialog
    if (!currentEmailMetadata.sender) {
      const senderElement = dialog.querySelector('[email], .gD, .go, [data-hovercard-id]');
      if (senderElement) {
        // Try to get the email address directly from the element
        const email = senderElement.getAttribute('email') || 
                      senderElement.getAttribute('data-hovercard-id');
        
        if (email && email.includes('@')) {
          // Use the full email address
          currentEmailMetadata.sender = email;
        } else {
          // Try to extract email from parent text
          const parentText = senderElement.parentElement ? 
                            senderElement.parentElement.textContent.trim() : 
                            senderElement.textContent.trim();
          
          // Look for email in the format "Name <email@domain.com>"
          const emailMatch = parentText.match(/\s*<([^>]+@[^>]+)>/);
          if (emailMatch && emailMatch[1]) {
            currentEmailMetadata.sender = emailMatch[1];
          } else {
            // Otherwise use displayed name
            currentEmailMetadata.sender = senderElement.textContent.trim();
          }
        }
        
        console.log("Extracted sender from dialog:", currentEmailMetadata.sender);
      }
    }
    
    // Try to find date in the dialog
    if (!currentEmailMetadata.date) {
      const dateElement = dialog.querySelector('.g3, .gH .gK span');
      if (dateElement) {
        const dateText = dateElement.textContent.trim();
        // Use today's date as fallback
        currentEmailMetadata.date = formatDate(new Date());
        console.log("Using current date for preview:", currentEmailMetadata.date);
      }
    }
  } catch (error) {
    console.error("Error extracting metadata from dialog:", error);
    
    // Use fallbacks if extraction fails
    if (!currentEmailMetadata.sender) {
      currentEmailMetadata.sender = "unknown_sender";
    }
    if (!currentEmailMetadata.date) {
      currentEmailMetadata.date = formatDate(new Date());
    }
  }
}

/**
 * Extract filename from a preview dialog using multiple strategies
 * @param {Element} dialog - The preview dialog element
 * @returns {string} The extracted filename or null if not found
 */
function extractFilenameFromPreviewDialog(dialog) {
  try {
    // First check for presence in attachments list from email metadata
    if (currentEmailMetadata.attachments && currentEmailMetadata.attachments.length > 0) {
      // If only one attachment, just use it
      if (currentEmailMetadata.attachments.length === 1) {
        console.log("Using the only attachment filename:", currentEmailMetadata.attachments[0].filename);
        return currentEmailMetadata.attachments[0].filename;
      }
      
      // For multiple attachments, try to find which one matches the current preview
      // Get preview content to compare
      const previewText = dialog.textContent.toLowerCase();
      const previewHasImage = !!dialog.querySelector('img:not([src*="icon"]):not([src*="logo"])');
      const previewHasPdf = !!dialog.querySelector('.ndfHFb-c4YZDc-cYSp0e-DARUcf, iframe[src*="pdf"]');
      
      // Try to match the document type
      let bestMatchIndex = -1;
      let bestMatchScore = 0;
      
      currentEmailMetadata.attachments.forEach((attachment, index) => {
        let score = 0;
        const filename = attachment.filename.toLowerCase();
        
        // Score based on file extension match
        if (previewHasImage && /\.(jpe?g|png|gif|bmp|tiff?)$/i.test(filename)) {
          score += 5;
        } else if (previewHasPdf && /\.pdf$/i.test(filename)) {
          score += 5;
        } else if (previewText.includes('word') && /\.(docx?|rtf)$/i.test(filename)) {
          score += 5;
        } else if (previewText.includes('excel') && /\.(xlsx?|csv)$/i.test(filename)) {
          score += 5;
        } else if (previewText.includes('powerpoint') && /\.(pptx?|pps)$/i.test(filename)) {
          score += 5;
        }
        
        // Check if filename text appears in the preview dialog
        const filenameBase = filename.substring(0, filename.lastIndexOf('.'));
        if (filenameBase.length > 3 && previewText.includes(filenameBase)) {
          score += 10;
        }
        
        if (score > bestMatchScore) {
          bestMatchScore = score;
          bestMatchIndex = index;
        }
      });
      
      // If we found a good match, use it
      if (bestMatchIndex >= 0 && bestMatchScore > 3) {
        console.log(`Found matching attachment #${bestMatchIndex + 1} for preview:`, 
                   currentEmailMetadata.attachments[bestMatchIndex].filename);
        return currentEmailMetadata.attachments[bestMatchIndex].filename;
      }
    }
    
    // Now try multiple strategies to find the filename in the dialog itself
    console.log("Extracting filename from preview dialog with multiple strategies");
    
    // Strategy 1: First check for the attachment ID in the dialog (most reliable)
    const attachmentId = findAttachmentIdInDialog(dialog);
    if (attachmentId) {
      console.log("Found attachment ID in preview:", attachmentId);
      
      // Try to find this ID in our stored attachments
      let matchedAttachment = null;
      if (currentEmailMetadata.attachments && currentEmailMetadata.attachments.length > 0) {
        for (const attachment of currentEmailMetadata.attachments) {
          if (attachment.element && (
              attachment.element.getAttribute('data-attachid') === attachmentId ||
              attachment.element.getAttribute('data-legacy-attachment-id') === attachmentId ||
              attachment.element.id && attachment.element.id.includes(attachmentId))) {
            matchedAttachment = attachment;
            break;
          }
        }
        
        if (matchedAttachment) {
          console.log("Matched attachment ID to filename:", matchedAttachment.filename);
          return matchedAttachment.filename;
        }
      }
    }
    
    // Strategy 2: Look for explicit file title elements
    const titleElements = dialog.querySelectorAll('.aQA, .aV3, .a3s, [role="heading"]');
    for (const el of titleElements) {
      const text = el.textContent.trim();
      if (text && text.length > 3 && text.length < 200) {
        // Check if this looks like a filename (has extension)
        if (text.includes('.') && /\.\w{2,4}$/.test(text)) {
          console.log("Found filename in title element:", text);
          return cleanupFilename(text);
        }
      }
    }
    
    // Strategy 3: Check top-level heading elements
    const headings = dialog.querySelectorAll('h1, h2, h3');
    for (const heading of headings) {
      if (heading.textContent && heading.textContent.trim().length > 3 
          && heading.textContent.length < 200) {  
        const headingText = heading.textContent.trim();
        console.log("Found potential filename in heading:", headingText);
        
        // If heading contains obvious filename patterns
        if (headingText.includes('.') && /\.\w{2,4}$/.test(headingText)) {
          return cleanupFilename(headingText);
        }
      }
    }
    
    // Strategy 4: Document title check (excluding Gmail-specific parts)
    let documentTitle = document.title || '';
    documentTitle = documentTitle.replace(/Gmail( - )?/i, '').trim();
    
    if (documentTitle && documentTitle !== 'Inbox' && !documentTitle.includes('mail') && documentTitle.length < 200) {
      console.log("Using cleaned document title as filename:", documentTitle);
      
      // Add extension if missing
      if (!documentTitle.includes('.')) {
        const fileType = guessFileTypeFromContent(dialog);
        documentTitle += `.${fileType}`;
      }
      
      return cleanupFilename(documentTitle);
    }
    
    // Strategy 5: Check for inline images that might give filename clues
    const images = dialog.querySelectorAll('img[src]:not([src*="icon"]):not([src*="logo"])');
    for (const img of images) {
      const src = img.getAttribute('src');
      if (src && src.includes('/')) {
        const srcParts = src.split('/');
        let lastPart = srcParts[srcParts.length - 1].split('?')[0];
        
        // Check if it looks like a filename
        if (lastPart.includes('.') && lastPart.length > 5 && lastPart.length < 200) {
          // Remove any base64 or data URL parts
          if (lastPart.includes(';base64')) {
            lastPart = lastPart.substring(0, lastPart.indexOf(';base64'));
          }
          
          // Try to decode URL-encoded names
          try {
            lastPart = decodeURIComponent(lastPart);
          } catch (e) { /* Continue with original if decoding fails */ }
          
          console.log("Found filename in image src:", lastPart);
          return cleanupFilename(lastPart);
        }
      }
      
      // Check alt text too
      const alt = img.getAttribute('alt');
      if (alt && alt.length > 3 && alt.length < 200 && alt.includes('.')) {
        return cleanupFilename(alt);
      }
    }
    
    // Strategy 6: If an attachment ID was found but no name, use it with guessed extension
    if (attachmentId) {
      // Try to guess the file type
      const fileType = guessFileTypeFromContent(dialog);
      const extension = fileType ? '.' + fileType : '.pdf';
      
      // Generate a name based on email subject if available
      if (currentEmailMetadata.subject && currentEmailMetadata.subject.length > 3) {
        const subjectName = sanitizeFilename(currentEmailMetadata.subject).substring(0, 30) + extension;
        console.log("Using email subject with extension:", subjectName);
        return subjectName;
      }
      
      // Fallback to attachment ID
      return `attachment_${attachmentId}${extension}`;
    }
    
    // Strategy 7: Generate name based on content type
    const fileType = guessFileTypeFromContent(dialog);
    const timestamp = Date.now();
    const randomSeq = Math.floor(Math.random() * 1000);
    
    // Try to use sender+date for more meaningful names
    let prefix = "document";
    if (currentEmailMetadata.sender && currentEmailMetadata.sender !== 'unknown_sender') {
      // Extract username part from email
      const sender = currentEmailMetadata.sender.includes('@') ? 
                    currentEmailMetadata.sender.split('@')[0] : 
                    currentEmailMetadata.sender;
      
      prefix = sanitizeFilename(sender);
    }
    
    return `${prefix}_${timestamp}_${randomSeq}.${fileType}`;
  } catch (error) {
    console.error("Error extracting filename from preview dialog:", error);
    
    // Return a generic name in case of error
    return `attachment_${Date.now()}.pdf`;
  }
}

/**
 * Find attachment ID in dialog
 * @param {Element} dialog - The preview dialog
 * @returns {string} Attachment ID or null
 */
function findAttachmentIdInDialog(dialog) {
  // Look for elements with attachment IDs
  const attachmentElements = dialog.querySelectorAll('[id*="attachment_"]:not(input), [data-attachid], [data-legacy-attachment-id]');
  
  for (const el of attachmentElements) {
    // Check ID attribute
    const id = el.id || '';
    if (id.includes('attachment_')) {
      const match = id.match(/attachment_(\d+)/);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    // Check data attributes
    const attachId = el.getAttribute('data-attachid') || el.getAttribute('data-legacy-attachment-id');
    if (attachId) {
      return attachId;
    }
  }
  
  // Also check the URL
  const url = window.location.href;
  const attachmentMatch = url.match(/[&?]view=att[^&]*?id=([^&]+)/i);
  if (attachmentMatch && attachmentMatch[1]) {
    return attachmentMatch[1];
  }
  
  return null;
}

/**
 * Guess file type based on dialog content
 * @param {Element} dialog - The preview dialog
 * @returns {string} File extension without dot, or empty string
 */
function guessFileTypeFromContent(dialog) {
  // Check for images
  if (dialog.querySelector('img[src]:not([src*="icon"]):not([src*="logo"])')) {
    return 'jpg';
  }
  
  // Check for PDF viewers
  if (dialog.querySelector('.ndfHFb-c4YZDc-cYSp0e-DARUcf, iframe[src*="pdf"]')) {
    return 'pdf';
  }
  
  // Check for text content patterns suggesting a Word document
  const textContent = dialog.textContent || '';
  if (textContent.includes('Microsoft Word') || 
      dialog.querySelector('.docs-gm-office-suite')) {
    return 'docx';
  }
  
  // Check for spreadsheet patterns
  if (textContent.includes('Microsoft Excel') ||
      dialog.querySelector('table[role="grid"], [class*="excel"], [class*="sheet"]')) {
    return 'xlsx';
  }
  
  // Check for presentation patterns
  if (textContent.includes('Microsoft PowerPoint') ||
      dialog.querySelector('[class*="slide"], [class*="presentation"]')) {
    return 'pptx';
  }
  
  // Default to PDF for documents
  return 'pdf';
}

/**
 * Clean up a potential filename string
 * @param {string} text - The text to clean
 * @returns {string} Cleaned filename
 */
function cleanupFilename(text) {
  if (!text) return '';
  
  // Remove email markers and common prefixes
  text = text.replace(/^re:/i, '')
             .replace(/^fwd:/i, '')
             .replace(/^fw:/i, '')
             .replace(/^attachment:/i, '')
             .trim();
  
  // Extract just the filename if it appears to have one
  const filenameParts = text.match(/([^\/\\:*?"<>|]+\.\w{2,6})(?:\s|$)/);
  if (filenameParts && filenameParts[1]) {
    return filenameParts[1].trim();
  }
  
  // Remove invalid filename characters
  text = text.replace(/[\/\\:*?"<>|]/g, '_');
  
  // Limit length
  if (text.length > 200) {
    text = text.substring(0, 197) + '...';
  }
  
  // Add extension if missing
  if (!text.includes('.')) {
    text += '.pdf'; // Default extension
  }
  
  return text;
}

// Initialize when the DOM is fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
} 