// Serverless function to verify payment
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async function(event, context) {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  
  // Handle OPTIONS request (preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'OK' })
    };
  }
  
  try {
    // Get email from query parameters
    const email = event.queryStringParameters.email;
    const machineId = event.queryStringParameters.machineId || '';
    
    if (!email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Email is required' })
      };
    }
    
    // Find the customer by email in Stripe
    const customers = await stripe.customers.list({ email });
    
    // Check if customer exists
    const customerExists = customers.data.length > 0;
    
    // Set paid status
    const paid = customerExists;
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ paid })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
}; 