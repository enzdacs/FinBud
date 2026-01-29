exports.handler = async (event, context) => {
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Get search query from URL parameters
  const { text } = event.queryStringParameters || {};
  
  if (!text) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing text parameter' })
    };
  }

  try {
    // Get API key from environment variable
    const GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY;
    
    if (!GEOAPIFY_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'API key not configured' })
      };
    }

    // Make request to Geoapify
    const response = await fetch(
      `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(text)}&apiKey=${GEOAPIFY_API_KEY}`
    );
    
    const data = await response.json();
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to geocode address' })
    };
  }
};
