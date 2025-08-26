import fetch from 'node-fetch';

export default async function handler(req, res) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Brak access_token' });
  const access_token = auth.replace('Bearer ', '');

  const { action, volume_percent, state, position_ms } = req.query;
  let spotifyUrl = '';
  let method = req.method;
  let body = undefined;

  switch (action) {
    case 'play':
      spotifyUrl = 'https://api.spotify.com/v1/me/player/play';
      method = 'PUT';
      break;
    case 'pause':
      spotifyUrl = 'https://api.spotify.com/v1/me/player/pause';
      method = 'PUT';
      break;
    case 'next':
      spotifyUrl = 'https://api.spotify.com/v1/me/player/next';
      method = 'POST';
      break;
    case 'previous':
      spotifyUrl = 'https://api.spotify.com/v1/me/player/previous';
      method = 'POST';
      break;
    case 'volume':
      spotifyUrl = `https://api.spotify.com/v1/me/player/volume?volume_percent=${volume_percent}`;
      method = 'PUT';
      break;
    case 'transfer':
      spotifyUrl = 'https://api.spotify.com/v1/me/player';
      method = 'PUT';
      body = req.body && Object.keys(req.body).length ? JSON.stringify(req.body) : undefined;
      break;
    case 'shuffle':
      spotifyUrl = `https://api.spotify.com/v1/me/player/shuffle?state=${state}`;
      method = 'PUT';
      break;
    case 'repeat':
      spotifyUrl = `https://api.spotify.com/v1/me/player/repeat?state=${state}`;
      method = 'PUT';
      break;
    case 'seek':
      spotifyUrl = `https://api.spotify.com/v1/me/player/seek?position_ms=${position_ms}`;
      method = 'PUT';
      break;
    default:
      // Domyślnie zwróć status playera
      spotifyUrl = 'https://api.spotify.com/v1/me/player';
      method = 'GET';
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
  res.status(spotifyRes.status).json(data);
}
