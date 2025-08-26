import querystring from 'querystring';
import { serialize } from 'cookie';
import crypto from 'crypto';

const CLIENT_ID = process.env.CLIENT_ID;
const REDIRECT_URI = process.env.REDIRECT_URI;

function generateCodeVerifier() {
  return crypto.randomBytes(64).toString('hex');
}
function generateCodeChallenge(codeVerifier) {
  return crypto.createHash('sha256').update(codeVerifier).digest('base64url');
}
function generateRandomString(length) {
  return crypto.randomBytes(length).toString('hex');
}

export default async function handler(req, res) {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateRandomString(16);

  // Ustaw ciasteczko z wartością state
  const stateCookie = serialize('spotify_auth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development',
    maxAge: 60 * 5, // 5 minut
    path: '/',
  });
  // Ustaw ciasteczko z code_verifier
  const verifierCookie = serialize(`pkce_${state}`, codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development',
    maxAge: 60 * 5, // 5 minut
    path: '/',
  });
  res.setHeader('Set-Cookie', [stateCookie, verifierCookie]);

  const scope = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'user-read-private',
    'user-read-email',
    'playlist-modify-public',
    'playlist-modify-private',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-top-read',
    'user-read-playback-position',
    'user-library-read',
    'user-library-modify',
    'user-follow-read',
    'user-follow-modify',
    'user-read-recently-played',
    'streaming',
    'app-remote-control',
    'ugc-image-upload',
  ].join(' ');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope,
    redirect_uri: REDIRECT_URI,
    state,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
}
