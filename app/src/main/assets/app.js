'use strict';
// ============================================================
// Chess Analyzer — Main App Controller
// ============================================================
(function () {

// ── Piece glyphs (white = 1-6, black = 7-12) ──
const GLYPHS = ['', '♙','♘','♗','♖','♕','♔', '♟','♞','♝','♜','♛','♚'];

// ── Classification display ──
const CLS_META = {
    brilliant: { sym:'!!', label:'Brilliant',  cls:'cls-brilliant' },
    great:     { sym:'!',  label:'Great',      cls:'cls-great'     },
    best:      { sym:'✓',  label:'Best',       cls:'cls-best'      },
    good:      { sym:'',   label:'Good',       cls:'cls-good'      },
    book:      { sym:'',   label:'Book',       cls:'cls-book'      },
    inaccuracy:{ sym:'?!', label:'Inaccuracy', cls:'cls-inaccuracy'},
    mistake:   { sym:'?',  label:'Mistake',    cls:'cls-mistake'   },
    blunder:   { sym:'??', label:'Blunder',    cls:'cls-blunder'   },
};

// ── State ──
let state       = null;   // current CE.State
let gameHistory = [];     // [{state, mv, san, class, cpLoss}] full game
let histIdx     = 0;      // current position index in history
let sanHistory  = [];     // SAN strings played so far
let flipped     = false;
let selectedSq  = -1;
let legalDests  = [];
let lastMvSqs   = [];     // [from, to] of last move
let inReview    = false;  // reviewing a full PGN game
let searchDepth = 3;
let voiceEnabled= false;
let pendingPromo= null;   // {from, to, resolve}
let pendingImgUrl=null;
let currentOpening=null;
let arrowData   = [];     // [{from,to,color}]
let boardPx     = 0;      // board pixel size

// ── DOM shortcuts ──
const $=id=>document.getElementById(id);
const evalBlack=$('eval-black-fill'),evalWhite=$('eval-white-fill'),evalScore=$('eval-score');
const boardGrid=$('board-grid'),arrowCanvas=$('arrow-canvas');
const engineLines=$('engine-lines'),plansList=$('plans-list'),threatsList=$('threats-list');
const openingBar=$('opening-bar'),openingEco=$('opening-eco'),openingName=$('opening-name-text');
const spinner=$('spinner');
const depthBadge=$('depth-badge');
const whiteName=$('white-name'),blackName=$('black-name');
const whiteAccPill=$('white-accuracy-pill'),blackAccPill=$('black-accuracy-pill');
const movePairList=$('move-list');
const accReport=$('accuracy-report'),whiteAccScore=$('white-acc-score'),blackAccScore=$('black-acc-score');
const classSummary=$('class-summary');
const coachDiv=$('coach-advice');
const toast=$('toast');

// ── Board sizing ──
function calcBoardPx() {
    const sw = window.innerWidth;
    const barW = 22; // eval bar + gap
    boardPx = Math.floor(Math.min(sw - barW - 20, window.innerHeight * 0.45) / 8) * 8;
    const sqPx = boardPx / 8;
    boardGrid.style.width = boardPx + 'px';
    boardGrid.style.height = boardPx + 'px';
    document.documentElement.style.setProperty('--sq-px', sqPx + 'px');
    document.documentElement.style.setProperty('--board-size', boardPx + 'px');
    arrowCanvas.width  = boardPx;
    arrowCanvas.height = boardPx;
    arrowCanvas.style.width  = boardPx + 'px';
    arrowCanvas.style.height = boardPx + 'px';
}

// ── Board rendering ──
function buildBoard() {
    boardGrid.innerHTML = '';
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const div = document.createElement('div');
            div.className = 'sq ' + ((row + col) % 2 === 0 ? 'light' : 'dark');
            boardGrid.appendChild(div);
        }
    }
}

