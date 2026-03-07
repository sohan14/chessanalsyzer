'use strict';
// ============================================================
// Chess Analyzer -- Main App Controller
// Multi-screen SPA with full analysis, report, puzzle modes
// ============================================================
(function () {

// ---- Constants ----
const GLYPHS = ['', '\u2659','\u2658','\u2657','\u2656','\u2655','\u2654', '\u265F','\u265E','\u265D','\u265C','\u265B','\u265A'];
const CLS_META = {
    brilliant:  {sym:'\u2726', label:'Brilliant',   color:'#22d1e5'},
    great:      {sym:'!',      label:'Great',       color:'#76c442'},
    best:       {sym:'\u2713', label:'Best',        color:'#7ec86d'},
    excellent:  {sym:'\u2605', label:'Excellent',    color:'#96bc4b'},
    good:       {sym:'\u00B7', label:'Good',        color:'#a0a0a0'},
    book:       {sym:'\u{1F4D6}',label:'Book',      color:'#c8a97e'},
    inaccuracy: {sym:'?!',     label:'Inaccuracy',  color:'#f0c040'},
    mistake:    {sym:'?',      label:'Mistake',     color:'#e57220'},
    blunder:    {sym:'??',     label:'Blunder',     color:'#ca3431'}
};
const DAILY_TIPS = [
    "Always look for checks, captures, and threats before making your move.",
    "In the opening, develop your knights and bishops before moving the same piece twice.",
    "Castle early to protect your king and connect your rooks.",
    "Control the center with pawns and pieces -- it gives your pieces more mobility.",
    "A knight on the rim is dim -- knights are strongest in the center.",
    "Rooks belong on open files. Double them for maximum power.",
    "Before making a move, ask yourself: what is my opponent threatening?",
    "In the endgame, activate your king -- it becomes a fighting piece.",
    "Avoid creating pawn weaknesses (doubled, isolated) unless you get compensation.",
    "When ahead in material, trade pieces but not pawns. When behind, trade pawns but not pieces.",
    "A bishop pair is worth about half a pawn extra in open positions.",
    "Don't bring your queen out too early -- it can be chased by minor pieces.",
    "Every move should have a purpose: develop, control, attack, or defend.",
    "Passed pawns must be pushed! They become more dangerous as they advance.",
    "Look for tactics every move: forks, pins, skewers, discovered attacks."
];
const STORAGE_GAMES = 'chess_recent_games';
const STORAGE_STATS = 'chess_analyzer_stats';
const STORAGE_THEME = 'chess_theme';
const STORAGE_SOUND = 'chess_sound';

// ---- State ----
let state = null;
let gameHistory = [];
let histIdx = 0;
let sanHistory = [];
let flipped = false;
let selectedSq = -1;
let legalDests = [];
let lastMvSqs = [];
let inReview = false;
let searchDepth = 3;
let pendingImgUrl = null;
let currentOpening = null;
let arrowData = [];
let boardPx = 0;
let heatmapOn = false;
let evalHistory = [];
let analysisResults = [];
let currentScreen = 'dash';
let soundEnabled = true;
let puzzleList = [];
let puzzleIdx = 0;
let puzzleState = null;
let puzzleHintLevel = 0;
let puzzleSolved = false;
let puzzleSelectedSq = -1;
let puzzleLegalDests = [];

// ---- Audio Context (Web Audio API) ----
let audioCtx = null;
function getAudioCtx() {
    if (!audioCtx) {
        try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }
    return audioCtx;
}

function playSound(type) {
    if (!soundEnabled) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    switch (type) {
        case 'move':
            osc.type = 'sine'; osc.frequency.value = 600;
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.start(now); osc.stop(now + 0.08);
            break;
        case 'capture':
            osc.type = 'triangle'; osc.frequency.value = 400;
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            osc.start(now); osc.stop(now + 0.12);
            break;
        case 'check':
            osc.type = 'square'; osc.frequency.value = 800;
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.start(now); osc.stop(now + 0.15);
            break;
        case 'blunder':
            osc.type = 'sawtooth'; osc.frequency.value = 200;
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.start(now); osc.stop(now + 0.3);
            break;
        case 'brilliant':
            osc.type = 'sine'; osc.frequency.value = 1200;
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.05, now + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.frequency.setValueAtTime(1600, now + 0.05);
            osc.start(now); osc.stop(now + 0.2);
            break;
        case 'puzzle_correct':
            osc.type = 'sine'; osc.frequency.value = 800;
            gain.gain.setValueAtTime(0.12, now);
            osc.frequency.setValueAtTime(1000, now + 0.1);
            osc.frequency.setValueAtTime(1200, now + 0.2);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc.start(now); osc.stop(now + 0.35);
            break;
    }
}

// ---- DOM Shortcuts ----
const $ = id => document.getElementById(id);
const boardGrid = $('board-grid'), arrowCanvas = $('arrow-canvas');
const evalBlack = $('eval-black-fill'), evalWhite = $('eval-white-fill'), evalScore = $('eval-score');
const engineLines = $('engine-lines'), plansList = $('plans-list'), threatsList = $('threats-list');
const openingBar = $('opening-bar'), openingEco = $('opening-eco'), openingName = $('opening-name');
const spinner = $('spinner'), depthBadge = $('depth-badge');
const whiteName = $('white-name'), blackName = $('black-name');
const whiteAccPill = $('white-accuracy-pill'), blackAccPill = $('black-accuracy-pill');
const coachDiv = $('coach-advice');
const toast = $('toast');

// ---- Screen Management ----
function showScreen(name) {
    currentScreen = name;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = $('screen-' + name);
    if (screen) screen.classList.add('active');
    if (name === 'analysis') {
        calcBoardPx(); buildBoard(); renderBoard();
    }
    if (name === 'puzzle') {
        calcPuzzleBoardPx(); buildPuzzleBoard(); renderPuzzleBoard();
    }
}

// ---- Board Sizing ----
function calcBoardPx() {
    const sw = window.innerWidth;
    const barW = 25;
    boardPx = Math.floor(Math.min(sw - barW - 16, window.innerHeight * 0.42) / 8) * 8;
    const sqPx = boardPx / 8;
    boardGrid.style.width = boardPx + 'px';
    boardGrid.style.height = boardPx + 'px';
    document.documentElement.style.setProperty('--sq-px', sqPx + 'px');
    document.documentElement.style.setProperty('--board-size', boardPx + 'px');
    arrowCanvas.width = boardPx;
    arrowCanvas.height = boardPx;
    arrowCanvas.style.width = boardPx + 'px';
    arrowCanvas.style.height = boardPx + 'px';
}

// ---- Board Rendering ----
function buildBoard() {
    boardGrid.innerHTML = '';
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const div = document.createElement('div');
            div.className = 'sq ' + ((row + col) % 2 === 0 ? 'light' : 'dark');
            // Coordinate labels
            const rank = flipped ? row : 7 - row;
            const file = flipped ? 7 - col : col;
            if (col === 0) {
                const lbl = document.createElement('span');
                lbl.className = 'coord-label coord-rank';
                lbl.textContent = rank + 1;
                div.appendChild(lbl);
            }
            if (row === 7) {
                const lbl = document.createElement('span');
                lbl.className = 'coord-label coord-file';
                lbl.textContent = String.fromCharCode(97 + file);
                div.appendChild(lbl);
            }
            boardGrid.appendChild(div);
        }
    }
}

