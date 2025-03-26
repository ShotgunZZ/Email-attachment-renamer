// Elements
const trialContent = document.getElementById('trialContent');
const paidContent = document.getElementById('paidContent');
const upgradeBtn = document.getElementById('upgradeBtn');
const verifyBtn = document.getElementById('verifyBtn');

// Stripe payment link
const stripePaymentLink = 'https://buy.stripe.com/test_14k2bm5T864I9kQ145';

// Netlify function endpoint for payment verification
const verifyEndpoint = 'https://your-netlify-site.netlify.app/.netlify/functions/verify-payment';

// Check user status and update UI
function checkUserStatus() {
  chrome.storage.sync.get('userStatus', (data) => {
    if (data.userStatus === 'paid') {
      trialContent.classList.add('hidden');
      paidContent.classList.remove('hidden');
    } else {
      trialContent.classList.remove('hidden');
      paidContent.classList.add('hidden');
    }
  });
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
  
  // Call the Netlify function to verify payment
  fetch(`${verifyEndpoint}?email=${encodeURIComponent(email)}`)
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
}

// Event listeners
upgradeBtn.addEventListener('click', openPaymentLink);
verifyBtn.addEventListener('click', verifyPayment);

// Initialize
document.addEventListener('DOMContentLoaded', checkUserStatus); 