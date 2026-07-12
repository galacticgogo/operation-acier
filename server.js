const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT || 8080);
const ROOT = __dirname;
const GAME_FILE = path.join(ROOT, 'jeux');
const DATA_FILE = path.join(ROOT, 'data.json');
const DATABASE_URL = process.env.DATABASE_URL || '';
let pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : null;
const LEVEL_COUNT = 20;
const HIDDEN_LEADERBOARD_ACCOUNTS = new Set(['galacticgogo9']);
const SEED_ACCOUNT_NAME = 'GalacticGogo9';
const SEED_ACCOUNT_PASSWORD = 'Gogo2026!';
const TEST_ACCOUNT_PREFIXES = ['test', 'testuser', 'testuserregistration'];

function createEmptyStore() {
  return { accounts: {}, clans: {}, sessions: {}, marketListings: [], messages: [], events: [] };
}

function normalizeStore(source) {
  const parsed = source || {};
  return {
    accounts: parsed.accounts || {},
    clans: parsed.clans || {},
    sessions: parsed.sessions || {},
    marketListings: Array.isArray(parsed.marketListings) ? parsed.marketListings : [],
    messages: Array.isArray(parsed.messages) ? parsed.messages : [],
    events: Array.isArray(parsed.events) ? parsed.events : [],
  };
}

function loadStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) return createEmptyStore();
    return normalizeStore(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
  } catch {
    return createEmptyStore();
  }
}

let store = loadStore();
let initializationPromise = null;

function isTestAccountName(name) {
  const key = accountKey(name || '');
  return TEST_ACCOUNT_PREFIXES.some((prefix) => key === prefix || key.startsWith(`${prefix}`));
}

function removeTestAccounts() {
  const filteredAccounts = Object.fromEntries(
    Object.entries(store.accounts).filter(([key, account]) => !isTestAccountName(account && account.name ? account.name : key)),
  );
  store.accounts = filteredAccounts;
}

