// Simple Multi-Point Capture Counter
// Stores state in localStorage and logs events to text buffer

const STORAGE_KEY = 'capture_counter_state_v1';
const LOG_KEY = 'capture_counter_log_v1';

const scenarios = [
  {
    id: 'domination',
    name: 'Domination (3 points: A/B/C, 2 teams)',
    teams: [
      { id: 'red', name: 'Red', color: '#d23' },
      { id: 'blue', name: 'Blue', color: '#239' }
    ],
    points: [
      { id: 'a', label: 'A', owner: null },
      { id: 'b', label: 'B', owner: null },
      { id: 'c', label: 'C', owner: null }
    ]
  },
  {
    id: 'king',
    name: 'King of the Hill (1 point: Hilltop, 3 teams)',
    teams: [
      { id: 'red', name: 'Red', color: '#d23' },
      { id: 'blue', name: 'Blue', color: '#239' },
      { id: 'green', name: 'Green', color: '#2a2' }
    ],
    points: [
      { id: 'hill', label: 'Hilltop', owner: null }
    ]
  },
  {
    id: 'five',
    name: 'Five Flags (A–E, 2 teams)',
    teams: [
      { id: 'red', name: 'Red', color: '#d23' },
      { id: 'blue', name: 'Blue', color: '#239' }
    ],
    points: [
      { id: 'a', label: 'A', owner: null },
      { id: 'b', label: 'B', owner: null },
      { id: 'c', label: 'C', owner: null },
      { id: 'd', label: 'D', owner: null },
      { id: 'e', label: 'E', owner: null }
    ]
  }
];

const DEFAULT_TEAMS = [
  { id: 'resistance', name: 'RESISTANCE', color: '#ff00ff' },
  { id: 'militia', name: 'MILITIA', color: '#FFD700' }
];

const DEFAULT_POINTS = [
  { id: 'security-depot', label: 'Security Depot' },
  { id: 'church-ruins', label: 'Church Ruins' },
  { id: 'fort-keith', label: 'FORT Keith' },
  { id: 'necropolis', label: 'Necropolis (Cemetary Gates)' },
  { id: 'forest-hill', label: 'Forest Hill' },
  { id: 'ranch', label: 'Ranch' },
  { id: 'oilfields', label: 'Oilfields' },
  { id: 'tank-city', label: 'Tank City' },
  { id: 'fort-caley', label: 'FORT Caley' },
  { id: 'fort-alastair', label: 'FORT Alastair' },
  { id: 'fort-kurtis', label: 'FORT Kurtis' },
  { id: 'citadel', label: 'Citadel' },
  { id: 'shelter', label: 'SHELTER' },
  { id: 'bunker', label: 'BUNKER' },
  { id: 'crash-site', label: 'CRASH SITE' }
];

const CARD_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const CARD_SUITS = [
  { code: 'H', teamId: 'militia', color: 'red' },
  { code: 'D', teamId: 'militia', color: 'red' },
  { code: 'S', teamId: 'resistance', color: 'black' },
  { code: 'C', teamId: 'resistance', color: 'black' }
];

const CASH_PER_MINUTE = 20;

function generateCardDeck() {
  const cards = [];
  CARD_SUITS.forEach((s) =>
    CARD_RANKS.forEach((r) =>
      cards.push({ id: r + s.code, teamId: s.teamId, claimed: false })
    )
  );
  cards.push({ id: 'JOKER_M', teamId: 'militia', claimed: false });
  cards.push({ id: 'JOKER_R', teamId: 'resistance', claimed: false });
  return cards;
}

let state = {

  teams: DEFAULT_TEAMS.map((t) => ({
    ...t,
    cash: 0,
    chips: 0,
    cards: [],
    lastCapture: null,
    cashStart: 0
  })),
  points: DEFAULT_POINTS.map((p) => ({ ...p, owner: null, segments: [] })),
  cards: generateCardDeck(),

  match: {
    state: 'idle',
    startedAt: null,
    pausedAt: null,
    totalPaused: 0,
    endedAt: null,
    scenarioId: null,
    operator: ''
  },
  googleSheetUrl: ''
};
let logBuffer = '';