function sqToCell(sq) {
    // sq: 0=a1..63=h8. Board row 0 (visual top) = rank 8 normally
    const rank = CE.rankOf(sq), file = CE.fileOf(sq);
    const row  = flipped ? rank      : 7 - rank;
    const col  = flipped ? 7 - file  : file;
    return row * 8 + col;
}

function renderBoard() {
    if (!state) return;
    const cells = boardGrid.querySelectorAll('.sq');
    cells.forEach((cell, idx) => {
        // Determine which square this cell shows
        const row = Math.floor(idx / 8), col = idx % 8;
        const rank = flipped ? row      : 7 - row;
        const file  = flipped ? 7 - col : col;
        const sq   = rank * 8 + file;

        // Reset classes
        cell.className = 'sq ' + ((row + col) % 2 === 0 ? 'light' : 'dark');

        // Highlights
        if (lastMvSqs.includes(sq))  cell.classList.add('hl-last');
        if (sq === selectedSq)       cell.classList.add('hl-sel');
        if (legalDests.includes(sq)) {
            cell.classList.add('hl-dest');
            if (state.board[sq]) cell.classList.add('occupied');
        }

        // King in check
        const p = state.board[sq];
        if (p === (state.side === CE.WHITE ? CE.wK : CE.bK)) {
            const kSq = CE.findKing(state.board, state.side);
            if (kSq === sq && CE.isAttacked(state.board, sq, 1 - state.side))
                cell.classList.add('hl-check');
        }

        // Piece
        cell.innerHTML = '';
        if (p) {
            const span = document.createElement('span');
            span.className = 'piece ' + (CE.colorOf(p) === CE.WHITE ? 'white' : 'black');
            span.textContent = GLYPHS[p];
            cell.appendChild(span);
        }
    });

    drawArrows();
}

// ── Arrow drawing ──
function drawArrows() {
    const ctx = arrowCanvas.getContext('2d');
    ctx.clearRect(0, 0, boardPx, boardPx);
    for (const a of arrowData) drawArrow(ctx, a.from, a.to, a.color || 'rgba(200,80,80,0.8)');
}

function drawArrow(ctx, from, to, color) {
    const sq = boardPx / 8;
    const fr = CE.rankOf(from), ff = CE.fileOf(from);
    const tr = CE.rankOf(to),   tf = CE.fileOf(to);
    const vr1 = flipped ? fr      : 7 - fr, vc1 = flipped ? 7 - ff : ff;
    const vr2 = flipped ? tr      : 7 - tr, vc2 = flipped ? 7 - tf : tf;
    const x1 = vc1*sq+sq/2, y1 = vr1*sq+sq/2;
    const x2 = vc2*sq+sq/2, y2 = vr2*sq+sq/2;
    const angle = Math.atan2(y2-y1, x2-x1);
    const hl = sq*0.38, sw = sq*0.13;
    ctx.save();
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = sw; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - hl*Math.cos(angle-Math.PI/6), y2 - hl*Math.sin(angle-Math.PI/6));
    ctx.lineTo(x2 - hl*Math.cos(angle+Math.PI/6), y2 - hl*Math.sin(angle+Math.PI/6));
    ctx.closePath(); ctx.fill();
    ctx.restore();
}

// ── Board interaction ──
boardGrid.addEventListener('click', e => {
    if (!state) return;
    const cell = e.target.closest('.sq'); if (!cell) return;
    const cells = [...boardGrid.querySelectorAll('.sq')];
    const idx   = cells.indexOf(cell);
    const row = Math.floor(idx/8), col = idx%8;
    const rank = flipped ? row : 7-row, file = flipped ? 7-col : col;
    const sq   = rank*8+file;

    if (selectedSq >= 0 && legalDests.includes(sq)) {
        // Try to make the move
        const legal = CE.legalMoves(state);
        const candidates = legal.filter(m => m.from===selectedSq && m.to===sq);
        if (!candidates.length) { clearSel(); return; }

        // Promotion?
        const promoMoves = candidates.filter(m => m.flags===16 || m.flags===17);
        if (promoMoves.length) {
            showPromoModal(sq, candidates[0].from, mv => commitMove(mv));
            return;
        }
        commitMove(candidates[0]);
        return;
    }

    // Select piece
    const p = state.board[sq];
    if (p && CE.colorOf(p) === state.side) {
        selectedSq  = sq;
        legalDests  = CE.legalMoves(state).filter(m => m.from===sq).map(m => m.to);
    } else {
        clearSel();
    }
    renderBoard();
});

