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
    
    if (!email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Email is required' })
      };
    }
    
    // Find the customer by email
    const customers = await stripe.customers.list({ email });
    
    // Verify if any customer with this email has a successful payment
    let paid = false;
    
    if (customers.data.length > 0) {
      // Get payment intents for this customer
      const paymentIntents = await stripe.paymentIntents.list({
        customer: customers.data[0].id,
        limit: 5
      });
      
      // Check if any payment was successful
      paid = paymentIntents.data.some(pi => pi.status === 'succeeded');
    }
    
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