function ensureSeedAccount() {
  const key = accountKey(SEED_ACCOUNT_NAME);
  const existing = store.accounts[key];
  if (existing) {
    const existingSalt = existing.salt || crypto.randomBytes(16).toString('hex');
    existing.passwordHash = hashPassword(SEED_ACCOUNT_PASSWORD, existingSalt);
    existing.salt = existingSalt;
    existing.updatedAt = Date.now();
    existing.profile = normalizeProfile(existing.profile || defaultProfile(SEED_ACCOUNT_NAME), SEED_ACCOUNT_NAME);
    existing.profile.hideFromLeaderboard = true;
    existing.name = SEED_ACCOUNT_NAME;
    return existing;
  }
  const salt = crypto.randomBytes(16).toString('hex');
  store.accounts[key] = {
    name: SEED_ACCOUNT_NAME,
    salt,
    passwordHash: hashPassword(SEED_ACCOUNT_PASSWORD, salt),
    profile: { ...defaultProfile(SEED_ACCOUNT_NAME), hideFromLeaderboard: true },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return store.accounts[key];
}

async function initializeStore() {
  removeTestAccounts();
  ensureSeedAccount();
  if (!pool) {
    await saveStore();
    return;
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS game_state (
        id TEXT PRIMARY KEY,
        payload JSONB NOT NULL
      )
    `);
    const result = await pool.query('SELECT payload FROM game_state WHERE id = $1', ['store']);
    if (result.rowCount > 0 && result.rows[0] && result.rows[0].payload) {
      const loaded = normalizeStore(result.rows[0].payload);
      loaded.clans = Object.fromEntries(Object.entries(loaded.clans).map(([clanName, clan]) => [clanName, normalizeClan(clanName, clan)]));
      loaded.marketListings = loaded.marketListings.map(normalizeMarketListing);
      store = loaded;
    }
    ensureSeedAccount();
    await saveStore();
  } catch (error) {
    console.error('Database unavailable, falling back to file storage:', error);
    if (pool) {
      try {
        await pool.end();
      } catch {}
    }
    pool = null;
    ensureSeedAccount();
    await saveStore();
  }
}

async function ensureInitialized() {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      try {
        await initializeStore();
      } catch (error) {
        initializationPromise = null;
        throw error;
      }
    })();
  }
  return initializationPromise;
}

function saveStoreToFile() {
  const tmpFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmpFile, DATA_FILE);
}

async function saveStore() {
  if (pool) {
    try {
      await pool.query(
        `
          INSERT INTO game_state (id, payload)
          VALUES ($1, $2)
          ON CONFLICT (id)
          DO UPDATE SET payload = EXCLUDED.payload
        `,
        ['store', store],
      );
      return;
    } catch (error) {
      console.error('Database save failed, falling back to file storage:', error);
    }
  }
  saveStoreToFile();
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
    hideFromLeaderboard: false,
    xp: 0,
    commanderLevel: 1,
    prestige: 0,
    prestigePoints: 0,
    techPoints: 0,
    tech: {},
    achievements: {},
    unitUpgrades: {},
    general: null,
    bank: { deposited: 0, lastTick: Date.now() },
    battleDifficulty: 'normal',
    battleWins: 0,
    battleLosses: 0,
    units: { infantry: 0, armor: 0, heavy: 0, jet: 0, carrier: 0, drone: 0, artillery: 0, helicopter: 0, submarine: 0, missile: 0 },
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
  const commanderLevel = Number(source.commanderLevel) || 1;
  return {
    ...base,
    ...source,
    name: source.name || name,
    clan: source.clan || null,
    xp: Math.max(0, Number(source.xp) || 0),
    commanderLevel,
    prestige: Math.max(0, Number(source.prestige) || 0),
    prestigePoints: Math.max(0, Number(source.prestigePoints) || 0),
    techPoints: Math.max(0, Number(source.techPoints) || 0),
    tech: { ...(source.tech || {}) },
    achievements: { ...(source.achievements || {}) },
    unitUpgrades: { ...(source.unitUpgrades || {}) },
    general: source.general || null,
    bank: {
      deposited: Math.max(0, Number(source.bank && source.bank.deposited) || 0),
      lastTick: Number(source.bank && source.bank.lastTick) || Date.now(),
    },
    battleDifficulty: ['easy', 'normal', 'hard', 'nightmare'].includes(source.battleDifficulty) ? source.battleDifficulty : 'normal',
    battleWins: Math.max(0, Number(source.battleWins) || 0),
    battleLosses: Math.max(0, Number(source.battleLosses) || 0),
    units: { ...base.units, ...(source.units || {}) },
    factories: { ...base.factories, ...(source.factories || {}) },
    levelsCompleted: Array.from({ length: LEVEL_COUNT }, (_, index) => !!(source.levelsCompleted && source.levelsCompleted[index])),
    questsClaimed: { ...(source.questsClaimed || {}) },
    lastTick: Number(source.lastTick) || Date.now(),
  };
}

function commanderLevelFromXp(xp) {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, Number(xp) || 0) / 250)) + 1);
}

function passiveIncomePerSecond(profile) {
  const factoryIncome = Object.values(profile.factories || {}).reduce((sum, count, index) => sum + (Number(count || 0) * [2, 8, 20][index]), 0);
  const generalBonus = profile.general && profile.general.id === 'economist' ? 1.15 : 1;
  return factoryIncome * generalBonus;
}

function applyPassiveProgress(profile) {
  const now = Date.now();
  const target = normalizeProfile(profile, profile && profile.name);
  const elapsed = Math.max(0, now - Number(target.lastTick || now));
  if (elapsed > 0) {
    target.money += passiveIncomePerSecond(target) * (elapsed / 1000);
    if (target.bank && target.bank.deposited > 0) {
      const bankElapsed = Math.max(0, now - Number(target.bank.lastTick || now));
      const bankInterest = target.prestige >= 1 ? 0.0009 : 0.0006;
      target.bank.deposited += target.bank.deposited * bankInterest * (bankElapsed / 60000);
      target.bank.lastTick = now;
    }
    target.lastTick = now;
  }
  const computedLevel = commanderLevelFromXp(target.xp);
  if (computedLevel > Number(target.commanderLevel || 1)) {
    target.techPoints += computedLevel - Number(target.commanderLevel || 1);
    target.commanderLevel = computedLevel;
  }
  return target;
}

function normalizeClan(name, clan) {
  const source = clan || {};
  return {
    name,
    members: Array.isArray(source.members) ? source.members : [],
    created: Number(source.created) || Date.now(),
    level: Math.max(1, Number(source.level) || 1),
    xp: Math.max(0, Number(source.xp) || 0),
    warPoints: Math.max(0, Number(source.warPoints) || 0),
    missions: Array.isArray(source.missions) ? source.missions : [
      { id: 'm1', txt: 'Gagner 5 batailles', reward: { gems: 10 }, progress: 0, target: 5, claimed: false },
      { id: 'm2', txt: 'Construire 10 usines en équipe', reward: { money: 1000 }, progress: 0, target: 10, claimed: false },
      { id: 'm3', txt: 'Réunir 20 membres de puissance', reward: { gems: 25 }, progress: 0, target: 20, claimed: false },
    ],
    chat: Array.isArray(source.chat) ? source.chat : [],
  };
}

function normalizeMarketListing(listing) {
  const source = listing || {};
  return {
    id: source.id || crypto.randomBytes(8).toString('hex'),
    seller: source.seller || 'inconnu',
    sellerKey: source.sellerKey || accountKey(source.seller || ''),
    kind: ['unit', 'gems', 'money'].includes(source.kind) ? source.kind : 'unit',
    unitId: source.unitId || 'infantry',
    quantity: Math.max(1, Number(source.quantity) || 1),
    price: Math.max(1, Number(source.price) || 1),
    createdAt: Number(source.createdAt) || Date.now(),
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
    const upgrades = profile.unitUpgrades && profile.unitUpgrades[unit] ? profile.unitUpgrades[unit] : { armor: 0, precision: 0, speed: 0 };
    const owned = Number(count || 0);
    total += owned * (unitPower[unit] || 0) + owned * ((Number(upgrades.armor || 0) * 2) + (Number(upgrades.precision || 0) * 3) + Number(upgrades.speed || 0));
  }
  if (profile.general === 'tactician') total *= 1.08;
  if (profile.general === 'admiral') total += ((Number(profile.units && profile.units.submarine) || 0) + (Number(profile.units && profile.units.carrier) || 0)) * 12;
  if (profile.tech && profile.tech.precision) total *= 1.08;
  total += (Number(profile.prestige || 0) * 75);
  return Math.round(total);
}

function leaderboardEntries() {
  return Object.values(store.accounts)
    .filter((account) => {
      const profile = account && account.profile ? account.profile : {};
      return !profile.hideFromLeaderboard && !HIDDEN_LEADERBOARD_ACCOUNTS.has(accountKey(account.name));
    })
    .map((account) => normalizeProfile(account.profile, account.name))
    .sort((a, b) => (Number(b.population || 0) - Number(a.population || 0)) || (computePower(b) - computePower(a)) || a.name.localeCompare(b.name))
    .map((profile) => ({
      name: profile.name,
      clan: profile.clan,
      population: profile.population,
      money: profile.money,
      level: profile.commanderLevel || 1,
      prestige: profile.prestige || 0,
      power: computePower(profile),
      updated: profile.lastTick || Date.now(),
    }));
}

function isAdmin(auth) {
  return auth && accountKey(auth.account.name) === accountKey(SEED_ACCOUNT_NAME);
}

async function executeAdminCommand(command, auth) {
  if (!isAdmin(auth)) throw new Error('Acces admin requis.');
  
  const parts = (command || '').trim().split(/\s+/);
  if (!parts[0]) throw new Error('Commande vide.');
  
  const cmd = parts[0].toLowerCase();
  
  // give money <name> <amount>
  if (cmd === 'give' && parts[1] === 'money' && parts[2] && parts[3]) {
    const targetName = parts[2];
    const amount = Number(parts[3]);
    if (isNaN(amount) || amount < 0) throw new Error('Montant invalide.');
    const account = getAccountByName(targetName);
    if (!account) throw new Error('Compte introuvable.');
    account.profile.money += amount;
    account.updatedAt = Date.now();
    await saveStore();
    return { ok: true, message: `${amount} argent donne a ${targetName}` };
  }
  
  // give gems <name> <amount>
  if (cmd === 'give' && parts[1] === 'gems' && parts[2] && parts[3]) {
    const targetName = parts[2];
    const amount = Number(parts[3]);
    if (isNaN(amount) || amount < 0) throw new Error('Montant invalide.');
    const account = getAccountByName(targetName);
    if (!account) throw new Error('Compte introuvable.');
    account.profile.gems += amount;
    account.updatedAt = Date.now();
    await saveStore();
    return { ok: true, message: `${amount} gemmes donnees a ${targetName}` };
  }
  
  // give units <name> <unitId> <amount>
  if (cmd === 'give' && parts[1] === 'units' && parts[2] && parts[3] && parts[4]) {
    const targetName = parts[2];
    const unitId = parts[3].toLowerCase();
    const amount = Number(parts[4]);
    if (isNaN(amount) || amount < 0) throw new Error('Montant invalide.');
    const account = getAccountByName(targetName);
    if (!account) throw new Error('Compte introuvable.');
    if (!account.profile.units.hasOwnProperty(unitId)) throw new Error('Unite invalide.');
    account.profile.units[unitId] += amount;
    account.updatedAt = Date.now();
    await saveStore();
    return { ok: true, message: `${amount}x ${unitId} donne a ${targetName}` };
  }
  
  // set money <name> <amount>
  if (cmd === 'set' && parts[1] === 'money' && parts[2] && parts[3]) {
    const targetName = parts[2];
    const amount = Number(parts[3]);
    if (isNaN(amount) || amount < 0) throw new Error('Montant invalide.');
    const account = getAccountByName(targetName);
    if (!account) throw new Error('Compte introuvable.');
    account.profile.money = amount;
    account.updatedAt = Date.now();
    await saveStore();
    return { ok: true, message: `Argent de ${targetName} defini a ${amount}` };
  }
  
  // set gems <name> <amount>
  if (cmd === 'set' && parts[1] === 'gems' && parts[2] && parts[3]) {
    const targetName = parts[2];
    const amount = Number(parts[3]);
    if (isNaN(amount) || amount < 0) throw new Error('Montant invalide.');
    const account = getAccountByName(targetName);
    if (!account) throw new Error('Compte introuvable.');
    account.profile.gems = amount;
    account.updatedAt = Date.now();
    await saveStore();
    return { ok: true, message: `Gemmes de ${targetName} definies a ${amount}` };
  }
  
  // set xp <name> <amount>
  if (cmd === 'set' && parts[1] === 'xp' && parts[2] && parts[3]) {
    const targetName = parts[2];
    const amount = Number(parts[3]);
    if (isNaN(amount) || amount < 0) throw new Error('Montant invalide.');
    const account = getAccountByName(targetName);
    if (!account) throw new Error('Compte introuvable.');
    account.profile.xp = amount;
    account.updatedAt = Date.now();
    await saveStore();
    return { ok: true, message: `XP de ${targetName} defini a ${amount}` };
  }
  
  // set level <name> <level>
  if (cmd === 'set' && parts[1] === 'level' && parts[2] && parts[3]) {
    const targetName = parts[2];
    const level = Number(parts[3]);
    if (isNaN(level) || level < 1) throw new Error('Niveau invalide.');
    const account = getAccountByName(targetName);
    if (!account) throw new Error('Compte introuvable.');
    account.profile.commanderLevel = level;
    account.updatedAt = Date.now();
    await saveStore();
    return { ok: true, message: `Niveau de ${targetName} defini a ${level}` };
  }
  
  // set population <name> <amount>
  if (cmd === 'set' && parts[1] === 'population' && parts[2] && parts[3]) {
    const targetName = parts[2];
    const amount = Number(parts[3]);
    if (isNaN(amount) || amount < 0) throw new Error('Montant invalide.');
    const account = getAccountByName(targetName);
    if (!account) throw new Error('Compte introuvable.');
    account.profile.population = amount;
    account.updatedAt = Date.now();
    await saveStore();
    return { ok: true, message: `Population de ${targetName} definie a ${amount}` };
  }
  
  // set prestige <name> <amount>
  if (cmd === 'set' && parts[1] === 'prestige' && parts[2] && parts[3]) {
    const targetName = parts[2];
    const amount = Number(parts[3]);
    if (isNaN(amount) || amount < 0) throw new Error('Montant invalide.');
    const account = getAccountByName(targetName);
    if (!account) throw new Error('Compte introuvable.');
    account.profile.prestige = amount;
    account.updatedAt = Date.now();
    await saveStore();
    return { ok: true, message: `Prestige de ${targetName} defini a ${amount}` };
  }
  
  // set units <name> <unitId> <amount>
  if (cmd === 'set' && parts[1] === 'units' && parts[2] && parts[3] && parts[4]) {
    const targetName = parts[2];
    const unitId = parts[3].toLowerCase();
    const amount = Number(parts[4]);
    if (isNaN(amount) || amount < 0) throw new Error('Montant invalide.');
    const account = getAccountByName(targetName);
    if (!account) throw new Error('Compte introuvable.');
    if (!account.profile.units.hasOwnProperty(unitId)) throw new Error('Unite invalide.');
    account.profile.units[unitId] = amount;
    account.updatedAt = Date.now();
    await saveStore();
    return { ok: true, message: `${unitId} de ${targetName} defini a ${amount}` };
  }
  
  // give xp <name> <amount>
  if (cmd === 'give' && parts[1] === 'xp' && parts[2] && parts[3]) {
    const targetName = parts[2];
    const amount = Number(parts[3]);
    if (isNaN(amount) || amount < 0) throw new Error('Montant invalide.');
    const account = getAccountByName(targetName);
    if (!account) throw new Error('Compte introuvable.');
    account.profile.xp += amount;
    account.updatedAt = Date.now();
    await saveStore();
    return { ok: true, message: `${amount} XP donne a ${targetName}` };
  }
  
  // reset all
  if (cmd === 'reset' && parts[1] === 'all') {
    store.accounts = {};
    store.sessions = {};
    store.clans = {};
    store.marketListings = [];
    ensureSeedAccount();
    await saveStore();
    return { ok: true, message: 'Tous les comptes reinitialises' };
  }
  
  // reset <name>
  if (cmd === 'reset' && parts[1]) {
    const targetName = parts[1];
    const account = getAccountByName(targetName);
    if (!account) throw new Error('Compte introuvable.');
    if (accountKey(account.name) === accountKey(SEED_ACCOUNT_NAME)) throw new Error('Impossible de reinitialiser le compte admin.');
    account.profile = defaultProfile(account.name);
    account.updatedAt = Date.now();
    await saveStore();
    return { ok: true, message: `Compte ${targetName} reinitialise` };
  }
  
  // delete <name>
  if (cmd === 'delete' && parts[1]) {
    const targetName = parts[1];
    const key = accountKey(targetName);
    if (key === accountKey(SEED_ACCOUNT_NAME)) throw new Error('Impossible de supprimer le compte admin.');
    if (!store.accounts[key]) throw new Error('Compte introuvable.');
    delete store.accounts[key];
    Object.keys(store.sessions).forEach(token => {
      if (store.sessions[token].name === targetName) delete store.sessions[token];
    });
    await saveStore();
    return { ok: true, message: `Compte ${targetName} supprime` };
  }
  
  // list accounts
  if (cmd === 'list' && parts[1] === 'accounts') {
    const accounts = Object.values(store.accounts).map(account => ({
      name: account.name,
      money: Math.round(account.profile.money),
      gems: account.profile.gems,
      level: account.profile.commanderLevel,
      power: computePower(account.profile),
      population: account.profile.population,
    })).sort((a, b) => b.power - a.power);
    return { ok: true, accounts };
  }
  
  // get <name>
  if (cmd === 'get' && parts[1]) {
    const targetName = parts[1];
    const account = getAccountByName(targetName);
    if (!account) throw new Error('Compte introuvable.');
    const profile = normalizeProfile(account.profile, account.name);
    return { ok: true, profile };
  }
  
  // wipe all
  if (cmd === 'wipe' && parts[1] === 'all') {
    store.accounts = {};
    store.sessions = {};
    store.clans = {};
    store.marketListings = [];
    ensureSeedAccount();
    await saveStore();
    return { ok: true, message: 'Tous les donnees supprimees, compte admin recree' };
  }
  
  // broadcast <message>
  if (cmd === 'broadcast' && parts[1]) {
    const message = parts.slice(1).join(' ');
    store.messages = store.messages || [];
    store.messages.push({
      id: crypto.randomBytes(8).toString('hex'),
      type: 'broadcast',
      sender: 'ADMIN',
      text: message,
      createdAt: Date.now(),
    });
    store.messages = store.messages.slice(-100);
    await saveStore();
    return { ok: true, message: `Broadcast envoye: ${message}` };
  }
  
  // event drop <amount>
  if (cmd === 'event' && parts[1] === 'drop' && parts[2]) {
    const amount = Number(parts[2]);
    if (isNaN(amount) || amount <= 0) throw new Error('Montant invalide.');
    store.events = store.events || [];
    store.events.push({
      id: crypto.randomBytes(8).toString('hex'),
      type: 'moneydrop',
      amount: amount,
      createdAt: Date.now(),
    });
    store.messages = store.messages || [];
    store.messages.push({
      id: crypto.randomBytes(8).toString('hex'),
      type: 'event',
      sender: 'SYSTÈME',
      text: `💰 Pluie d'argent! ${amount} trouvés par tous les joueurs connectés!`,
      createdAt: Date.now(),
    });
    await saveStore();
    return { ok: true, message: `Événement: ${amount} argent drop pour tous` };
  }
  
  // event gems <amount>
  if (cmd === 'event' && parts[1] === 'gems' && parts[2]) {
    const amount = Number(parts[2]);
    if (isNaN(amount) || amount <= 0) throw new Error('Montant invalide.');
    store.events = store.events || [];
    store.events.push({
      id: crypto.randomBytes(8).toString('hex'),
      type: 'gemsdrop',
      amount: amount,
      createdAt: Date.now(),
    });
    store.messages = store.messages || [];
    store.messages.push({
      id: crypto.randomBytes(8).toString('hex'),
      type: 'event',
      sender: 'SYSTÈME',
      text: `💎 Festival de gemmes! ${amount} gemmes pour tous!`,
      createdAt: Date.now(),
    });
    await saveStore();
    return { ok: true, message: `Événement: ${amount} gemmes drop pour tous` };
  }
  
  // event xp <amount>
  if (cmd === 'event' && parts[1] === 'xp' && parts[2]) {
    const amount = Number(parts[2]);
    if (isNaN(amount) || amount <= 0) throw new Error('Montant invalide.');
    store.events = store.events || [];
    store.events.push({
      id: crypto.randomBytes(8).toString('hex'),
      type: 'xpdrop',
      amount: amount,
      createdAt: Date.now(),
    });
    store.messages = store.messages || [];
    store.messages.push({
      id: crypto.randomBytes(8).toString('hex'),
      type: 'event',
      sender: 'SYSTÈME',
      text: `⚡ Surge d'expérience! ${amount} XP pour tous les commandants!`,
      createdAt: Date.now(),
    });
    await saveStore();
    return { ok: true, message: `Événement: ${amount} XP drop pour tous` };
  }
  
  // messages list
  if (cmd === 'messages' && parts[1] === 'list') {
    const messages = (store.messages || []).slice(-20);
    return { ok: true, messages };
  }
  
  // messages clear
  if (cmd === 'messages' && parts[1] === 'clear') {
    store.messages = [];
    await saveStore();
    return { ok: true, message: 'Messages effaces' };
  }
  
  // give factory <name> <factoryId> <amount>
  if (cmd === 'give' && parts[1] === 'factory' && parts[2] && parts[3] && parts[4]) {
    const targetName = parts[2];
    const factoryId = parts[3].toLowerCase();
    const amount = Number(parts[4]);
    if (isNaN(amount) || amount < 0) throw new Error('Montant invalide.');
    const account = getAccountByName(targetName);
    if (!account) throw new Error('Compte introuvable.');
    if (!account.profile.factories.hasOwnProperty(factoryId)) throw new Error('Usine invalide.');
    account.profile.factories[factoryId] += amount;
    account.updatedAt = Date.now();
    await saveStore();
    return { ok: true, message: `${amount}x usine ${factoryId} donnee a ${targetName}` };
  }
  
  // set bank <name> <amount>
  if (cmd === 'set' && parts[1] === 'bank' && parts[2] && parts[3]) {
    const targetName = parts[2];
    const amount = Number(parts[3]);
    if (isNaN(amount) || amount < 0) throw new Error('Montant invalide.');
    const account = getAccountByName(targetName);
    if (!account) throw new Error('Compte introuvable.');
    account.profile.bank.deposited = amount;
    account.updatedAt = Date.now();
    await saveStore();
    return { ok: true, message: `Banque de ${targetName} definie a ${amount}` };
  }
  
  // online count
  if (cmd === 'online') {
    const count = Object.keys(store.sessions).length;
    return { ok: true, online: count, message: `${count} joueurs connectes` };
  }
  
  // info <name>
  if (cmd === 'info' && parts[1]) {
    const targetName = parts[1];
    const account = getAccountByName(targetName);
    if (!account) throw new Error('Compte introuvable.');
    const profile = normalizeProfile(account.profile, account.name);
    return { 
      ok: true, 
      info: {
        name: account.name,
        createdAt: new Date(account.createdAt).toISOString(),
        updatedAt: new Date(account.updatedAt).toISOString(),
        money: Math.round(profile.money),
        gems: profile.gems,
        xp: profile.xp,
        level: profile.commanderLevel,
        prestige: profile.prestige,
        population: profile.population,
        power: computePower(profile),
        clan: profile.clan || 'aucun',
      }
    };
  }
  // sondage <question>|<choix1>|<choix2>|<choix3>