function clearSel() { selectedSq=-1; legalDests=[]; }

function commitMove(mv) {
    const legal = CE.legalMoves(state);
    const san   = CE.moveToSan(state, mv, legal);
    lastMvSqs   = [mv.from, mv.to];
    state       = CE.applyMove(state, mv);
    sanHistory.push(san);
    clearSel();
    // Update opening
    currentOpening = identifyOpening(sanHistory);
    renderBoard();
    updateOpeningBar();
    if (voiceEnabled) speak(san);
    // Auto-analyze after player moves
    if (!inReview) runAnalysis();
}

// ── Promotion modal ──
function showPromoModal(toSq, fromSq, cb) {
    const side   = state.side;
    const pieces = side===CE.WHITE ? [CE.wQ,CE.wR,CE.wB,CE.wN] : [CE.bQ,CE.bR,CE.bB,CE.bN];
    const div    = $('promo-choices');
    div.innerHTML = '';
    for (const p of pieces) {
        const btn = document.createElement('span');
        btn.className = 'promo-choice ' + (side===CE.WHITE ? 'white' : 'black');
        btn.textContent = GLYPHS[p];
        btn.onclick = () => {
            $('promo-modal').classList.remove('open');
            const legal = CE.legalMoves(state);
            const mv = legal.find(m => m.from===fromSq && m.to===toSq && (m.flags===16||m.flags===17) && m.promo===p);
            if (mv) cb(mv);
        };
        div.appendChild(btn);
    }
    $('promo-modal').classList.add('open');
}

// ── Opening identification ──
function identifyOpening(sans) {
    return typeof OPENINGS_DB !== 'undefined' ? identifyOpening_ext(sans) : null;
}
// Reference the function from openings.js
function identifyOpening_ext(sans) {
    if (typeof identifyOpening === 'undefined') return null;
    return window.identifyOpening ? window.identifyOpening(sans) : null;
}

function updateOpeningBar() {
    const op = currentOpening;
    if (op) {
        openingBar.classList.remove('hidden');
        openingEco.textContent   = op.eco;
        openingName.textContent  = op.name;
    } else {
        openingBar.classList.add('hidden');
    }
}

// ── Eval bar ──
function updateEvalBar(cp) {
    // cp from white's perspective; clamp to [-1500, 1500]
    const clamped = Math.max(-1500, Math.min(1500, cp));
    const whitePct = 50 + 50*(clamped/1500);
    evalWhite.style.flex = whitePct.toString();
    evalBlack.style.flex = (100-whitePct).toString();
    const abs = Math.abs(cp);
    const display = abs >= 9000
        ? (cp>0 ? '#' : '-#')   // mate
        : (cp>=0 ? '+' : '') + (cp/100).toFixed(1);
    evalScore.textContent = display;
    evalScore.style.color = cp > 50 ? '#f0f0f0' : cp < -50 ? '#888' : 'var(--text2)';
}

// ── Engine Analysis ──
function runAnalysis() {
    if (!state) return;
    spinner.classList.add('active');
    arrowData = [];

    setTimeout(() => {
        try {
            const top = CE.getTopMoves(state, searchDepth, 3);
            const rawEval = CE.evaluate(state);
            updateEvalBar(rawEval);
            renderEngineLines(state, top);

            // Arrows for top 3 moves
            const colors = ['rgba(255,80,80,0.8)','rgba(80,160,255,0.75)','rgba(200,200,200,0.55)'];
            arrowData = top.map((t,i) => ({from:t.mv.from, to:t.mv.to, color:colors[i]}));
            drawArrows();

            const {plans, threats} = CE.analyzePosition(state);
            renderPlans(plans);
            renderThreats(threats);

            // Update opening
            currentOpening = identifyOpening(sanHistory);
            updateOpeningBar();

            // If coach tab active, auto-refresh local advice
            if ($('htab-coach').classList.contains('active')) {
                showLocalCoach();
            }
        } finally {
            spinner.classList.remove('active');
        }
    }, 20);
}

