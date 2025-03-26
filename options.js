/**
 * Gmail Attachment Renamer - Options Page JavaScript
 * 
 * Handles loading and saving the filename pattern preference.
 * Also manages license activation and status checking.
 */

// Default pattern
const DEFAULT_PATTERN = "YYYY-MM-DD_SenderEmail_OriginalFilename";

// DOM elements - Settings tab
const patternInput = document.getElementById('patternInput');
const dateFormatSelect = document.getElementById('dateFormatSelect');
const dateFormatDisplay = document.getElementById('dateFormatDisplay');
const examplePattern = document.getElementById('examplePattern');
const patternPreview = document.getElementById('patternPreview');
const saveButton = document.getElementById('saveBtn');
const settingsStatusElement = document.getElementById('settingsStatus');

// DOM elements - License tab
const licenseStatusText = document.getElementById('licenseStatusText');
const licenseKeyInput = document.getElementById('licenseKeyInput');
const activateButton = document.getElementById('activateBtn');
const purchaseButton = document.getElementById('purchaseBtn');
const licenseStatusElement = document.getElementById('licenseStatus');
const trialInfoElement = document.getElementById('trialInfo');
const licenseInfoElement = document.getElementById('licenseInfo');
const licenseDetailsElement = document.getElementById('licenseDetails');

// DOM elements - Tab navigation
const settingsTab = document.getElementById('settingsTab');
const licenseTab = document.getElementById('licenseTab');
const settingsPanel = document.getElementById('settingsPanel');
const licensePanel = document.getElementById('licensePanel');

// Sample values for preview
const today = new Date();
const sampleEmail = "user@example.com";
const sampleName = "John Doe";
const sampleFilename = "document.pdf";
const sampleSubject = "Meeting Notes";

// Purchase URL - basic format that works reliably with Stripe's test mode
const PURCHASE_URL = "https://buy.stripe.com/test_14k2bm5T864I9kQ145";

/**
 * Get formatted date based on selected format
 */
function getFormattedDate(date, format) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  switch (format) {
    case 'YYYY-MM-DD':
      return `${year}-${month}-${day}`;
    case 'MM-DD-YYYY':
      return `${month}-${day}-${year}`;
    case 'DD-MM-YYYY':
      return `${day}-${month}-${year}`;
    case 'YYYYMMDD':
      return `${year}${month}${day}`;
    case 'MMDDYYYY':
      return `${month}${day}${year}`;
    default:
      return `${year}-${month}-${day}`;
  }
}

/**
 * Update the pattern with the selected date format
 */
function updateDateFormat() {
  const selectedFormat = dateFormatSelect.value;
  const currentPattern = patternInput.value;
  
  // Update the displayed date format in the variables list
  dateFormatDisplay.textContent = selectedFormat;
  
  // Replace any existing date format in the pattern
  const dateFormats = ['YYYY-MM-DD', 'MM-DD-YYYY', 'DD-MM-YYYY', 'YYYYMMDD', 'MMDDYYYY'];
  let updatedPattern = currentPattern;
  
  for (const format of dateFormats) {
    if (currentPattern.includes(format)) {
      updatedPattern = currentPattern.replace(format, selectedFormat);
      break;
    }
  }
  
  // If no date format was found in the pattern, don't change anything
  if (updatedPattern !== currentPattern) {
    patternInput.value = updatedPattern;
  }
  
  // Update example pattern
  examplePattern.textContent = updatedPattern;
  
  // Update preview
  updatePreview();
}

/**
 * Update the filename preview
 */
function updatePreview() {
  const pattern = patternInput.value || DEFAULT_PATTERN;
  const dateFormat = dateFormatSelect.value;
  const formattedDate = getFormattedDate(today, dateFormat);
  
  // Replace variables with sample values
  let preview = pattern
    .replace(dateFormat, formattedDate)
    .replace('SenderEmail', sampleEmail)
    .replace('SenderName', sampleName)
    .replace('OriginalFilename', sampleFilename)
    .replace('Subject', sampleSubject);
  
  patternPreview.textContent = preview;
}

