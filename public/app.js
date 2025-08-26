function getApiUrl(endpoint) {
  return `/api${endpoint}`;
}
// --- ZAWSZE UPPERCASE sessionId w localStorage i w zapytaniach ---
function setSessionId(id) {
  if (id) localStorage.setItem('sessionId', id.toUpperCase());
}
function getSessionId() {
  return (localStorage.getItem('sessionId') || localStorage.getItem('currentSessionId') || '').toUpperCase();
}

// --- Optymalizacja: minimalizuj GET /api/session, korzystaj z localStorage jeśli token ważny ---
function getValidAccessTokenFromStorage() {
  const access_token = localStorage.getItem('access_token');
  const expiresAt = Number(localStorage.getItem('access_token_expires_at'));
  if (access_token && expiresAt && Date.now() < expiresAt - 60000) {
    return access_token;
  }
  return null;
}

async function getFreshAccessToken() {
  const access_token = localStorage.getItem('access_token');
  const expiresAt = Number(localStorage.getItem('access_token_expires_at'));
  if (access_token && expiresAt && Date.now() < expiresAt - 60000) {
    return access_token;
  }
  const refresh_token = localStorage.getItem('refresh_token');
  if (!refresh_token) {
    showError('Brak ważnego refresh_token. Zaloguj się ponownie.');
    setTimeout(() => renderLogin(), 1500);
    throw new Error('Brak refresh_token.');
  }
  try {
    showLoading('Odświeżanie tokena...');
    const res = await fetch(getApiUrl('/refresh_token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token })
    });
    hideLoading();
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Unknown error' }));
      showError('Nie udało się odświeżyć tokena. Zaloguj się ponownie.');
      setTimeout(() => renderLogin(), 1500);
      throw new Error(error.error || 'Błąd odświeżania tokena');
    }
    const data = await res.json();
    if (!data.access_token) {
      showError('Brak access_token po odświeżeniu. Zaloguj się ponownie.');
      setTimeout(() => renderLogin(), 1500);
      throw new Error('Brak access_token po odświeżeniu');
    }
    localStorage.setItem('access_token', data.access_token);
    if (data.expires_in) {
      localStorage.setItem('access_token_expires_at', String(Date.now() + data.expires_in * 1000));
    }
    if (data.refresh_token) {
      localStorage.setItem('refresh_token', data.refresh_token);
    }
    return data.access_token;
  } catch (e) {
    hideLoading();
    showError('Błąd odświeżania tokena. Zaloguj się ponownie.');
    setTimeout(() => renderLogin(), 1500);
    throw e;
  }
}

// Funkcje do obsługi tokenów Spotify po stronie klienta
async function getValidAccessToken() {
  let access_token = localStorage.getItem('access_token');
  let refresh_token = localStorage.getItem('refresh_token');
  let expires_at = parseInt(localStorage.getItem('expires_at'), 10);

  if (!access_token || !refresh_token || !expires_at) {
    throw new Error('Brak tokenów Spotify. Zaloguj się ponownie.');
  }

  if (Date.now() > expires_at - 60000) { // wygasł lub zaraz wygaśnie
    // Odśwież token bezpośrednio przez Spotify API
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refresh_token);
    params.append('client_id', '37cd333b19754a508eeff2f7b92989e9');
    params.append('client_secret', '113f78eae7834459b613fcd2eabb2981');
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    if (!res.ok) throw new Error('Nie udało się odświeżyć tokena Spotify');
    const data = await res.json();
    access_token = data.access_token;
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('expires_at', Date.now() + data.expires_in * 1000);
    if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
  }
  return access_token;
}

