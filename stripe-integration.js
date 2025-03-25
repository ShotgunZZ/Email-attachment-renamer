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
}

// Initialize the global stripe manager
window.stripeManager = new StripeManager(); 