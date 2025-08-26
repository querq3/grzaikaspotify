// Uproszczony endpoint: NIE przechowuje żadnych sesji, NIE korzysta z blobów, NIE odświeża tokenów
// Cała logika sesji i odświeżania tokena po stronie klienta (localStorage/cookie)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    // Prosty endpoint diagnostyczny
    return res.status(200).json({
      message: 'Session endpoint nie przechowuje już żadnych sesji. Cała logika po stronie klienta.'
    });
  }

  if (req.method === 'POST') {
    // Generuj sessionId (8 znaków A-Z0-9)
    const sessionId = (Math.random().toString(36).substr(2, 8).toUpperCase());
    const { access_token, refresh_token } = req.body || {};
    // Echo zwrotne – frontend sam zarządza tokenami
    return res.status(200).json({
      sessionId,
      access_token,
      refresh_token
    });
  }

  if (req.method === 'DELETE') {
    // Nie ma już żadnej logiki backendowej, ale dla zgodności zwracamy sukces
    return res.status(200).json({ message: 'Sesja zakończona po stronie klienta. Tokeny wyczyszczone.' });
  }

  // Dla nieobsługiwanych metod zwróć 200 z neutralnym komunikatem
  return res.status(200).json({ message: 'OK' });
}