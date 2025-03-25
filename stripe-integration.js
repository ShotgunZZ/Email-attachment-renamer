/**
 * Gmail Attachment Renamer - Stripe Integration
 * 
 * Handles Stripe purchase verification and premium feature access.
 */

class StripeManager {
  constructor() {
    this.storageKey = 'stripe_customer_info';
    this.publishableKey = 'pk_test_your_publishable_key'; // This will be set from the page
    // Default to trial mode until verified
    this.premiumStatus = {
      isValid: true,
      daysLeft: 7,
      isPaid: false,
      plan: 'trial'
    };
  }

  /**
   * Initialize the Stripe manager and check subscription status
   * @returns {Promise<Object>} Current premium status
   */
  async init() {
    try {
      // First check if user has stored customer info
      const customerInfo = await this.getCustomerInfo();
      
      if (customerInfo && customerInfo.customerId) {
        // In a real implementation, you would verify with Stripe API
        // For now, we'll just use the stored info
        if (customerInfo.plan === 'lifetime') {
          this.premiumStatus = {
            isValid: true,
            daysLeft: 0,
            isPaid: true,
            plan: 'lifetime'
          };
        } else if (customerInfo.plan === 'monthly' && customerInfo.validUntil > Date.now()) {
          const daysLeft = Math.ceil((customerInfo.validUntil - Date.now()) / (1000 * 60 * 60 * 24));
          this.premiumStatus = {
            isValid: true,
            daysLeft: daysLeft,
            isPaid: true,
            plan: 'monthly'
          };
        } else {
          // Expired monthly subscription
          await this.checkTrialStatus();
        }
      } else {
        // No customer info, check trial
        await this.checkTrialStatus();
      }
      
      return this.premiumStatus;
    } catch (error) {
      console.error('Error initializing Stripe manager:', error);
      return this.premiumStatus;
    }
  }

  /**
   * Check trial status if no valid paid subscription
   */
  async checkTrialStatus() {
    return new Promise((resolve) => {
      // Get trial info from storage
      chrome.storage.sync.get('trial_info', (result) => {
        const trialInfo = result.trial_info;
        
        if (trialInfo && trialInfo.startDate) {
          const now = Date.now();
          const trialDurationMs = 7 * 24 * 60 * 60 * 1000; // 7 days
          const trialEndDate = trialInfo.startDate + trialDurationMs;
          
          if (now < trialEndDate) {
            // Trial still valid
            const daysLeft = Math.ceil((trialEndDate - now) / (1000 * 60 * 60 * 24));
            this.premiumStatus = {
              isValid: true,
              daysLeft: daysLeft,
              isPaid: false,
              plan: 'trial'
            };
          } else {
            // Trial expired
            this.premiumStatus = {
              isValid: false,
              daysLeft: 0,
              isPaid: false,
              plan: 'expired'
            };
          }
        } else {
          // No trial info, start new trial
          const newTrialInfo = {
            startDate: Date.now()
          };
          
          chrome.storage.sync.set({ trial_info: newTrialInfo }, () => {
            this.premiumStatus = {
              isValid: true,
              daysLeft: 7,
              isPaid: false,
              plan: 'trial'
            };
            resolve(this.premiumStatus);
          });
          return;
        }
        
        resolve(this.premiumStatus);
      });
    });
  }

