const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function waitForServer(url, timeoutMs = 5000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      fetch(url)
        .then(() => resolve())
        .catch(() => {
          if (Date.now() - started > timeoutMs) {
            reject(new Error(`Server did not become ready at ${url}`));
            return;
          }
          setTimeout(attempt, 100);
        });
    };
    attempt();
  });
}

test('health endpoint responds during startup', async () => {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname + '/..',
    env: { ...process.env, PORT: '3101' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  try {
    await waitForServer('http://127.0.0.1:3101/healthz');
    const response = await fetch('http://127.0.0.1:3101/healthz');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, { status: 'ok' });
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
  }
});

test('register endpoint works without a database connection', async () => {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname + '/..',
    env: { ...process.env, PORT: '3102', DATABASE_URL: 'postgres://invalid:invalid@localhost:5432/invalid' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  try {
    await waitForServer('http://127.0.0.1:3102/healthz');
    const uniqueName = `TestUser${String(Date.now()).slice(-6)}`;
    const response = await fetch('http://127.0.0.1:3102/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: uniqueName, password: 'secret123' }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(body.token);
    assert.equal(body.profile.name, uniqueName);
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
  }
});

test('seed accounts are created and excluded from the leaderboard', async () => {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname + '/..',
    env: { ...process.env, PORT: '3103' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForServer('http://127.0.0.1:3103/healthz');
    const loginResponse = await fetch('http://127.0.0.1:3103/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'GalacticGogo9', password: 'Gogo2026!' }),
    });
    assert.equal(loginResponse.status, 200);

    const leaderboardResponse = await fetch('http://127.0.0.1:3103/api/leaderboard');
    assert.equal(leaderboardResponse.status, 200);
    const leaderboard = await leaderboardResponse.json();
    assert.ok(!leaderboard.entries.some((entry) => entry.name === 'GalacticGogo9'));
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
  }
});

test('startup removes test accounts from persisted state and leaderboard', async () => {
  const repoRoot = path.join(__dirname, '..');
  const dataPath = path.join(repoRoot, 'data.json');
  const originalData = fs.readFileSync(dataPath, 'utf8');

  try {
    fs.writeFileSync(dataPath, JSON.stringify({
      accounts: {
        testuser: {
          name: 'TestUser',
          salt: 'test-salt',
          passwordHash: 'test-hash',
          profile: {
            name: 'TestUser',
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
            levelsCompleted: Array(20).fill(false),
            questsClaimed: {},
            lastTick: Date.now(),
          },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      },
      clans: {},
      sessions: {},
      marketListings: [],
    }, null, 2));

    const child = spawn(process.execPath, ['server.js'], {
      cwd: repoRoot,
      env: { ...process.env, PORT: '3104' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    try {
      await waitForServer('http://127.0.0.1:3104/healthz');
      const leaderboardResponse = await fetch('http://127.0.0.1:3104/api/leaderboard');
      assert.equal(leaderboardResponse.status, 200);
      const leaderboard = await leaderboardResponse.json();
      assert.ok(!leaderboard.entries.some((entry) => entry.name === 'TestUser'));

      const persisted = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      assert.equal(persisted.accounts.testuser, undefined);
      assert.equal(persisted.accounts.galacticgogo9 && persisted.accounts.galacticgogo9.profile.hideFromLeaderboard, true);
    } finally {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('exit', resolve));
    }
  } finally {
    fs.writeFileSync(dataPath, originalData);
  }
});
