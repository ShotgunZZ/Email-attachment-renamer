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
    // Get email from query parameters
    const email = event.queryStringParameters.email;
    const machineId = event.queryStringParameters.machineId || '';
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Valid email is required' })
      };
    }
    
    // 1. Check in Supabase first
    const { data: user, error } = await supabase
      .from('paid_users')
      .select('*')
      .eq('email', email)
      .single();
    
    // 1.1 If found in Supabase
    if (user && !error) {
      // Check if machine ID matches
      if (user.machine_id === machineId) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ paid: true })
        };
      } else {
        // Machine ID doesn't match
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            error: 'Not verified as you have a different machine ID attached to this email. If you need help, please email szhang1@me.com' 
          })
        };
      }
    }
    
    // 1.2 If not found in Supabase, check Stripe
    const customers = await stripe.customers.list({ email });
    const customerExists = customers.data.length > 0;
    
    if (customerExists) {
      // Register the user in Supabase
      await supabase.from('paid_users').insert([
        { email, machine_id: machineId }
      ]);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ paid: true })
      };
    } else {
      // Not found in Stripe either
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ paid: false })
      };
    }
    
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
}; 