function renderEngineLines(s, top) {
    if (!top.length) { engineLines.innerHTML='<div class="engine-line"><span class="line-rank"></span><span class="line-score zero">—</span><span class="line-moves">No legal moves</span></div>'; return; }
    const legal = CE.legalMoves(s);
    engineLines.innerHTML = top.map(({mv,sc},i) => {
        const cp  = s.side===CE.WHITE ? sc : -sc;
        const scoreStr = Math.abs(sc)>=9000
            ? (cp>0?'M':'−M')+Math.ceil((10000-Math.abs(sc))/2)
            : (cp>=0?'+':'')+(cp/100).toFixed(2);
        const cls = cp>0.5?'pos':cp<-0.5?'neg':'zero';
        const san = CE.moveToSan(s, mv, legal);
        return `<div class="engine-line">
            <span class="line-rank">${i+1}</span>
            <span class="line-score ${cls}">${scoreStr}</span>
            <span class="line-moves"><strong>${san}</strong></span>
        </div>`;
    }).join('');
}

function renderPlans(plans) {
    if (!plans.length) { plansList.innerHTML='<li class="color-dim" style="list-style:none;padding:8px">None detected</li>'; return; }
    plansList.innerHTML = plans.map(p=>`<li>${p}</li>`).join('');
}
function renderThreats(threats) {
    if (!threats.length) { threatsList.innerHTML='<li class="color-dim" style="list-style:none;padding:8px">None</li>'; return; }
    threatsList.innerHTML = threats.map(t=>{
        if(t.type==='hanging') return`<li>${t.side}'s ${t.piece||'P'} on ${t.sq} is undefended</li>`;
        if(t.type==='king')    return`<li>${t.side}'s king faces danger</li>`;
        return`<li>${t.text||JSON.stringify(t)}</li>`;
    }).join('');
}

