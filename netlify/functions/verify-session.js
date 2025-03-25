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
    
    const requestBody = JSON.parse(event.body);
    const { sessionId, purchaseType } = requestBody;
    
    console.log('Request body:', JSON.stringify(requestBody));
    
    if (!sessionId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          verified: false, 
          message: 'Session ID is required' 
        })
      };
    }
    
    // If sessionId contains the placeholder, it wasn't replaced
    if (sessionId === '{CHECKOUT_SESSION_ID}') {
      console.log('Session ID contains placeholder, not replaced by Stripe');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          verified: false, 
          message: 'Invalid session ID: placeholder was not replaced' 
        })
      };
    }
    
    console.log(`Verifying session: ${sessionId}`);
    
    try {
      // Retrieve the session to get the customer
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      console.log('Session retrieved:', JSON.stringify(session, null, 2));
      
      if (session.payment_status !== 'paid') {
        console.log(`Session ${sessionId} is not paid: ${session.payment_status}`);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            verified: false, 
            message: `Payment not completed. Status: ${session.payment_status}` 
          })
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
      
      // Initialize customerEmail variable
      let customerEmail = '';
      
      // Only try to retrieve customer details if we have a valid customerId
      if (customerId) {
        try {
          // Get customer details to retrieve email
          const customer = await stripe.customers.retrieve(customerId);
          customerEmail = customer.email;
          console.log(`Customer email: ${customerEmail}`);
        } catch (customerError) {
          console.error('Error retrieving customer details:', customerError);
          // Continue with the process even if we can't get the email
        }
      } else {
        console.log('No customer ID available in session');
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          verified: true,
          customerId: customerId || '',
          plan: plan,
          email: customerEmail
        })
      };
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
    console.error('Error verifying session:', error);
    return { 
      statusCode: 500, 
      headers,
      body: JSON.stringify({ 
        verified: false,
        message: 'Failed to verify session',
        error: error.message 
      })
    };
  }
}; 