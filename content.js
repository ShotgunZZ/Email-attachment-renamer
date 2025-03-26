// Gmail Attachment Renamer - Content Script

// Function to initialize the attachment observer
function initAttachmentRenamer() {
  console.log('Gmail Attachment Renamer initialized');
  
  // We'll observe Gmail for dynamically loaded content
  observeGmailContent();
}

// Observe Gmail for content changes (emails loading, etc.)
function observeGmailContent() {
  // Simple observer for Gmail content changes
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length) {
        // Look for attachment download links
        checkForAttachments();
      }
    }
  });
  
  // Start observing the main Gmail container
  const gmailContainer = document.querySelector('body');
  if (gmailContainer) {
    observer.observe(gmailContainer, { childList: true, subtree: true });
  }
}

// Check for attachments in the current view
function checkForAttachments() {
  // Find all attachment download links in Gmail
  // Gmail uses span[download_url] for attachments
  const attachmentLinks = document.querySelectorAll('span[download_url]');
  
  // Add click interceptors to each attachment link
  attachmentLinks.forEach(link => {
    // Skip if we've already processed this link
    if (link.dataset.renamerProcessed) return;
    
    // Mark as processed to avoid duplicate listeners
    link.dataset.renamerProcessed = 'true';
    
    // Instead of adding a click listener directly to the span,
    // we need to find all clickable elements inside and around it
    const clickTargets = findClickableTargets(link);
    
    // Add capture phase listeners to all potential click targets
    clickTargets.forEach(target => {
      target.addEventListener('click', handleAttachmentClick, true);
    });
  });
}

// Find all clickable elements related to an attachment
function findClickableTargets(attachmentSpan) {
  const targets = [];
  
  // Add the span itself
  targets.push(attachmentSpan);
  
  // Find parent elements that might be clickable (up to 3 levels)
  let parent = attachmentSpan.parentElement;
  for (let i = 0; i < 3 && parent; i++) {
    if (parent.tagName === 'A' || parent.role === 'button' || 
        parent.className.includes('download') || parent.getAttribute('jsaction')) {
      targets.push(parent);
    }
    parent = parent.parentElement;
  }
  
  // Find child elements that might be clickable
  const children = attachmentSpan.querySelectorAll('a, [role="button"], [jsaction], .download');
  children.forEach(child => targets.push(child));
  
  return targets;
}

// Handle attachment click
function handleAttachmentClick(event) {
  // Stop propagation immediately in the capture phase
  event.stopPropagation();
  event.preventDefault();
  
  // Find the span with the download_url
  let target = event.target;
  let downloadSpan = null;
  
  // If the target itself is the download span
  if (target.hasAttribute('download_url')) {
    downloadSpan = target;
  } else {
    // Look for the download span in the event path
    downloadSpan = findDownloadSpan(target);
  }
  
  if (!downloadSpan) return;
  
  // Get attachment information
  const downloadUrl = downloadSpan.getAttribute('download_url');
  
  // downloadUrl format: "application/pdf:filename.pdf:https://..."
  if (!downloadUrl) return;
  
  const parts = downloadUrl.split(':');
  if (parts.length < 3) return;
  
  const originalFilename = parts[1];
  const url = parts.slice(2).join(':'); // In case URL itself contains colons
  
  // Get email metadata (date and sender)
  const emailMetadata = getEmailMetadata();
  
  // Format new filename
  const newFilename = formatFilename(emailMetadata.date, emailMetadata.sender, originalFilename);
  
  // Send to background script for processing
  chrome.runtime.sendMessage({
    action: 'renameAttachment',
    url: url,
    newFilename: newFilename
  }, response => {
    if (!response || !response.success) {
      // If renaming failed (e.g., trial limit reached), fall back to original download
      if (response && response.reason === 'trial_limit_reached') {
        alert('Trial limit reached. Please upgrade to premium for unlimited renaming.');
      }
      // Use a timeout to ensure our download is separate from Gmail's
      setTimeout(() => window.open(url, '_blank'), 10);
    }
  });
}

// Helper to find the download span from a click target
function findDownloadSpan(element) {
  // Check if the element itself has the attribute
  if (element.hasAttribute('download_url')) {
    return element;
  }
  
  // Check parent elements (up to 3 levels)
  let parent = element.parentElement;
  for (let i = 0; i < 3 && parent; i++) {
    if (parent.hasAttribute('download_url')) {
      return parent;
    }
    parent = parent.parentElement;
  }
  
  // Check child elements
  const downloadSpan = element.querySelector('span[download_url]');
  if (downloadSpan) {
    return downloadSpan;
  }
  
  return null;
}

// Extract email metadata from the current email
function getEmailMetadata() {
  let date = new Date();
  let sender = 'unknown';
  
  try {
    // Try to get the date from the email header
    const dateElement = document.querySelector('[role="main"] h2 span[title]');
    if (dateElement) {
      const dateString = dateElement.getAttribute('title');
      if (dateString) {
        date = new Date(dateString);
      }
    }
    
    // Try to get sender email
    const senderElement = document.querySelector('[role="main"] [email]');
    if (senderElement) {
      sender = senderElement.getAttribute('email');
    }
  } catch (e) {
    console.log('Error extracting email metadata:', e);
  }
  
  return { date, sender };
}

// Format filename according to pattern: MM.DD.YYYY_SenderEmail_OriginalFileName
function formatFilename(date, sender, originalFilename) {
  // Format date as MM.DD.YYYY
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  const formattedDate = `${month}.${day}.${year}`;
  
  // Clean up sender email (remove special chars that aren't file-system friendly)
  const cleanSender = sender.replace(/[^a-zA-Z0-9._@-]/g, '');
  
  // Combine parts into new filename
  return `${formattedDate}_${cleanSender}_${originalFilename}`;
}

// Initialize when the content script loads
initAttachmentRenamer(); 