// ── Game Review ──
async function reviewGame(pgn) {
    if (!pgn.trim()) return;
    let headers, sanMoves, history;
    try {
        ({headers, sanMoves} = PGN.parsePgn(pgn));
        history = PGN.replayGame(sanMoves);
    } catch(e) {
        showToast('Failed to parse PGN: ' + e.message); return;
    }
    if (history.length < 2) { showToast('No moves found in PGN'); return; }

    whiteName.textContent = headers.White || 'White';
    blackName.textContent = headers.Black || 'Black';

    inReview = true;
    gameHistory = history.map(h => ({...h, class:null, cpLoss:null}));
    histIdx = gameHistory.length - 1;

    spinner.classList.add('active');
    showToast('Analyzing game… this may take a moment');

    // Analyze each position
    await new Promise(resolve => setTimeout(async () => {
        try {
            let wCpl = 0, bCpl = 0, wMoves = 0, bMoves = 0;
            const bestScores = [];

            for (let i = 0; i < gameHistory.length - 1; i++) {
                const s    = gameHistory[i].state;
                const move = gameHistory[i+1].mv;
                if (!move) continue;

                const top   = CE.getTopMoves(s, Math.min(searchDepth, 3), 1);
                const bestSc = top.length ? top[0].sc : 0;
                const ns     = CE.applyMove(s, move);
                const moveSc = -CE.evaluate(ns) * (s.side===CE.WHITE?1:-1);
                // Normalize from side's perspective
                const bestCp  = s.side===CE.WHITE ?  bestSc : -bestSc;
                const moveCp  = s.side===CE.WHITE ?  moveSc : -moveSc;
                const cpLoss  = Math.max(0, bestCp - moveCp);
                const isSac   = CE.isMaterialSacrifice(s, move);

                let cls;
                if (i < 10 && isBookMove(sanMoves.slice(0,i+1))) {
                    cls = 'book';
                } else {
                    cls = CE.classifyMove(bestCp, moveCp, isSac);
                }

                gameHistory[i+1].class  = cls;
                gameHistory[i+1].cpLoss = cpLoss;

                if (s.side===CE.WHITE) { wCpl+=cpLoss; wMoves++; }
                else                   { bCpl+=cpLoss; bMoves++; }

                bestScores.push({idx:i+1, bestSc, moveSc, cp:moveCp, san:gameHistory[i+1].san});
            }

            const wAcc = CE.cpToAccuracy(wMoves ? wCpl/wMoves : 0);
            const bAcc = CE.cpToAccuracy(bMoves ? bCpl/bMoves : 0);

            accReport.classList.remove('hidden');
            whiteAccScore.textContent = wAcc.toFixed(1)+'%';
            blackAccScore.textContent = bAcc.toFixed(1)+'%';
            whiteAccScore.className = 'acc-score '+(wAcc>=80?'high':wAcc>=60?'mid':'low');
            blackAccScore.className = 'acc-score '+(bAcc>=80?'high':bAcc>=60?'mid':'low');

            whiteAccPill.textContent = wAcc.toFixed(1)+'%';
            whiteAccPill.className = 'accuracy-pill '+(wAcc>=80?'high':wAcc>=60?'mid':'low');
            whiteAccPill.classList.remove('hidden');
            blackAccPill.textContent = bAcc.toFixed(1)+'%';
            blackAccPill.className = 'accuracy-pill '+(bAcc>=80?'high':bAcc>=60?'mid':'low');
            blackAccPill.classList.remove('hidden');

            renderClassSummary();
            renderMoveList();
            goToHistory(gameHistory.length - 1);
        } finally {
            spinner.classList.remove('active');
            resolve();
        }
    }, 50));
}

function isBookMove(sans) {
    const key = sans.join(' ');
    return OPENINGS_DB.some(([moves]) => key === moves || key.startsWith(moves+' '));
}

function renderClassSummary() {
    const counts = {};
    for (const h of gameHistory) if (h.class) counts[h.class]=(counts[h.class]||0)+1;
    const order = ['brilliant','great','best','good','book','inaccuracy','mistake','blunder'];
    classSummary.innerHTML = order.filter(c=>counts[c]).map(c=>{
        const m = CLS_META[c]||{sym:'',label:c};
        return `<div class="class-pill ${CLS_META[c]?.cls||''}"><span class="cls-sym">${m.sym||'○'}</span>${counts[c]} ${m.label}</div>`;
    }).join('');
    classSummary.classList.remove('hidden');
}

function renderMoveList() {
    let html = '';
    for (let i = 1; i < gameHistory.length; i += 2) {
        const wMove = gameHistory[i];
        const bMove = gameHistory[i+1];
        const moveNum = Math.ceil(i/2);
        html += `<div class="move-pair" data-idx="${i}">
            <div class="move-num">${moveNum}</div>
            <div class="move-cell ${wMove?.class?'cls-'+(wMove.class):''}" data-idx="${i}">${moveCell(wMove)}</div>
            <div class="move-cell ${bMove?.class?'cls-'+(bMove.class):''}" data-idx="${i+1}">${moveCell(bMove)}</div>
        </div>`;
    }
    movePairList.innerHTML = html;
    // Click handlers
    movePairList.querySelectorAll('.move-cell[data-idx]').forEach(cell => {
        cell.addEventListener('click', () => goToHistory(+cell.dataset.idx));
    });
}

function moveCell(h) {
    if (!h || !h.san) return '<span class="move-san">—</span>';
    const m = CLS_META[h.class] || {sym:''};
    return `<span class="move-san">${h.san}</span><span class="move-class-icon">${m.sym}</span>`;
}