// Refaktoryzacja spotifyFetch: accessToken jest opcjonalny, domyślnie pobierany przez getFreshAccessToken
async function spotifyFetch(endpoint, accessToken, options = {}) {
  // Poprawka: obsługa wywołań spotifyFetch(endpoint, options)
  if (typeof accessToken === 'object' && accessToken !== null) {
    options = accessToken;
    accessToken = undefined;
  }
  // Upewnij się, że accessToken jest stringiem
  if (!accessToken) {
    accessToken = await getFreshAccessToken();
  }
  if (typeof accessToken !== 'string') {
    accessToken = String(accessToken);
  }  
  const useCaching = options._useCache === true && ['GET', undefined].includes(options.method);
  delete options._useCache;

  let url = '';
  if (options._useEndpoint) {
    url = options._useEndpoint;
    delete options._useEndpoint;
  } else {
    const endpointMap = {
      '/me': '/api/spotify/user-info?type=me',
      '/me/player': '/api/spotify/user-info?type=player',
      '/me/player/play': '/api/spotify/player-controls?action=play',
      '/me/player/pause': '/api/spotify/player-controls?action=pause',
      '/me/player/next': '/api/spotify/player-controls?action=next',
      '/me/player/previous': '/api/spotify/player-controls?action=previous',
      '/me/player/shuffle': '/api/spotify/player-controls?action=shuffle',
      '/me/player/repeat': '/api/spotify/player-controls?action=repeat',
      '/me/player/seek': '/api/spotify/player-controls?action=seek',
      '/me/player/devices': '/api/spotify/user-info?type=devices',
      '/me/player/queue': '/api/spotify/search-queue?action=get-queue',
      '/me/player/currently-playing': '/api/spotify/user-info?type=currently-playing',
      '/me/top/tracks': '/api/spotify/user-info?type=top-tracks',
      '/me/playlists': '/api/spotify/user-info?type=playlists',
      '/search': '/api/spotify/search-queue?action=search'
    };
    url = `/api/spotify${endpoint}`;
    const baseEndpoint = endpoint.split('?')[0];  // Specjalna obsługa volume endpoint - POPRAWKA: volume_percent zamiast volume
    if (baseEndpoint === '/me/player/volume') {
      const volumeMatch = endpoint.match(/volume_percent=(\d+)/);
      const volume_percent = volumeMatch ? volumeMatch[1] : '50';
      url = `/api/spotify/player-controls?action=volume&volume_percent=${volume_percent}`;
    } else if (baseEndpoint === '/me/player/shuffle') {
      const stateMatch = endpoint.match(/state=(true|false)/);
      const state = stateMatch ? stateMatch[1] : 'false';
      url = `/api/spotify/player-controls?action=shuffle&state=${state}`;
    } else if (baseEndpoint === '/me/player/repeat') {
      const stateMatch = endpoint.match(/state=(track|context|off)/);
      const state = stateMatch ? stateMatch[1] : 'off';
      url = `/api/spotify/player-controls?action=repeat&state=${state}`;
    } else if (baseEndpoint === '/me/player/seek') {
      const positionMatch = endpoint.match(/position_ms=(\d+)/);
      const position_ms = positionMatch ? positionMatch[1] : '0';
      url = `/api/spotify/player-controls?action=seek&position_ms=${position_ms}`;
    } else if (endpointMap[baseEndpoint]) {
      url = endpointMap[baseEndpoint];
      const queryPart = endpoint.includes('?') ? '&' + endpoint.split('?')[1] : '';
      url += queryPart;
    }
    if (endpoint.includes('/users/') && endpoint.includes('/playlists')) {
      const userId = endpoint.split('/users/')[1].split('/playlists')[0];
      url = `/api/spotify/user-info?type=playlists&userId=${userId}`;
    } else if (endpoint.includes('/playlists/') && endpoint.includes('/tracks')) {
      const playlistId = endpoint.split('/playlists/')[1].split('/')[0];
      url = `/api/spotify/user-info?type=playlist-tracks&playlistId=${playlistId}`;
    }
  }
  // DODAJ ACCESS_TOKEN DO PLAYER-CONTROLS (Vercel fix)
  if (url.startsWith('/api/spotify/player-controls')) {
    const sep = url.includes('?') ? '&' : '?';
    url += `${sep}access_token=${encodeURIComponent(accessToken)}`;
  }
  if (url.startsWith('/api/spotify/user-info') || url.startsWith('/api/spotify/search-queue?action=get-queue') || url.startsWith('/api/spotify/search-queue?action=search')) {
    options.method = 'GET';
  }
  
  // Ustaw POST dla dodawania do kolejki
  if (url.includes('/api/spotify/search-queue?action=add-to-queue')) {
    options.method = 'POST';
  }// Wymuś właściwe metody HTTP dla kontroli odtwarzacza
  if (url.includes('/api/spotify/player-controls?action=volume') || 
      url.includes('/api/spotify/player-controls?action=play') ||
      url.includes('/api/spotify/player-controls?action=pause') ||
      url.includes('/api/spotify/player-controls?action=transfer') ||
      url.includes('/api/spotify/player-controls?action=shuffle') ||
      url.includes('/api/spotify/player-controls?action=repeat') ||
      url.includes('/api/spotify/player-controls?action=seek')) {
    options.method = 'PUT';
  }
  if (url.includes('/api/spotify/player-controls?action=next') ||
      url.includes('/api/spotify/player-controls?action=previous')) {
    options.method = 'POST';
  }
  let retryCount = 0;
  const maxRetries = 3;  async function tryFetch() {
    try {
      const startTime = Date.now();
      
      const res = await fetch(url, {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      
      const requestTime = Date.now() - startTime;if (requestTime > 1000) {
        console.warn(`Slow API request: ${endpoint} took ${requestTime}ms`);
      }
      
      if (res.status === 204) return {};      if (res.status === 401) {
        // Przy wygaśnięciu tokena pobierz nowy z backendu i spróbuj ponownie
        try {
          const newToken = await getFreshAccessToken();
          if (newToken) {
            return spotifyFetch(endpoint, newToken, options);
          }
        } catch (tokenError) {
          console.error('Failed to refresh token:', tokenError);
          // Sprawdź, czy błąd dotyczy obu nieważnych tokenów (np. backend zwraca taki komunikat)
          if (tokenError && tokenError.message && tokenError.message.match(/both access and refresh tokens are invalid|invalid tokens|brak aktywnej sesji|brak access_token/i)) {
            showError('Sesja wygasła lub jest nieważna. Zaloguj się ponownie.');
            localStorage.clear();
            setTimeout(() => window.location.reload(), 2000);
            throw new Error('Session expired');
          } else {
            // W innych przypadkach nie wylogowuj, tylko pokaż błąd i pozwól na ponowną próbę
            showError('Błąd odświeżania tokena. Spróbuj ponownie.');
            throw new Error('Token refresh failed');
          }
        }
      }
      if (res.status === 403) {
        const errorData = await res.json().catch(() => ({ error: 'Forbidden' }));
        console.warn('Spotify API 403 error:', errorData);
        throw new Error(errorData.message || 'Brak uprawnień. Upewnij się, że masz aktywne urządzenie Spotify lub konto Premium.');
      }      if (!res.ok) {
        if ([429, 500, 502, 503, 504].includes(res.status) && retryCount < maxRetries) {
          retryCount++;
          const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
          return tryFetch();
        }
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw errorData;
      }
      const data = await res.json();
      if (useCaching) {
        const cacheKey = `spotify_cache_${endpoint}_${JSON.stringify(options)}`;
        sessionStorage.setItem(cacheKey, JSON.stringify({
          timestamp: Date.now(),
          data
        }));
      }
      return data;
    } catch (e) {      if (e.name === 'TypeError' && retryCount < maxRetries) {
        retryCount++;
        const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
        return tryFetch();
      }
      throw e;
    }
  }
  return tryFetch();
}

function showSuccess(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast-success';
  toast.innerText = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function showError(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast-error';
  toast.innerText = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function showLoading(text = 'Ładowanie...') {
  const loading = document.createElement('div');
  loading.id = 'loading';
  loading.className = 'loading-overlay';
  loading.innerHTML = `<div class="loading-content">${text}</div>`;
  document.body.appendChild(loading);
}

function hideLoading() {
  const loading = document.getElementById('loading');
  if (loading) loading.remove();
}

function renderLogin(message) {
  document.getElementById('app').innerHTML = `
    <div class="login-container">
      <h1>Grzaika Spotify 2.0</h1>
      <p class="login-subtitle">Zdalne sterowanie Spotify dla Oli</p>
      ${message ? `<div class="login-message">${message}</div>` : ''}
      <div class="role-selection">
        <div class="role-option">
          <h3>🎵 STREAMER</h3>
          <p>Zaloguj się przez Spotify i utwórz sesję</p>
          <button id="streamer-login-btn" class="spotify-btn">Zaloguj przez Spotify</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('streamer-login-btn').onclick = () => {
    localStorage.setItem('userRole', 'streamer');
    window.location.href = getApiUrl('/login');
  };
}

function renderAppUI() {
  const userRole = localStorage.getItem('userRole') || 'streamer';
  const sessionId = localStorage.getItem('sessionId');
  document.getElementById('app').innerHTML = `
    <header>
      <div class="logo">Grzaika Spotify</div>
      <div class="user-info">
        <span class="role-badge role-${userRole}">${userRole.toUpperCase()}</span>
        ${sessionId ? `<span class="session-id">Sesja: ${sessionId}</span>` : ''}
      </div>
      ${userRole === 'streamer' ? '<button id="logout-btn" class="spotify-btn">Wyloguj</button>' : ''}
    </header>
    <main id="main-content">
      ${userRole === 'streamer' ? '<section id="session-manager"></section>' : ''}
      <section id="now-playing"></section>
      <section id="controls"></section>
      <section id="volume"></section>
      <section id="search"></section>
      <section id="queue"></section>
      <section id="devices"></section>
    </main>
  `;
  if (userRole === 'streamer') {
    document.getElementById('logout-btn').onclick = () => {
      localStorage.clear();
      renderLogin();
    };
  }
}

function renderSessionManager() {
  const userRole = localStorage.getItem('userRole');
  if (userRole !== 'streamer') return;
  const sessionId = localStorage.getItem('sessionId');
  document.getElementById('session-manager').innerHTML = `
    <div class="session-manager">
      <h3>🎵 Panel</h3>
      ${sessionId ? `
        <div class="active-session">
          <button id="end-session-btn" class="danger-btn">Zakończ</button>
        </div>
      ` : `
        <div class="create-session">
          <p>Utwórz sesję dla moderatora</p>
          <button id="create-session-btn" class="spotify-btn">Utwórz sesję</button>
        </div>
      `}
    </div>
  `;
  if (sessionId) {
    document.getElementById('end-session-btn').onclick = async () => {
      try {
        showLoading('Kończenie sesji...');
        const res = await fetch(getApiUrl('/session'), {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' }
        });
        localStorage.clear();
        showSuccess('Sesja zakończona');
        setTimeout(() => renderLogin(), 1000);
      } catch (e) {
        showError(e.message || 'Błąd podczas kończenia sesji');
      } finally {
        hideLoading();
      }
    };
    // Dodaj generowanie linku zaproszenia
    const accessToken = localStorage.getItem('access_token');
    const refreshToken = localStorage.getItem('refresh_token');
    let inviteLink = '';
    if (accessToken && refreshToken) {
      const baseUrl = window.location.origin + window.location.pathname;
      inviteLink = `${baseUrl}#join-session?sessionId=${encodeURIComponent(sessionId)}&access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}`;
    }
    if (inviteLink) {
      const inviteDiv = document.createElement('div');
      inviteDiv.className = 'invite-link-box';
      inviteDiv.innerHTML = `<p style='margin-top:16px;'>🔗 Link dla moderatora:</p><input id="invite-link-input" value="${inviteLink}" readonly style="width:100%" /><button id="copy-invite-link-btn" class="spotify-btn">Kopiuj link</button>`;
      document.querySelector('.active-session').appendChild(inviteDiv);
      document.getElementById('copy-invite-link-btn').onclick = () => {
        navigator.clipboard.writeText(inviteLink);
        showSuccess('Link skopiowany!');
      };
    }
  } else {
    document.getElementById('create-session-btn').onclick = async () => {
      try {
        showLoading('Tworzenie...');
        const refreshToken = localStorage.getItem('refresh_token');
        const accessToken = localStorage.getItem('access_token');
        const res = await fetch(getApiUrl('/session'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: accessToken,
            refresh_token: refreshToken
          })
        });
        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || 'Błąd');
        }
        const data = await res.json();
        setSessionId(data.sessionId);
        showSuccess(`Utworzono!`);
        renderSessionManager();
      } catch (e) {
        showError(e.message);
      } finally {
        hideLoading();
      }
    };
  }
}

