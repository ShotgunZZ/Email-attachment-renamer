// Function to check existing trial usage for a machine ID
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
    // Get machine ID from query parameters
    const machineId = event.queryStringParameters.machineId;
    
    if (!machineId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Machine ID is required' })
      };
    }
    
    // Check if this machine has any trial usage
    const { data, error } = await supabase
      .from('trial_usage')
      .select('usage_date, count')
      .eq('machine_id', machineId);
    
    if (error) {
      throw error;
    }
    
    // If no data found, return exists: false
    if (!data || data.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ exists: false })
      };
    }
    
    // Convert to the format expected by the extension
    const trialUsage = {};
    data.forEach(item => {
      // Convert date to toDateString format used by extension
      const date = new Date(item.usage_date);
      trialUsage[date.toDateString()] = item.count;
    });
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ exists: true, trialUsage })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
}; 