// ---------- Utility Functions ----------
function uuid() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function nowIso() {
  const d = new Date();
  const tz = -d.getTimezoneOffset();
  const sign = tz >= 0 ? '+' : '-';
  const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const offset = sign + pad(tz / 60) + ':' + pad(tz % 60);
  return d.toISOString().replace('Z', offset);
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (h > 0 ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
}

function formatTimestampParts(ts) {
  if (!ts) return { military: '', standard: '' };
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const military = hh + mm;
  let h12 = d.getHours() % 12;
  h12 = h12 === 0 ? 12 : h12;
  const standard = `${String(h12).padStart(2, '0')}:${mm} ${d.getHours() >= 12 ? 'PM' : 'AM'}`;
  return { military, standard };
}

function formatTimestamp(ts) {
  if (!ts) return '-- (--:-- --)';
  const { military, standard } = formatTimestampParts(ts);
  return `${military} (${standard})`;
}

function getMatchElapsed() {
  if (!state.match.startedAt) return 0;
  const ref =
    state.match.state === 'ended'
      ? state.match.endedAt || Date.now()
      : state.match.state === 'paused'
      ? state.match.pausedAt
      : Date.now();
  return ref - state.match.startedAt - state.match.totalPaused;
}

function getContrastColor(hex) {
  if (!hex) return '#000';
  const c = hex.replace('#', '');
  const r = parseInt(c.length === 3 ? c[0] + c[0] : c.slice(0, 2), 16);
  const g = parseInt(c.length === 3 ? c[1] + c[1] : c.slice(2, 4), 16);
  const b = parseInt(c.length === 3 ? c[2] + c[2] : c.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000' : '#fff';
}

function getTeamCash(team) {
  const manual = team.cash || 0;
  const start = team.cashStart || 0;
  const elapsed = Math.max(0, getMatchElapsed() - start);
  const auto = Math.floor(elapsed / (60000 / CASH_PER_MINUTE));
  return manual + auto;
}

function currencySnapshot() {
  return state.teams
    .map((t) => {
      const cards = (t.cards || []).join(',');
      return `${t.name} cash=${getTeamCash(t)} chips=${t.chips || 0} cards=${cards}`;
    })
    .join(' | ');
}

function appendLog(line) {
  line += ' | ' + currencySnapshot();
  logBuffer += line + '\n';
  if (state.googleSheetUrl) {
    fetch(state.googleSheetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ line })
    }).catch((err) => console.error('Failed to export to Google Sheet', err));
  }
  saveState();
}

function addCash(teamId, amount, reason = 'MANUAL') {
  const team = getTeam(teamId);
  if (!team) return;
  team.cash = (team.cash || 0) + amount;
  appendLog(`${nowIso()} | CASH | team=${team.name} | delta=${amount} | reason=${reason}`);
  renderCurrency();
  saveState();
}

function addChips(teamId, amount) {
  const team = getTeam(teamId);
  if (!team) return;
  team.chips = (team.chips || 0) + amount;
  appendLog(`${nowIso()} | CHIPS | team=${team.name} | delta=${amount}`);
  renderCurrency();
  saveState();
}

function toggleCard(cardId) {
  const card = state.cards.find((c) => c.id === cardId);
  if (!card) return;
  const team = getTeam(card.teamId);
  card.claimed = !card.claimed;
  if (card.claimed) {
    if (!team.cards.includes(card.id)) team.cards.push(card.id);
  } else {
    team.cards = team.cards.filter((id) => id !== card.id);
  }
  appendLog(`${nowIso()} | CARD | team=${team.name} | card=${card.id} | action=${card.claimed ? 'add' : 'remove'}`);
  renderCardsBar();
  renderCurrency();
  saveState();
}

function downloadLog() {
  const blob = new Blob([logBuffer], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'capture-log.txt';
  a.click();
  URL.revokeObjectURL(url);
}

function downloadCsv() {
  const lines = ['timestampISO,timestamp24,timestamp12,event,details'];
  logBuffer
    .trim()
    .split(/\n/)
    .forEach((line) => {
      if (!line) return;
      const parts = line.split('|').map((s) => s.trim());
      const iso = parts.shift();
      const event = parts.shift() || '';
      const details = parts.join(' | ').replace(/,/g, ';');
      const ts = Date.parse(iso);
      const { military, standard } = formatTimestampParts(ts);
      lines.push(`${iso},${military},${standard},${event},${details}`);
    });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'capture-log.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function importCsv(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result.trim();
    const lines = text.split(/\n/);
    lines.shift();
    logBuffer = lines
      .filter((l) => l)
      .map((l) => {
        const [iso, , , event, details] = l.split(',');
        return `${iso} | ${event} | ${details.replace(/;/g, ',')}`;
      })
      .join('\n');
    saveState();
  };
  reader.readAsText(file);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  localStorage.setItem(LOG_KEY, logBuffer);
}

