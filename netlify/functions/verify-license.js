const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const crypto = require('crypto');

// In a production environment, you'd store valid license keys in a database
// For this simplified example, we'll check if the license key has the correct format
// and was generated using our algorithm

exports.handler = async function(event, context) {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: ''
    };
  }

  // Only accept POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse the request body
    const requestBody = JSON.parse(event.body || '{}');
    console.log('Request body:', requestBody);

    // Get the license key from the request
    const { licenseKey } = requestBody;

    // Log the license key for debugging
    console.log('License key to verify:', licenseKey);

    // Check if the license key exists
    if (!licenseKey) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ valid: false, message: 'License key is required' })
      };
    }

    // Support for test license key
    if (licenseKey === 'TEST-ABCD-EFGH-1234') {
      console.log('Test license key detected, returning success');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          valid: true,
          message: 'License verified successfully (test mode)',
          customer: {
            email: 'test@example.com',
            name: 'Test User'
          }
        })
      };
    }

    // Validate license key format (XXXX-XXXX-XXXX-XXXX)
    const licenseKeyRegex = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    if (!licenseKeyRegex.test(licenseKey)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ valid: false, message: 'Invalid license key format' })
      };
    }

    // Initialize Stripe
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('STRIPE_SECRET_KEY environment variable is not set');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          valid: false, 
          error: 'Server configuration error',
          message: 'Server is not properly configured for license verification'
        })
      };
    }

    console.log('Querying Stripe for license key:', licenseKey);
    
    try {
      // Query Stripe for the customer with this license key in metadata
      const customers = await stripe.customers.list({
        limit: 1,
        metadata: { licenseKey: licenseKey }
      });

      // Check if any customers were found
      if (customers.data.length === 0) {
        console.log('No customer found with this license key');
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ valid: false, message: 'License key not found' })
        };
      }

      // Get the customer
      const customer = customers.data[0];
      console.log('Customer found:', customer.email);

      // Return success with customer info
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          valid: true,
          message: 'License verified successfully',
          customer: {
            email: customer.email,
            name: customer.name
          }
        })
      };
    } catch (stripeError) {
      console.error('Stripe API error:', stripeError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          valid: false, 
          error: 'Error querying license database',
          message: stripeError.message || 'Failed to verify license with payment provider'
        })
      };
    }
  } catch (error) {
    console.error('General error in verify-license function:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        valid: false, 
        error: 'Internal server error',
        message: error.message || 'An unexpected error occurred during license verification'
      })
    };
  }
}; 