// sondage stop
if(cmd === 'sondage' && parts[1] === 'stop'){

  if(!store.poll)
    throw new Error("Aucun sondage actif.");


  store.poll.active = false;


  await saveStore();


  return {
    ok:true,
    message:"Sondage arrêté."
  };

}
  if (cmd === 'sondage') 

  const text = parts.slice(1).join(' ');

  const data = text.split('|');

  if(data.length < 3)
    throw new Error(
      'Utilisation: sondage Question|Choix1|Choix2|Choix3'
    );


  const question = data[0];

  const choices = data.slice(1);


  const pollId = crypto.randomBytes(8).toString('hex');

store.poll = {
  id: pollId,
  question,
  choices,
  votes:{},
  active:true,
  createdAt:Date.now(),
  endsAt:Date.now() + 15000
};
await saveStore();
setTimeout(async()=>{

  if(!store.poll || store.poll.id !== pollId)
    return;


  store.poll.active = false;


  const result = {};

  store.poll.choices.forEach(choice=>{
    result[choice] = 0;
  });


  Object.values(store.poll.votes || {}).forEach(vote=>{

    const index = Number(vote)-1;

    if(index >= 0 && index < store.poll.choices.length){

      result[store.poll.choices[index]]++;

    }

  });


  store.messages = store.messages || [];

  store.messages.push({

    id:crypto.randomBytes(8).toString('hex'),

    type:'poll_result',

    sender:'ADMIN',

    text:
      "📊 Résultat du sondage : " +
      store.poll.question +
      "\n" +
      Object.entries(result)
      .map(([k,v])=>`${k}: ${v} vote(s)`)
      .join("\n"),

    createdAt:Date.now()

  });


  await saveStore();


},15000);

  store.messages = store.messages || [];

  store.messages.push({
    id:crypto.randomBytes(8).toString('hex'),
    type:'poll',
    sender:'ADMIN',
    text:`📊 Sondage : ${question}`,
    poll:store.poll,
    createdAt:Date.now()
  });


  await saveStore();


  return {
    ok:true,
    message:"Sondage créé"
  };

