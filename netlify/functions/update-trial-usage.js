// Function to update trial usage for a machine ID
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
    // Get request body
    const requestBody = JSON.parse(event.body);
    const { machineId, date, count } = requestBody;
    
    if (!machineId || !date || count === undefined) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Machine ID, date, and count are required' })
      };
    }
    
    // Convert date string to proper date format (YYYY-MM-DD)
    const dateObj = new Date(date);
    const formattedDate = dateObj.toISOString().split('T')[0];
    
    // Update or insert trial usage record
    const { error } = await supabase
      .from('trial_usage')
      .upsert({
        machine_id: machineId,
        usage_date: formattedDate,
        count: count
      });
    
    if (error) {
      throw error;
    }
    
    // Update machine_id in paid_users table if this user is verified
    // This associates the machine with the user for future reference
    await supabase
      .from('paid_users')
      .update({ machine_id: machineId })
      .eq('user_id', machineId);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
}; 