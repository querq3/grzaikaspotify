import fetch from 'node-fetch';

const cache = {};
const CACHE_TTL = 5000;

export default async function handler(req, res) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Brak access_token' });
  const access_token = auth.replace('Bearer ', '');

  // Obsługa różnych typów zapytań
  const { type, userId, playlistId, limit, time_range } = req.query;
  let spotifyUrl = '';
  switch (type) {
    case 'me':
      spotifyUrl = 'https://api.spotify.com/v1/me';
      break;
    case 'player':
      spotifyUrl = 'https://api.spotify.com/v1/me/player';
      break;
    case 'currently-playing':
      spotifyUrl = 'https://api.spotify.com/v1/me/player/currently-playing';
      break;
    case 'devices':
      spotifyUrl = 'https://api.spotify.com/v1/me/player/devices';
      break;
    case 'top-tracks':
      spotifyUrl = `https://api.spotify.com/v1/me/top/tracks?limit=${limit||10}&time_range=${time_range||'medium_term'}`;
      break;
    case 'playlists':
      if (userId) {
        spotifyUrl = `https://api.spotify.com/v1/users/${userId}/playlists`;
      } else {
        spotifyUrl = 'https://api.spotify.com/v1/me/playlists';
      }
      break;
    case 'playlist-tracks':
      if (playlistId) {
        spotifyUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;
      } else {
        return res.status(400).json({ error: 'Brak playlistId' });
      }
      break;
    default:
      return res.status(400).json({ error: 'Nieznany typ zapytania' });
  }

  const cacheKey = JSON.stringify(req.query) + (req.headers.authorization || '');
  if (cache[cacheKey] && Date.now() - cache[cacheKey].ts < CACHE_TTL) {
    return res.status(200).json(cache[cacheKey].data);
  }

  const spotifyRes = await fetch(spotifyUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/json'
    }
  });
  if (spotifyRes.status === 204) return res.status(204).end();
  let data;
  try {
    data = await spotifyRes.json();
  } catch (e) {
    const text = await spotifyRes.text();
    return res.status(spotifyRes.status).json({ error: 'Spotify API returned non-JSON', details: text });
  }
  cache[cacheKey] = { data, ts: Date.now() };
  res.status(spotifyRes.status).json(data);
}
