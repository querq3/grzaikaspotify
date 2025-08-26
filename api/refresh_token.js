import axios from 'axios';
import querystring from 'querystring';

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

const rateLimitMap = new Map();
const tokenRateLimitMap = new Map();
setInterval(() => rateLimitMap.clear(), 30 * 60 * 1000); // czyść co 30 min
setInterval(() => tokenRateLimitMap.clear(), 30 * 60 * 1000);

function isRateLimited(ip) {
  const now = Date.now();
  const last = rateLimitMap.get(ip) || 0;
  if (now - last < 5000) return true;
  rateLimitMap.set(ip, now);
  return false;
}
function isTokenRateLimited(token) {
  const now = Date.now();
  const last = tokenRateLimitMap.get(token) || 0;
  if (now - last < 30000) return true; // 1 request na 30s na refresh_token
  tokenRateLimitMap.set(token, now);
  return false;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (req.headers['content-type'] !== 'application/json') {
    return res.status(415).json({ error: 'Content-Type must be application/json' });
  }

  const { refresh_token } = req.body;
  if (typeof refresh_token !== 'string' || refresh_token.length < 10) {
    return res.status(400).json({ error: 'Invalid refresh_token' });
  }

  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(clientIp)) {
    res.setHeader('Retry-After', '5');
    return res.status(429).json({ error: 'Too many requests. Poczekaj chwilę przed kolejną próbą.' });
  }
  if (isTokenRateLimited(refresh_token)) {
    res.setHeader('Retry-After', '5');
    return res.status(429).json({ error: 'Too many requests for this token. Poczekaj chwilę.' });
  }

  try {
    const tokenRes = await axios.post('https://accounts.spotify.com/api/token', querystring.stringify({
      grant_type: 'refresh_token',
      refresh_token,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    // Odpowiedz tylko niezbędnymi polami
    const { access_token, expires_in, refresh_token: new_refresh_token, scope, token_type } = tokenRes.data;
    const response = { access_token, expires_in, scope, token_type };
    if (new_refresh_token) response.refresh_token = new_refresh_token;
    res.json(response);
  } catch (e) {
    const errorMessage = e.response?.data?.error_description || e.response?.data?.error || 'Unknown error';
    res.status(e.response?.status || 500).json({ 
      error: 'Refresh failed', 
      details: errorMessage,
      code: e.response?.status || 'UNKNOWN'
    });
  }
}
