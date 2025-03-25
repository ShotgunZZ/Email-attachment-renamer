const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const crypto = require('crypto');

/**
 * Generates a license key in the format XXXX-XXXX-XXXX-XXXX
 * @param {string} seed - Seed data for generating the license (email + timestamp)
 * @returns {string} Formatted license key
 */
function generateLicenseKey(seed) {
  // Create a hash from the seed
  const hash = crypto.createHash('sha256').update(seed).digest('hex');
  
  // Format it as XXXX-XXXX-XXXX-XXXX
  const segments = [];
  for (let i = 0; i < 4; i++) {
    segments.push(hash.substring(i * 4, i * 4 + 4).toUpperCase());
  }
  
  return segments.join('-');
}

exports.handler = async (event) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  
  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers
    };
  }
  
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }
  
  try {
    // Parse request body
    const body = JSON.parse(event.body);
    console.log('Request body:', body);
    
    // Check for session ID in various possible formats
    const checkoutSessionId = body.checkoutSessionId || body.checkout_session_id || body.session_id;
    
    if (!checkoutSessionId) {
      console.log('No checkout session ID provided. Request body:', body);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Checkout session ID is required',
          receivedBody: body
        })
      };
    }
    
    console.log('Using checkout session ID:', checkoutSessionId);
    
    // For testing purposes - if the session ID is "test_session", generate a test license
    if (checkoutSessionId === 'test_session') {
      console.log('Using test session - generating test license');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          licenseKey: 'TEST-ABCD-EFGH-1234',
          email: 'test@example.com'
        })
      };
    }
    
    // Retrieve the checkout session
    const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
    
    // Verify payment was successful
    if (session.payment_status !== 'paid') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Payment not completed' })
      };
    }
    
    // Get customer email from the session
    const customerEmail = session.customer_details.email;
    if (!customerEmail) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Customer email not found' })
      };
    }
    
    // Generate a license key using the customer email and session ID
    const seed = `${customerEmail}:${checkoutSessionId}:${Date.now()}`;
    const licenseKey = generateLicenseKey(seed);
    
    // Store the license key with the customer
    if (session.customer) {
      await stripe.customers.update(session.customer, {
        metadata: {
          license_key: licenseKey,
          license_created: Math.floor(Date.now() / 1000).toString()
        }
      });
    }
    
    // Return the license key
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        licenseKey,
        email: customerEmail
      })
    };
  } catch (error) {
    console.error('Error generating license:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to generate license key'
      })
    };
  }
}; 