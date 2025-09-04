// Complete serverless function rewrite - no external dependencies
export default function handler(req, res) {
  // Enable CORS
  // Configure CORS for chainsoftwaregroup.com
  const allowedOrigins = [
    'https://chainsoftwaregroup.com',
    'https://www.chainsoftwaregroup.com',
    'http://localhost:5000',
    'http://localhost:3000'
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://chainsoftwaregroup.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url, method } = req;
  console.log('API Request:', method, url);

  // Handle login endpoint
  if (url.includes('/api/login')) {
    if (method === 'GET') {
      return res.status(200).json({
        message: 'Agency Login Available',
        action: 'redirect_to_replit_auth',
        loginUrl: 'https://replit.com/auth',
        timestamp: new Date().toISOString()
      });
    }
  }

  // Handle agency registration
  if (url.includes('/api/agencies/register')) {
    if (method === 'POST') {
      return res.status(200).json({
        message: 'Agency registration endpoint working',
        received: 'POST request',
        note: 'Full registration logic will be implemented here',
        timestamp: new Date().toISOString()
      });
    }
  }

  // Handle auth user check
  if (url.includes('/api/auth/user')) {
    return res.status(401).json({
      message: 'Unauthorized',
      note: 'Authentication not implemented yet'
    });
  }

  // Default response for any API route
  return res.status(200).json({
    message: 'Chain API Working',
    endpoint: url,
    method: method,
    timestamp: new Date().toISOString(),
    status: 'Serverless functions now operational'
  });
}