let lastNowPlayingId = null;
let lastNowPlayingProgress = null;
async function renderNowPlaying() {
  try {
    const nowPlayingElement = document.getElementById('now-playing');
    if (!nowPlayingElement.querySelector('.now-playing-track')) {
      nowPlayingElement.innerHTML = `
        <h3>🎵 Teraz gra</h3>
        <div class="loading-spinner"></div>
      `;
    }
    
    try {
      const data = await spotifyFetch('/me/player/currently-playing');
      
      // Sprawdź czy dane są puste (status 204 lub brak item)
      if (!data || Object.keys(data).length === 0 || !data.item) {
        nowPlayingElement.innerHTML = '<h3>🎵 Teraz gra</h3><p>Nic nie jest aktualnie odtwarzane.</p>';
        lastNowPlayingId = null;
        lastNowPlayingProgress = null;
        return;
      }
      
      const { item, progress_ms, is_playing } = data;
      const imageUrl = item.album?.images?.[0]?.url || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="%23333"/></svg>';
      
      // Cache ostatnio grany utwór
      sessionStorage.setItem('last_played_track', JSON.stringify({
        id: item.id,
        name: item.name,
        artists: item.artists,
        album: item.album,
        timestamp: Date.now()
      }));
      
      // Optymalizacja - aktualizuj tylko pasek postępu jeśli to ten sam utwór
      if (lastNowPlayingId === item.id && Math.abs((progress_ms || 0) - (lastNowPlayingProgress || 0)) < 2000) {
        const progressBar = nowPlayingElement.querySelector('.progress');
        if (progressBar && item.duration_ms) {
          progressBar.style.width = `${(progress_ms / item.duration_ms) * 100}%`;
        }
        lastNowPlayingProgress = progress_ms;
        return;
      }
      
      lastNowPlayingId = item.id;
      lastNowPlayingProgress = progress_ms;
        nowPlayingElement.innerHTML = `
        <h3>🎵 Teraz gra</h3>
        <div class="now-playing-track">
          <img src="${imageUrl}" alt="okładka" class="album-cover" />
          <div class="track-info">
            <div class="track-title">${item.name}</div>
            <div class="track-artist">${item.artists.map(a => a.name).join(', ')}</div>
            <div class="track-album">${item.album?.name || 'Nieznany album'}</div>
            <div class="progress-container" data-duration="${item.duration_ms}">
              <div class="progress-bar">
                <div class="progress" style="width:${(progress_ms && item.duration_ms) ? (progress_ms / item.duration_ms) * 100 : 0}%"></div>
              </div>
              <div class="time-info">
                <span class="current-time">${formatTime(progress_ms || 0)}</span>
                <span class="total-time">${formatTime(item.duration_ms)}</span>
              </div>
            </div>
            <div class="playback-status">${is_playing ? '▶️ Odtwarzanie' : '⏸️ Pauza'}</div>
          </div>
        </div>
      `;
      
      // Dodaj obsługę klikania na pasek postępu (seek)
      const progressContainer = nowPlayingElement.querySelector('.progress-container');
      if (progressContainer) {
        progressContainer.onclick = async (e) => {
          if (e.target.classList.contains('progress-bar') || e.target.classList.contains('progress')) {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickPosition = (e.clientX - rect.left) / rect.width;
            const duration = parseInt(progressContainer.dataset.duration);
            const seekPosition = Math.floor(clickPosition * duration);
            
            try {
              await spotifyFetch(`/me/player/seek?position_ms=${seekPosition}`, { method: 'PUT' });
              showSuccess('Przewinięto');
            } catch (error) {
              showError('Błąd przewijania');
            }
          }
        };
      }
    } catch (apiError) {
      // Jeśli błąd to prawdopodobnie 204 (no content) albo brak danych
      if (apiError.message && apiError.message.includes('204')) {
        nowPlayingElement.innerHTML = '<h3>🎵 Teraz gra</h3><p>Nic nie jest aktualnie odtwarzane.</p>';
        lastNowPlayingId = null;
        lastNowPlayingProgress = null;
      } else {
        throw apiError; // Przepuść inne błędy do zewnętrznego catch
      }
    }
  } catch (e) {
    console.error('Now playing error:', e);
    document.getElementById('now-playing').innerHTML = '<h3>🎵 Teraz gra</h3><p>Błąd pobierania aktualnego utworu.</p>';
  }
}

