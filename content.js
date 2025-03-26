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
    
    // Add capture phase event listener to intercept before Gmail's handlers
    link.addEventListener('click', handleAttachmentClick, true);
  });
}

// Handle attachment click
function handleAttachmentClick(event) {
  // Get attachment information
  const link = event.currentTarget;
  const downloadUrl = link.getAttribute('download_url');
  
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
  
  try {
    // Check if chrome.runtime is available (extension context is valid)
    if (chrome.runtime && chrome.runtime.id) {
      // Completely stop the event to prevent Gmail's default download
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      
      // Send to background script for processing
      chrome.runtime.sendMessage({
        action: 'renameAttachment',
        url: url,
        newFilename: newFilename
      }, response => {
        // Check if response exists and was successful
        if (response && response.success) {
          // Successfully handled by our extension
          return;
        }
        
        // If renaming failed, fall back to original download
        if (response && response.reason === 'trial_limit_reached') {
          alert('Trial limit reached. Please upgrade to premium for unlimited renaming.');
        }
        
        // Fall back to original download
        window.open(url, '_blank');
      });
      
      // Return false to ensure the default action is prevented
      return false;
    }
  } catch (error) {
    console.log('Extension context error:', error);
    // Continue with default download on error
  }
  
  // If we get here, either the extension context is invalid or an error occurred
  // Let Gmail's default download proceed
  return true;
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