function renderBoard() {
    if (!state) return;
    const cells = boardGrid.querySelectorAll('.sq');
    const attackMap = heatmapOn ? CE.attackedSquaresMap(state) : null;
    cells.forEach((cell, idx) => {
        const row = Math.floor(idx / 8), col = idx % 8;
        const rank = flipped ? row : 7 - row;
        const file = flipped ? 7 - col : col;
        const sq = rank * 8 + file;

        cell.className = 'sq ' + ((row + col) % 2 === 0 ? 'light' : 'dark');

        // Heatmap
        if (heatmapOn && attackMap) {
            const v = attackMap[sq];
            if (v > 0) cell.classList.add('heatmap-green');
            else if (v < 0) cell.classList.add('heatmap-red');
        }

        // Highlights
        if (lastMvSqs.includes(sq)) cell.classList.add('hl-last');
        if (sq === selectedSq) cell.classList.add('hl-sel');
        if (legalDests.includes(sq)) {
            cell.classList.add('hl-dest');
            if (state.board[sq]) cell.classList.add('occupied');
        }

        // Check highlight
        const p = state.board[sq];
        const sideKing = state.side === CE.WHITE ? CE.wK : CE.bK;
        if (p === sideKing) {
            const kSq = CE.findKing(state.board, state.side);
            if (kSq === sq && CE.isAttacked(state.board, sq, 1 - state.side))
                cell.classList.add('hl-check');
        }

        // Coord labels
        if (col === 0) {
            const lbl = cell.querySelector('.coord-rank');
            if (!lbl) {
                const l = document.createElement('span');
                l.className = 'coord-label coord-rank';
                l.textContent = rank + 1;
                cell.appendChild(l);
            } else lbl.textContent = rank + 1;
        }
        if (row === 7) {
            const lbl = cell.querySelector('.coord-file');
            if (!lbl) {
                const l = document.createElement('span');
                l.className = 'coord-label coord-file';
                l.textContent = String.fromCharCode(97 + file);
                cell.appendChild(l);
            } else lbl.textContent = String.fromCharCode(97 + file);
        }

        // Piece
        const existingPiece = cell.querySelector('.piece');
        if (existingPiece) existingPiece.remove();
        if (p) {
            const span = document.createElement('span');
            span.className = 'piece ' + (CE.colorOf(p) === CE.WHITE ? 'white' : 'black');
            span.textContent = GLYPHS[p];
            cell.appendChild(span);
        }
    });
    drawArrows();
    updateCapturedPieces();
}

// ---- Captured Pieces ----
function updateCapturedPieces() {
    if (!state) return;
    const initial = [0, 8,2,2,2,1,0, 8,2,2,2,1,0];
    const current = new Array(13).fill(0);
    for (let i = 0; i < 64; i++) {
        if (state.board[i]) current[state.board[i]]++;
    }
    let whiteCaps = '', blackCaps = '';
    const capGlyphs = {7:'\u265F',8:'\u265E',9:'\u265D',10:'\u265C',11:'\u265B'};
    const capGlyphsW = {1:'\u2659',2:'\u2658',3:'\u2657',4:'\u2656',5:'\u2655'};
    for (const [p, g] of Object.entries(capGlyphs)) {
        const diff = initial[p] - current[p];
        for (let i = 0; i < diff; i++) whiteCaps += g;
    }
    for (const [p, g] of Object.entries(capGlyphsW)) {
        const diff = initial[p] - current[p];
        for (let i = 0; i < diff; i++) blackCaps += g;
    }
    $('white-caps').textContent = whiteCaps;
    $('black-caps').textContent = blackCaps;
}

// ---- Arrow Drawing ----
function drawArrows() {
    const ctx = arrowCanvas.getContext('2d');
    ctx.clearRect(0, 0, boardPx, boardPx);
    for (const a of arrowData) drawArrow(ctx, a.from, a.to, a.color || 'rgba(200,80,80,0.8)');
}

function drawArrow(ctx, from, to, color) {
    const sq = boardPx / 8;
    const fr = CE.rankOf(from), ff = CE.fileOf(from);
    const tr = CE.rankOf(to), tf = CE.fileOf(to);
    const vr1 = flipped ? fr : 7 - fr, vc1 = flipped ? 7 - ff : ff;
    const vr2 = flipped ? tr : 7 - tr, vc2 = flipped ? 7 - tf : tf;
    const x1 = vc1 * sq + sq / 2, y1 = vr1 * sq + sq / 2;
    const x2 = vc2 * sq + sq / 2, y2 = vr2 * sq + sq / 2;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const hl = sq * 0.35, sw = sq * 0.12;
    ctx.save();
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = sw; ctx.lineCap = 'round';
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - hl * 0.5 * Math.cos(angle), y2 - hl * 0.5 * Math.sin(angle)); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - hl * Math.cos(angle - Math.PI / 6), y2 - hl * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - hl * Math.cos(angle + Math.PI / 6), y2 - hl * Math.sin(angle + Math.PI / 6));
    ctx.closePath(); ctx.fill();
    ctx.restore();
}

// ---- Board Interaction ----
boardGrid.addEventListener('click', e => {
    if (!state) return;
    const cell = e.target.closest('.sq');
    if (!cell) return;
    const cells = [...boardGrid.querySelectorAll('.sq')];
    const idx = cells.indexOf(cell);
    const row = Math.floor(idx / 8), col = idx % 8;
    const rank = flipped ? row : 7 - row, file = flipped ? 7 - col : col;
    const sq = rank * 8 + file;

    if (selectedSq >= 0 && legalDests.includes(sq)) {
        const legal = CE.legalMoves(state);
        const candidates = legal.filter(m => m.from === selectedSq && m.to === sq);
        if (!candidates.length) { clearSel(); renderBoard(); return; }
        const promoMoves = candidates.filter(m => m.flags === 16 || m.flags === 17);
        if (promoMoves.length) {
            showPromoModal(sq, candidates[0].from, mv => commitMove(mv));
            return;
        }
        commitMove(candidates[0]);
        return;
    }

    const p = state.board[sq];
    if (p && CE.colorOf(p) === state.side) {
        selectedSq = sq;
        legalDests = CE.legalMoves(state).filter(m => m.from === sq).map(m => m.to);
    } else {
        clearSel();
    }
    renderBoard();
});

function clearSel() { selectedSq = -1; legalDests = []; }

function commitMove(mv) {
    const legal = CE.legalMoves(state);
    const san = CE.moveToSan(state, mv, legal);
    const isCap = (mv.flags & 1) || mv.flags === 2;
    const isCheck = san.includes('+') || san.includes('#');
    lastMvSqs = [mv.from, mv.to];
    state = CE.applyMove(state, mv);
    sanHistory.push(san);
    clearSel();

    if (isCap) playSound('capture');
    else if (isCheck) playSound('check');
    else playSound('move');

    currentOpening = identifyOpeningFn(sanHistory);
    renderBoard();
    updateOpeningBar();
    COACH.speakMove(san, null);
    if (!inReview) runAnalysis();
}

// ---- Promotion Modal ----
function showPromoModal(toSq, fromSq, cb) {
    const side = state.side;
    const pieces = side === CE.WHITE ? [CE.wQ, CE.wR, CE.wB, CE.wN] : [CE.bQ, CE.bR, CE.bB, CE.bN];
    const div = $('promo-choices');
    div.innerHTML = '';
    for (const p of pieces) {
        const btn = document.createElement('span');
        btn.className = 'promo-choice piece ' + (side === CE.WHITE ? 'white' : 'black');
        btn.textContent = GLYPHS[p];
        btn.onclick = () => {
            $('promo-modal').classList.remove('open');
            const legal = CE.legalMoves(state);
            const mv = legal.find(m => m.from === fromSq && m.to === toSq && (m.flags === 16 || m.flags === 17) && m.promo === p);
            if (mv) cb(mv);
        };
        div.appendChild(btn);
    }
    $('promo-modal').classList.add('open');
}

// ---- Opening ----
function identifyOpeningFn(sans) {
    if (typeof identifyOpening !== 'undefined') return identifyOpening(sans);
    return null;
}

function updateOpeningBar() {
    const op = currentOpening;
    if (op) {
        openingBar.classList.remove('hidden');
        openingEco.textContent = op.eco;
        openingName.textContent = op.name;
        const desc = $('opening-desc');
        if (desc) desc.textContent = op.description ? op.description.slice(0, 60) : '';
    } else {
        openingBar.classList.add('hidden');
    }
}

// ---- Eval Bar ----
function updateEvalBar(cp) {
    const clamped = Math.max(-1500, Math.min(1500, cp));
    const whitePct = 50 + 50 * (clamped / 1500);
    evalWhite.style.flex = whitePct.toString();
    evalBlack.style.flex = (100 - whitePct).toString();
    const abs = Math.abs(cp);
    const display = abs >= 9000
        ? (cp > 0 ? '#' : '-#')
        : (cp >= 0 ? '+' : '') + (cp / 100).toFixed(1);
    evalScore.textContent = display;
    evalScore.style.color = cp > 50 ? '#f0f0f0' : cp < -50 ? '#888' : '#a0a0a0';
}