function formatTime(ms) {
  if (!ms || ms < 0) return '0:00';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function renderControls() {
  // Sprawdź czy przyciski już istnieją, aby uniknąć nadpisywania event handlerów
  const existingControls = document.getElementById('controls');
  if (existingControls && existingControls.querySelector('.controls')) {
    return;
  }
  
  document.getElementById('controls').innerHTML = `
    <h3>🎮 Sterowanie</h3>
    <div class="controls">
      <button id="prev-btn" title="Poprzedni">⏮️</button>
      <button id="playpause-btn" title="Odtwarzaj/Pauza">⏯️</button>
      <button id="next-btn" title="Następny">⏭️</button>
    </div>
    <div class="playback-options">
      <button id="shuffle-btn" class="toggle-btn" title="Losowo">🔀</button>
      <button id="repeat-btn" class="toggle-btn" title="Powtórz">🔁</button>
    </div>  `;
  
  // Przypisz event handlery
  const prevBtn = document.getElementById('prev-btn');
  const playPauseBtn = document.getElementById('playpause-btn');
  const nextBtn = document.getElementById('next-btn');  if (prevBtn) {
    prevBtn.onclick = async (e) => {
      e.preventDefault();
      try {
        const result = await spotifyFetch('/me/player/previous', { method: 'POST' });
        showSuccess('⏮️ Poprzedni');
      } catch (error) {
        console.error('Previous button error:', error);
        showError('Błąd poprzedniego');
      }
    };
  }  if (playPauseBtn) {
    playPauseBtn.onclick = async (e) => {
      e.preventDefault();
      try {
        const data = await spotifyFetch('/me/player');
        if (data.is_playing) {
          await spotifyFetch('/me/player/pause', { method: 'PUT' });
          showSuccess('⏸️ Pauzowano');
        } else {
          await spotifyFetch('/me/player/play', { method: 'PUT' });
          showSuccess('▶️ Odtwarzanie');
        }
      } catch (error) {
        console.error('Play/Pause button error:', error);
        showError('Błąd play/pause');
      }
    };
  }  if (nextBtn) {
    nextBtn.onclick = async (e) => {
      e.preventDefault();
      try {
        const result = await spotifyFetch('/me/player/next', { method: 'POST' });
        showSuccess('⏭️ Następny');
      } catch (error) {
        console.error('Next button error:', error);
        showError('Błąd następnego');
      }
    };
  }  // Shuffle control
  const shuffleBtn = document.getElementById('shuffle-btn');
  if (shuffleBtn) {
    shuffleBtn.onclick = async (e) => {
      e.preventDefault();
      try {
        const data = await spotifyFetch('/me/player');
        const newShuffleState = !data.shuffle_state;
        await spotifyFetch(`/me/player/shuffle?state=${newShuffleState}`, { method: 'PUT' });
        showSuccess(`🔀 Losowo: ${newShuffleState ? 'włączone' : 'wyłączone'}`);
        // Aktualizuj wygląd przycisku
        shuffleBtn.classList.toggle('active', newShuffleState);
      } catch (error) {
        console.error('Shuffle button error:', error);
        showError('Błąd shuffle');
      }
    };
  }  // Repeat control
  const repeatBtn = document.getElementById('repeat-btn');
  if (repeatBtn) {
    repeatBtn.onclick = async (e) => {
      e.preventDefault();
      try {
        const data = await spotifyFetch('/me/player');
        let newRepeatState = 'off';
        if (data.repeat_state === 'off') {
          newRepeatState = 'context';
        } else if (data.repeat_state === 'context') {
          newRepeatState = 'track';
        } else {
          newRepeatState = 'off';
        }
        await spotifyFetch(`/me/player/repeat?state=${newRepeatState}`, { method: 'PUT' });
        showSuccess(`🔁 Powtórz: ${newRepeatState === 'off' ? 'wyłączone' : newRepeatState === 'track' ? 'utwór' : 'kontekst'}`);
        // Aktualizuj wygląd przycisku
        repeatBtn.classList.toggle('active', newRepeatState !== 'off');
        repeatBtn.title = `Powtórz: ${newRepeatState === 'off' ? 'wyłączone' : newRepeatState === 'track' ? 'utwór' : 'kontekst'}`;
      } catch (error) {
        console.error('Repeat button error:', error);
        showError('Błąd repeat');
      }
    };
  }  
  // Aktualizuj stan przycisków na podstawie obecnego stanu odtwarzania
  updateControlsState();
}

async function updateControlsState() {
  try {
    const data = await spotifyFetch('/me/player');
    const shuffleBtn = document.getElementById('shuffle-btn');
    const repeatBtn = document.getElementById('repeat-btn');
    
    if (shuffleBtn) {
      shuffleBtn.classList.toggle('active', data.shuffle_state);
    }
    
    if (repeatBtn) {
      repeatBtn.classList.toggle('active', data.repeat_state !== 'off');
      repeatBtn.title = `Powtórz: ${data.repeat_state === 'off' ? 'wyłączone' : data.repeat_state === 'track' ? 'utwór' : 'kontekst'}`;
    }
  } catch (e) {
    // Ignoruj błędy aktualizacji stanu
  }
}

async function renderVolume() {
  try {
    // Sprawdź czy volume control już istnieje, aby uniknąć nadpisywania event handlerów
    const existingVolumeControl = document.getElementById('volume').querySelector('.volume-control');
    if (existingVolumeControl) {
      const data = await spotifyFetch('/me/player');
      const volume = data.device?.volume_percent ?? 50;
      const slider = document.getElementById('volume-slider');
      const input = document.getElementById('volume-input');
      if (slider && input) {
        slider.value = volume;
        input.value = volume;
        return;
      }
    }
    const data = await spotifyFetch('/me/player');
    const volume = data.device?.volume_percent ?? 50;
    document.getElementById('volume').innerHTML = `
      <h3>🔊 Głośność</h3>
      <div class="volume-control">
        <label for="volume-slider">Głośność:</label>
        <input type="range" id="volume-slider" min="0" max="100" value="${volume}" />
        <input type="number" id="volume-input" min="0" max="100" value="${volume}" />
      </div>
    `;
    let volumeTimeout;
    const updateVolume = (val) => {
      clearTimeout(volumeTimeout);
      volumeTimeout = setTimeout(() => {
        // Użyj endpointu backendowego
        spotifyFetch(`/player-controls?action=volume&volume_percent=${val}`, {
          method: 'PUT'
        })
          .then(() => showSuccess(`🔊 Głośność: ${val}%`))
          .catch(() => showError('Błąd głośności'));
      }, 300);
    };
    const slider = document.getElementById('volume-slider');
    const input = document.getElementById('volume-input');
    if (slider && input) {
      slider.oninput = input.oninput = (e) => {
        const val = Number(e.target.value);
        slider.value = input.value = val;
        updateVolume(val);
      };
    }
  } catch (e) {
    document.getElementById('volume').innerHTML = '<h3>🔊 Głośność</h3><p>Błąd pobierania głośności.</p>';
  }
}

function renderSearch() {
  document.getElementById('search').innerHTML = `
    <h3>🔍 Szukaj</h3>
    <div class="search-bar">
      <input id="search-input" type="text" placeholder="Szukaj..." />
      <button id="search-btn" class="spotify-btn">Szukaj</button>
    </div>
    <div id="search-results"></div>
    <div class="add-to-queue">
      <input id="queue-link" type="text" placeholder="Link Spotify (utwór lub playlista)" />
      <button id="add-link-btn" class="spotify-btn">Dodaj</button>
    </div>
  `;
  async function performSearch(query) {
    try {
      showLoading('Szukanie...');
      const data = await spotifyFetch(`/search?q=${encodeURIComponent(query)}&type=track&limit=10`);
      const results = data.tracks?.items || [];
      document.getElementById('search-results').innerHTML = results.map(track => `
        <div class="search-result">
          <img src="${track.album.images?.[0]?.url || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="%23333"/></svg>'}" class="result-cover" />
          <span>${track.name} - ${track.artists.map(a => a.name).join(', ')}</span>
          <button data-uri="${track.uri}" class="add-queue-btn">Dodaj</button>
        </div>
      `).join('');
      document.querySelectorAll('.add-queue-btn').forEach(btn => {
        btn.onclick = () => {          const uri = btn.dataset.uri;
          const encodedUri = encodeURIComponent(uri);
          spotifyFetch('/me/player/queue', {
            method: 'POST',
            _useEndpoint: `/api/spotify/search-queue?action=add-to-queue&uri=${encodedUri}`
          })
            .then(() => showSuccess('Dodano'))
            .catch(() => showError('Błąd'));
        };
      });
    } catch (e) {
      showError('Błąd szukania');
    } finally {
      hideLoading();
    }
  }
  document.getElementById('search-btn').onclick = () => {
    const q = document.getElementById('search-input').value;
    if (q) performSearch(q);
  };
  document.getElementById('search-input').onkeypress = (e) => {
    if (e.key === 'Enter') {
      const q = e.target.value;
      if (q) performSearch(q);
    }
  };
  document.getElementById('add-link-btn').onclick = async () => {
    const link = document.getElementById('queue-link').value;
    if (!link) return;
    let uri = '';
    if (link.includes('track/')) {
      uri = 'spotify:track:' + link.split('track/')[1].split('?')[0];
    }
    if (link.includes('playlist/')) {
      const playlistId = link.split('playlist/')[1].split('?')[0];
      if (!playlistId) {
        showError('Nieprawidłowy link do playlisty');
        return;
      }
      showLoading('Pobieranie playlisty...');
      try {
        // Pobierz wszystkie utwory z playlisty (pętla po offset)
        let allTracks = [];
        let offset = 0;
        const limit = 100;
        let total = 0;
        do {
          const data = await spotifyFetch(`/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`);
          const items = data.items || [];
          if (offset === 0) total = data.total || items.length;
          allTracks = allTracks.concat(items);
          offset += limit;
        } while (allTracks.length < total && allTracks.length < 100);
        // OGRANICZ DO 100 UTWORÓW NAWET JEŚLI POBRANO WIĘCEJ
        if (allTracks.length > 100) allTracks = allTracks.slice(0, 100);
        if (allTracks.length === 0) {
          showError('Brak utworów w playliście');
          hideLoading();
          return;
        }
        // Dodawanie do kolejki równolegle z limitem concurrency
        let added = 0;
        let failed = 0;
        const concurrency = 3;
        let inProgress = 0;
        let idx = 0;
        const updateProgress = () => {
          showLoading(`Dodawanie do kolejki... (${added + failed}/${allTracks.length})`);
        };
        await new Promise(resolve => {
          function next() {
            while (inProgress < concurrency && idx < allTracks.length) {
              const item = allTracks[idx++];
              const track = item.track || item;
              if (!track || !track.uri) {
                failed++;
                updateProgress();
                continue;
              }
              inProgress++;
              const encodedUri = encodeURIComponent(track.uri);
              spotifyFetch('/me/player/queue', {
                method: 'POST',
                _useEndpoint: `/api/spotify/search-queue?action=add-to-queue&uri=${encodedUri}`
              })
                .then(() => { added++; })
                .catch(() => { failed++; })
                .finally(() => {
                  inProgress--;
                  updateProgress();
                  if (added + failed === allTracks.length) resolve();
                  else next();
                });
            }
          }
          next();
        });
        hideLoading();
        if (added > 0) {
          showSuccess(`Dodano ${added} utworów z playlisty${failed ? `, nieudanych: ${failed}` : ''}`);
          renderQueue();
        } else {
          showError('Nie udało się dodać żadnego utworu z playlisty');
        }
      } catch (e) {
        hideLoading();
        showError('Błąd pobierania playlisty lub dodawania utworów');
      }
      return;
    }
    if (uri) {
      const encodedUri = encodeURIComponent(uri);
      spotifyFetch('/me/player/queue', {
        method: 'POST',
        _useEndpoint: `/api/spotify/search-queue?action=add-to-queue&uri=${encodedUri}`
      })
        .then(() => {
          showSuccess('Dodano');
          renderQueue();
        })
        .catch(() => showError('Błąd'));
    } else {
      showError('Wklej link do utworu lub playlisty Spotify');
    }
  };
}

// Agent: throttling i batchowanie dodawania utworów do kolejki
async function addTracksToQueueWithThrottle(trackUris, concurrency = 2, delayMs = 400) {
  let index = 0;
  let active = 0;
  let added = 0, failed = 0;
  let currentConcurrency = concurrency;
  let currentDelay = delayMs;
  let penaltyUntil = 0;
  let penaltyTries = 0;

  return new Promise((resolve) => {
    async function next() {
      while (active < currentConcurrency && index < trackUris.length) {
        const uri = trackUris[index++];
        active++;
        let retryCount = 0;
        async function tryAdd() {
          try {
            await spotifyFetch(`/search-queue?action=add-to-queue&uri=${encodeURIComponent(uri)}`, { method: 'POST' });
            added++;
            // Po udanym dodaniu, jeśli był penalty, stopniowo wracaj do concurrency=2
            if (penaltyTries > 0) penaltyTries--;
            if (penaltyTries === 0 && currentConcurrency < concurrency) {
              currentConcurrency = concurrency;
              currentDelay = delayMs;
            }
          } catch (err) {
            // Obsługa 429 Too Many Requests
            if (err && (err.status === 429 || err.error === 'Too Many Requests' || (err.error && String(err.error).includes('429')))) {
              retryCount++;
              penaltyTries = 10; // przez 10 prób concurrency=1
              currentConcurrency = 1;
              currentDelay = Math.min(10000, 2000 * retryCount); // rosnące opóźnienie, max 10s
              index--; // cofnij indeks, spróbuj ponownie ten sam utwór
              console.warn(`429 Too Many Requests, retrying in ${currentDelay}ms... (concurrency=1)`);
              setTimeout(() => { active--; next(); }, currentDelay);
              return;
            } else {
              failed++;
            }
          }
          // Logowanie postępu
          if ((added + failed) % 10 === 0 || (added + failed) === trackUris.length) {
            console.log(`Dodano do kolejki: ${added}, błędów: ${failed}, pozostało: ${trackUris.length - (added + failed)}`);
          }
          active--;
          if (index < trackUris.length) {
            setTimeout(next, currentDelay);
          } else if (active === 0) {
            resolve({ added, failed });
          }
        }
        tryAdd();
      }
    }
    next();
  });
}

async function renderQueue() {
  try {
    const data = await spotifyFetch('/me/player/queue');
    let tracks = data.queue || [];
    if (tracks.length > 100) tracks = tracks.slice(0, 100);
    let queueHtml = `
      <h3>📋 Kolejka</h3>
      <ul class="queue-list">
        ${tracks.map(track => `
          <li class="queue-item">
            <img src="${track.album?.images?.[0]?.url || 'data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\"><rect width=\"64\" height=\"64\" fill=\"%23333\"/></svg>'}" class="queue-cover" />
            <span>${track.name} - ${track.artists.map(a => a.name).join(', ')}</span>
          </li>
        `).join('')}
      </ul>
    `;
    document.getElementById('queue').innerHTML = queueHtml;
  } catch (e) {
    document.getElementById('queue').innerHTML = '<h3>📋 Kolejka</h3><p>Błąd pobierania kolejki. Sprawdź swoje połączenie lub zaloguj się ponownie.</p>';
    console.error('Queue error:', e);
  }
}

let lastDevicesFetch = 0;
let cachedDevices = null;

async function renderDevices() {
  const now = Date.now();
  if (cachedDevices && now - lastDevicesFetch < 60 * 60 * 1000) {
    // Użyj cache jeśli nie minęła godzina
    document.getElementById('devices').innerHTML = cachedDevices;
    return;
  }
  try {
    const data = await spotifyFetch('/me/player/devices');
    const devices = data.devices || [];
    const activeId = devices.find(d => d.is_active)?.id;
    const html = `
      <h3>📱 Urządzenia</h3>
      <div class="device-list">
        ${devices.map(d => `
          <button class="device-btn${d.id === activeId ? ' active' : ''}" data-id="${d.id}">${d.name} (${d.type})</button>
        `).join('')}
      </div>
    `;
    document.getElementById('devices').innerHTML = html;
    cachedDevices = html;
    lastDevicesFetch = now;
    document.querySelectorAll('.device-btn').forEach(btn => {
      btn.onclick = () => {
        spotifyFetch('/me/player', {
          method: 'PUT',
          _useEndpoint: `/api/spotify/player-controls?action=transfer`,
          body: JSON.stringify({ device_ids: [btn.dataset.id], play: false })
        }).then(() => showSuccess('Przełączono'))
          .catch(() => showError('Błąd'));
      };
    });
  } catch (e) {
    document.getElementById('devices').innerHTML = '<h3>📱 Urządzenia</h3><p>Błąd pobierania urządzeń. Sprawdź czy Spotify jest uruchomione na jakimś urządzeniu.</p>';
    console.error('Devices error:', e);
  }
}

function getTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (access_token) {
    localStorage.setItem('access_token', access_token);
    if (refresh_token) localStorage.setItem('refresh_token', refresh_token);
    window.history.replaceState({}, document.title, '/');
  }
}