function loadState() {
  const s = localStorage.getItem(STORAGE_KEY);
  if (s) {
    try {
      state = JSON.parse(s);
      if (state.match && typeof state.match.cashMinutes !== 'undefined') {
        delete state.match.cashMinutes;
      }
      state.teams.forEach((t) => {
        if (typeof t.lastCapture === 'undefined') t.lastCapture = null;
        if (typeof t.cash === 'undefined') t.cash = 0;
        if (typeof t.chips === 'undefined') t.chips = 0;
        if (!t.cards) t.cards = [];
        if (typeof t.cashStart === 'undefined') t.cashStart = 0;
      });
      if (!state.cards) state.cards = generateCardDeck();
    } catch (e) {
      console.error('Failed to parse state', e);
    }
  }
  if (!state.googleSheetUrl) state.googleSheetUrl = '';
  const l = localStorage.getItem(LOG_KEY);
  if (l) logBuffer = l;
}

function resetDefaults() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LOG_KEY);
  state = {

    teams: DEFAULT_TEAMS.map((t) => ({
      ...t,
      cash: 0,
      chips: 0,
      cards: [],
      lastCapture: null,
      cashStart: 0
    })),

    points: DEFAULT_POINTS.map((p) => ({ ...p, owner: null, segments: [] })),
    cards: generateCardDeck(),

    match: {
      state: 'idle',
      startedAt: null,
      pausedAt: null,
      totalPaused: 0,
      endedAt: null,
      scenarioId: null,
      operator: ''
    }
  };
  logBuffer = '';
  render();
}

// ---------- Team & Point Helpers ----------
function getTeam(id) {
  return state.teams.find((t) => t.id === id);
}

function getPoint(id) {
  return state.points.find((p) => p.id === id);
}

function setOwner(pointId, teamId) {
  const point = getPoint(pointId);
  const from = point.owner;
  if (from === teamId) return;
  const now = Date.now();
  // close current segment
  if (point.owner) {
    const seg = point.segments[point.segments.length - 1];
    if (seg && !seg.endTs) seg.endTs = now;
  }
  point.owner = teamId;
  if (teamId && state.match.state === 'running') {
    point.segments.push({ teamId, startTs: now, endTs: null });
    const team = getTeam(teamId);
    if (team) team.lastCapture = now;
  }
  appendLog(`${nowIso()} | CAPTURE | point=${point.label} | from=${from ? getTeam(from).name : 'Neutral'} | to=${teamId ? getTeam(teamId).name : 'Neutral'} | actor=${state.match.operator}`);
  render();
  saveState();
}

function getTeamTotals() {
  const totals = {};
  state.teams.forEach((t) => (totals[t.id] = 0));
  const now = Date.now();
  state.points.forEach((p) => {
    p.segments.forEach((s) => {
      const end = s.endTs || now;
      totals[s.teamId] += end - s.startTs;
    });
  });
  return totals;
}

// ---------- Match Controls ----------
function startMatch() {
  if (state.match.state !== 'idle') return;
  const now = Date.now();
  state.match.state = 'running';
  state.match.startedAt = now;
  state.match.totalPaused = 0;
  state.match.endedAt = null;
  state.teams.forEach((t) => (t.cashStart = 0));
  // start segments for points with owners
  state.points.forEach((p) => {
    if (p.owner) {
      p.segments.push({ teamId: p.owner, startTs: now, endTs: null });
      const team = getTeam(p.owner);
      if (team) team.lastCapture = now;
    }
  });
  appendLog(`${nowIso()} | START | operator=${state.match.operator} | scenario=${state.match.scenarioId || 'custom'}`);
  render();
  saveState();
}

function pauseMatch() {
  if (state.match.state !== 'running') return;
  const now = Date.now();
  state.match.state = 'paused';
  state.match.pausedAt = now;
  // close segments
  state.points.forEach((p) => {
    if (p.owner) {
      const seg = p.segments[p.segments.length - 1];
      if (seg && !seg.endTs) seg.endTs = now;
    }
  });
  appendLog(`${nowIso()} | PAUSE`);
  render();
  saveState();
}