if(!store.poll || !store.poll.active){
  return sendJson(res,400,{
    error:"Le sondage est terminé."
  });
}
// sondage result
if(cmd === 'sondage' && parts[1] === 'result'){

  if(!store.poll)
    throw new Error('Aucun sondage.');

  const results={};


  store.poll.choices.forEach(choice=>{
    results[choice]=0;
  });


  Object.values(store.poll.votes)
  .forEach(vote=>{

    const choice = store.poll.choices[vote-1];

    if(choice)
      results[choice]++;

  });


  return {
    ok:true,
    question:store.poll.question,
    results
  };

}
// stock get
if(cmd === 'stock' && parts[1] === 'get'){

  return {
    ok:true,
    stocks: store.stock || {}
  };

}


// stock reset
if(cmd === 'stock' && parts[1] === 'reset'){

  store.stock = {
    money:0,
    gems:0,
    infantry:0,
    armor:0,
    heavy:0,
    jet:0,
    carrier:0,
    drone:0,
    artillery:0,
    helicopter:0,
    submarine:0,
    missile:0
  };

  await saveStore();

  return {
    ok:true,
    message:"Stocks réinitialisés"
  };

}


// stock add resource amount
if(cmd === 'stock' && parts[1] === 'add' && parts[2] && parts[3]){

  const resource = parts[2];
  const amount = Number(parts[3]);

  if(isNaN(amount)) throw new Error("Montant invalide.");

  store.stock = store.stock || {};

  store.stock[resource] =
    (store.stock[resource] || 0) + amount;

  await saveStore();

  return {
    ok:true,
    message:`${amount} ${resource} ajouté`
  };

}


