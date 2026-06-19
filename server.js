const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const GAME_FILE = path.join(ROOT, 'jeux');
const DATA_FILE = path.join(ROOT, 'data.json');
const LEVEL_COUNT = 20;

function createEmptyStore() {
  return { accounts: {}, clans: {}, sessions: {} };
}

function loadStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) return createEmptyStore();
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return {
      accounts: parsed.accounts || {},
      clans: parsed.clans || {},
      sessions: parsed.sessions || {},
    };
  } catch {
    return createEmptyStore();
  }
}

let store = loadStore();

function saveStore() {
  const tmpFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmpFile, DATA_FILE);
}

function normalizeName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function accountKey(name) {
  return normalizeName(name).toLowerCase();
}

function defaultProfile(name) {
  return {
    name,
    clan: null,
    money: 2000,
    gems: 25,
    population: 100,
    units: { infantry: 0, armor: 0, heavy: 0, jet: 0, carrier: 0 },
    factories: { f1: 0, f2: 0, f3: 0 },
    bonusPower: 0,
    levelsCompleted: new Array(LEVEL_COUNT).fill(false),
    questsClaimed: {},
    lastTick: Date.now(),
  };
}

function normalizeProfile(profile, name) {
  const base = defaultProfile(name);
  const source = profile || {};
  return {
    ...base,
    ...source,
    name: source.name || name,
    clan: source.clan || null,
    units: { ...base.units, ...(source.units || {}) },
    factories: { ...base.factories, ...(source.factories || {}) },
    levelsCompleted: Array.from({ length: LEVEL_COUNT }, (_, index) => !!(source.levelsCompleted && source.levelsCompleted[index])),
    questsClaimed: { ...(source.questsClaimed || {}) },
    lastTick: Number(source.lastTick) || Date.now(),
  };
}

function computePower(profile) {
  const unitPower = {
    infantry: 5,
    armor: 30,
    heavy: 90,
    jet: 220,
    carrier: 500,
  };
  let total = Number(profile.bonusPower || 0);
  for (const [unit, count] of Object.entries(profile.units || {})) {
    total += Number(count || 0) * (unitPower[unit] || 0);
  }
  return Math.round(total);
}

function leaderboardEntries() {
  return Object.values(store.accounts)
    .map((account) => normalizeProfile(account.profile, account.name))
    .sort((a, b) => (Number(b.population || 0) - Number(a.population || 0)) || (computePower(b) - computePower(a)) || a.name.localeCompare(b.name))
    .map((profile) => ({
      name: profile.name,
      clan: profile.clan,
      population: profile.population,
      money: profile.money,
      power: computePower(profile),
      updated: profile.lastTick || Date.now(),
    }));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        reject(new Error('Payload trop volumineux'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve(null);
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('JSON invalide'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    });
    res.end(content);
  });
}

function getToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function requireAuth(req) {
  const token = getToken(req);
  const session = token ? store.sessions[token] : null;
  if (!session) return null;
  const key = accountKey(session.name);
  const account = store.accounts[key];
  if (!account) return null;
  return { token, key, account };
}

function validateCredentials(body) {
  const name = normalizeName(body && body.name);
  const password = String(body && body.password ? body.password : '');
  if (name.length < 3) throw new Error('Le nom doit contenir au moins 3 caracteres.');
  if (name.length > 24) throw new Error('Le nom est trop long.');
  if (password.length < 4) throw new Error('Le mot de passe doit contenir au moins 4 caracteres.');
  if (!/^[\wÀ-ÿ' -]+$/u.test(name)) throw new Error('Le nom contient des caracteres interdits.');
  return { name, password };
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
}

function createSession(name) {
  const token = crypto.randomBytes(32).toString('hex');
  store.sessions[token] = { name, createdAt: Date.now() };
  return token;
}

function upsertAccount(name, password) {
  const key = accountKey(name);
  if (store.accounts[key]) throw new Error('Ce compte existe deja.');
  const salt = crypto.randomBytes(16).toString('hex');
  const account = {
    name,
    salt,
    passwordHash: hashPassword(password, salt),
    profile: defaultProfile(name),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  store.accounts[key] = account;
  const token = createSession(name);
  saveStore();
  return { token, profile: normalizeProfile(account.profile, account.name) };
}

function loginAccount(name, password) {
  const key = accountKey(name);
  const account = store.accounts[key];
  if (!account) throw new Error('Compte introuvable.');
  const hash = hashPassword(password, account.salt);
  if (hash !== account.passwordHash) throw new Error('Mot de passe incorrect.');
  const token = createSession(account.name);
  saveStore();
  return { token, profile: normalizeProfile(account.profile, account.name) };
}

function updateProfile(auth, body) {
  const account = auth.account;
  const incoming = normalizeProfile(body || {}, account.name);
  incoming.name = account.name;
  incoming.lastTick = Number(incoming.lastTick) || Date.now();
  account.profile = incoming;
  account.updatedAt = Date.now();
  saveStore();
  return normalizeProfile(account.profile, account.name);
}

function updateClans(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Format de clan invalide.');
  store.clans = body;
  saveStore();
  return store.clans;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/') {
      return sendFile(res, GAME_FILE, 'text/html; charset=utf-8');
    }

    if (req.method === 'GET' && url.pathname === '/api/me') {
      const auth = requireAuth(req);
      if (!auth) return sendJson(res, 401, { error: 'Non authentifie.' });
      return sendJson(res, 200, { profile: normalizeProfile(auth.account.profile, auth.account.name) });
    }

    if (req.method === 'POST' && url.pathname === '/api/register') {
      const body = await readBody(req);
      const creds = validateCredentials(body || {});
      return sendJson(res, 200, upsertAccount(creds.name, creds.password));
    }

    if (req.method === 'POST' && url.pathname === '/api/login') {
      const body = await readBody(req);
      const creds = validateCredentials(body || {});
      return sendJson(res, 200, loginAccount(creds.name, creds.password));
    }

    if (req.method === 'PUT' && url.pathname === '/api/me') {
      const auth = requireAuth(req);
      if (!auth) return sendJson(res, 401, { error: 'Non authentifie.' });
      const body = await readBody(req);
      return sendJson(res, 200, { profile: updateProfile(auth, body || {}) });
    }

    if (req.method === 'GET' && url.pathname === '/api/clans') {
      return sendJson(res, 200, { clans: store.clans });
    }

    if (req.method === 'PUT' && url.pathname === '/api/clans') {
      const auth = requireAuth(req);
      if (!auth) return sendJson(res, 401, { error: 'Non authentifie.' });
      const body = await readBody(req);
      return sendJson(res, 200, { clans: updateClans(body || {}) });
    }

    if (req.method === 'GET' && url.pathname === '/api/leaderboard') {
      return sendJson(res, 200, { entries: leaderboardEntries() });
    }

    if (req.method === 'POST' && url.pathname === '/api/logout') {
      const auth = requireAuth(req);
      if (auth) {
        delete store.sessions[auth.token];
        saveStore();
      }
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 404, { error: 'Route inconnue.' });
  } catch (error) {
    return sendJson(res, 400, { error: error.message || 'Erreur inconnue.' });
  }
});

server.listen(PORT, () => {
  console.log(`Operation Acier en ligne sur http://localhost:${PORT}`);
});