// ---- Engine Analysis ----
function runAnalysis() {
    if (!state) return;
    spinner.classList.add('active');
    arrowData = [];
    setTimeout(() => {
        try {
            const top = CE.getTopMoves(state, searchDepth, 5);
            const rawEval = CE.evaluate(state);
            updateEvalBar(rawEval);
            renderEngineLines(state, top);

            const colors = ['rgba(255,80,80,0.8)', 'rgba(80,160,255,0.7)', 'rgba(180,180,180,0.5)', 'rgba(180,150,255,0.4)', 'rgba(255,200,100,0.35)'];
            arrowData = top.slice(0, 3).map((t, i) => ({from: t.mv.from, to: t.mv.to, color: colors[i]}));
            drawArrows();

            const {plans, threats} = CE.analyzePosition(state);
            renderPlans(plans);
            renderThreats(threats);

            currentOpening = identifyOpeningFn(sanHistory);
            updateOpeningBar();
            updateInsightsTab();

            if ($('tab-coach').classList.contains('active')) showLocalCoach();

            $('whatif-btn').classList.remove('hidden');
        } finally {
            spinner.classList.remove('active');
        }
    }, 20);
}

function renderEngineLines(s, top) {
    if (!top.length) {
        engineLines.innerHTML = '<div class="engine-line"><span class="line-rank"></span><span class="line-score zero">--</span><span class="line-moves">No legal moves</span></div>';
        return;
    }
    const legal = CE.legalMoves(s);
    engineLines.innerHTML = top.map(({mv, sc}, i) => {
        const cp = s.side === CE.WHITE ? sc : -sc;
        const scoreStr = Math.abs(sc) >= 9000
            ? (cp > 0 ? 'M' : '-M') + Math.ceil((10000 - Math.abs(sc)) / 2)
            : (cp >= 0 ? '+' : '') + (cp / 100).toFixed(2);
        const cls = cp > 5 ? 'pos' : cp < -5 ? 'neg' : 'zero';
        const san = CE.moveToSan(s, mv, legal);
        const cont = CE.getContinuation(s, mv, 3);
        const contStr = cont.length ? ' ' + cont.join(' ') : '';
        return '<div class="engine-line">' +
            '<span class="line-rank">' + (i + 1) + '</span>' +
            '<span class="line-score ' + cls + '">' + scoreStr + '</span>' +
            '<span class="line-moves"><strong>' + san + '</strong>' + contStr + '</span>' +
            '</div>';
    }).join('');
}

function renderPlans(plans) {
    if (!plans.length) { plansList.innerHTML = '<li class="color-dim">None detected</li>'; return; }
    plansList.innerHTML = plans.map(p => '<li>' + p + '</li>').join('');
}

function renderThreats(threats) {
    if (!threats.length) { threatsList.innerHTML = '<li class="color-dim">None</li>'; return; }
    threatsList.innerHTML = threats.map(t => {
        if (t.type === 'hanging') return '<li>' + t.side + '\'s ' + (t.piece || 'P') + ' on ' + t.sq + ' is undefended</li>';
        if (t.type === 'king') return '<li>' + t.side + '\'s king faces danger</li>';
        return '<li>' + (t.text || JSON.stringify(t)) + '</li>';
    }).join('');
}

// ---- Insights Tab ----
function updateInsightsTab() {
    if (!state) return;
    // King safety
    const wSafety = CE.getKingSafetyPercent(state.board, CE.WHITE);
    const bSafety = CE.getKingSafetyPercent(state.board, CE.BLACK);
    $('wk-safety-label').textContent = wSafety + '%';
    $('wk-safety-label').className = 'king-safety-label ' + (wSafety >= 60 ? 'safe' : wSafety >= 35 ? 'risky' : 'danger');
    $('wk-safety-fill').style.width = wSafety + '%';
    $('wk-safety-fill').style.background = wSafety >= 60 ? '#7ec86d' : wSafety >= 35 ? '#f0c040' : '#ca3431';
    $('bk-safety-label').textContent = bSafety + '%';
    $('bk-safety-label').className = 'king-safety-label ' + (bSafety >= 60 ? 'safe' : bSafety >= 35 ? 'risky' : 'danger');
    $('bk-safety-fill').style.width = bSafety + '%';
    $('bk-safety-fill').style.background = bSafety >= 60 ? '#7ec86d' : bSafety >= 35 ? '#f0c040' : '#ca3431';

    // Piece activity
    const activity = CE.pieceActivityScores(state);
    const actList = $('piece-activity-list');
    let actHtml = '';
    for (const side of ['white', 'black']) {
        for (const [name, score] of Object.entries(activity[side])) {
            actHtml += '<li class="piece-activity-item"><span style="width:80px;font-size:11px;color:var(--text2);">' + name + '</span>' +
                '<div class="activity-bar"><div class="activity-bar-fill" style="width:' + (score * 10) + '%;"></div></div>' +
                '<span class="activity-score">' + score + '</span></li>';
        }
    }
    actList.innerHTML = actHtml || '<li class="piece-activity-item" style="color:var(--text2);">No pieces to evaluate</li>';

    // Tactical alerts
    const tactics = CE.detectTactics(state);
    const tacDiv = $('tactical-alerts');
    if (tactics.length) {
        tacDiv.innerHTML = tactics.map(t => {
            const severity = t.severity || 'medium';
            return '<div class="tactical-alert"><span class="tactic-icon ' + severity + '">' + (t.icon || '!') + '</span><span>' + t.text + '</span></div>';
        }).join('');
    } else {
        tacDiv.innerHTML = '<div class="tactical-alert"><span style="color:var(--text2);font-size:12px;">No tactical alerts</span></div>';
    }

    // Win probability graph
    drawWinProbGraph();
}

