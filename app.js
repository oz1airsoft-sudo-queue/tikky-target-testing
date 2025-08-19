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
  { id: 'resistance', name: 'RESISTANCE', color: '#800080' },
  { id: 'militia', name: 'MILITIA', color: '#FFD700' }
];

let state = {
  teams: DEFAULT_TEAMS.map((t) => ({ ...t })),
  points: [],
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

function appendLog(line) {
  logBuffer += line + '\n';
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

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  localStorage.setItem(LOG_KEY, logBuffer);
}

function loadState() {
  const s = localStorage.getItem(STORAGE_KEY);
  if (s) {
    try {
      state = JSON.parse(s);
    } catch (e) {
      console.error('Failed to parse state', e);
    }
  }
  const l = localStorage.getItem(LOG_KEY);
  if (l) logBuffer = l;
}

function resetDefaults() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LOG_KEY);
  state = {
    teams: DEFAULT_TEAMS.map((t) => ({ ...t })),
    points: [],
    match: { state: 'idle', startedAt: null, pausedAt: null, totalPaused: 0, endedAt: null, scenarioId: null, operator: '' }
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
  // start segments for points with owners
  state.points.forEach((p) => {
    if (p.owner) {
      p.segments.push({ teamId: p.owner, startTs: now, endTs: null });
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
  state.teams = JSON.parse(JSON.stringify(sc.teams));
  state.points = sc.points.map((p) => ({ ...p, segments: [], owner: p.owner || null }));
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
  render();
  saveState();
}

// ---------- Rendering ----------
function renderSetup() {
  document.getElementById('operatorInput').value = state.match.operator;
  const teamList = document.getElementById('teamList');
  teamList.innerHTML = '';
  state.teams.forEach((t) => {
    const div = document.createElement('div');
    div.textContent = t.name;
    div.style.color = t.color;
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
      div.textContent = `${t.name}: ${formatDuration(totals[t.id])}`;
      div.style.color = t.color;
      timesWrap.appendChild(div);
    });
    card.appendChild(timesWrap);
    const ownerDisp = document.createElement('div');
    ownerDisp.className = 'owner-display';
    // neutral button
    const neutralBtn = document.createElement('button');
    neutralBtn.textContent = 'Neutral';
    neutralBtn.style.background = '#666';
    neutralBtn.addEventListener('click', () => setOwner(p.id, null));
    ownerDisp.appendChild(neutralBtn);
    state.teams.forEach((t) => {
      const btn = document.createElement('button');
      btn.textContent = t.name;
      btn.style.background = t.color;
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
    div.textContent = `${t.name}: ${formatDuration(totals[t.id])}`;
    div.style.color = t.color;
    totalsEl.appendChild(div);
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
    state.teams.push({ id: uuid(), name, color });
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
  document.getElementById('operatorInput').addEventListener('change', applySetup);
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
    }
  }, 1000);
}

document.addEventListener('DOMContentLoaded', initApp);
