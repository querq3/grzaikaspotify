import axios from 'axios';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Requested-With');
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  // Sprawdź różne sposoby przekazywania tokena
  let accessToken = null;
  
  // 1. Standardowy nagłówek Authorization: Bearer token
  if (req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      accessToken = authHeader.substring(7);
    } else {
      accessToken = authHeader.split(' ')[1];
    }
  }
  
  // 2. Sprawdź nagłówek w małych literach (czasem Vercel normalizuje)
  if (!accessToken && req.headers.Authorization) {
    const authHeader = req.headers.Authorization;
    if (authHeader.startsWith('Bearer ')) {
      accessToken = authHeader.substring(7);
    } else {
      accessToken = authHeader.split(' ')[1];
    }
  }
  
  // 3. Sprawdź query parameter jako fallback
  if (!accessToken && req.query.access_token) {
    accessToken = req.query.access_token;
  }
  
  if (!accessToken) {
    console.error('No access token found in:', {
      headers: req.headers,
      query: req.query
    });
    return res.status(401).json({ 
      error: 'Missing access token',
      debug: {
        hasAuthHeader: !!req.headers.authorization,
        hasCapitalAuthHeader: !!req.headers.Authorization,
        hasQueryToken: !!req.query.access_token
      }
    });
  }
  
  // POPRAWKA: Używaj pełny URL zamiast req.url który może być nieprzewidywalny w Vercel
  const endpoint = req.url.startsWith('/') ? req.url : `/${req.url}`;
  const url = `https://api.spotify.com/v1${endpoint}`;
  
  try {
    const method = req.method.toLowerCase();
    const response = await axios({
      url,
      method,
      headers: { 
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      params: method === 'get' ? req.query : undefined,
      data: ['post', 'put', 'patch'].includes(method) ? req.body : undefined
    });
    
    // POPRAWKA: Zwróć właściwy status code
    res.status(response.status).json(response.data);
  } catch (e) {
    const status = e.response?.status || 500;
    const data = e.response?.data || { error: 'Spotify API error' };
    console.error('Spotify API proxy error:', { 
      endpoint, 
      method: req.method, 
      status, 
      error: e.message 
    });
    res.status(status).json(data);
  }
}