/**
 * Save options to chrome.storage
 */
function saveOptions() {
  const pattern = patternInput.value || DEFAULT_PATTERN;
  const dateFormat = dateFormatSelect.value;
  
  chrome.storage.sync.set(
    { 
      filenamePattern: pattern,
      dateFormat: dateFormat
    },
    () => {
      // Update status to let user know options were saved
      showSettingsStatus('Options saved!', 'success');
      
      // Hide status after 2 seconds
      setTimeout(() => {
        settingsStatusElement.style.display = 'none';
      }, 2000);
    }
  );
}

/**
 * Load saved options from chrome.storage
 */
function loadOptions() {
  chrome.storage.sync.get(
    { 
      filenamePattern: DEFAULT_PATTERN,
      dateFormat: 'YYYY-MM-DD'
    },
    (items) => {
      patternInput.value = items.filenamePattern;
      
      // Set the date format dropdown
      if (items.dateFormat) {
        dateFormatSelect.value = items.dateFormat;
      }
      
      // Update the display elements
      dateFormatDisplay.textContent = dateFormatSelect.value;
      examplePattern.textContent = patternInput.value;
      
      // Update preview
      updatePreview();
    }
  );
}

/**
 * Show status message in the settings tab
 * @param {string} message - Message to display
 * @param {string} type - 'success' or 'error'
 */
function showSettingsStatus(message, type) {
  settingsStatusElement.textContent = message;
  settingsStatusElement.className = 'status ' + type;
  settingsStatusElement.style.display = 'block';
}

/**
 * Show status message in the license tab
 * @param {string} message - Message to display
 * @param {string} type - 'success', 'error', or 'warning'
 */
function showLicenseStatus(message, type) {
  licenseStatusElement.textContent = message;
  licenseStatusElement.className = 'status ' + type;
  licenseStatusElement.style.display = 'block';
  
  // Hide status after 5 seconds
  setTimeout(() => {
    licenseStatusElement.style.display = 'none';
  }, 5000);
}

/**
 * Validate the pattern input
 * @returns {boolean} True if valid
 */
function validatePattern() {
  const pattern = patternInput.value;
  
  if (!pattern) {
    showSettingsStatus('Pattern cannot be empty', 'error');
    return false;
  }
  
  // Check if pattern contains required variables
  const hasOriginalFilename = pattern.includes('OriginalFilename');
  
  if (!hasOriginalFilename) {
    showSettingsStatus('Pattern must include OriginalFilename', 'error');
    return false;
  }
  
  return true;
}

/**
 * Check and display license status
 */
async function checkLicenseStatus() {
  try {
    // Set loading state
    licenseStatusText.textContent = 'Checking license status...';
    
    // Check license status using the license manager
    const status = await window.licenseManager.checkLicenseStatus();
    
    // Update UI based on license status
    updateLicenseUI(status);
  } catch (error) {
    console.error('Error checking license status:', error);
    licenseStatusText.textContent = 'Error checking license status';
    showLicenseStatus('Failed to check license status. Please try again later.', 'error');
  }
}

/**
 * Update license UI based on status
 * @param {Object} status - License status object
 */
function updateLicenseUI(status) {
  // Update status text
  licenseStatusText.textContent = status.message;
  
  // Show appropriate info box
  if (status.status === 'active') {
    // Licensed
    trialInfoElement.style.display = 'none';
    licenseInfoElement.style.display = 'block';
    
    // Update customer info if available
    if (status.customerInfo) {
      licenseDetailsElement.textContent = `Licensed to: ${status.customerInfo.email || status.customerInfo.name || 'Verified Customer'}`;
    } else {
      licenseDetailsElement.textContent = 'Your license is active.';
    }
    
    // Disable purchase button
    purchaseButton.disabled = true;
    purchaseButton.textContent = 'Already Licensed';
  } else {
    // Trial or expired
    trialInfoElement.style.display = 'block';
    licenseInfoElement.style.display = 'none';
    
    // Get trial downloads count
    const trialDownloads = parseInt(localStorage.getItem('trialDownloads') || '0');
    const trialLimit = 10;
    const remainingDownloads = Math.max(0, trialLimit - trialDownloads);
    
    // Update trial info
    trialInfoElement.innerHTML = `<p><strong>Trial Mode:</strong> You're currently using the trial version which is limited to 10 attachment downloads. You have ${remainingDownloads} downloads remaining. Upgrade to premium for unlimited downloads.</p>`;
    
    // Enable purchase button
    purchaseButton.disabled = false;
    purchaseButton.textContent = 'Purchase Premium License';
  }
}