function getTokenFromInviteLink() {
  if (window.location.hash.startsWith('#join-session')) {
    const params = new URLSearchParams(window.location.hash.replace('#join-session?', ''));
    const sessionId = params.get('sessionId');
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (sessionId && accessToken && refreshToken) {
      setSessionId(sessionId);
      localStorage.setItem('access_token', accessToken);
      localStorage.setItem('refresh_token', refreshToken);
      localStorage.setItem('userRole', 'moderator');
      // Wyczyść hash z URL po użyciu
      window.location.hash = '';
      showSuccess('Dołączono do sesji!');
      setTimeout(() => window.location.reload(), 500);
      return true;
    }
  }
  return false;
}

async function refreshTokenFunc() {
  const refresh_token = localStorage.getItem('refresh_token');
  if (!refresh_token) return;
  
  if (window._isRefreshing) {
    await new Promise(resolve => {
      const checkRefresh = setInterval(() => {
        if (!window._isRefreshing) {
          clearInterval(checkRefresh);
          resolve();
        }
      }, 100);
    });
    return localStorage.getItem('access_token');
  }
  
  try {
    window._isRefreshing = true;
    
    const res = await fetch(getApiUrl('/refresh_token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token })
    });
    
    if (!res.ok) {
      throw new Error('Token refresh failed');
    }
    
    const data = await res.json();
    if (data.access_token) localStorage.setItem('access_token', data.access_token);
    if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
    return data.access_token;
  } catch (e) {
    console.error('Token refresh error:', e);
    showError('Błąd odświeżania tokena');
    return null;
  } finally {
    window._isRefreshing = false;
  }
}

