export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  // Sprawdzamy podstawowe zmienne środowiskowe
  const checks = {
    client_id: !!process.env.CLIENT_ID,
    client_secret: !!process.env.CLIENT_SECRET,
    redirect_uri: !!process.env.REDIRECT_URI,
    blob_read_write: !!process.env.BLOB_READ_WRITE_TOKEN,
    node_env: process.env.NODE_ENV || 'not set',
    timestamp: new Date().toISOString()
  };
  
  const allChecksPass = checks.client_id && checks.client_secret && checks.redirect_uri;
  
  res.status(200).json({
    status: allChecksPass ? 'ok' : 'configuration_error',
    checks,
    version: '1.1.0',
    message: allChecksPass 
      ? 'API jest skonfigurowane poprawnie' 
      : 'Brakuje kluczowych zmiennych środowiskowych'
  });
}
