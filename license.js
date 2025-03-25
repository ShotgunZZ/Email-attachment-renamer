/**
 * License Management for Gmail Attachment Renamer
 * Handles license verification
 */
class LicenseManager {
  constructor() {
    this.storageKey = 'license_data';
    // This will be replaced with your actual Netlify URL
    this.apiEndpoint = '/api/verify-license';
  }

  /**
   * Initialize the license manager
   * Check existing license or set up trial
   */
  async init() {
    const licenseData = await this.getLicenseData();
    if (!licenseData.installDate) {
      // First installation - set up trial
      await this.setLicenseData({
        installDate: Date.now(),
        licenseKey: null,
        licenseStatus: 'trial'
      });
    } else if (licenseData.licenseKey) {
      // Verify existing license with server
      try {
        const result = await this.verifyLicenseWithServer(licenseData.licenseKey);
        if (result.valid) {
          // Update local data to reflect server validation
          licenseData.licenseStatus = 'active';
          licenseData.customerInfo = result.customer;
          await this.setLicenseData(licenseData);
        } else if (licenseData.licenseStatus === 'active') {
          // License was previously active but now invalid
          licenseData.licenseStatus = 'invalid';
          await this.setLicenseData(licenseData);
        }
      } catch (error) {
        console.error("Error verifying license:", error);
        // Keep the existing status if we can't verify with the server
      }
    }
    
    return this.checkLicenseStatus();
  }

  /**
   * Get license data from Chrome storage
   */
  async getLicenseData() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(this.storageKey, (data) => {
        resolve(data[this.storageKey] || {});
      });
    });
  }

  /**
   * Save license data to Chrome storage
   */
  async setLicenseData(data) {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [this.storageKey]: data }, resolve);
    });
  }

  /**
   * Check current license status
   */
  async checkLicenseStatus() {
    const licenseData = await this.getLicenseData();

    if (licenseData.licenseStatus === 'active') {
      return { 
        status: 'active', 
        message: 'Licensed', 
        customerInfo: licenseData.customerInfo 
      };
    }

    if (licenseData.licenseStatus === 'invalid') {
      return { status: 'invalid', message: 'License invalid' };
    }

    // If no license or it's in trial mode, return trial status without expiration
    return { 
      status: 'trial', 
      message: 'Trial mode - limited to 10 downloads'
    };
  }

  /**
   * Verify license key with server
   */
  async verifyLicenseWithServer(licenseKey) {
    try {
      // Get the appropriate base URL depending on environment
      const baseUrl = this.getApiBaseUrl();
      const response = await fetch(`${baseUrl}${this.apiEndpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ licenseKey })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'License verification failed');
      }
      
      return await response.json();
    } catch (error) {
      console.error("Server verification error:", error);
      throw error;
    }
  }

  /**
   * Activate a license key
   */
  async activateLicense(licenseKey) {
    try {
      // Verify with server
      const result = await this.verifyLicenseWithServer(licenseKey);
      
      if (result.valid) {
        // Update local storage with license data
        await this.setLicenseData({
          licenseKey: licenseKey,
          activationDate: Date.now(),
          licenseStatus: 'active',
          customerInfo: result.customer
        });
        return { success: true, message: 'License activated successfully' };
      } else {
        return { success: false, message: result.message || 'Invalid license key' };
      }
    } catch (error) {
      console.error("Error activating license:", error);
      return { success: false, message: 'Error verifying license with server' };
    }
  }

  /**
   * Get the base URL for API calls
   * In production this will be your Netlify domain
   */
  getApiBaseUrl() {
    // In production, return your Netlify URL
    // For development/testing you can use a local server
    if (window.location.hostname === 'localhost') {
      return 'http://localhost:8888';
    }

    // This should match your Netlify site that processes Stripe payments
    return 'https://kaleidoscopic-sopapillas-6a41bb.netlify.app';
  }

  /**
   * Reset trial download counter (for development/testing only)
   */
  async resetTrialDownloads() {
    // Clear the trial downloads counter from localStorage
    localStorage.removeItem('trialDownloads');
    return { success: true, message: 'Trial downloads counter reset' };
  }
}

// Create global instance
window.licenseManager = new LicenseManager();
