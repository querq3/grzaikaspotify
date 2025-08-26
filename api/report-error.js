// Endpoint do logowania błędów z frontendu
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { message, details, userAgent, stack, path } = req.body;
    
    // Log error to console (w produkcji można by zapisywać do bazy lub serwisu logowania)
    console.error('Client error reported:', {
      timestamp: new Date().toISOString(),
      message,
      details,
      userAgent,
      path,
      stack: stack?.slice(0, 500) // Ogranicz długość stosu
    });
    
    res.status(200).json({ success: true, message: 'Error reported' });
  } catch (e) {
    console.error('Error reporting error:', e);
    res.status(500).json({ error: 'Failed to process error report' });
  }
}
