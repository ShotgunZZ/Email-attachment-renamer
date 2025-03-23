/**
 * Gmail Attachment Renamer - Options Page JavaScript
 * 
 * Handles loading and saving the filename pattern preference.
 */

// Default pattern
const DEFAULT_PATTERN = "YYYY-MM-DD_SenderName_OriginalFilename";

// DOM elements
const patternInput = document.getElementById('patternInput');
const saveButton = document.getElementById('saveBtn');
const statusElement = document.getElementById('status');

/**
 * Save options to chrome.storage
 */
function saveOptions() {
  const pattern = patternInput.value || DEFAULT_PATTERN;
  
  chrome.storage.sync.set(
    { filenamePattern: pattern },
    () => {
      // Update status to let user know options were saved
      showStatus('Options saved!', 'success');
      
      // Hide status after 2 seconds
      setTimeout(() => {
        statusElement.style.display = 'none';
      }, 2000);
    }
  );
}

/**
 * Load saved options from chrome.storage
 */
function loadOptions() {
  chrome.storage.sync.get(
    { filenamePattern: DEFAULT_PATTERN },
    (items) => {
      patternInput.value = items.filenamePattern;
    }
  );
}

/**
 * Show status message to the user
 * @param {string} message - Message to display
 * @param {string} type - 'success' or 'error'
 */
function showStatus(message, type) {
  statusElement.textContent = message;
  statusElement.className = 'status ' + type;
  statusElement.style.display = 'block';
}

/**
 * Validate the pattern input
 * @returns {boolean} True if valid
 */
function validatePattern() {
  const pattern = patternInput.value;
  
  if (!pattern) {
    showStatus('Pattern cannot be empty', 'error');
    return false;
  }
  
  // Check if pattern contains required variables
  const hasOriginalFilename = pattern.includes('OriginalFilename');
  
  if (!hasOriginalFilename) {
    showStatus('Pattern must include OriginalFilename', 'error');
    return false;
  }
  
  return true;
}

// Initialize the options page
document.addEventListener('DOMContentLoaded', loadOptions);

// Save options when the button is clicked
saveButton.addEventListener('click', () => {
  if (validatePattern()) {
    saveOptions();
  }
});

// Enable enter key to save
patternInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (validatePattern()) {
      saveOptions();
    }
  }
}); 