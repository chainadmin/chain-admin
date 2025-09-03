// Direct login endpoint for testing
export default function handler(req, res) {
  console.log('Login endpoint called:', req.method, req.url);
  
  if (req.method === 'GET') {
    // For now, return a simple redirect message
    res.status(200).json({
      message: 'Agency login endpoint working',
      redirect: 'Authentication will be implemented here',
      method: req.method,
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}