// stock remove
if(cmd === 'stock' && parts[1] === 'remove' && parts[2] && parts[3]){

  const resource = parts[2];
  const amount = Number(parts[3]);

  if(!store.stock || !store.stock[resource])
    throw new Error("Ressource inexistante.");

  store.stock[resource] -= amount;

  if(store.stock[resource] < 0)
    store.stock[resource]=0;

  await saveStore();

  return {
    ok:true,
    message:`${amount} ${resource} retiré`
  };

}


// stock fill
if(cmd === 'stock' && parts[1] === 'fill'){

  store.stock={
    money:999999,
    gems:999999,
    infantry:999999,
    armor:999999,
    heavy:999999,
    jet:999999,
    carrier:999999,
    drone:999999,
    artillery:999999,
    helicopter:999999,
    submarine:999999,
    missile:999999
  };

  await saveStore();

  return {
    ok:true,
    message:"Stocks remplis"
  };

}


// stock empty
if(cmd === 'stock' && parts[1] === 'empty'){

  store.stock={};

  await saveStore();

  return {
    ok:true,
    message:"Stocks vidés"
  };

}
// bonus money <name> <mult> <duration>
if(cmd === 'bonus' && parts[1] === 'money' && parts[2] && parts[3] && parts[4]){

  const targetName = parts[2];
  const mult = Number(parts[3]);
  const duration = Number(parts[4]);

  const account = getAccountByName(targetName);

  if(!account)
    throw new Error("Compte introuvable.");

  account.profile.bonus = account.profile.bonus || {};

  account.profile.bonus.money = {
    multiplier: mult,
    expires: Date.now() + duration * 1000
  };

  await saveStore();

  return {
    ok:true,
    message:`Bonus argent x${mult} activé pour ${targetName} (${duration}s)`
  };

}


