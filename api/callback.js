import querystring from 'querystring';
import axios from 'axios';
import { serialize, parse } from 'cookie';

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

export default async function handler(req, res) {
  const { code, state, error } = req.query;
  const storedState = req.headers.cookie ? parse(req.headers.cookie).spotify_auth_state : null;

  if (error) {
    return res.status(400).send(`Authorization error: ${error}`);
  }

  if (!state || state !== storedState) {
    return res.status(400).send('State mismatch. Possible CSRF attack.');
  }

  // Usuń ciasteczko po weryfikacji
  res.setHeader('Set-Cookie', serialize('spotify_auth_state', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development',
    expires: new Date(0),
    path: '/',
  }));
  // Odczytaj code_verifier z cookie używając funkcji parse
  const cookies = req.headers.cookie ? parse(req.headers.cookie) : {};
  const codeVerifier = cookies[`pkce_${state}`];
  if (!codeVerifier) return res.status(400).send('Invalid state or missing PKCE verifier');
  try {
    const tokenRes = await axios.post('https://accounts.spotify.com/api/token', querystring.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: codeVerifier
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    // Czyść cookie
    res.setHeader('Set-Cookie', `pkce_${state}=; Path=/; Max-Age=0`);
    // Przekieruj do frontendu z tokenami w URL
    res.redirect(`/?access_token=${tokenRes.data.access_token}&refresh_token=${tokenRes.data.refresh_token}`);
  } catch (e) {
    res.status(500).send('Token exchange failed');
  }
}