function goToHistory(idx) {
    if (!gameHistory.length) return;
    idx = Math.max(0, Math.min(idx, gameHistory.length-1));
    histIdx = idx;
    state = gameHistory[idx].state;
    if (idx > 0) {
        const mv = gameHistory[idx].mv;
        lastMvSqs = mv ? [mv.from, mv.to] : [];
    } else lastMvSqs = [];
    clearSel(); renderBoard();
    // Show eval for this position
    updateEvalBar(CE.evaluate(state));
    // Highlight active move in list
    movePairList.querySelectorAll('.move-cell').forEach(c => c.classList.remove('active'));
    if (idx > 0) {
        const cell = movePairList.querySelector(`.move-cell[data-idx="${idx}"]`);
        if (cell) { cell.classList.add('active'); cell.scrollIntoView({block:'nearest'}); }
    }
}

// ── Coach ──
function showLocalCoach() {
    if (!state) return;
    const rawEval = CE.evaluate(state);
    const text = COACH.localAdvice(state, sanHistory, currentOpening, rawEval);
    coachDiv.innerHTML = COACH.formatAdviceHtml(text);
}

async function askCoachFull(customQ) {
    if (!state) { showToast('Load a position first'); return; }
    spinner.classList.add('active');
    coachDiv.innerHTML = '<div class="coach-empty">Thinking…</div>';
    try {
        const rawEval = CE.evaluate(state);
        const apiKey = COACH.getApiKey();
        let text;
        if (apiKey) {
            text = await COACH.askClaude(state, sanHistory, currentOpening, rawEval, customQ||null);
            if (!text) throw new Error('Empty response');
        } else {
            text = COACH.localAdvice(state, sanHistory, currentOpening, rawEval);
        }
        coachDiv.innerHTML = COACH.formatAdviceHtml(text);
    } catch(e) {
        coachDiv.innerHTML = `<div style="color:var(--c-mistake)">Error: ${e.message}</div>`;
        showLocalCoach(); // fallback
    } finally {
        spinner.classList.remove('active');
    }
}

// ── Load FEN ──
function loadFen(fen) {
    try {
        state = CE.parseFen(fen.trim());
        sanHistory = []; lastMvSqs = []; clearSel();
        inReview = false; gameHistory = [];
        currentOpening = null; arrowData = [];
        updateOpeningBar();
        renderBoard();
        updateEvalBar(CE.evaluate(state));
        runAnalysis();
    } catch(e) { showToast('Invalid FEN: ' + e.message); }
}

// ── PGN or FEN paste ──
function loadPasteInput(raw) {
    const text = raw.trim();
    // Detect if it looks like a FEN (contains slashes and spaces)
    if (/^[rnbqkpRNBQKP1-8\/]+ [wb]/.test(text)) {
        loadFen(text);
    } else {
        // Try as PGN
        switchTab('review');
        reviewGame(text);
    }
}

