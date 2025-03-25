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

// Premium status DOM elements
const licenseStatusElement = document.getElementById('licenseStatus');
const trialSection = document.getElementById('trialSection');
const expiredSection = document.getElementById('expiredSection');
const paidSection = document.getElementById('paidSection');
const verifySection = document.getElementById('verifySection');
const customerEmailInput = document.getElementById('customerEmailInput');
const verifyPurchaseBtn = document.getElementById('verifyPurchaseBtn');
const verificationMessage = document.getElementById('verificationMessage');
const licenseDetails = document.getElementById('licenseDetails');
const verifyPurchaseLink = document.getElementById('verifyPurchaseLink');

// Payment buttons
const subscribeMonthlyBtn = document.getElementById('subscribeMonthlyBtn');
const buyLifetimeBtn = document.getElementById('buyLifetimeBtn');
const subscribeMonthlyExpiredBtn = document.getElementById('subscribeMonthlyExpiredBtn');
const buyLifetimeExpiredBtn = document.getElementById('buyLifetimeExpiredBtn');

// Premium status
let currentPremiumStatus = null;

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
 * Load and display premium status
 */
function loadLicenseStatus() {
  // Get premium status from background page
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
          isPaid: false,
          plan: 'trial'
        });
      }
    }
  );
}

/**
 * Update the premium UI based on status
 * @param {Object} licenseStatus - The premium status object
 */
function updateLicenseUI(licenseStatus) {
  currentPremiumStatus = licenseStatus;
  
  // Hide all sections first
  trialSection.style.display = 'none';
  expiredSection.style.display = 'none';
  paidSection.style.display = 'none';
  verifySection.style.display = 'none';
  
  if (licenseStatus.isPaid) {
    // Paid license
    licenseStatusElement.textContent = 'Premium Active';
    licenseStatusElement.className = 'license-status license-paid';
    
    // Show paid section
    paidSection.style.display = 'block';
    
    // Update license details
    let licenseDetailsText = 'Plan Type: ' + (licenseStatus.plan === 'lifetime' ? 'Lifetime' : 'Monthly');
    
    // Add expiration date for monthly plans
    if (licenseStatus.plan === 'monthly') {
      // Calculate expiration date
      const expirationDate = new Date(Date.now() + (licenseStatus.daysLeft * 24 * 60 * 60 * 1000));
      const formattedDate = expirationDate.toLocaleDateString();
      licenseDetailsText += `<br>Renews on: ${formattedDate}`;
    }
    
    licenseDetails.innerHTML = licenseDetailsText;
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
 * Show purchase verification section
 */
function showVerifySection() {
  verifySection.style.display = 'block';
  customerEmailInput.focus();
}

/**
 * Hide purchase verification section
 */
function hideVerifySection() {
  verifySection.style.display = 'none';
}

/**
 * Verify purchase using email
 */
function verifyPurchase() {
  const email = customerEmailInput.value.trim();
  const resultElement = verificationMessage;
  
  if (!email) {
    showVerificationMessage('Please enter your email address', 'error');
    return;
  }
  
  // Show loading state
  showVerificationMessage('Verifying...', '');
  
  // Call our Netlify function
  fetch('/.netlify/functions/verify-purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email })
  })
  .then(response => response.json())
  .then(data => {
    if (data.verified) {
      showVerificationMessage('Purchase verified successfully!', 'success');
      
      // Store in Chrome storage
      chrome.runtime.sendMessage(
        { 
          action: 'storeCustomerInfo',
          customerId: data.customerId,
          plan: data.plan || 'lifetime'
        },
        (response) => {
          if (response && response.status === 'ok') {
            // Update UI with new status
            updateLicenseUI(response.licenseStatus);
            
            // Hide verification form after 2 seconds
            setTimeout(() => {
              hideVerifySection();
            }, 2000);
          }
        }
      );
    } else {
      showVerificationMessage('No purchase found for this email. Please make sure you\'ve completed checkout.', 'error');
    }
  })
  .catch(error => {
    console.error('Error:', error);
    showVerificationMessage('Verification failed. Please try again later.', 'error');
  });
}

/**
 * Show verification message
 * @param {string} message - Message to display
 * @param {string} type - 'success' or 'error'
 */
function showVerificationMessage(message, type) {
  verificationMessage.textContent = message;
  verificationMessage.className = 'status ' + type;
  verificationMessage.style.display = 'block';
}

/**
 * Handle purchase button click
 * @param {string} type - 'monthly' or 'lifetime'
 */
function handlePurchase(type) {
  // Save plan type to localStorage for later verification
  localStorage.setItem('stripePlan', type);
  
  // Open Stripe checkout in new tab
  if (type === 'monthly') {
    window.open('https://buy.stripe.com/test_6oEbLWa9odxacx2dQQ', '_blank');
  } else {
    window.open('https://buy.stripe.com/test_14k2bm5T864I9kQ145', '_blank');
  }
}

// Initialize listeners when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Load saved options
  loadOptions();
  
  // Update date format preview whenever the select changes
  dateFormatSelect.addEventListener('change', () => {
    // Show or hide the custom format input
    if (dateFormatSelect.value === 'custom') {
      customDateFormatGroup.style.display = 'block';
    } else {
      customDateFormatGroup.style.display = 'none';
    }
    
    updateDateFormatPreview();
  });
  
  // Update preview when custom format changes
  customDateFormat.addEventListener('input', updateDateFormatPreview);
  
  // Set up the save button
  saveBtn.addEventListener('click', () => {
    if (validatePattern()) {
      saveOptions();
    }
  });
  
  // Set up verify purchase link
  verifyPurchaseLink.addEventListener('click', (e) => {
    e.preventDefault();
    showVerifySection();
  });
  
  // Set up verify purchase button
  verifyPurchaseBtn.addEventListener('click', verifyPurchase);
  
  // Set up payment buttons
  subscribeMonthlyBtn.addEventListener('click', () => handlePurchase('monthly'));
  buyLifetimeBtn.addEventListener('click', () => handlePurchase('lifetime'));
  subscribeMonthlyExpiredBtn.addEventListener('click', () => handlePurchase('monthly'));
  buyLifetimeExpiredBtn.addEventListener('click', () => handlePurchase('lifetime'));
  
  // Load license status
  loadLicenseStatus();
}); 