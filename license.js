/**
 * Gmail Attachment Renamer - License Management
 * 
 * Handles license validation and trial period tracking.
 */

class LicenseManager {
  constructor() {
    this.trialDays = 7;
    this.trialKey = 'trial_info';
    this.licenseKey = 'license_info';
    this.apiEndpoint = 'https://your-verification-api.com/verify'; // Replace with your API endpoint
  }

  /**
   * Initialize the license manager and check trial status
   * @returns {Promise<{isValid: boolean, daysLeft: number, isPaid: boolean, isFirstDay: boolean, type?: string}>}
   */
  async init() {
    // First check if user has a paid license
    const license = await this.getLicenseInfo();
    if (license && license.isPaid) {
      if (license.type === 'lifetime') {
        return { 
          isValid: true, 
          daysLeft: 0, 
          isPaid: true, 
          isFirstDay: false,
          type: 'lifetime'
        };
      } else if (license.type === 'monthly' && license.validUntil > Date.now()) {
        return { 
          isValid: true, 
          daysLeft: 0, 
          isPaid: true, 
          isFirstDay: false,
          type: 'monthly'
        };
      }
    }

    // If no paid license or expired monthly license, check trial status
    const trial = await this.getTrialInfo();
    if (!trial) {
      // First time user, start trial
      await this.startTrial();
      return { isValid: true, daysLeft: this.trialDays, isPaid: false, isFirstDay: true };
    }

    // Calculate days left in trial
    const now = Date.now();
    const endDate = trial.startDate + (this.trialDays * 24 * 60 * 60 * 1000);
    const daysLeft = Math.max(0, Math.ceil((endDate - now) / (24 * 60 * 60 * 1000)));
    
    // Check if this is the first time we're checking today
    const today = new Date().toDateString();
    const isFirstCheckToday = !trial.lastCheckedDate || trial.lastCheckedDate !== today;
    
    // Update last checked date
    if (isFirstCheckToday) {
      const updatedTrial = { ...trial, lastCheckedDate: today };
      await new Promise((resolve) => {
        chrome.storage.sync.set({ [this.trialKey]: updatedTrial }, resolve);
      });
    }

    return {
      isValid: daysLeft > 0,
      daysLeft,
      isPaid: false,
      isFirstDay: trial.isFirstDay || false,
      isFirstCheckToday
    };
  }

  /**
   * Start the trial period for new users
   * @returns {Promise<void>}
   */
  async startTrial() {
    const now = new Date();
    const trialInfo = {
      startDate: now.getTime(),
      hasStarted: true,
      lastCheckedDate: now.toDateString(),
      isFirstDay: true
    };

    return new Promise((resolve) => {
      chrome.storage.sync.set({ [this.trialKey]: trialInfo }, resolve);
    });
  }

  /**
   * Get current trial information
   * @returns {Promise<{startDate: number, hasStarted: boolean, lastCheckedDate: string, isFirstDay: boolean}|null>}
   */
  async getTrialInfo() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(this.trialKey, (result) => {
        resolve(result[this.trialKey] || null);
      });
    });
  }

  /**
   * Get license information if available
   * @returns {Promise<{licenseKey: string, validUntil: number, isPaid: boolean}|null>}
   */
  async getLicenseInfo() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(this.licenseKey, (result) => {
        resolve(result[this.licenseKey] || null);
      });
    });
  }

  /**
   * Activate a license key
   * @param {string} userLicenseKey - License key from user
   * @returns {Promise<{success: boolean, message: string, validUntil?: number}>}
   */
  async activateLicense(userLicenseKey) {
    try {
      // Validate license key with your backend
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: userLicenseKey })
      });

      if (!response.ok) {
        throw new Error('License validation failed');
      }

      const data = await response.json();
      
      if (data.valid) {
        // Save valid license
        const licenseInfo = {
          licenseKey: userLicenseKey,
          validUntil: data.validUntil || Date.now() + (365 * 24 * 60 * 60 * 1000), // Default to 1 year
          isPaid: true,
          type: data.type || 'monthly', // 'monthly' or 'lifetime'
          activatedAt: Date.now()
        };
        
        await new Promise((resolve) => {
          chrome.storage.sync.set({ [this.licenseKey]: licenseInfo }, resolve);
        });
        
        return { 
          success: true, 
          message: 'License activated successfully!',
          validUntil: licenseInfo.validUntil,
          type: licenseInfo.type
        };
      } else {
        return { success: false, message: data.message || 'Invalid license key' };
      }
    } catch (error) {
      console.error('License activation error:', error);
      return { success: false, message: 'Failed to activate license. Please try again.' };
    }
  }
  
  /**
   * Reset the first day flag (to be called after showing the first day notification)
   */
  async resetFirstDayFlag() {
    const trial = await this.getTrialInfo();
    if (trial && trial.isFirstDay) {
      const updatedTrial = { ...trial, isFirstDay: false };
      await new Promise((resolve) => {
        chrome.storage.sync.set({ [this.trialKey]: updatedTrial }, resolve);
      });
    }
  }

  /**
   * Force a new trial period (useful for reinstalls)
   * @returns {Promise<void>}
   */
  async forceNewTrial() {
    console.log("Forcing new trial period");
    
    // Remove any existing trial or license info
    await new Promise((resolve) => {
      chrome.storage.sync.remove([this.trialKey, this.licenseKey], resolve);
    });
    
    // Start a fresh trial
    return this.startTrial();
  }

  /**
   * Handle successful payment
   * @param {string} type - 'monthly' or 'lifetime'
   * @returns {Promise<{success: boolean, message: string, licenseKey: string}>}
   */
  async handleSuccessfulPayment(type) {
    try {
      // Generate a license key
      const licenseKey = this.generateLicenseKey(type);
      
      const licenseInfo = {
        licenseKey: licenseKey,
        isPaid: true,
        type: type,
        activatedAt: Date.now(),
        validUntil: type === 'lifetime' ? null : Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days for monthly
      };
      
      await new Promise((resolve) => {
        chrome.storage.sync.set({ [this.licenseKey]: licenseInfo }, resolve);
      });
      
      return { 
        success: true, 
        message: type === 'lifetime' 
          ? 'Lifetime license activated successfully!' 
          : 'Monthly subscription activated successfully!',
        licenseKey: licenseKey
      };
    } catch (error) {
      console.error('Payment handling error:', error);
      return { success: false, message: 'Failed to process payment. Please contact support.' };
    }
  }

  /**
   * Generate a license key
   * @param {string} type - License type (monthly/lifetime)
   * @returns {string} Generated license key
   */
  generateLicenseKey(type) {
    // Generate a random 24-character alphanumeric string with dashes
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = type === 'lifetime' ? 'LT-' : 'MO-'; // Prefix based on type
    
    // Add timestamp-based section for uniqueness
    key += Date.now().toString(36).toUpperCase().substring(0, 4) + '-';
    
    // Add three groups of 4 random characters
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 4; j++) {
        key += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      if (i < 2) key += '-';
    }
    
    return key;
  }

  /**
   * Store a license key
   * @param {string} licenseKey - The license key
   * @param {string} type - The license type
   */
  async storeLicenseKey(licenseKey, type) {
    const licenseInfo = {
      licenseKey: licenseKey,
      isPaid: true,
      type: type,
      activatedAt: Date.now(),
      validUntil: type === 'lifetime' ? null : Date.now() + (30 * 24 * 60 * 60 * 1000)
    };
    
    await new Promise((resolve) => {
      chrome.storage.sync.set({ [this.licenseKey]: licenseInfo }, resolve);
    });
  }
}

// Export as global
window.licenseManager = new LicenseManager();