// bonus xp <name> <mult> <duration>
if(cmd === 'bonus' && parts[1] === 'xp' && parts[2] && parts[3] && parts[4]){

  const targetName = parts[2];
  const mult = Number(parts[3]);
  const duration = Number(parts[4]);

  const account = getAccountByName(targetName);

  if(!account)
    throw new Error("Compte introuvable.");

  account.profile.bonus = account.profile.bonus || {};

  account.profile.bonus.xp = {
    multiplier: mult,
    expires: Date.now() + duration * 1000
  };

  await saveStore();

  return {
    ok:true,
    message:`Bonus XP x${mult} activé pour ${targetName} (${duration}s)`
  };

}


// bonus production <name> <mult> <duration>
if(cmd === 'bonus' && parts[1] === 'production' && parts[2] && parts[3] && parts[4]){

  const targetName = parts[2];
  const mult = Number(parts[3]);
  const duration = Number(parts[4]);

  const account = getAccountByName(targetName);

  if(!account)
    throw new Error("Compte introuvable.");

  account.profile.bonus = account.profile.bonus || {};

  account.profile.bonus.production = {
    multiplier: mult,
    expires: Date.now() + duration * 1000
  };

  await saveStore();

  return {
    ok:true,
    message:`Bonus production x${mult} activé pour ${targetName} (${duration}s)`
  };

}


// bonus remove <name>
if(cmd === 'bonus' && parts[1] === 'remove' && parts[2]){

  const targetName = parts[2];

  const account = getAccountByName(targetName);

  if(!account)
    throw new Error("Compte introuvable.");

  account.profile.bonus = {};

  await saveStore();

  return {
    ok:true,
    message:`Tous les bonus retirés à ${targetName}`
  };

}
// event start doublemoney
if(cmd === 'event' && parts[1] === 'start' && parts[2] === 'doublemoney'){

  store.globalEvent = {
    type:"doublemoney",
    multiplier:2,
    active:true,
    startedAt:Date.now()
  };

  store.messages = store.messages || [];

  store.messages.push({
    id:crypto.randomBytes(8).toString('hex'),
    type:"event",
    sender:"ADMIN",
    text:"💰 Événement : Argent x2 activé !",
    createdAt:Date.now()
  });

  await saveStore();

  return {
    ok:true,
    message:"Événement Double Argent activé"
  };

}


// event start doublexp
if(cmd === 'event' && parts[1] === 'start' && parts[2] === 'doublexp'){

  store.globalEvent = {
    type:"doublexp",
    multiplier:2,
    active:true,
    startedAt:Date.now()
  };

  store.messages = store.messages || [];

  store.messages.push({
    id:crypto.randomBytes(8).toString('hex'),
    type:"event",
    sender:"ADMIN",
    text:"⭐ Événement : XP x2 activé !",
    createdAt:Date.now()
  });

  await saveStore();

  return {
    ok:true,
    message:"Événement Double XP activé"
  };

}


// event start production
if(cmd === 'event' && parts[1] === 'start' && parts[2] === 'production'){

  store.globalEvent = {
    type:"production",
    multiplier:2,
    active:true,
    startedAt:Date.now()
  };

  store.messages = store.messages || [];

  store.messages.push({
    id:crypto.randomBytes(8).toString('hex'),
    type:"event",
    sender:"ADMIN",
    text:"🏭 Événement : Production x2 activée !",
    createdAt:Date.now()
  });

  await saveStore();

  return {
    ok:true,
    message:"Événement Production x2 activé"
  };

}


// event stop
if(cmd === 'event' && parts[1] === 'stop'){

  store.globalEvent = {
    active:false
  };

  store.messages = store.messages || [];

  store.messages.push({
    id:crypto.randomBytes(8).toString('hex'),
    type:"event",
    sender:"ADMIN",
    text:"⛔ Tous les événements sont arrêtés.",
    createdAt:Date.now()
  });


  await saveStore();

  return {
    ok:true,
    message:"Événements arrêtés"
  };

}

