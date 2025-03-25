const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const crypto = require('crypto');

// In a production environment, you'd store valid license keys in a database
// For this simplified example, we'll check if the license key has the correct format
// and was generated using our algorithm

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
    const { licenseKey } = JSON.parse(event.body);
    
    if (!licenseKey) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'License key is required' })
      };
    }
    
    // Validate license key format (XXXX-XXXX-XXXX-XXXX)
    const keyFormat = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    if (!keyFormat.test(licenseKey)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          valid: false,
          message: 'Invalid license key format'
        })
      };
    }
    
    // Retrieve customer by license key (using metadata)
    const customers = await stripe.customers.list({
      limit: 1,
      expand: ['data.subscriptions'],
      // This assumes you store the license key in customer metadata 
      // when generating it after purchase
      query: `metadata["license_key"]:"${licenseKey}"`
    });
    
    if (customers.data.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ valid: false, message: 'Invalid license key' })
      };
    }
    
    const customer = customers.data[0];
    
    // Return license information
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        valid: true,
        customer: {
          email: customer.email,
          name: customer.name,
          licenseCreated: customer.metadata.license_created || customer.created,
        }
      })
    };
  } catch (error) {
    console.error('License verification error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
}; 