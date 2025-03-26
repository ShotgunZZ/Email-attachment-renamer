// Elements
const trialContent = document.getElementById('trialContent');
const paidContent = document.getElementById('paidContent');
const upgradeBtn = document.getElementById('upgradeBtn');
const verifyBtn = document.getElementById('verifyBtn');
const trialCount = document.getElementById('trialCount');

// Stripe payment link
const stripePaymentLink = 'https://buy.stripe.com/test_14k2bm5T864I9kQ145';

// Netlify function endpoint for payment verification
const verifyEndpoint = 'https://steady-manatee-6a2fdc.netlify.app/.netlify/functions/verify-payment';

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

// Open Stripe payment link
function openPaymentLink() {
  chrome.tabs.create({ url: stripePaymentLink });
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
    fetch(`${verifyEndpoint}?email=${encodeURIComponent(email)}&machineId=${encodeURIComponent(machineId)}`)
      .then(response => response.json())
      .then(data => {
        if (data.paid) {
          chrome.storage.sync.set({ userStatus: 'paid' }, () => {
            checkUserStatus();
            alert('Payment verified! You now have premium access.');
          });
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
document.addEventListener('DOMContentLoaded', checkUserStatus); 