// Elements
const trialContent = document.getElementById('trialContent');
const paidContent = document.getElementById('paidContent');
const upgradeBtn = document.getElementById('upgradeBtn');
const verifyBtn = document.getElementById('verifyBtn');
const trialCount = document.getElementById('trialCount');

// API endpoints
const API_BASE_URL = 'https://steady-manatee-6a2fdc.netlify.app/.netlify/functions';
const PAYMENT_VERIFY_ENDPOINT = `${API_BASE_URL}/verify-payment`;
const PAYMENT_LINK_ENDPOINT = `${API_BASE_URL}/get-payment-link`;

// Payment link will be fetched dynamically
let STRIPE_PAYMENT_LINK = '';

// Check user status and update UI
function checkUserStatus() {
  chrome.storage.sync.get(['userStatus', 'trialUsage'], (data) => {
    if (data.userStatus === 'paid') {
      trialContent.classList.add('hidden');
      paidContent.classList.remove('hidden');
    } else {
      trialContent.classList.remove('hidden');
      paidContent.classList.add('hidden');
      
      // Update trial usage count
      updateTrialCount(data.trialUsage);
    }
  });
}

// Update trial count display
function updateTrialCount(trialUsage) {
  const today = new Date().toDateString();
  const todayUsage = trialUsage && trialUsage[today] ? trialUsage[today] : 0;
  
  if (trialCount) {
    trialCount.textContent = todayUsage;
  }
}

// Function to fetch payment link from backend
function fetchPaymentLink() {
  return fetch(PAYMENT_LINK_ENDPOINT)
    .then(response => response.json())
    .then(data => {
      STRIPE_PAYMENT_LINK = data.paymentLink;
      return STRIPE_PAYMENT_LINK;
    })
    .catch(error => {
      console.error('Error fetching payment link:', error);
      // Fallback to default test link if there's an error
      return 'https://buy.stripe.com/test_14k2bm5T864I9kQ145';
    });
}

// Open Stripe payment link
function openPaymentLink() {
  // If we already have the link, use it immediately
  if (STRIPE_PAYMENT_LINK) {
    chrome.tabs.create({ url: STRIPE_PAYMENT_LINK });
    return;
  }

  // Otherwise, fetch it first
  fetchPaymentLink().then(link => {
    chrome.tabs.create({ url: link });
  });
}

// Verify payment with Netlify function
function verifyPayment() {
  // For a simple implementation, we'll prompt for email
  const email = prompt('Please enter the email used for payment:');
  
  if (!email) return;
  
  // Get the machineId for verification
  chrome.storage.sync.get('machineId', (data) => {
    const machineId = data.machineId || '';
    
    // Call the Netlify function to verify payment
    fetch(`${PAYMENT_VERIFY_ENDPOINT}?email=${encodeURIComponent(email)}&machineId=${encodeURIComponent(machineId)}`)
      .then(response => {
        // First check if the response is ok (status in the 200-299 range)
        if (!response.ok) {
          // Will be handled in the next then() block
          return response.json();
        }
        return response.json();
      })
      .then(data => {
        if (data.paid) {
          chrome.storage.sync.set({ 
            userStatus: 'paid',
            email: email,
            isPaid: true
          }, () => {
            checkUserStatus();
            alert('Payment verified! You now have premium access.');
          });
        } else if (data.error) {
          // Show the specific error message from the server
          alert(`Verification failed: ${data.error}`);
        } else {
          alert('Payment verification failed. Please try again later.');
        }
      })
      .catch(error => {
        alert('Error verifying payment. Please try again later.');
      });
  });
}

// Event listeners
upgradeBtn.addEventListener('click', openPaymentLink);
verifyBtn.addEventListener('click', verifyPayment);

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  checkUserStatus();
  fetchPaymentLink(); // Preload the payment link
});

// Listen for machine deactivation message
chrome.runtime.onMessage.addListener(function(message) {
  if (message.action === 'machine_deactivated') {
    document.getElementById('status').innerText = 'This machine has been deactivated because another machine is now active.';
    document.getElementById('status').style.color = 'red';
    // Update UI to show not paid state
    checkUserStatus();
  }
});

// Function to update UI based on paid status
function updateUI(isPaid) {
  if (isPaid) {
    trialContent.classList.add('hidden');
    paidContent.classList.remove('hidden');
  } else {
    trialContent.classList.remove('hidden');
    paidContent.classList.add('hidden');
    
    // Update trial count if needed
    chrome.storage.sync.get('trialUsage', (data) => {
      updateTrialCount(data.trialUsage);
    });
  }
} 