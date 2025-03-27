// Function to serve the payment link
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
    // For debugging - check if environment variable exists
    const hasEnvVar = !!process.env.STRIPE_PAYMENT_LINK;
    
    // Configure payment link - easily change this value later without updating extension
    const paymentLink = process.env.STRIPE_PAYMENT_LINK || 'https://buy.stripe.com/test_14k2bm5T864I9kQ145';
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        paymentLink,
        debug: {
          envVarExists: hasEnvVar,
          fallbackUsed: !hasEnvVar,
          envVarNames: Object.keys(process.env).filter(key => key.includes('STRIPE'))
        }
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
}; 