  /**
   * Get customer information if available
   * @returns {Promise<Object|null>} Customer information
   */
  async getCustomerInfo() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(this.storageKey, (result) => {
        resolve(result[this.storageKey] || null);
      });
    });
  }

  /**
   * Store customer information from Stripe
   * @param {string} customerId - Stripe customer ID
   * @param {string} plan - Subscription plan (monthly/lifetime)
   */
  async storeCustomerInfo(customerId, plan) {
    return new Promise((resolve) => {
      const validUntil = plan === 'lifetime' 
        ? Date.now() + (100 * 365 * 24 * 60 * 60 * 1000) // 100 years for lifetime
        : Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days for monthly
      
      const customerInfo = {
        customerId: customerId,
        plan: plan,
        purchaseDate: Date.now(),
        validUntil: validUntil
      };
      
      chrome.storage.sync.set({ [this.storageKey]: customerInfo }, () => {
        this.premiumStatus = {
          isValid: true,
          daysLeft: plan === 'lifetime' ? 0 : 30,
          isPaid: true,
          plan: plan
        };
        resolve({
          success: true,
          message: plan === 'lifetime' 
            ? 'Lifetime purchase activated successfully!'
            : 'Monthly subscription activated successfully!'
        });
      });
    });
  }

  /**
   * Force start a new trial
   */
  async forceNewTrial() {
    return new Promise((resolve) => {
      // Remove any existing trial or customer info
      chrome.storage.sync.remove([this.storageKey, 'trial_info'], () => {
        const newTrialInfo = {
          startDate: Date.now()
        };
        
        chrome.storage.sync.set({ trial_info: newTrialInfo }, () => {
          this.premiumStatus = {
            isValid: true,
            daysLeft: 7,
            isPaid: false,
            plan: 'trial'
          };
          resolve(this.premiumStatus);
        });
      });
    });
  }

  /**
   * Update trial or subscription with additional days or upgrade to lifetime
   * @param {string} customerId - Stripe customer ID
   * @param {string} plan - Plan type ('monthly' or 'lifetime')
   * @returns {Promise<Object>} Updated premium status
   */
  async updatePremiumStatus(customerId, plan) {
    try {
      // First get current status
      const currentCustomerInfo = await this.getCustomerInfo();
      const trialInfo = await this.getTrialInfo();
      
      // If upgrading to lifetime, simply set lifetime status
      if (plan === 'lifetime') {
        return this.storeCustomerInfo(customerId, 'lifetime');
      }
      
      // For monthly subscription
      if (plan === 'monthly') {
        // If already a paid customer, extend the valid until date
        if (currentCustomerInfo && currentCustomerInfo.validUntil) {
          const newValidUntil = Math.max(
            currentCustomerInfo.validUntil,
            Date.now()
          ) + (30 * 24 * 60 * 60 * 1000); // Add 30 days
          
          const updatedInfo = {
            ...currentCustomerInfo,
            customerId: customerId,
            plan: 'monthly',
            validUntil: newValidUntil
          };
          
          return new Promise((resolve) => {
            chrome.storage.sync.set({ [this.storageKey]: updatedInfo }, () => {
              const daysLeft = Math.ceil((newValidUntil - Date.now()) / (1000 * 60 * 60 * 24));
              this.premiumStatus = {
                isValid: true,
                daysLeft: daysLeft,
                isPaid: true,
                plan: 'monthly'
              };
              resolve({
                success: true,
                message: 'Monthly subscription extended successfully!'
              });
            });
          });
        } 
        // If in trial or expired, convert to paid with trial days added if any
        else if (trialInfo && trialInfo.startDate) {
          const now = Date.now();
          const trialEndDate = trialInfo.startDate + (7 * 24 * 60 * 60 * 1000);
          
          // Calculate remaining trial days if trial is still valid
          let additionalMs = 0;
          if (now < trialEndDate) {
            additionalMs = trialEndDate - now;
          }
          
          // New valid until = now + 30 days + remaining trial days
          const newValidUntil = now + (30 * 24 * 60 * 60 * 1000) + additionalMs;
          
          const customerInfo = {
            customerId: customerId,
            plan: 'monthly',
            purchaseDate: now,
            validUntil: newValidUntil
          };
          
          return new Promise((resolve) => {
            chrome.storage.sync.set({ [this.storageKey]: customerInfo }, () => {
              const daysLeft = Math.ceil((newValidUntil - now) / (1000 * 60 * 60 * 1000 * 24));
              this.premiumStatus = {
                isValid: true,
                daysLeft: daysLeft,
                isPaid: true,
                plan: 'monthly'
              };
              resolve({
                success: true,
                message: 'Monthly subscription activated with trial days added!'
              });
            });
          });
        } 
        // No previous info, just start a new monthly subscription
        else {
          return this.storeCustomerInfo(customerId, 'monthly');
        }
      }
    } catch (error) {
      console.error('Error updating premium status:', error);
      return {
        success: false,
        message: 'Failed to update premium status'
      };
    }
  }
  
  /**
   * Get trial information
   * @returns {Promise<Object|null>} Trial information
   */
  async getTrialInfo() {
    return new Promise((resolve) => {
      chrome.storage.sync.get('trial_info', (result) => {
        resolve(result.trial_info || null);
      });
    });
  }
}

// Initialize the global stripe manager
window.stripeManager = new StripeManager(); 