async function checkApiStatus() {
  try {
    const res = await fetch('/api/status');    if (res.ok) {
      const data = await res.json();
      return data.status === 'ok';
    }
    return false;
  } catch (e) {
    console.error('API status check failed:', e);
    return false;
  }
}

// --- USUNIĘTO: function renderPlaylistCreator ---

window.addEventListener('storage', (e) => {
  if (e.key === 'access_token' && e.newValue) {
    // Otrzymano nowy access_token od lidera
    // (nie trzeba nic robić, bo getFreshAccessToken korzysta z localStorage)
  }
});

let isPolling = false;
let apiHealthy = true;
let appVersion = '1.1.0';

async function main() {
  if (getTokenFromInviteLink()) return;
  getTokenFromUrl();
  const accessToken = localStorage.getItem('access_token');
  const refreshToken = localStorage.getItem('refresh_token');
  const userRole = localStorage.getItem('userRole');
  if (userRole === 'moderator' && accessToken && refreshToken) {
    // Nie kasuj sesji moderatora po F5
  } else if (!accessToken) {
    renderLogin();
    return;
  }
  apiHealthy = await checkApiStatus();
  if (!apiHealthy) {
    console.warn('API health check failed, continuing anyway');
  }
  localStorage.setItem('app_version', appVersion);
  renderAppUI();
  showLoading();
  try {
    await renderSessionManager();
    await renderNowPlaying();
    renderControls();
    await renderVolume();
    renderSearch();
    await renderQueue();
    await renderDevices();
  } catch (e) {
    showError('Błąd ładowania');
  } finally {
    hideLoading();
  }
  setupPolling();
}