/**
 * Activate license key
 */
async function activateLicense() {
  const licenseKey = licenseKeyInput.value.trim();
  
  // Validate input
  if (!licenseKey) {
    showLicenseStatus('Please enter a license key', 'error');
    return;
  }
  
  try {
    // Show loading state
    activateButton.disabled = true;
    activateButton.textContent = 'Activating...';
    showLicenseStatus('Verifying license key...', 'info');
    
    // Attempt to activate the license
    const result = await window.licenseManager.activateLicense(licenseKey);
    
    // Handle result
    if (result.success) {
      showLicenseStatus(result.message || 'License activated successfully!', 'success');
      licenseKeyInput.value = '';
      
      // Update license status display
      checkLicenseStatus();
    } else {
      showLicenseStatus(result.message || 'Failed to activate license.', 'error');
    }
  } catch (error) {
    console.error('Error activating license:', error);
    showLicenseStatus('Error activating license. Please try again later.', 'error');
  } finally {
    // Reset button state
    activateButton.disabled = false;
    activateButton.textContent = 'Activate License';
  }
}

/**
 * Open purchase page with proper success URL parameters
 */
function openPurchasePage() {
  // Add the success_url parameter dynamically
  const successUrl = encodeURIComponent(`https://kaleidoscopic-sopapillas-6a41bb.netlify.app/purchase-success.html`);
  
  // Add session_id parameter explicitly to the success URL
  const fullUrl = `${PURCHASE_URL}?success_url=${successUrl}%3Fsession_id%3D{CHECKOUT_SESSION_ID}`;
  
  console.log("Opening purchase URL:", fullUrl);
  chrome.tabs.create({ url: fullUrl });
}

/**
 * Switch between tabs
 * @param {string} tabId - ID of the tab to show
 */
function switchTab(tabId) {
  // Hide all panels
  settingsPanel.classList.remove('active');
  licensePanel.classList.remove('active');
  
  // Deactivate all tabs
  settingsTab.classList.remove('active');
  licenseTab.classList.remove('active');
  
  // Show selected panel and activate tab
  if (tabId === 'settings') {
    settingsPanel.classList.add('active');
    settingsTab.classList.add('active');
  } else if (tabId === 'license') {
    licensePanel.classList.add('active');
    licenseTab.classList.add('active');
    // Refresh license status when tab is shown
    checkLicenseStatus();
  }
}

// Initialize the options page
document.addEventListener('DOMContentLoaded', () => {
  // Load settings
  loadOptions();
  
  // Check license status
  checkLicenseStatus();
});

// Save options when the button is clicked
saveButton.addEventListener('click', () => {
  if (validatePattern()) {
    saveOptions();
  }
});

// Enable enter key to save settings
patternInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (validatePattern()) {
      saveOptions();
    }
  }
});

// Update pattern when date format changes
dateFormatSelect.addEventListener('change', updateDateFormat);

// Update preview when pattern changes
patternInput.addEventListener('input', updatePreview);

// License activation
activateButton.addEventListener('click', activateLicense);

// Purchase button
purchaseButton.addEventListener('click', openPurchasePage);

// Tab navigation
settingsTab.addEventListener('click', () => switchTab('settings'));
licenseTab.addEventListener('click', () => switchTab('license'));

// Enable enter key for license activation
licenseKeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    activateLicense();
  }
}); 