function resumeMatch() {
  if (state.match.state !== 'paused') return;
  const now = Date.now();
  state.match.state = 'running';
  state.match.totalPaused += now - state.match.pausedAt;
  state.match.pausedAt = null;
  // reopen segments
  state.points.forEach((p) => {
    if (p.owner) {
      p.segments.push({ teamId: p.owner, startTs: now, endTs: null });
    }
  });
  appendLog(`${nowIso()} | RESUME`);
  render();
  saveState();
}

function endMatch() {
  if (state.match.state === 'ended' || state.match.state === 'idle') return;
  const now = Date.now();
  if (state.match.state === 'running') {
    // close segments
    state.points.forEach((p) => {
      if (p.owner) {
        const seg = p.segments[p.segments.length - 1];
        if (seg && !seg.endTs) seg.endTs = now;
      }
    });
  }
  if (state.match.state === 'paused') {
    state.match.totalPaused += now - state.match.pausedAt;
    state.match.pausedAt = null;
  }
  state.match.state = 'ended';
  state.match.endedAt = now;
  appendLog(`${nowIso()} | END`);
  // summary
  const totals = getTeamTotals();
  const totalMatchTime = now - state.match.startedAt - state.match.totalPaused;
  appendLog(
    `${nowIso()} | SUMMARY | total=${Math.round(totalMatchTime / 60000)}m | teams=[${state.teams
      .map((t) => t.name)
      .join(',')}] | points=[${state.points.map((p) => p.label).join(',')}]`
  );
  state.teams.forEach((t) => {
    const perPoint = state.points
      .map((p) => {
        const time = p.segments
          .filter((s) => s.teamId === t.id)
          .reduce((a, s) => a + (s.endTs - s.startTs), 0);
        return `${p.label}=${Math.round(time / 60000)}m`;
      })
      .join(', ');
    appendLog(`${t.name}: ${perPoint}, Overall=${Math.round(totals[t.id] / 60000)}m`);
  });
  render();
  saveState();
}

function resetMatch() {
  if (!confirm('Reset match and clear logs?')) return;
  resetDefaults();
}

// ---------- Scenario & Setup ----------
function loadScenario(id) {
  const sc = scenarios.find((s) => s.id === id);
  if (!sc) return;
  state.teams = sc.teams.map((t) => ({
    ...t,
    lastCapture: null,
    cash: 0,
    chips: 0,
    cards: [],
    cashStart: 0
  }));
  state.points = sc.points.map((p) => ({ ...p, segments: [], owner: p.owner || null }));
  state.cards = generateCardDeck();
  state.match.scenarioId = sc.id;
  state.match.state = 'idle';
  state.match.startedAt = null;
  state.match.pausedAt = null;
  state.match.totalPaused = 0;
  state.match.endedAt = null;
  appendLog(`${nowIso()} | SCENARIO | id=${sc.name}`);
  render();
  saveState();
}

function applySetup() {
  state.match.operator = document.getElementById('operatorInput').value.trim();
  state.googleSheetUrl = document.getElementById('googleSheetUrl').value.trim();
  render();
  saveState();
}

// ---------- Rendering ----------
function renderSetup() {
  document.getElementById('operatorInput').value = state.match.operator;
  document.getElementById('googleSheetUrl').value = state.googleSheetUrl || '';
  const teamList = document.getElementById('teamList');
  teamList.innerHTML = '';
  state.teams.forEach((t) => {
    const div = document.createElement('div');
    div.textContent = t.name;
    div.style.borderLeft = `4px solid ${t.color}`;
    div.style.paddingLeft = '0.25rem';
    const del = document.createElement('button');
    del.textContent = 'x';
    del.addEventListener('click', () => {
      state.teams = state.teams.filter((tt) => tt.id !== t.id);
      render();
      saveState();
    });
    div.appendChild(del);
    teamList.appendChild(div);
  });
  const pointList = document.getElementById('pointList');
  pointList.innerHTML = '';
  state.points.forEach((p) => {
    const div = document.createElement('div');
    div.textContent = p.label;
    const del = document.createElement('button');
    del.textContent = 'x';
    del.addEventListener('click', () => {
      state.points = state.points.filter((pp) => pp.id !== p.id);
      render();
      saveState();
    });
    div.appendChild(del);
    pointList.appendChild(div);
  });
  // scenario options
  const sel = document.getElementById('scenarioSelect');
  sel.innerHTML = '<option value="">--Choose--</option>';
  scenarios.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    sel.appendChild(opt);
  });
}