// ---- Win Probability Graph ----
function drawWinProbGraph() {
    const canvas = $('win-prob-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (evalHistory.length < 2) {
        ctx.fillStyle = '#555';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Play moves to see win probability', w / 2, h / 2);
        return;
    }

    // Draw background
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(0, 0, w, h);

    // Center line
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    ctx.setLineDash([]);

    // Fill areas
    const n = evalHistory.length;
    const dx = w / (n - 1);

    // White fill
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    for (let i = 0; i < n; i++) {
        const wp = CE.cpToWinPct(evalHistory[i]);
        const y = h * (1 - wp);
        ctx.lineTo(i * dx, y);
    }
    ctx.lineTo((n - 1) * dx, h / 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(240,240,240,0.2)';
    ctx.fill();

    // Black fill
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    for (let i = 0; i < n; i++) {
        const wp = CE.cpToWinPct(evalHistory[i]);
        const y = h * (1 - wp);
        ctx.lineTo(i * dx, y);
    }
    ctx.lineTo((n - 1) * dx, h / 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(30,30,30,0.2)';
    ctx.fill();

    // Line
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
        const wp = CE.cpToWinPct(evalHistory[i]);
        const y = h * (1 - wp);
        if (i === 0) ctx.moveTo(0, y);
        else ctx.lineTo(i * dx, y);
    }
    ctx.strokeStyle = '#7fa650';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Current position marker
    if (inReview && histIdx > 0 && histIdx < n) {
        const wp = CE.cpToWinPct(evalHistory[histIdx]);
        const y = h * (1 - wp);
        ctx.beginPath();
        ctx.arc(histIdx * dx, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#7fa650';
        ctx.fill();
    }
}

// ---- Game Review ----
function reviewGame(pgn) {
    if (!pgn.trim()) return;
    let headers, sanMoves, history;
    try {
        ({headers, sanMoves} = PGN.parsePgn(pgn));
        history = PGN.replayGame(sanMoves);
    } catch (e) {
        showToast('Failed to parse PGN: ' + e.message);
        return;
    }
    if (history.length < 2) { showToast('No moves found in PGN'); return; }

    whiteName.textContent = headers.White || 'White';
    blackName.textContent = headers.Black || 'Black';

    inReview = true;
    gameHistory = history.map(h => ({...h, class: null, cpLoss: null, bestMv: null, bestEval: null, evalAfter: null}));
    histIdx = 0;
    sanHistory = sanMoves.slice();
    evalHistory = [];

    showScreen('analysis');
    spinner.classList.add('active');
    showToast('Analyzing game...');

    setTimeout(() => {
        try {
            let wCpl = 0, bCpl = 0, wMoves = 0, bMoves = 0;
            evalHistory = [CE.evaluate(gameHistory[0].state)];

            for (let i = 0; i < gameHistory.length - 1; i++) {
                const s = gameHistory[i].state;
                const move = gameHistory[i + 1].mv;
                if (!move) continue;

                const top = CE.getTopMoves(s, Math.min(searchDepth, 3), 1);
                const bestSc = top.length ? top[0].sc : 0;
                const bestMv = top.length ? top[0].mv : null;
                const ns = CE.applyMove(s, move);
                const afterEval = CE.evaluate(ns);
                evalHistory.push(afterEval);

                const bestCp = s.side === CE.WHITE ? bestSc : -bestSc;
                const moveSc = s.side === CE.WHITE ? afterEval : -afterEval;
                const cpLoss = Math.max(0, bestCp - moveSc);
                const isSac = CE.isMaterialSacrifice(s, move);

                let cls;
                if (i < 10 && isBookMove(sanMoves.slice(0, i + 1))) {
                    cls = 'book';
                } else {
                    cls = CE.classifyMove(bestCp, moveSc, isSac);
                }

                gameHistory[i + 1].class = cls;
                gameHistory[i + 1].cpLoss = cpLoss;
                gameHistory[i + 1].bestMv = bestMv;
                gameHistory[i + 1].bestEval = bestCp;
                gameHistory[i + 1].evalAfter = moveSc;

                if (s.side === CE.WHITE) { wCpl += cpLoss; wMoves++; }
                else { bCpl += cpLoss; bMoves++; }
            }

            const wAcc = CE.cpToAccuracy(wMoves ? wCpl / wMoves : 0);
            const bAcc = CE.cpToAccuracy(bMoves ? bCpl / bMoves : 0);

            whiteAccPill.textContent = wAcc.toFixed(1) + '%';
            whiteAccPill.className = 'accuracy-pill ' + (wAcc >= 80 ? 'high' : wAcc >= 60 ? 'mid' : 'low');
            whiteAccPill.classList.remove('hidden');
            blackAccPill.textContent = bAcc.toFixed(1) + '%';
            blackAccPill.className = 'accuracy-pill ' + (bAcc >= 80 ? 'high' : bAcc >= 60 ? 'mid' : 'low');
            blackAccPill.classList.remove('hidden');

            analysisResults = {wAcc, bAcc, wCpl: wMoves ? wCpl / wMoves : 0, bCpl: bMoves ? bCpl / bMoves : 0, headers};
            saveRecentGame(headers, wAcc, bAcc);
            renderAnalysisMoveList();
            goToHistory(gameHistory.length - 1);
            showToast('Analysis complete! Navigate moves to hear voice coach.');
            // Announce completion via voice
            COACH.speakText('Analysis complete. White accuracy ' + wAcc.toFixed(0) + ' percent. Black accuracy ' + bAcc.toFixed(0) + ' percent.');
        } finally {
            spinner.classList.remove('active');
        }
    }, 50);
}

function isBookMove(sans) {
    const key = sans.join(' ');
    return OPENINGS_DB.some(entry => key === entry[0] || key.startsWith(entry[0] + ' '));
}

// ---- History Navigation ----
function goToHistory(idx) {
    if (!gameHistory.length) return;
    idx = Math.max(0, Math.min(idx, gameHistory.length - 1));
    const prevIdx = histIdx;
    histIdx = idx;
    state = gameHistory[idx].state;
    if (idx > 0) {
        const mv = gameHistory[idx].mv;
        lastMvSqs = mv ? [mv.from, mv.to] : [];
    } else lastMvSqs = [];
    clearSel();
    renderBoard();
    updateEvalBar(CE.evaluate(state));
    currentOpening = identifyOpeningFn(sanHistory.slice(0, idx));
    updateOpeningBar();
    updateInsightsTab();
    drawWinProbGraph();
    updateCurrentMoveClass(idx);
    highlightAnalysisMoveList(idx);

    // Highlight active move in report move list
    const moveList = $('report-move-list');
    if (moveList) {
        moveList.querySelectorAll('.move-cell').forEach(c => c.classList.remove('active'));
        if (idx > 0) {
            const cell = moveList.querySelector('.move-cell[data-idx="' + idx + '"]');
            if (cell) { cell.classList.add('active'); cell.scrollIntoView({block: 'nearest'}); }
        }
    }

    // Auto-voice on navigation during review
    if (inReview && idx > 0 && idx !== prevIdx && gameHistory[idx].mv) {
        const h = gameHistory[idx];
        const san = h.san || '';
        const cls = h.class || '';
        // Play sound for the move type
        if (cls === 'blunder') playSound('blunder');
        else if (cls === 'brilliant') playSound('brilliant');
        else if (san.includes('+') || san.includes('#')) playSound('check');
        else if (h.mv && (h.mv.flags & 1)) playSound('capture');
        else playSound('move');
        // Voice coach
        if (cls && cls !== 'best' && cls !== 'excellent' && cls !== 'good' && cls !== 'book') {
            const prevState = gameHistory[idx - 1] ? gameHistory[idx - 1].state : null;
            if (prevState) {
                const explanation = COACH.explainClassification(cls, prevState, h.mv, h.bestMv, h.bestEval, h.evalAfter, h.bestEval);
                COACH.speakExplanation(cls, san, explanation);
            }
        } else {
            COACH.speakMove(san, cls);
        }
    }
}

// ---- Current Move Classification Badge ----
function updateCurrentMoveClass(idx) {
    const cmcDiv = $('current-move-class');
    if (!cmcDiv) return;
    if (!inReview || idx <= 0 || !gameHistory[idx] || !gameHistory[idx].class) {
        cmcDiv.classList.add('hidden');
        cmcDiv.className = 'current-move-class hidden';
        return;
    }
    const h = gameHistory[idx];
    const cls = h.class;
    const meta = CLS_META[cls];
    if (!meta) { cmcDiv.classList.add('hidden'); return; }

    cmcDiv.className = 'current-move-class cls-' + cls;
    $('cmc-badge').textContent = meta.sym;
    const moveNum = Math.ceil(idx / 2);
    const side = idx % 2 === 1 ? '' : '...';
    $('cmc-san').textContent = moveNum + '.' + side + ' ' + (h.san || '') + ' — ' + meta.label;

    // Short description
    const prevState = gameHistory[idx - 1] ? gameHistory[idx - 1].state : null;
    let desc = '';
    if (prevState && h.mv) {
        const legal = CE.legalMoves(prevState);
        const bestSan = h.bestMv ? CE.moveToSan(prevState, h.bestMv, legal) : null;
        if (cls === 'blunder' || cls === 'mistake' || cls === 'inaccuracy') {
            const loss = h.cpLoss ? (h.cpLoss / 100).toFixed(1) : '0.0';
            desc = (bestSan ? 'Best was ' + bestSan + '. ' : '') + 'Lost ' + loss + ' pawns. Tap for details.';
        } else if (cls === 'brilliant') {
            desc = 'A brilliant sacrifice! Tap for details.';
        } else if (cls === 'great') {
            desc = 'A strong move, nearly the best. Tap for details.';
        } else if (cls === 'book') {
            desc = 'Standard opening theory.';
        } else {
            desc = 'Tap for details.';
        }
    }
    $('cmc-desc').textContent = desc;

    cmcDiv.onclick = () => {
        if (cls !== 'best' && cls !== 'book' && cls !== 'good' && cls !== 'excellent') {
            showMoveDetail(idx);
        }
    };
}

// ---- Analysis Move List ----
function renderAnalysisMoveList() {
    const wrap = $('analysis-move-list-wrap');
    const list = $('analysis-move-list');
    if (!wrap || !list) return;
    if (!inReview || gameHistory.length < 2) {
        wrap.classList.add('hidden');
        return;
    }
    wrap.classList.remove('hidden');
    let html = '';
    for (let i = 1; i < gameHistory.length; i++) {
        const h = gameHistory[i];
        if (!h.san) continue;
        if (i % 2 === 1) {
            html += '<span class="aml-num">' + Math.ceil(i / 2) + '.</span>';
        }
        const cls = h.class ? ' cls-' + h.class : '';
        const active = i === histIdx ? ' active' : '';
        html += '<span class="aml-move' + cls + active + '" data-idx="' + i + '">' + h.san + '</span>';
    }
    list.innerHTML = html;
    list.querySelectorAll('.aml-move').forEach(el => {
        el.addEventListener('click', () => {
            const idx = +el.dataset.idx;
            if (idx > 0 && idx < gameHistory.length) {
                goToHistory(idx);
                const h = gameHistory[idx];
                if (h.class && h.class !== 'best' && h.class !== 'book' && h.class !== 'good' && h.class !== 'excellent') {
                    showMoveDetail(idx);
                }
            }
        });
    });
}

function highlightAnalysisMoveList(idx) {
    const list = $('analysis-move-list');
    if (!list) return;
    list.querySelectorAll('.aml-move').forEach(el => {
        el.classList.toggle('active', +el.dataset.idx === idx);
    });
    // Scroll active into view
    const active = list.querySelector('.aml-move.active');
    if (active) active.scrollIntoView({block: 'nearest', inline: 'nearest'});
}

// ---- Move Detail Panel ----
function showMoveDetail(idx) {
    if (!gameHistory[idx] || !gameHistory[idx].mv) return;
    const h = gameHistory[idx];
    const prevState = gameHistory[idx - 1].state;
    const legal = CE.legalMoves(prevState);
    const playedSan = h.san;
    const bestMv = h.bestMv;
    const bestSan = bestMv ? CE.moveToSan(prevState, bestMv, legal) : playedSan;

    // Classification banner
    const clsBanner = $('detail-cls-banner');
    const clsMeta = CLS_META[h.class];
    if (clsMeta) {
        clsBanner.className = 'detail-cls-banner ' + h.class;
        clsBanner.textContent = clsMeta.sym + ' ' + clsMeta.label;
        clsBanner.style.display = '';
    } else {
        clsBanner.style.display = 'none';
    }

    $('detail-played-san').textContent = playedSan;
    $('detail-played-san').style.color = CLS_META[h.class] ? CLS_META[h.class].color : '#e8e8e8';
    $('detail-played-eval').textContent = h.evalAfter != null ? ((h.evalAfter >= 0 ? '+' : '') + (h.evalAfter / 100).toFixed(1)) : '';

    $('detail-best-san').textContent = bestSan;
    $('detail-best-san').style.color = '#7ec86d';
    $('detail-best-eval').textContent = h.bestEval != null ? ((h.bestEval >= 0 ? '+' : '') + (h.bestEval / 100).toFixed(1)) : '';

    const explanation = COACH.explainClassification(h.class, prevState, h.mv, bestMv, h.bestEval, h.evalAfter, h.bestEval);
    $('detail-explanation').innerHTML = COACH.formatAdviceHtml(explanation);

    // Draw arrows on board
    goToHistory(idx - 1);
    arrowData = [];
    arrowData.push({from: h.mv.from, to: h.mv.to, color: 'rgba(200,60,60,0.8)'});
    if (bestMv && (bestMv.from !== h.mv.from || bestMv.to !== h.mv.to)) {
        arrowData.push({from: bestMv.from, to: bestMv.to, color: 'rgba(80,200,80,0.8)'});
    }
    drawArrows();

    $('move-detail-overlay').classList.add('open');

    // Voice explanation for bad moves
    if (h.class === 'blunder' || h.class === 'mistake') {
        COACH.speakExplanation(h.class, playedSan, explanation);
        if (h.class === 'blunder') playSound('blunder');
    } else if (h.class === 'brilliant') {
        playSound('brilliant');
    }
}

$('detail-close-btn').addEventListener('click', () => {
    $('move-detail-overlay').classList.remove('open');
    arrowData = [];
    if (inReview) goToHistory(histIdx);
});

$('detail-practice-btn').addEventListener('click', () => {
    $('move-detail-overlay').classList.remove('open');
    const h = gameHistory[histIdx + 1] || gameHistory[histIdx];
    if (h && h.bestMv) {
        const prevState = gameHistory[histIdx].state;
        const legal = CE.legalMoves(prevState);
        const bestSan = CE.moveToSan(prevState, h.bestMv, legal);
        puzzleList = [{
            fen: CE.stateToFen(prevState),
            bestMove: bestSan,
            bestMoveObj: h.bestMv,
            side: prevState.side,
            hint1: 'Look for the strongest move.',
            hint2: 'Consider all forcing moves.',
            hint3: 'The answer starts with ' + bestSan.charAt(0) + '...'
        }];
        puzzleIdx = 0;
        loadPuzzle(0);
        showScreen('puzzle');
    }
});

// ---- Game Report Screen ----
function showGameReport() {
    if (!gameHistory.length || gameHistory.length < 3) {
        showToast('Review a game first');
        return;
    }

    const report = COACH.generateWeaknessReport(gameHistory);
    if (!report) { showToast('Not enough data for report'); return; }

    showScreen('report');

    // Donut charts
    drawDonut($('white-donut'), report.wStats.accuracy);
    drawDonut($('black-donut'), report.bStats.accuracy);
    $('white-donut-val').textContent = report.wStats.accuracy.toFixed(1) + '%';
    $('white-donut-val').className = 'donut-value ' + (report.wStats.accuracy >= 80 ? 'high' : report.wStats.accuracy >= 60 ? 'mid' : 'low');
    $('black-donut-val').textContent = report.bStats.accuracy.toFixed(1) + '%';
    $('black-donut-val').className = 'donut-value ' + (report.bStats.accuracy >= 80 ? 'high' : report.bStats.accuracy >= 60 ? 'mid' : 'low');

    // Classification breakdown bar
    const allCounts = {};
    for (const h of gameHistory) if (h.class) allCounts[h.class] = (allCounts[h.class] || 0) + 1;
    const totalClassified = Object.values(allCounts).reduce((a, b) => a + b, 0) || 1;
    const order = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'blunder'];
    const classBar = $('class-bar');
    const classLegend = $('class-bar-legend');
    classBar.innerHTML = order.filter(c => allCounts[c]).map(c => {
        const pct = (allCounts[c] / totalClassified * 100).toFixed(1);
        const meta = CLS_META[c];
        return '<div class="class-bar-seg" style="width:' + pct + '%;background:' + meta.color + ';"></div>';
    }).join('');
    classLegend.innerHTML = order.filter(c => allCounts[c]).map(c => {
        const meta = CLS_META[c];
        return '<div class="class-bar-legend-item"><span class="class-bar-legend-dot" style="background:' + meta.color + '"></span>' + allCounts[c] + ' ' + meta.label + '</div>';
    }).join('');

    // Key moments
    const keyMomentsDiv = $('key-moments');
    keyMomentsDiv.innerHTML = '<div class="section-header">Key Moments</div>';
    if (report.bigMistakes.length) {
        for (const m of report.bigMistakes.slice(0, 5)) {
            const moveNum = Math.ceil((gameHistory.indexOf(m)) / 2);
            const div = document.createElement('div');
            div.className = 'key-moment';
            div.innerHTML = '<div class="key-moment-header">' +
                '<span class="key-moment-badge ' + m.class + '">' + (CLS_META[m.class] ? CLS_META[m.class].sym : '') + ' ' + (CLS_META[m.class] ? CLS_META[m.class].label : m.class) + '</span>' +
                '<span class="key-moment-move">' + moveNum + '. ' + m.san + '</span>' +
                '<span class="key-moment-loss">-' + (m.cpLoss / 100).toFixed(1) + '</span>' +
                '</div>';
            div.addEventListener('click', () => {
                showScreen('analysis');
                const idx = gameHistory.indexOf(m);
                if (idx > 0) showMoveDetail(idx);
            });
            keyMomentsDiv.appendChild(div);
        }
    } else {
        keyMomentsDiv.innerHTML += '<div style="color:var(--text2);font-size:12px;padding:8px;">No major mistakes found. Well played!</div>';
    }

    // Strengths / Weaknesses
    const swCards = $('sw-cards');
    if (report.styleAnalysis) {
        const sa = report.styleAnalysis;
        swCards.innerHTML =
            '<div class="sw-card"><div class="sw-card-title strength">Strengths</div><ul class="sw-card-list strength">' +
            sa.strengths.map(s => '<li>' + s + '</li>').join('') + '</ul></div>' +
            '<div class="sw-card"><div class="sw-card-title weakness">Weaknesses</div><ul class="sw-card-list weakness">' +
            sa.weaknesses.map(w => '<li>' + w + '</li>').join('') + '</ul></div>';

        $('report-style').classList.remove('hidden');
        $('report-style-badge').textContent = sa.style;
        $('report-style-desc').textContent = sa.description;

        $('style-analysis').classList.remove('hidden');
        $('style-badge').textContent = sa.style;
        $('style-desc').textContent = sa.description;
    }

    // Move list in report
    renderReportMoveList();
}

function drawDonut(canvas, accuracy) {
    const ctx = canvas.getContext('2d');
    const cx = 50, cy = 50, r = 40, lw = 10;
    ctx.clearRect(0, 0, 100, 100);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#3a3937';
    ctx.lineWidth = lw;
    ctx.stroke();
    const pct = accuracy / 100;
    const color = accuracy >= 80 ? '#7ec86d' : accuracy >= 60 ? '#f0c040' : '#ca3431';
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.stroke();
}

function renderReportMoveList() {
    const div = $('report-move-list');
    let html = '';
    for (let i = 1; i < gameHistory.length; i += 2) {
        const wMove = gameHistory[i];
        const bMove = gameHistory[i + 1];
        const moveNum = Math.ceil(i / 2);
        html += '<div class="move-pair"><div class="move-num">' + moveNum + '</div>' +
            '<div class="move-cell ' + (wMove && wMove.class ? 'cls-' + wMove.class : '') + '" data-idx="' + i + '">' + moveCellHtml(wMove) + '</div>' +
            '<div class="move-cell ' + (bMove && bMove.class ? 'cls-' + bMove.class : '') + '" data-idx="' + (i + 1) + '">' + moveCellHtml(bMove) + '</div>' +
            '</div>';
    }
    div.innerHTML = html;
    div.querySelectorAll('.move-cell[data-idx]').forEach(cell => {
        cell.addEventListener('click', () => {
            const idx = +cell.dataset.idx;
            if (idx > 0 && idx < gameHistory.length) {
                showScreen('analysis');
                goToHistory(idx);
                if (gameHistory[idx].class && gameHistory[idx].class !== 'good' && gameHistory[idx].class !== 'excellent') {
                    showMoveDetail(idx);
                }
            }
        });
    });
}

function moveCellHtml(h) {
    if (!h || !h.san) return '<span class="move-san">--</span>';
    const m = CLS_META[h.class] || {sym: '', color: '#a0a0a0'};
    return '<span class="move-san">' + h.san + '</span><span class="move-class-icon" style="color:' + m.color + ';">' + m.sym + '</span>';
}

// ---- Coach Tab ----
function showLocalCoach() {
    if (!state) return;
    const rawEval = CE.evaluate(state);
    const text = COACH.localAdvice(state, sanHistory, currentOpening, rawEval);
    coachDiv.innerHTML = COACH.formatAdviceHtml(text);
}

// ---- Load FEN ----
function loadFen(fen) {
    try {
        state = CE.parseFen(fen.trim());
        sanHistory = []; lastMvSqs = []; clearSel();
        inReview = false; gameHistory = []; evalHistory = [];
        currentOpening = null; arrowData = [];
        heatmapOn = false;
        if ($('heatmap-toggle')) $('heatmap-toggle').checked = false;
        whiteName.textContent = 'White';
        blackName.textContent = 'Black';
        whiteAccPill.classList.add('hidden');
        blackAccPill.classList.add('hidden');
        $('analysis-move-list-wrap').classList.add('hidden');
        const cmcDiv = $('current-move-class');
        if (cmcDiv) { cmcDiv.classList.add('hidden'); cmcDiv.className = 'current-move-class hidden'; }
        updateOpeningBar();
        showScreen('analysis');
        renderBoard();
        updateEvalBar(CE.evaluate(state));
        runAnalysis();
    } catch (e) { showToast('Invalid FEN: ' + e.message); }
}

// ---- Paste Input ----
function loadPasteInput(raw) {
    const text = raw.trim();
    if (/^[rnbqkpRNBQKP1-8\/]+ [wb]/.test(text)) {
        loadFen(text);
    } else {
        reviewGame(text);
    }
}

// ---- Tab Switching ----
function switchTab(name) {
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab-content').forEach(d => d.classList.toggle('active', d.id === 'tab-' + name));
    if (name === 'coach') showLocalCoach();
    if (name === 'insights') updateInsightsTab();
}

// ---- Recent Games ----
function saveRecentGame(headers, wAcc, bAcc) {
    try {
        const games = JSON.parse(localStorage.getItem(STORAGE_GAMES) || '[]');
        games.unshift({
            white: headers.White || 'White',
            black: headers.Black || 'Black',
            result: headers.Result || '*',
            date: headers.Date || new Date().toISOString().slice(0, 10),
            wAcc: wAcc.toFixed(1),
            bAcc: bAcc.toFixed(1),
            time: Date.now()
        });
        localStorage.setItem(STORAGE_GAMES, JSON.stringify(games.slice(0, 20)));
        updateStats(wAcc, bAcc);
    } catch (e) {}
}

function updateStats(wAcc, bAcc) {
    try {
        const stats = JSON.parse(localStorage.getItem(STORAGE_STATS) || '{"gamesAnalyzed":0,"totalAcc":0}');
        stats.gamesAnalyzed++;
        stats.totalAcc += (wAcc + bAcc) / 2;
        localStorage.setItem(STORAGE_STATS, JSON.stringify(stats));
    } catch (e) {}
}

function renderDashboard() {
    // Daily tip
    const tipIdx = Math.floor(Date.now() / 86400000) % DAILY_TIPS.length;
    $('daily-tip').textContent = DAILY_TIPS[tipIdx];

    // Recent games
    try {
        const games = JSON.parse(localStorage.getItem(STORAGE_GAMES) || '[]');
        const list = $('recent-games-list');
        if (games.length) {
            list.innerHTML = games.slice(0, 5).map((g, i) => {
                const resultChar = g.result === '1-0' ? 'W' : g.result === '0-1' ? 'L' : g.result === '1/2-1/2' ? 'D' : '?';
                const resultClass = resultChar === 'W' ? 'win' : resultChar === 'L' ? 'loss' : 'draw';
                return '<div class="recent-game-item" data-game-idx="' + i + '">' +
                    '<div class="recent-game-result ' + resultClass + '">' + resultChar + '</div>' +
                    '<div class="recent-game-info"><div class="recent-game-players">' + g.white + ' vs ' + g.black + '</div>' +
                    '<div class="recent-game-meta">' + g.date + '</div></div>' +
                    '<div class="recent-game-acc" style="color:' + (parseFloat(g.wAcc) >= 80 ? '#7ec86d' : parseFloat(g.wAcc) >= 60 ? '#f0c040' : '#ca3431') + ';">' + g.wAcc + '%</div></div>';
            }).join('');
        } else {
            list.innerHTML = '<div class="dash-empty">No games analyzed yet. Paste a PGN or start a new board to begin.</div>';
        }

        // Stats
        const stats = JSON.parse(localStorage.getItem(STORAGE_STATS) || '{"gamesAnalyzed":0,"totalAcc":0}');
        if (stats.gamesAnalyzed > 0) {
            $('dash-stats-section').classList.remove('hidden');
            const avgAcc = (stats.totalAcc / stats.gamesAnalyzed).toFixed(1);
            $('dash-stats').innerHTML =
                '<div class="dash-stat"><div class="dash-stat-val">' + stats.gamesAnalyzed + '</div><div class="dash-stat-label">Games</div></div>' +
                '<div class="dash-stat"><div class="dash-stat-val">' + avgAcc + '%</div><div class="dash-stat-label">Avg Accuracy</div></div>' +
                '<div class="dash-stat"><div class="dash-stat-val">' + (COACH.getSavedPuzzles().length) + '</div><div class="dash-stat-label">Puzzles</div></div>';
        }
    } catch (e) {}
}

// ---- Puzzle Mode ----
function calcPuzzleBoardPx() {
    const sw = window.innerWidth;
    const bpx = Math.floor(Math.min(sw - 30, window.innerHeight * 0.4) / 8) * 8;
    const grid = $('puzzle-board-grid');
    grid.style.width = bpx + 'px';
    grid.style.height = bpx + 'px';
    const sqPx = bpx / 8;
    document.documentElement.style.setProperty('--sq-px', sqPx + 'px');
    const evalWrap = $('puzzle-eval-wrap');
    evalWrap.style.height = bpx + 'px';
}

function buildPuzzleBoard() {
    const grid = $('puzzle-board-grid');
    grid.innerHTML = '';
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const div = document.createElement('div');
            div.className = 'sq ' + ((row + col) % 2 === 0 ? 'light' : 'dark');
            grid.appendChild(div);
        }
    }
}