function setupPolling() {
  if (isPolling) return;
  isPolling = true;
  let consecutiveApiFailures = 0;
  let healthCheckInterval;

  function isActiveWindow() {
    return document.visibilityState === 'visible';
  }

  function safeInterval(fn, ms) {
    let id = setInterval(() => {
      if (isActiveWindow()) fn();
    }, ms);
    return id;
  }

  const quickInterval = safeInterval(async () => {
    if (!apiHealthy) return;
    try {
      await renderNowPlaying();
      consecutiveApiFailures = 0;
    } catch (e) {
      console.error('Quick polling error:', e);
      consecutiveApiFailures++;
      if (consecutiveApiFailures > 3 && !healthCheckInterval) {
        console.warn('Multiple API failures, starting health check');
        healthCheckInterval = setInterval(async () => {
          apiHealthy = await checkApiStatus();
          if (apiHealthy) {
            clearInterval(healthCheckInterval);
            healthCheckInterval = null;
            consecutiveApiFailures = 0;
            showSuccess('Połączenie przywrócone');
          }
        }, 10000);
      }
    }
  }, 12000); // quick: 12s

  const midInterval = safeInterval(() => {
    if (!apiHealthy) return;
    try {
      updateControlsState();
    } catch (e) {
      console.error('Mid polling error:', e);
    }
  }, 30000); // mid: 30s

  const slowInterval = safeInterval(async () => {
    if (!apiHealthy) return;
    try {
      await renderVolume();
      // renderQueue usunięte z slowInterval
    } catch (e) {
      console.error('Slow polling error:', e);
    }
  }, 60000); // slow: 60s

  // renderQueue co 3 minuty
  const queueInterval = safeInterval(async () => {
    if (!apiHealthy) return;
    try {
      await renderQueue();
    } catch (e) {
      console.error('Queue polling error:', e);
    }
  }, 180000); // 3 min

  window._pollingIntervals = {
    quick: quickInterval,
    mid: midInterval,
    slow: slowInterval,
    queue: queueInterval,
    health: healthCheckInterval
  };
  window.addEventListener('beforeunload', () => {
    clearInterval(quickInterval);
    clearInterval(midInterval);
    clearInterval(slowInterval);
    clearInterval(queueInterval);
    if (healthCheckInterval) clearInterval(healthCheckInterval);
  });
}

