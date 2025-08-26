import fetch from 'node-fetch';

const cache = {};
const CACHE_TTL = 5000;

export default async function handler(req, res) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Brak access_token' });
  const access_token = auth.replace('Bearer ', '');

  const { action, uri, q, type, limit } = req.query;
  let spotifyUrl = '';
  let method = req.method;
  let body = undefined;

  switch (action) {
    case 'get-queue':
      spotifyUrl = 'https://api.spotify.com/v1/me/player/queue';
      method = 'GET';
      break;
    case 'add-to-queue':
      if (!uri) return res.status(400).json({ error: 'Brak uri' });
      spotifyUrl = `https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(uri)}`;
      method = 'POST';
      break;
    case 'search':
      if (!q) return res.status(400).json({ error: 'Brak zapytania q' });
      spotifyUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=${type||'track'}&limit=${limit||10}`;
      method = 'GET';
      break;
    default:
      return res.status(400).json({ error: 'Nieznana akcja' });
  }

  const cacheKey = JSON.stringify(req.query) + (req.headers.authorization || '');
  if ((req.query.action === 'get-queue' || req.query.action === 'search') && cache[cacheKey] && Date.now() - cache[cacheKey].ts < CACHE_TTL) {
    return res.status(200).json(cache[cacheKey].data);
  }

  const spotifyRes = await fetch(spotifyUrl, {
    method,
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/json'
    },
    body
  });
  if (spotifyRes.status === 204) return res.status(204).end();
  const data = await spotifyRes.json().catch(() => ({}));
  if (req.query.action === 'get-queue' || req.query.action === 'search') {
    cache[cacheKey] = { data, ts: Date.now() };
  }
  res.status(spotifyRes.status).json(data);
}
