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
    
    const { priceId, mode, successUrl, cancelUrl } = JSON.parse(event.body);
    
    if (!priceId || !mode) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Price ID and mode are required' })
      };
    }
    
    console.log(`Creating checkout session for ${mode} with price ID: ${priceId}`);
    console.log(`Success URL: ${successUrl || 'not provided'}`);
    console.log(`Cancel URL: ${cancelUrl || 'not provided'}`);
    
    // Get the actual price ID from Stripe based on our product ID
    const prices = await stripe.prices.list({
      product: priceId,
      limit: 1,
      active: true
    });
    
    if (prices.data.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Price not found for the given product' })
      };
    }
    
    const priceObject = prices.data[0];
    console.log(`Found price: ${priceObject.id} for ${priceObject.unit_amount/100} ${priceObject.currency}`);
    
    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceObject.id,
          quantity: 1,
        },
      ],
      mode: mode,
      // The session_id parameter needs to be passed as is, Stripe will replace it
      success_url: successUrl || `${process.env.URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.URL}/?canceled=true`,
    });
    
    console.log(`Created checkout session: ${session.id}`);
    console.log(`Final success URL: ${session.success_url}`);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ id: session.id })
    };
    
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return { 
      statusCode: 500, 
      headers,
      body: JSON.stringify({ error: 'Failed to create checkout session' })
    };
  }
}; 