// ── TTS ──
function speak(text) {
    if (!voiceEnabled || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text.replace(/[+#!?]/g,'').replace(/=/,' promotes to '));
    u.rate = 1.1;
    window.speechSynthesis.speak(u);
}

// ── Tab switching ──
function switchTab(name) {
    document.querySelectorAll('.htab').forEach(b => b.classList.toggle('active', b.dataset.htab===name));
    document.querySelectorAll('.htab-content').forEach(d => d.classList.toggle('active', d.id==='htab-'+name));
}
document.querySelectorAll('.htab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.htab)));

// ── Controls ──
$('flip-btn').addEventListener('click', () => { flipped=!flipped; renderBoard(); });
$('analyze-btn').addEventListener('click', () => runAnalysis());

$('prev-btn').addEventListener('click', () => {
    if (inReview && gameHistory.length) goToHistory(histIdx-1);
});
$('next-btn').addEventListener('click', () => {
    if (inReview && gameHistory.length) goToHistory(histIdx+1);
});

// Depth buttons
document.querySelectorAll('.depth-btn').forEach(b => {
    b.addEventListener('click', () => {
        document.querySelectorAll('.depth-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        searchDepth = +b.dataset.depth;
        depthBadge.textContent = 'D' + searchDepth;
    });
});

// Paste PGN/FEN
$('paste-btn').addEventListener('click', () => $('paste-modal').classList.add('open'));
$('review-paste-btn').addEventListener('click', () => $('paste-modal').classList.add('open'));
$('cancel-paste-btn').addEventListener('click', () => $('paste-modal').classList.remove('open'));
$('load-paste-btn').addEventListener('click', () => {
    const text = $('paste-input').value;
    $('paste-modal').classList.remove('open');
    if (text.trim()) loadPasteInput(text);
});

// Image
$('image-btn').addEventListener('click', () => $('img-modal').classList.add('open'));
$('cancel-img-btn').addEventListener('click', () => { $('img-modal').classList.remove('open'); pendingImgUrl=null; });
$('detect-btn').addEventListener('click', async () => {
    if (!pendingImgUrl) return;
    $('detect-status').textContent = 'Detecting board…';
    try {
        const result = await BD.detectFromDataUrl(pendingImgUrl);
        $('detect-status').textContent = result.message;
        if (result.fen) {
            setTimeout(() => {
                $('img-modal').classList.remove('open');
                loadFen(result.fen);
            }, 900);
        }
    } catch(e) { $('detect-status').textContent = 'Detection failed: ' + e.message; }
});

// Called by Android
window.loadSharedImage = function(dataUrl) {
    pendingImgUrl = dataUrl;
    const img = $('shared-img');
    img.src = dataUrl;
    img.classList.remove('hidden');
    $('detect-status').textContent = 'Tap "Detect Board" to analyse this screenshot.';
    $('detect-btn').disabled = false;
    $('img-modal').classList.add('open');
};

// Coach
$('ask-coach-btn').addEventListener('click', () => askCoachFull(null));
document.querySelectorAll('.q-btn').forEach(b => b.addEventListener('click', () => askCoachFull(b.dataset.q)));
$('save-key-btn').addEventListener('click', () => {
    COACH.saveApiKey($('api-key-input').value.trim());
    showToast('API key saved');
});

// Settings
$('settings-btn').addEventListener('click', () => $('settings-modal').classList.add('open'));
$('close-settings-btn').addEventListener('click', () => $('settings-modal').classList.remove('open'));
$('board-theme-sel').addEventListener('change', e => {
    boardGrid.dataset.theme = e.target.value;
    try { localStorage.setItem('chess_theme', e.target.value); } catch(err){}
});
$('voice-toggle').addEventListener('change', e => { voiceEnabled = e.target.checked; });

// ── Toast ──
let toastTimer;
function showToast(msg) {
    toast.textContent = msg; toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── Keyboard shortcuts ──
document.addEventListener('keydown', e => {
    if (e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return;
    if (e.key==='ArrowLeft')  $('prev-btn').click();
    if (e.key==='ArrowRight') $('next-btn').click();
    if (e.key==='f')          $('flip-btn').click();
});

// ── Resize ──
window.addEventListener('resize', () => { calcBoardPx(); buildBoard(); renderBoard(); });

// ── Init ──
function init() {
    calcBoardPx();
    buildBoard();

    // Restore preferences
    try {
        const theme = localStorage.getItem('chess_theme') || 'brown';
        boardGrid.dataset.theme = theme;
        $('board-theme-sel').value = theme;
        const key = COACH.getApiKey();
        if (key) $('api-key-input').value = key;
    } catch(e) {}

    // Wire up openings identifier
    window.identifyOpening = identifyOpening_outer;

    loadFen(CE.START_FEN);
}

function identifyOpening_outer(sans) {
    if (typeof OPENINGS_DB === 'undefined') return null;
    const key = sans.join(' ');
    let best = null;
    for (const [moves, name, eco] of OPENINGS_DB) {
        if (key === moves || key.startsWith(moves+' ')) {
            if (!best || moves.length > best.moves.length) best = {moves, name, eco};
        }
    }
    return best;
}

init();
})();
