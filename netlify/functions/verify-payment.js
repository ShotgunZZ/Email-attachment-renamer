// Serverless function to verify payment
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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
    // Get email and userId from query parameters
    const email = event.queryStringParameters.email;
    const userId = event.queryStringParameters.userId || '';
    
    if (!email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Email is required' })
      };
    }
    
    // Check if this userId is already in our paid users in Supabase
    if (userId) {
      const { data, error } = await supabase
        .from('paid_users')
        .select('user_id')
        .eq('user_id', userId)
        .limit(1);
      
      if (!error && data && data.length > 0) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ paid: true })
        };
      }
    }
    
    // Find the customer by email in Stripe
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
      
      // If paid and userId provided, store in Supabase
      if (paid && userId) {
        const { error } = await supabase
          .from('paid_users')
          .upsert({ 
            user_id: userId,
            email: email
          });
        
        if (error) console.error('Error storing in Supabase:', error);
      }
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