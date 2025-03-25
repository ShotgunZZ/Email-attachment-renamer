const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * Netlify function to verify purchase status with Stripe
 * Accepts customer ID or email address to verify
 */
exports.handler = async (event) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    if (event.httpMethod !== 'POST') {
      return { 
        statusCode: 405, 
        headers,
        body: JSON.stringify({ error: 'Method Not Allowed' })
      };
    }
    
    const requestBody = JSON.parse(event.body);
    const { customerId, email } = requestBody;
    
    console.log('Verify purchase request:', JSON.stringify(requestBody));
    
    // Verify customer using either ID or email
    if (!customerId && !email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          verified: false, 
          message: 'Customer ID or email required' 
        })
      };
    }
    
    try {
      // If customer ID is provided, verify that customer
      if (customerId && customerId !== 'unknown') {
        console.log(`Verifying customer by ID: ${customerId}`);
        
        // Retrieve the customer
        const customer = await stripe.customers.retrieve(customerId);
        
        if (!customer || customer.deleted) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              verified: false,
              message: 'Customer not found or has been deleted'
            })
          };
        }
        
        // Look for subscriptions or one-time purchases
        return await checkCustomerPurchases(customer, headers);
      }
      
      // If email is provided, search for customer by email
      if (email) {
        console.log(`Searching for customer by email: ${email}`);
        
        const customers = await stripe.customers.list({
          email: email,
          limit: 1
        });
        
        if (customers.data.length === 0) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              verified: false,
              message: 'No customer found with that email'
            })
          };
        }
        
        const customer = customers.data[0];
        console.log(`Found customer: ${customer.id}`);
        
        // Look for subscriptions or one-time purchases
        return await checkCustomerPurchases(customer, headers);
      }
    } catch (stripeError) {
      console.error('Stripe API error:', stripeError);
      return {
        statusCode: 200, // Return 200 to avoid breaking the frontend
        headers,
        body: JSON.stringify({ 
          verified: false, 
          message: `Stripe error: ${stripeError.message}` 
        })
      };
    }
    
  } catch (error) {
    console.error('Error verifying purchase:', error);
    return { 
      statusCode: 500, 
      headers,
      body: JSON.stringify({ 
        verified: false,
        message: 'Failed to verify purchase',
        error: error.message 
      })
    };
  }
};

/**
 * Check a customer's purchases in Stripe
 * @param {Object} customer - Stripe customer object
 * @param {Object} headers - Response headers
 * @returns {Object} - Response object
 */
async function checkCustomerPurchases(customer, headers) {
  try {
    // Check for active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'active',
      limit: 1
    });
    
    if (subscriptions.data.length > 0) {
      console.log(`Customer ${customer.id} has active subscription`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          verified: true,
          customerId: customer.id,
          email: customer.email,
          plan: 'monthly'
        })
      };
    }
    
    // No active subscription, check for one-time payments
    // Look at the last 30 days of payments (most likely timeframe)
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
    
    const charges = await stripe.charges.list({
      customer: customer.id,
      created: { gte: thirtyDaysAgo },
      limit: 10
    });
    
    // Check for successful one-time payments
    const successfulPayments = charges.data.filter(charge => 
      charge.paid && 
      !charge.refunded &&
      charge.metadata && 
      charge.metadata.plan === 'lifetime'
    );
    
    if (successfulPayments.length > 0) {
      console.log(`Customer ${customer.id} has lifetime purchase`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          verified: true,
          customerId: customer.id,
          email: customer.email,
          plan: 'lifetime'
        })
      };
    }
    
    // No active subscription or one-time payment found
    console.log(`No valid purchases found for customer ${customer.id}`);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        verified: false,
        message: 'No active subscription or lifetime purchase found'
      })
    };
  } catch (error) {
    console.error('Error checking customer purchases:', error);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        verified: false,
        message: `Error checking purchase history: ${error.message}`
      })
    };
  }
} 