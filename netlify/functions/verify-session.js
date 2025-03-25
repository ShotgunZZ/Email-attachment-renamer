const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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
    
    const { sessionId, purchaseType } = JSON.parse(event.body);
    
    if (!sessionId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Session ID is required' })
      };
    }
    
    console.log(`Verifying session: ${sessionId}`);
    
    // Retrieve the session to get the customer
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (session.payment_status !== 'paid') {
      console.log(`Session ${sessionId} is not paid: ${session.payment_status}`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ verified: false, message: 'Payment not completed' })
      };
    }
    
    const customerId = session.customer;
    console.log(`Payment verified for customer: ${customerId}`);
    
    // Determine the plan type (subscription or one-time payment)
    let plan = purchaseType || 'lifetime';
    
    if (session.mode === 'subscription') {
      plan = 'monthly';
      console.log(`Customer has a subscription (monthly plan)`);
    }
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        verified: true,
        customerId: customerId,
        plan: plan
      })
    };
    
  } catch (error) {
    console.error('Error verifying session:', error);
    return { 
      statusCode: 500, 
      headers,
      body: JSON.stringify({ error: 'Failed to verify session' })
    };
  }
}; 