function renderPuzzleBoard() {
    if (!puzzleState) return;
    const grid = $('puzzle-board-grid');
    const cells = grid.querySelectorAll('.sq');
    const pFlipped = puzzleState.side === CE.BLACK;
    cells.forEach((cell, idx) => {
        const row = Math.floor(idx / 8), col = idx % 8;
        const rank = pFlipped ? row : 7 - row;
        const file = pFlipped ? 7 - col : col;
        const sq = rank * 8 + file;
        cell.className = 'sq ' + ((row + col) % 2 === 0 ? 'light' : 'dark');
        if (sq === puzzleSelectedSq) cell.classList.add('hl-sel');
        if (puzzleLegalDests.includes(sq)) {
            cell.classList.add('hl-dest');
            if (puzzleState.board[sq]) cell.classList.add('occupied');
        }
        const existingPiece = cell.querySelector('.piece');
        if (existingPiece) existingPiece.remove();
        const p = puzzleState.board[sq];
        if (p) {
            const span = document.createElement('span');
            span.className = 'piece ' + (CE.colorOf(p) === CE.WHITE ? 'white' : 'black');
            span.textContent = GLYPHS[p];
            cell.appendChild(span);
        }
    });
}

function loadPuzzle(idx) {
    if (!puzzleList.length) return;
    idx = Math.max(0, Math.min(idx, puzzleList.length - 1));
    puzzleIdx = idx;
    const puz = puzzleList[idx];
    puzzleState = CE.parseFen(puz.fen);
    puzzleSolved = false;
    puzzleHintLevel = 0;
    puzzleSelectedSq = -1;
    puzzleLegalDests = [];
    $('puzzle-feedback').textContent = '';
    $('puzzle-feedback').className = 'puzzle-feedback';
    $('puzzle-hint-area').classList.add('hidden');
    $('puzzle-prompt').textContent = 'Find the best move';
    $('puzzle-subtext').textContent = (puzzleState.side === CE.WHITE ? 'White' : 'Black') + ' to move';
    $('puzzle-counter').textContent = (idx + 1) + ' / ' + puzzleList.length;
    renderPuzzleBoard();

    // Update puzzle eval bar
    const rawEval = CE.evaluate(puzzleState);
    const clamped = Math.max(-1500, Math.min(1500, rawEval));
    const wp = 50 + 50 * (clamped / 1500);
    $('puzzle-eval-white').style.flex = wp.toString();
    $('puzzle-eval-black').style.flex = (100 - wp).toString();
}

