exports.handler = async (event, context) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const { waypoints, mode } = event.queryStringParameters || {};
  
  if (!waypoints) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing waypoints parameter' })
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

    const transportMode = mode || 'drive';
    
    const response = await fetch(
      `https://api.geoapify.com/v1/routing?waypoints=${waypoints}&mode=${transportMode}&apiKey=${GEOAPIFY_API_KEY}`
    );
    
    const data = await response.json();
    
    return {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to get route' })
    };
  }
};