function renderDashboard() {
  const dash = document.getElementById('dashboard');
  dash.innerHTML = '';
  const now = Date.now();
  state.points.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'point-card';
    const borderColor = p.owner ? getTeam(p.owner).color : '#ccc';
    card.style.borderColor = borderColor;
    const ownerName = p.owner ? getTeam(p.owner).name : 'Neutral';
    const ownerEl = document.createElement('div');
    ownerEl.className = 'owner ' + (p.owner ? '' : 'none');
    ownerEl.textContent = ownerName;
    card.appendChild(document.createElement('div')).textContent = p.label;
    card.appendChild(ownerEl);
    // elapsed time for current owner (since last capture)
    let time = 0;
    if (p.owner) {
      for (let i = p.segments.length - 1; i >= 0; i--) {
        const seg = p.segments[i];
        if (seg.teamId !== p.owner) break;
        const end = seg.endTs || now;
        time += end - seg.startTs;
      }
    }
    const timeEl = document.createElement('div');
    timeEl.textContent = formatDuration(time);
    card.appendChild(timeEl);

    // total times per team on this point
    const totals = {};
    state.teams.forEach((t) => (totals[t.id] = 0));
    p.segments.forEach((s) => {
      const end = s.endTs || now;
      totals[s.teamId] += end - s.startTs;
    });
    const timesWrap = document.createElement('div');
    timesWrap.className = 'team-times';
    state.teams.forEach((t) => {
      const div = document.createElement('div');
      const lastSeg = [...p.segments]
        .filter((s) => s.teamId === t.id)
        .slice(-1)[0];
      const lastTs = lastSeg ? lastSeg.startTs : null;
      div.textContent = `${t.name}: ${formatDuration(totals[t.id])} - ${formatTimestamp(lastTs)}`;
      div.style.borderLeft = `4px solid ${t.color}`;
      div.style.paddingLeft = '0.25rem';
      timesWrap.appendChild(div);
    });
    card.appendChild(timesWrap);
    const ownerDisp = document.createElement('div');
    ownerDisp.className = 'owner-display';
    // neutral button
    const neutralBtn = document.createElement('button');
    neutralBtn.textContent = 'Neutral';
    neutralBtn.style.background = '#666';
    neutralBtn.style.color = getContrastColor('#666');
    neutralBtn.addEventListener('click', () => setOwner(p.id, null));
    ownerDisp.appendChild(neutralBtn);
    state.teams.forEach((t) => {
      const btn = document.createElement('button');
      btn.textContent = t.name;
      btn.style.background = t.color;
       btn.style.color = getContrastColor(t.color);
      btn.addEventListener('click', () => setOwner(p.id, t.id));
      ownerDisp.appendChild(btn);
    });
    card.appendChild(ownerDisp);
    dash.appendChild(card);
  });
}

function renderTotals() {
  const totalsEl = document.getElementById('totals');
  totalsEl.innerHTML = '';
  const totals = getTeamTotals();
  state.teams.forEach((t) => {
    const div = document.createElement('div');
    div.className = 'team-total';
    div.textContent = `${t.name}: ${formatDuration(totals[t.id])} - ${formatTimestamp(t.lastCapture)}`;
    div.style.borderLeft = `4px solid ${t.color}`;
    div.style.paddingLeft = '0.5rem';
    totalsEl.appendChild(div);
  });
}

function renderCurrency() {
  const cont = document.getElementById('currencyCounters');
  if (!cont) return;
  cont.innerHTML = '';
  state.teams.forEach((t) => {
    const wrap = document.createElement('div');
    wrap.className = 'currency-team';
    wrap.style.borderLeft = `4px solid ${t.color}`;

    const cashRow = document.createElement('div');
    cashRow.textContent = `Cash: $${getTeamCash(t)}`;
    [10, 100, -10, -100].forEach((amt) => {
      const btn = document.createElement('button');
      btn.textContent = (amt > 0 ? '+' : '') + amt;
      btn.addEventListener('click', () => addCash(t.id, amt));
      cashRow.appendChild(btn);
    });
    wrap.appendChild(cashRow);

    const chipRow = document.createElement('div');
    chipRow.textContent = `Chips: ${t.chips || 0}`;
    [1, 10, 100, -1, -10, -100].forEach((amt) => {
      const btn = document.createElement('button');
      btn.textContent = (amt > 0 ? '+' : '') + amt;
      btn.addEventListener('click', () => addChips(t.id, amt));
      chipRow.appendChild(btn);
    });
    wrap.appendChild(chipRow);

    cont.appendChild(wrap);
  });
}

