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
    // Get email and machineId from query parameters
    const email = event.queryStringParameters.email;
    const machineId = event.queryStringParameters.machineId || '';
    
    if (!email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Email is required' })
      };
    }
    
    // Check if this machineId is already in our paid users in Supabase
    if (machineId) {
      const { data, error } = await supabase
        .from('paid_users')
        .select('machine_id')
        .eq('machine_id', machineId)
        .limit(1);
      
      if (!error && data && data.length > 0) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ paid: true })
        };
      }
    }
    
    // Check if email already exists in our database
    const { data: existingUser, error: emailCheckError } = await supabase
      .from('paid_users')
      .select('id')
      .eq('email', email)
      .limit(1);
    
    // If email exists in database, user is already paid
    if (!emailCheckError && existingUser && existingUser.length > 0) {
      // If we have a machineId, update the existing record
      if (machineId) {
        await supabase
          .from('paid_users')
          .update({ machine_id: machineId })
          .eq('id', existingUser[0].id);
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ paid: true })
      };
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
      
      // Only mark as paid if we actually found successful payments
      if (paid && paymentIntents.data.length > 0) {
        // If paid and machineId provided, insert new record in Supabase
        if (machineId) {
          await supabase
            .from('paid_users')
            .insert({ 
              machine_id: machineId,
              email: email
            });
        }
      } else {
        paid = false; // Explicitly set to false if no successful payments found
      }
    } else {
      // No customers found with this email
      paid = false;
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