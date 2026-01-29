exports.handler = async (event, context) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const { lat, lon } = event.queryStringParameters || {};
  
  if (!lat || !lon) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing lat or lon parameter' })
    };
  }

  try {
    const GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY;
    
    if (!GEOAPIFY_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'API key not configured' })
      };
    }

    const response = await fetch(
      `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lon}&apiKey=${GEOAPIFY_API_KEY}`
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
      body: JSON.stringify({ error: 'Failed to reverse geocode' })
    };
  }
};