function renderCardsBar() {
  const bar = document.getElementById('cardBar');
  if (!bar) return;
  bar.innerHTML = '';
  state.cards.forEach((c, idx) => {
    const btn = document.createElement('button');
    btn.textContent = c.id.replace('JOKER_', 'J');
    btn.className = c.claimed ? 'claimed' : '';
    btn.style.color = c.teamId === 'militia' ? 'red' : 'black';
    btn.addEventListener('click', () => toggleCard(c.id));
    bar.appendChild(btn);
    if ((idx + 1) % 13 === 0 && idx < state.cards.length - 1) {
      const sep = document.createElement('hr');
      sep.className = 'card-separator';
      bar.appendChild(sep);
    }
  });
}

function renderMatchControls() {
  document.getElementById('matchStatus').textContent = state.match.state.toUpperCase();
  document.getElementById('startBtn').disabled = state.match.state !== 'idle';
  document.getElementById('pauseBtn').disabled = state.match.state !== 'running';
  document.getElementById('resumeBtn').disabled = state.match.state !== 'paused';
  document.getElementById('endBtn').disabled =
    state.match.state === 'idle' || state.match.state === 'ended';
}

function renderGlobalTimer() {
  const el = document.getElementById('globalTimer');
  if (el) el.textContent = formatDuration(getMatchElapsed());
}

function render() {
  renderSetup();
  renderDashboard();
  renderTotals();
  renderCardsBar();
  renderCurrency();
  renderMatchControls();
  renderGlobalTimer();
}

// ---------- Initialization ----------
function initApp() {
  loadState();
  // attach events
  document.getElementById('addTeamBtn').addEventListener('click', () => {
    const name = document.getElementById('newTeamName').value.trim();
    const color = document.getElementById('newTeamColor').value;
    if (!name) return;
    state.teams.push({
      id: uuid(),
      name,
      color,
      lastCapture: null,
      cash: 0,
      chips: 0,
      cards: [],
      cashStart: getMatchElapsed()
    });
    document.getElementById('newTeamName').value = '';
    render();
    saveState();
  });
  document.getElementById('addPointBtn').addEventListener('click', () => {
    const label = document.getElementById('newPointLabel').value.trim();
    if (!label) return;
    state.points.push({ id: uuid(), label, owner: null, segments: [] });
    document.getElementById('newPointLabel').value = '';
    render();
    saveState();
  });
  document.getElementById('setupToggle').addEventListener('click', () => {
    document.getElementById('setupView').classList.toggle('hidden');
  });
  document.getElementById('closeSetupBtn').addEventListener('click', () => {
    document.getElementById('setupView').classList.add('hidden');
    applySetup();
  });
  document.getElementById('resetDefaultsBtn').addEventListener('click', resetDefaults);
  document.getElementById('loadScenarioBtn').addEventListener('click', () => {
    const id = document.getElementById('scenarioSelect').value;
    if (id) loadScenario(id);
  });
  document.getElementById('startBtn').addEventListener('click', startMatch);
  document.getElementById('pauseBtn').addEventListener('click', pauseMatch);
  document.getElementById('resumeBtn').addEventListener('click', resumeMatch);
  document.getElementById('endBtn').addEventListener('click', endMatch);
  document.getElementById('resetBtn').addEventListener('click', resetMatch);
  document.getElementById('downloadLogBtn').addEventListener('click', downloadLog);
  document.getElementById('exportCsvBtn').addEventListener('click', downloadCsv);
  document.getElementById('importCsvBtn').addEventListener('click', () =>
    document.getElementById('importCsvFile').click()
  );
  document.getElementById('importCsvFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importCsv(file);
  });
  document.getElementById('operatorInput').addEventListener('change', applySetup);
  document.getElementById('googleSheetUrl').addEventListener('change', applySetup);
  document.getElementById('highContrastToggle').addEventListener('click', () => {
    document.body.classList.toggle('high-contrast');
  });
  // key shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (state.match.state === 'idle') startMatch();
      else if (state.match.state === 'running') pauseMatch();
      else if (state.match.state === 'paused') resumeMatch();
    }
    if (e.key === 'e') endMatch();
    if (e.key === 'l') downloadLog();
  });
  render();
  setInterval(() => {
    if (state.match.state === 'running') {
      renderDashboard();
      renderTotals();
      renderGlobalTimer();
      renderCurrency();
    }
  }, 1000);
}

document.addEventListener('DOMContentLoaded', initApp);
