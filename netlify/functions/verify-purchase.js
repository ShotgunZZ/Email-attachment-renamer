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
    
    const { email } = JSON.parse(event.body);
    
    if (!email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Email is required' })
      };
    }
    
    console.log(`Verifying purchase for email: ${email}`);
    
    // Search for customers by email
    const customers = await stripe.customers.list({ email: email });
    
    if (customers.data.length > 0) {
      // Customer exists, check payments
      const customer = customers.data[0];
      console.log(`Found customer with ID: ${customer.id}`);
      
      // Check payment intents
      const payments = await stripe.paymentIntents.list({
        customer: customer.id,
        limit: 10
      });
      
      const successfulPayment = payments.data.find(payment => 
        payment.status === 'succeeded'
      );
      
      if (successfulPayment) {
        console.log(`Found successful payment: ${successfulPayment.id}`);
        
        // Find associated subscription or plan
        let plan = 'lifetime'; // Default assumption
        
        // Check if there's an active subscription
        const subscriptions = await stripe.subscriptions.list({
          customer: customer.id,
          status: 'active',
          limit: 1
        });
        
        if (subscriptions.data.length > 0) {
          plan = 'monthly';
          console.log(`Customer has active subscription: ${subscriptions.data[0].id}`);
        } else {
          console.log(`No active subscription found, assuming lifetime plan`);
        }
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            verified: true,
            customerId: customer.id,
            plan: plan
          })
        };
      } else {
        console.log(`No successful payments found for customer`);
      }
    } else {
      console.log(`No customer found with email: ${email}`);
    }
    
    // No customer found or no successful payments
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ verified: false })
    };
    
  } catch (error) {
    console.error('Verification error:', error);
    return { 
      statusCode: 500, 
      headers,
      body: JSON.stringify({ error: 'Verification failed' })
    };
  }
}; 