$('puzzle-board-grid').addEventListener('click', e => {
    if (!puzzleState || puzzleSolved) return;
    const cell = e.target.closest('.sq');
    if (!cell) return;
    const grid = $('puzzle-board-grid');
    const cells = [...grid.querySelectorAll('.sq')];
    const idx = cells.indexOf(cell);
    const pFlipped = puzzleState.side === CE.BLACK;
    const row = Math.floor(idx / 8), col = idx % 8;
    const rank = pFlipped ? row : 7 - row;
    const file = pFlipped ? 7 - col : col;
    const sq = rank * 8 + file;

    if (puzzleSelectedSq >= 0 && puzzleLegalDests.includes(sq)) {
        const legal = CE.legalMoves(puzzleState);
        const candidates = legal.filter(m => m.from === puzzleSelectedSq && m.to === sq);
        if (candidates.length) {
            const mv = candidates[0];
            const san = CE.moveToSan(puzzleState, mv, legal);
            const puz = puzzleList[puzzleIdx];
            const correctSan = puz.bestMove.replace(/[+#!?]/g, '');
            const playedSan = san.replace(/[+#!?]/g, '');
            if (playedSan === correctSan) {
                puzzleSolved = true;
                $('puzzle-feedback').textContent = 'Correct! ' + san + ' is the best move.';
                $('puzzle-feedback').className = 'puzzle-feedback correct';
                playSound('puzzle_correct');
                puzzleState = CE.applyMove(puzzleState, mv);
                puzzleSelectedSq = -1; puzzleLegalDests = [];
                renderPuzzleBoard();
            } else {
                $('puzzle-feedback').textContent = 'Incorrect. ' + san + ' is not the best move. Try again.';
                $('puzzle-feedback').className = 'puzzle-feedback incorrect';
                playSound('blunder');
                puzzleSelectedSq = -1; puzzleLegalDests = [];
                renderPuzzleBoard();
            }
            return;
        }
    }

    const p = puzzleState.board[sq];
    if (p && CE.colorOf(p) === puzzleState.side) {
        puzzleSelectedSq = sq;
        puzzleLegalDests = CE.legalMoves(puzzleState).filter(m => m.from === sq).map(m => m.to);
    } else {
        puzzleSelectedSq = -1;
        puzzleLegalDests = [];
    }
    renderPuzzleBoard();
});

$('puzzle-hint-btn').addEventListener('click', () => {
    if (!puzzleList.length || puzzleSolved) return;
    const puz = puzzleList[puzzleIdx];
    puzzleHintLevel++;
    const hintArea = $('puzzle-hint-area');
    hintArea.classList.remove('hidden');
    if (puzzleHintLevel === 1) hintArea.textContent = puz.hint1 || 'Look for forcing moves.';
    else if (puzzleHintLevel === 2) hintArea.textContent = puz.hint2 || 'Check all candidate moves.';
    else hintArea.textContent = puz.hint3 || 'The answer is ' + puz.bestMove.charAt(0) + '...';
});

$('puzzle-show-btn').addEventListener('click', () => {
    if (!puzzleList.length) return;
    const puz = puzzleList[puzzleIdx];
    puzzleSolved = true;
    $('puzzle-feedback').textContent = 'The best move was: ' + puz.bestMove;
    $('puzzle-feedback').className = 'puzzle-feedback';
    // Show arrow
    if (puz.bestMoveObj) {
        const legal = CE.legalMoves(puzzleState);
        const mv = legal.find(m => m.from === puz.bestMoveObj.from && m.to === puz.bestMoveObj.to);
        if (mv) {
            puzzleState = CE.applyMove(puzzleState, mv);
            renderPuzzleBoard();
        }
    }
});

$('puzzle-next-btn').addEventListener('click', () => {
    if (puzzleIdx < puzzleList.length - 1) {
        loadPuzzle(puzzleIdx + 1);
    } else {
        showToast('No more puzzles');
    }
});

// ---- What-If ----
$('whatif-btn').addEventListener('click', () => {
    if (!state) return;
    const top = CE.getTopMoves(state, 2, 3);
    if (!top.length) { showToast('No moves available'); return; }
    const legal = CE.legalMoves(state);
    let html = '';
    for (const t of top) {
        const result = CE.whatIfAnalysis(state, t.mv, 2);
        const san = CE.moveToSan(state, t.mv, legal);
        html += '<div style="margin-bottom:12px;padding:8px;background:var(--bg);border-radius:6px;border:1px solid var(--border);">';
        html += '<div style="font-weight:700;font-size:14px;margin-bottom:4px;">If ' + san + ':</div>';
        for (const o of result.outcomes) {
            const pct = Math.round(o.winPct * 100);
            const color = pct > 55 ? '#7ec86d' : pct < 45 ? '#ca3431' : '#f0c040';
            html += '<div style="display:flex;align-items:center;gap:8px;margin:4px 0;">';
            html += '<span style="font-size:12px;width:60px;">' + o.response + '</span>';
            html += '<div style="flex:1;height:8px;background:var(--bg3);border-radius:4px;overflow:hidden;">';
            html += '<div style="width:' + pct + '%;height:100%;background:' + color + ';border-radius:4px;"></div></div>';
            html += '<span style="font-size:11px;color:' + color + ';font-weight:700;">' + pct + '%</span>';
            if (o.continuation.length) {
                html += '<span style="font-size:10px;color:var(--text2);"> ' + o.continuation.join(' ') + '</span>';
            }
            html += '</div>';
        }
        html += '</div>';
    }
    $('whatif-results').innerHTML = html;
    $('whatif-modal').classList.add('open');
});

$('close-whatif-btn').addEventListener('click', () => $('whatif-modal').classList.remove('open'));

// ---- Toast ----
let toastTimer;
function showToast(msg) {
    toast.textContent = msg; toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ---- Event Listeners ----
// Dashboard
$('dash-paste-btn').addEventListener('click', () => $('paste-modal').classList.add('open'));
$('dash-fen-btn').addEventListener('click', () => $('paste-modal').classList.add('open'));
$('dash-screenshot-btn').addEventListener('click', () => $('img-modal').classList.add('open'));
$('dash-new-btn').addEventListener('click', () => loadFen(CE.START_FEN));
$('dash-settings-btn').addEventListener('click', () => $('settings-modal').classList.add('open'));

// Navigation
$('analysis-back-btn').addEventListener('click', () => { showScreen('dash'); renderDashboard(); });
$('report-back-btn').addEventListener('click', () => showScreen('analysis'));
$('puzzle-back-btn').addEventListener('click', () => showScreen('analysis'));

// Tabs
document.querySelectorAll('.nav-tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

// Controls
$('flip-btn').addEventListener('click', () => { flipped = !flipped; buildBoard(); renderBoard(); });
$('analyze-btn').addEventListener('click', () => runAnalysis());
$('review-btn').addEventListener('click', () => {
    if (inReview && gameHistory.length > 2) showGameReport();
    else $('paste-modal').classList.add('open');
});

$('first-btn').addEventListener('click', () => { if (inReview && gameHistory.length) goToHistory(0); });
$('prev-btn').addEventListener('click', () => { if (inReview && gameHistory.length) goToHistory(histIdx - 1); });
$('next-btn').addEventListener('click', () => { if (inReview && gameHistory.length) goToHistory(histIdx + 1); });
$('last-btn').addEventListener('click', () => { if (inReview && gameHistory.length) goToHistory(gameHistory.length - 1); });

// Depth
document.querySelectorAll('.depth-btn').forEach(b => {
    b.addEventListener('click', () => {
        document.querySelectorAll('.depth-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        searchDepth = +b.dataset.depth;
        depthBadge.textContent = 'D' + searchDepth;
    });
});

// Paste modal
$('cancel-paste-btn').addEventListener('click', () => $('paste-modal').classList.remove('open'));
$('load-paste-btn').addEventListener('click', () => {
    const text = $('paste-input').value;
    $('paste-modal').classList.remove('open');
    if (text.trim()) loadPasteInput(text);
});

// Image modal
$('cancel-img-btn').addEventListener('click', () => { $('img-modal').classList.remove('open'); pendingImgUrl = null; });
$('detect-btn').addEventListener('click', async () => {
    if (!pendingImgUrl) return;
    $('detect-status').textContent = 'Detecting board...';
    try {
        const result = await BD.detectFromDataUrl(pendingImgUrl);
        $('detect-status').textContent = result.message;
        if (result.fen) {
            setTimeout(() => {
                $('img-modal').classList.remove('open');
                loadFen(result.fen);
            }, 800);
        }
    } catch (e) { $('detect-status').textContent = 'Detection failed: ' + e.message; }
});

// Android shared image
window.loadSharedImage = function(dataUrl) {
    pendingImgUrl = dataUrl;
    const img = $('shared-img');
    img.src = dataUrl;
    img.classList.remove('hidden');
    $('detect-status').textContent = 'Tap "Detect Board" to analyse this screenshot.';
    $('detect-btn').disabled = false;
    $('img-modal').classList.add('open');
};

// Settings
$('settings-btn').addEventListener('click', () => $('settings-modal').classList.add('open'));
$('close-settings-btn').addEventListener('click', () => {
    $('settings-modal').classList.remove('open');
    // Apply settings
    const theme = $('board-theme-sel').value;
    boardGrid.dataset.theme = theme;
    if ($('puzzle-board-grid')) $('puzzle-board-grid').dataset.theme = theme;
    try { localStorage.setItem(STORAGE_THEME, theme); } catch(e) {}

    soundEnabled = $('sound-toggle').checked;
    try { localStorage.setItem(STORAGE_SOUND, soundEnabled ? '1' : '0'); } catch(e) {}

    const voiceMode = $('settings-voice-sel').value;
    COACH.setVoiceMode(voiceMode);
    if ($('voice-mode-sel')) $('voice-mode-sel').value = voiceMode;

    const level = $('settings-level-sel').value;
    COACH.setLevel(level);
    document.querySelectorAll('.level-btn').forEach(b => b.classList.toggle('active', b.dataset.level === level));
});

// Coach level buttons
document.querySelectorAll('.level-btn').forEach(b => {
    b.addEventListener('click', () => {
        document.querySelectorAll('.level-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        COACH.setLevel(b.dataset.level);
        $('settings-level-sel').value = b.dataset.level;
        showLocalCoach();
    });
});

// Voice mode select
$('voice-mode-sel').addEventListener('change', e => {
    COACH.setVoiceMode(e.target.value);
    $('settings-voice-sel').value = e.target.value;
});

// Heatmap toggle
$('heatmap-toggle').addEventListener('change', e => {
    heatmapOn = e.target.checked;
    renderBoard();
});

// Generate puzzles
$('gen-puzzles-btn').addEventListener('click', () => {
    if (!gameHistory.length || gameHistory.length < 3) { showToast('Review a game first'); return; }
    puzzleList = COACH.generatePuzzles(gameHistory);
    if (!puzzleList.length) { showToast('No mistakes found to create puzzles from'); return; }
    puzzleIdx = 0;
    loadPuzzle(0);
    showScreen('puzzle');
    showToast(puzzleList.length + ' puzzle' + (puzzleList.length > 1 ? 's' : '') + ' generated');
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft') $('prev-btn').click();
    if (e.key === 'ArrowRight') $('next-btn').click();
    if (e.key === 'f' || e.key === 'F') $('flip-btn').click();
    if (e.key === 'Home') $('first-btn').click();
    if (e.key === 'End') $('last-btn').click();
});

// Resize
window.addEventListener('resize', () => {
    if (currentScreen === 'analysis') { calcBoardPx(); buildBoard(); renderBoard(); }
    if (currentScreen === 'puzzle') { calcPuzzleBoardPx(); buildPuzzleBoard(); renderPuzzleBoard(); }
});

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
        if (e.target === overlay) overlay.classList.remove('open');
    });
});

$('move-detail-overlay').addEventListener('click', e => {
    if (e.target === $('move-detail-overlay')) {
        $('move-detail-overlay').classList.remove('open');
        arrowData = [];
        if (inReview) goToHistory(histIdx);
    }
});

// ---- Init ----
function init() {
    // Restore preferences
    try {
        const theme = localStorage.getItem(STORAGE_THEME) || 'brown';
        boardGrid.dataset.theme = theme;
        $('board-theme-sel').value = theme;
        if ($('puzzle-board-grid')) $('puzzle-board-grid').dataset.theme = theme;

        const snd = localStorage.getItem(STORAGE_SOUND);
        soundEnabled = snd !== '0';
        $('sound-toggle').checked = soundEnabled;

        const level = COACH.getLevel();
        $('settings-level-sel').value = level;
        document.querySelectorAll('.level-btn').forEach(b => b.classList.toggle('active', b.dataset.level === level));

        const voiceMode = COACH.getVoiceMode();
        $('settings-voice-sel').value = voiceMode;
        $('voice-mode-sel').value = voiceMode;
    } catch (e) {}

    state = CE.parseFen(CE.START_FEN);
    renderDashboard();
    showScreen('dash');
}

init();

})();
