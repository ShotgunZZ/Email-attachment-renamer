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
   * @returns {Promise<{isValid: boolean, daysLeft: number, isPaid: boolean}>}
   */
  async init() {
    // First check if user has a paid license
    const license = await this.getLicenseInfo();
    if (license && license.isPaid && license.validUntil > Date.now()) {
      return { isValid: true, daysLeft: 0, isPaid: true };
    }

    // If no paid license, check trial status
    const trial = await this.getTrialInfo();
    if (!trial) {
      // First time user, start trial
      await this.startTrial();
      return { isValid: true, daysLeft: this.trialDays, isPaid: false };
    }

    // Calculate days left in trial
    const now = Date.now();
    const endDate = trial.startDate + (this.trialDays * 24 * 60 * 60 * 1000);
    const daysLeft = Math.max(0, Math.ceil((endDate - now) / (24 * 60 * 60 * 1000)));

    return {
      isValid: daysLeft > 0,
      daysLeft,
      isPaid: false
    };
  }

  /**
   * Start the trial period for new users
   * @returns {Promise<void>}
   */
  async startTrial() {
    const trialInfo = {
      startDate: Date.now(),
      hasStarted: true
    };

    return new Promise((resolve) => {
      chrome.storage.sync.set({ [this.trialKey]: trialInfo }, resolve);
    });
  }

  /**
   * Get current trial information
   * @returns {Promise<{startDate: number, hasStarted: boolean}|null>}
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
          type: data.type || 'monthly' // 'monthly' or 'lifetime'
        };
        
        await new Promise((resolve) => {
          chrome.storage.sync.set({ [this.licenseKey]: licenseInfo }, resolve);
        });
        
        return { 
          success: true, 
          message: 'License activated successfully!',
          validUntil: licenseInfo.validUntil
        };
      } else {
        return { success: false, message: data.message || 'Invalid license key' };
      }
    } catch (error) {
      console.error('License activation error:', error);
      return { success: false, message: 'Failed to activate license. Please try again.' };
    }
  }
}

// Export as global
window.licenseManager = new LicenseManager();