function resetAppState() {
  // Zatrzymaj workera przy resecie aplikacji
  stopTokenRefreshWorker();
  if (window._pollingIntervals) {
    Object.values(window._pollingIntervals).forEach(interval => {
      if (interval) clearInterval(interval);
    });
  }
  
  isPolling = false;
  apiHealthy = false;
  
  const errors = JSON.parse(localStorage.getItem('spotify_client_errors') || '[]');
  errors.push({
    timestamp: new Date().toISOString(),
    message: 'App reset triggered',
    userAgent: navigator.userAgent
  });
  
  if (errors.length > 10) {
    errors.splice(0, errors.length - 10);
  }
  
  localStorage.setItem('spotify_client_errors', JSON.stringify(errors));
  
  const refreshToken = localStorage.getItem('refresh_token');
  localStorage.clear();
  if (refreshToken) {
    localStorage.setItem('refresh_token', refreshToken);
    localStorage.setItem('auto_restore', 'true');
  }
  
  showError('Aplikacja została zresetowana z powodu problemu. Odświeżanie strony...');
  
  setTimeout(() => {
    window.location.reload();
  }, 3000);
}

function reportError(error, details = {}) {
  try {
    const errorObj = {
      message: error instanceof Error ? error.message : String(error),
      details: details,
      userAgent: navigator.userAgent,
      path: window.location.pathname,
      stack: error instanceof Error ? error.stack : null,
      timestamp: new Date().toISOString()
    };
    
    const errors = JSON.parse(localStorage.getItem('spotify_client_errors') || '[]');
    errors.push(errorObj);
    if (errors.length > 10) errors.shift();
    localStorage.setItem('spotify_client_errors', JSON.stringify(errors));
    
    fetch('/api/report-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorObj),
      keepalive: true
    }).catch(e => console.error('Failed to report error:', e));
  } catch (e) {
    console.error('Error in error reporter:', e);
  }
}

window.addEventListener('error', (event) => {
  reportError(event.error || new Error(event.message), {
    source: 'window.onerror',
    lineno: event.lineno,
    colno: event.colno
  });
});

window.addEventListener('unhandledrejection', (event) => {
  reportError(event.reason, { source: 'unhandledrejection' });
});

window.addEventListener('online', () => showSuccess('Online'));
window.addEventListener('offline', () => showError('Offline'));

document.addEventListener('DOMContentLoaded', () => {
  main();
});