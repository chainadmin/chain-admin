// Simple test endpoint to verify serverless functions work
export default function handler(req, res) {
  console.log('Test endpoint called:', req.method, req.url);
  
  res.status(200).json({ 
    message: 'Serverless function working!',
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString()
  });
}