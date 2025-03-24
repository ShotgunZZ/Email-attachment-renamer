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

// License DOM elements
const licenseStatusElement = document.getElementById('licenseStatus');
const trialSection = document.getElementById('trialSection');
const expiredSection = document.getElementById('expiredSection');
const paidSection = document.getElementById('paidSection');
const licenseInputSection = document.getElementById('licenseInputSection');
const licenseKeyInput = document.getElementById('licenseKeyInput');
const activateLicenseBtn = document.getElementById('activateLicenseBtn');
const licenseMessage = document.getElementById('licenseMessage');
const licenseDetails = document.getElementById('licenseDetails');
const enterLicenseLink = document.getElementById('enterLicenseLink');

// Payment buttons
const subscribeMonthlyBtn = document.getElementById('subscribeMonthlyBtn');
const buyLifetimeBtn = document.getElementById('buyLifetimeBtn');
const subscribeMonthlyExpiredBtn = document.getElementById('subscribeMonthlyExpiredBtn');
const buyLifetimeExpiredBtn = document.getElementById('buyLifetimeExpiredBtn');

// License status
let currentLicenseStatus = null;

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

/**
 * Load and display license status
 */
function loadLicenseStatus() {
  // Get license status from background page
  chrome.runtime.sendMessage(
    { action: 'getLicenseStatus' },
    (response) => {
      if (response && response.licenseStatus) {
        updateLicenseUI(response.licenseStatus);
      } else {
        // Default to trial if can't get status
        updateLicenseUI({
          isValid: true,
          daysLeft: 7,
          isPaid: false
        });
      }
    }
  );
}

/**
 * Update the license UI based on status
 * @param {Object} licenseStatus - The license status object
 */
function updateLicenseUI(licenseStatus) {
  currentLicenseStatus = licenseStatus;
  
  // Hide all sections first
  trialSection.style.display = 'none';
  expiredSection.style.display = 'none';
  paidSection.style.display = 'none';
  
  if (licenseStatus.isPaid) {
    // Paid license
    licenseStatusElement.textContent = 'Active License';
    licenseStatusElement.className = 'license-status license-paid';
    
    // Show paid section
    paidSection.style.display = 'block';
    licenseDetails.textContent = 'License Type: ' + (licenseStatus.type || 'Full');
  } else if (licenseStatus.isValid) {
    // Trial period
    licenseStatusElement.textContent = `Trial Period: ${licenseStatus.daysLeft} days remaining`;
    licenseStatusElement.className = 'license-status license-trial';
    
    // Show trial section
    trialSection.style.display = 'block';
  } else {
    // Expired
    licenseStatusElement.textContent = 'Trial Period Expired';
    licenseStatusElement.className = 'license-status license-expired';
    
    // Show expired section
    expiredSection.style.display = 'block';
  }
}

/**
 * Show license input section
 */
function showLicenseInput() {
  licenseInputSection.style.display = 'block';
  licenseMessage.style.display = 'none';
  licenseKeyInput.focus();
}

/**
 * Hide license input section
 */
function hideLicenseInput() {
  licenseInputSection.style.display = 'none';
}

/**
 * Activate license key
 */
function activateLicense() {
  const key = licenseKeyInput.value.trim();
  
  if (!key) {
    showLicenseMessage('Please enter a license key', 'error');
    return;
  }
  
  // Show activating message
  showLicenseMessage('Activating license...', '');
  
  // Send to background script
  chrome.runtime.sendMessage(
    { action: 'activateLicense', licenseKey: key },
    (response) => {
      if (response && response.activationResult) {
        const result = response.activationResult;
        
        if (result.success) {
          showLicenseMessage(result.message, 'success');
          
          // Update UI with new license status
          updateLicenseUI(response.licenseStatus);
          
          // Hide input after successful activation
          setTimeout(() => {
            hideLicenseInput();
            licenseMessage.style.display = 'none';
          }, 3000);
        } else {
          showLicenseMessage(result.message || 'Activation failed', 'error');
        }
      } else {
        showLicenseMessage('Error activating license. Please try again.', 'error');
      }
    }
  );
}

/**
 * Show license activation message
 * @param {string} message - Message to display
 * @param {string} type - 'success' or 'error' or '' for neutral
 */
function showLicenseMessage(message, type) {
  licenseMessage.textContent = message;
  licenseMessage.className = 'status ' + type;
  licenseMessage.style.display = 'block';
}

/**
 * Handle purchase button clicks
 * @param {string} type - 'monthly' or 'lifetime'
 */
function handlePurchase(type) {
  // Open payment page in new tab
  const paymentUrl = `https://your-payment-page.com?product=gmail-attachment-renamer&type=${type}`;
  window.open(paymentUrl, '_blank');
  
  // Show message to user
  showStatus('Opening payment page. After purchase, you will receive a license key to activate.', 'success');
}

// Initialize the options page
document.addEventListener('DOMContentLoaded', () => {
  loadOptions();
  loadLicenseStatus();
});

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

// License key activation
activateLicenseBtn.addEventListener('click', activateLicense);
licenseKeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    activateLicense();
  }
});

// Show license input section
enterLicenseLink.addEventListener('click', (e) => {
  e.preventDefault();
  showLicenseInput();
});

// Payment buttons
subscribeMonthlyBtn.addEventListener('click', () => handlePurchase('monthly'));
buyLifetimeBtn.addEventListener('click', () => handlePurchase('lifetime'));
subscribeMonthlyExpiredBtn.addEventListener('click', () => handlePurchase('monthly'));
buyLifetimeExpiredBtn.addEventListener('click', () => handlePurchase('lifetime')); 