// motd <message>
if(cmd === 'motd' && parts[1]){

  const message = parts.slice(1).join(' ');

  store.motd = message;

  await saveStore();

  return {
    ok:true,
    message:`Message d'accueil défini : ${message}`
  };

}


  throw new Error('Commande inconnue. Voir le panneau admin pour la liste des commandes.');
}
async function checkPollAlert(){

    try{

        const res = await apiRequest("/api/poll");

        if(!res.poll || !res.poll.active)
            return;


        // éviter de remettre l'alerte en boucle
        const pollId = res.poll.id;

        if(localStorage.getItem("poll_seen_"+pollId))
            return;


        let text = "📊 Sondage\n\n";
        text += res.poll.question+"\n\n";


        res.poll.choices.forEach((choice,index)=>{

            text += `${index+1} - ${choice}\n`;

        });


        const answer = prompt(text);


        if(answer === null)
            return;


        const choice = Number(answer);


        if(
            !choice ||
            choice < 1 ||
            choice > res.poll.choices.length
        ){

            alert("Choix invalide");

            return;

        }


        await apiRequest("/api/poll/vote",{

            method:"POST",

            body:{
                choice
            }

        });


        localStorage.setItem(
            "poll_seen_"+pollId,
            "true"
        );


        alert("✅ Vote enregistré");


    }catch(e){

        console.log("Erreur sondage:",e);

    }

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

function getAccountByName(name) {
  return store.accounts[accountKey(name)] || null;
}

function getProfileForAccount(account) {
  if (!account) return null;
  const activeProfile = applyPassiveProgress(account.profile);
  account.profile = activeProfile;
  account.updatedAt = Date.now();
  return activeProfile;
}

async function upsertAccount(name, password) {
  const key = accountKey(name);
  if (store.accounts[key]) {
    const existing = store.accounts[key];
    const token = createSession(existing.name);
    getProfileForAccount(existing);
    await saveStore();
    return { token, profile: normalizeProfile(existing.profile, existing.name) };
  }
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
  await saveStore();
  return { token, profile: normalizeProfile(account.profile, account.name) };
}

async function loginAccount(name, password) {
  const key = accountKey(name);
  const account = store.accounts[key];
  if (!account) throw new Error('Compte introuvable.');
  const hash = hashPassword(password, account.salt);
  if (hash !== account.passwordHash) throw new Error('Mot de passe incorrect.');
  const token = createSession(account.name);
  getProfileForAccount(account);
  await saveStore();
  return { token, profile: normalizeProfile(account.profile, account.name) };
}

async function updateProfile(auth, body) {
  const account = auth.account;
  const source = body && typeof body === 'object' && body.profile && typeof body.profile === 'object'
    ? body.profile
    : body;
  const incoming = normalizeProfile(source || {}, account.name);
  incoming.name = account.name;
  incoming.lastTick = Number(incoming.lastTick) || Date.now();
  account.profile = incoming;
  account.updatedAt = Date.now();
  await saveStore();
  return normalizeProfile(account.profile, account.name);
}

async function updateClans(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Format de clan invalide.');
  store.clans = Object.fromEntries(Object.entries(body).map(([clanName, clan]) => [clanName, normalizeClan(clanName, clan)]));
  await saveStore();
  return store.clans;
}

function normalizeMarket() {
  store.marketListings = (store.marketListings || []).map(normalizeMarketListing);
}

async function addClanMessage(clanName, message, sender) {
  if (!store.clans[clanName]) throw new Error('Clan introuvable.');
  const clan = normalizeClan(clanName, store.clans[clanName]);
  clan.chat.push({
    id: crypto.randomBytes(8).toString('hex'),
    sender,
    text: String(message).slice(0, 200),
    createdAt: Date.now(),
  });
  clan.chat = clan.chat.slice(-40);
  store.clans[clanName] = clan;
  await saveStore();
  return store.clans;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const isHealthCheck = req.method === 'GET' && url.pathname === '/healthz';

    if (!isHealthCheck) {
      await ensureInitialized();
    }

    if (req.method === 'GET' && url.pathname === '/healthz') {
      return sendJson(res, 200, { status: 'ok' });
    }

    if (req.method === 'GET' && url.pathname === '/') {
      return sendFile(res, GAME_FILE, 'text/html; charset=utf-8');
    }

    if (req.method === 'GET' && url.pathname === '/api/me') {
      const auth = requireAuth(req);
      if (!auth) return sendJson(res, 401, { error: 'Non authentifie.' });
      const profile = getProfileForAccount(auth.account);
      await saveStore();
      return sendJson(res, 200, { profile: normalizeProfile(profile, auth.account.name) });
    }

    if (req.method === 'POST' && url.pathname === '/api/register') {
      const body = await readBody(req);
      const creds = validateCredentials(body || {});
      return sendJson(res, 200, await upsertAccount(creds.name, creds.password));
    }

    if (req.method === 'POST' && url.pathname === '/api/login') {
      const body = await readBody(req);
      const creds = validateCredentials(body || {});
      return sendJson(res, 200, await loginAccount(creds.name, creds.password));
    }

    if (req.method === 'PUT' && url.pathname === '/api/me') {
      const auth = requireAuth(req);
      if (!auth) return sendJson(res, 401, { error: 'Non authentifie.' });
      const body = await readBody(req);
      return sendJson(res, 200, { profile: await updateProfile(auth, body || {}) });
    }

    if (req.method === 'GET' && url.pathname === '/api/clans') {
      return sendJson(res, 200, { clans: store.clans });
    }

    if (req.method === 'PUT' && url.pathname === '/api/clans') {
      const auth = requireAuth(req);
      if (!auth) return sendJson(res, 401, { error: 'Non authentifie.' });
      const body = await readBody(req);
      return sendJson(res, 200, { clans: await updateClans(body || {}) });
    }

    if (req.method === 'GET' && url.pathname === '/api/clan-chat') {
      const clanName = String(url.searchParams.get('clan') || '');
      const clan = store.clans[clanName];
      if (!clan) return sendJson(res, 200, { messages: [] });
      return sendJson(res, 200, { messages: normalizeClan(clanName, clan).chat });
    }

    if (req.method === 'POST' && url.pathname === '/api/clan-chat') {
      const auth = requireAuth(req);
      if (!auth) return sendJson(res, 401, { error: 'Non authentifie.' });
      const body = await readBody(req);
      const clanName = String(body && body.clan ? body.clan : '');
      const text = String(body && body.text ? body.text : '').trim();
      if (!clanName || !text) return sendJson(res, 400, { error: 'Message invalide.' });
      const clan = store.clans[clanName];
      if (!clan) return sendJson(res, 404, { error: 'Clan introuvable.' });
      const normalized = normalizeClan(clanName, clan);
      normalized.chat.push({
        id: crypto.randomBytes(8).toString('hex'),
        sender: auth.account.name,
        text: text.slice(0, 200),
        createdAt: Date.now(),
      });
      normalized.chat = normalized.chat.slice(-40);
      store.clans[clanName] = normalized;
      await saveStore();
      return sendJson(res, 200, { messages: normalized.chat });
    }

    if (req.method === 'GET' && url.pathname === '/api/market') {
      normalizeMarket();
      return sendJson(res, 200, { listings: store.marketListings });
    }

    if (req.method === 'POST' && url.pathname === '/api/market/list') {
      const auth = requireAuth(req);
      if (!auth) return sendJson(res, 401, { error: 'Non authentifie.' });
      const body = await readBody(req);
      const kind = ['unit', 'gems', 'money'].includes(body && body.kind) ? body.kind : 'unit';
      const unitId = String(body && body.unitId ? body.unitId : 'infantry');
      const quantity = Math.max(1, Number(body && body.quantity) || 1);
      const price = Math.max(1, Number(body && body.price) || 1);
      const profile = auth.account.profile;
      if (kind === 'unit') {
        if (!profile.units[unitId] || profile.units[unitId] < quantity) return sendJson(res, 400, { error: 'Pas assez d’unités.' });
        profile.units[unitId] -= quantity;
      } else if (kind === 'gems') {
        if (profile.gems < quantity) return sendJson(res, 400, { error: 'Pas assez de gemmes.' });
        profile.gems -= quantity;
      } else if (kind === 'money') {
        if (profile.money < quantity) return sendJson(res, 400, { error: 'Pas assez d’argent.' });
        profile.money -= quantity;
      }
      store.marketListings.unshift(normalizeMarketListing({
        seller: auth.account.name,
        sellerKey: auth.key,
        kind,
        unitId,
        quantity,
        price,
      }));
      store.marketListings = store.marketListings.slice(0, 40);
      await saveStore();
      return sendJson(res, 200, { listings: store.marketListings });
    }

    if (req.method === 'POST' && url.pathname === '/api/market/buy') {
      const auth = requireAuth(req);
      if (!auth) return sendJson(res, 401, { error: 'Non authentifie.' });
      const body = await readBody(req);
      const listingId = String(body && body.id ? body.id : '');
      const index = store.marketListings.findIndex(item => item.id === listingId);
      if (index === -1) return sendJson(res, 404, { error: 'Annonce introuvable.' });
      const listing = normalizeMarketListing(store.marketListings[index]);
      if (auth.account.profile.money < listing.price) return sendJson(res, 400, { error: 'Pas assez d’argent.' });
      const sellerAccount = getAccountByName(listing.seller);
      if (!sellerAccount) return sendJson(res, 400, { error: 'Vendeur introuvable.' });
      const buyerProfile = auth.account.profile;
      const sellerProfile = sellerAccount.profile;
      buyerProfile.money -= listing.price;
      sellerProfile.money += listing.price;
      if (listing.kind === 'unit') {
        buyerProfile.units[listing.unitId] = (buyerProfile.units[listing.unitId] || 0) + listing.quantity;
      } else if (listing.kind === 'gems') {
        buyerProfile.gems += listing.quantity;
      } else if (listing.kind === 'money') {
        buyerProfile.money += listing.quantity;
      }
      store.marketListings.splice(index, 1);
      sellerAccount.updatedAt = Date.now();
      auth.account.updatedAt = Date.now();
      await saveStore();
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'DELETE' && url.pathname === '/api/market/cancel') {
      const auth = requireAuth(req);
      if (!auth) return sendJson(res, 401, { error: 'Non authentifie.' });
      const body = await readBody(req);
      const listingId = String(body && body.id ? body.id : '');
      const index = store.marketListings.findIndex(item => item.id === listingId && item.sellerKey === auth.key);
      if (index === -1) return sendJson(res, 404, { error: 'Annonce introuvable.' });
      const listing = normalizeMarketListing(store.marketListings[index]);
      if (listing.kind === 'unit') {
        auth.account.profile.units[listing.unitId] = (auth.account.profile.units[listing.unitId] || 0) + listing.quantity;
      } else if (listing.kind === 'gems') {
        auth.account.profile.gems += listing.quantity;
      } else if (listing.kind === 'money') {
        auth.account.profile.money += listing.quantity;
      }
      store.marketListings.splice(index, 1);
      await saveStore();
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && url.pathname === '/api/leaderboard') {
      return sendJson(res, 200, { entries: leaderboardEntries() });
    }

    if (req.method === 'POST' && url.pathname === '/api/admin/command') {
      const auth = requireAuth(req);
      if (!auth) return sendJson(res, 401, { error: 'Non authentifie.' });
      const body = await readBody(req);
      const command = String(body && body.command ? body.command : '').trim();
      try {
        const result = await executeAdminCommand(command, auth);
        return sendJson(res, 200, result);
      } catch (error) {
        return sendJson(res, 400, { error: error.message || 'Erreur de commande.' });
      }
    }
if (req.method === 'GET' && url.pathname === '/api/motd') {

  return sendJson(res,200,{
    motd: store.motd || ''
  });

}
    if (req.method === 'GET' && url.pathname === '/api/messages') {
      const messages = (store.messages || []).slice(-50);
      return sendJson(res, 200, { messages });
    }

    if (req.method === 'POST' && url.pathname === '/api/logout') {
      const auth = requireAuth(req);
      if (auth) {
        delete store.sessions[auth.token];
        await saveStore();
      }
      return sendJson(res, 200, { ok: true });
    }
// Voir le sondage actif
if (req.method === 'GET' && url.pathname === '/api/poll') {

  const poll = store.poll || null;

  return sendJson(res, 200, {
    poll
  });

} 
// sondage result
if(cmd === 'sondage' && parts[1] === 'result'){

  if(!store.poll)
    throw new Error('Aucun sondage.');

  const results={};


  store.poll.choices.forEach(choice=>{
    results[choice]=0;
  });


  Object.values(store.poll.votes)
  .forEach(vote=>{

    const choice = store.poll.choices[vote-1];

    if(choice)
      results[choice]++;

  });


  return {
    ok:true,
    question:store.poll.question,
    results
  };

}
    return sendJson(res, 404, { error: 'Route inconnue.' });
  } catch (error) {
    return sendJson(res, 400, { error: error.message || 'Erreur inconnue.' });
  }
});

ensureInitialized().catch((error) => {
  console.error('Initialisation de démarrage impossible:', error);
});

server.listen(PORT, () => {
  console.log(`Operation Acier en ligne sur http://localhost:${PORT}`);
});

process.on('SIGTERM', () => {
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  server.close(() => {
    process.exit(0);
  });
});