/**
 * Gmail Attachment Renamer - Options Page JavaScript
 * 
 * Handles loading and saving the date format preference.
 */

// Default values
const DEFAULT_PATTERN = "DateFormat_SenderName_OriginalFilename";
const DEFAULT_DATE_FORMAT = "YYYY-MM-DD";

// DOM elements
const dateFormatSelect = document.getElementById('dateFormatSelect');
const customDateFormatGroup = document.getElementById('customDateFormatGroup');
const customDateFormat = document.getElementById('customDateFormat');
const dateFormatPreview = document.getElementById('dateFormatPreview');
const saveBtn = document.getElementById('saveBtn');
const status = document.getElementById('status');

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
  // Get values from form - pattern is fixed
  let dateFormat = dateFormatSelect.value;
  
  // If custom format is selected, use the custom input
  if (dateFormat === 'custom') {
    dateFormat = customDateFormat.value || DEFAULT_DATE_FORMAT;
  }
  
  // Save both values to storage
  chrome.storage.sync.set(
    { 
      filenamePattern: DEFAULT_PATTERN,
      dateFormat: dateFormat 
    },
    () => {
      // Update status to let user know options were saved
      showStatus('Options saved!', 'success');
      
      // Hide status after 2 seconds
      setTimeout(() => {
        status.style.display = 'none';
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
      dateFormat: DEFAULT_DATE_FORMAT
    },
    (items) => {
      // Check if the date format is one of our predefined options
      const isPresetFormat = Array.from(dateFormatSelect.options).some(option => {
        return option.value === items.dateFormat;
      });
      
      if (isPresetFormat) {
        dateFormatSelect.value = items.dateFormat;
      } else {
        // If it's a custom format, select the custom option and show the input
        dateFormatSelect.value = 'custom';
        customDateFormat.value = items.dateFormat;
        customDateFormatGroup.style.display = 'block';
      }
      
      // Update the date format preview
      updateDateFormatPreview();
    }
  );
}

/**
 * Update the date format preview based on the selected format
 */
function updateDateFormatPreview() {
  let format = dateFormatSelect.value;
  
  // If custom is selected, use the custom input
  if (format === 'custom') {
    format = customDateFormat.value || DEFAULT_DATE_FORMAT;
  }
  
  // Get today's date for the preview
  const today = new Date();
  const formattedDate = formatDateWithPattern(today, format);
  
  // Update the preview
  dateFormatPreview.textContent = formattedDate;
}

/**
 * Format a date using the specified pattern
 * @param {Date} date - The date to format
 * @param {string} pattern - The pattern to use
 * @returns {string} - The formatted date
 */
function formatDateWithPattern(date, pattern) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  
  // Use padStart to ensure month and day have two digits
  const MM = month.toString().padStart(2, '0');
  const DD = day.toString().padStart(2, '0');
  const M = month.toString();
  const D = day.toString();
  
  // Replace tokens in the pattern
  let formatted = pattern
    .replace(/YYYY/g, year)
    .replace(/MM/g, MM)
    .replace(/M(?!M)/g, M)  // Replace M only if not followed by another M (lookbehind not fully supported)
    .replace(/DD/g, DD)
    .replace(/D(?!D)/g, D); // Replace D only if not followed by another D
  
  return formatted;
}

/**
 * Show status message to the user
 * @param {string} message - Message to display
 * @param {string} type - 'success' or 'error'
 */
function showStatus(message, type) {
  status.textContent = message;
  status.className = 'status ' + type;
  status.style.display = 'block';
}

/**
 * Validate options before saving
 * @returns {boolean} True if valid
 */
function validatePattern() {
  // Pattern is fixed, so no validation needed for that
  // Just validate the custom date format if selected
  if (dateFormatSelect.value === 'custom') {
    const customFormatValue = customDateFormat.value.trim();
    if (!customFormatValue) {
      showStatus('Custom date format cannot be empty', 'error');
      return false;
    }
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

// Initialize options page
document.addEventListener('DOMContentLoaded', () => {
  // Load saved options
  loadOptions();
  
  // Load license status
  loadLicenseStatus();
  
  // Initial date format preview
  updateDateFormatPreview();
});

// Event listeners
// Save options when the button is clicked
saveBtn.addEventListener('click', () => {
  if (validatePattern()) {
    saveOptions();
  }
});

// Toggle custom date format input when dropdown changes
dateFormatSelect.addEventListener('change', () => {
  if (dateFormatSelect.value === 'custom') {
    customDateFormatGroup.style.display = 'block';
  } else {
    customDateFormatGroup.style.display = 'none';
  }
  updateDateFormatPreview();
});

// Update preview when custom format changes
customDateFormat.addEventListener('input', updateDateFormatPreview);

// Enable enter key to save from custom date format
customDateFormat.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (validatePattern()) {
      saveOptions();
    }
  }
});

// Handle license UI
enterLicenseLink.addEventListener('click', (e) => {
  e.preventDefault();
  showLicenseInput();
});

activateLicenseBtn.addEventListener('click', activateLicense);

// Payment buttons
if (subscribeMonthlyBtn) {
  subscribeMonthlyBtn.addEventListener('click', () => handlePurchase('monthly'));
}

if (buyLifetimeBtn) {
  buyLifetimeBtn.addEventListener('click', () => handlePurchase('lifetime'));
}

if (subscribeMonthlyExpiredBtn) {
  subscribeMonthlyExpiredBtn.addEventListener('click', () => handlePurchase('monthly'));
}

if (buyLifetimeExpiredBtn) {
  buyLifetimeExpiredBtn.addEventListener('click', () => handlePurchase('lifetime'));
} 