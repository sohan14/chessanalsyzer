'use strict';
// ============================================================
// Chess Analyzer — Main App Controller
// ============================================================

(function() {
// ---- DOM refs ----
const fenInput     = document.getElementById('fen-input');
const analyzeBtn   = document.getElementById('analyze-btn');
const shareBtn     = document.getElementById('share-btn');
const detectBtn    = document.getElementById('detect-btn');
const cancelBtn    = document.getElementById('cancel-btn');
const imgModal     = document.getElementById('img-modal');
const sharedImg    = document.getElementById('shared-img');
const detectMsg    = document.getElementById('detect-message');
const evalWhite    = document.getElementById('eval-white-fill');
const evalLabel    = document.getElementById('eval-label');
const engineLines  = document.getElementById('engine-lines');
const moveClassDiv = document.getElementById('move-class-content');
const plansList    = document.getElementById('plans-list');
const threatsList  = document.getElementById('threats-list');
const boardCanvas  = document.getElementById('board-canvas');
const depthSelect  = document.getElementById('depth-select');
const spinner      = document.getElementById('spinner');
const sideBtns     = document.querySelectorAll('.side-btn');

// ---- Board rendering config ----
const LIGHT = '#eeeed2';
const DARK  = '#769656';
const HL_COLOR = 'rgba(246,246,105,0.55)';
const MOVE_COLOR = 'rgba(130,190,90,0.5)';
const ARROW_COLOR = 'rgba(255,70,70,0.7)';

// Unicode piece glyphs  — index matches CE piece constants
const GLYPHS = ['','♙','♘','♗','♖','♕','♔','♟','♞','♝','♜','♛','♚'];

// ---- App state ----
let currentState = null;    // CE State
let flipped      = false;   // board orientation
let selectedSq   = -1;      // currently selected square
let legalDests   = [];      // legal target squares for selected piece
let highlightSqs = [];      // squares to highlight (last move)
let arrows       = [];      // [{from,to}] engine arrows
let pendingDataUrl = null;  // shared image data URL

// ---- Sizing ----
function boardSize() {
    // Fill available space minus eval bar (22px) and padding
    const margin = 20 + 22;
    const maxW = window.innerWidth - margin;
    const maxH = window.innerHeight - 80; // minus header
    return Math.floor(Math.min(maxW, maxH, 440) / 8) * 8;
}

// ---- Board rendering ----
function renderBoard(state) {
    if (!state) return;
    const size = boardSize();
    boardCanvas.width  = size;
    boardCanvas.height = size;
    const ctx  = boardCanvas.getContext('2d');
    const sq   = size / 8;

    for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
            const visR = flipped ? r   : 7 - r;
            const visF = flipped ? 7-f : f;
            const sqIdx = visR * 8 + visF;
            const x = f * sq, y = r * sq;

            // Square color
            ctx.fillStyle = (r + f) % 2 === 0 ? LIGHT : DARK;
            ctx.fillRect(x, y, sq, sq);

            // Highlight
            if (highlightSqs.includes(sqIdx)) {
                ctx.fillStyle = HL_COLOR;
                ctx.fillRect(x, y, sq, sq);
            }
            // Legal move dot
            if (legalDests.includes(sqIdx)) {
                const piece = state.board[sqIdx];
                if (piece && CE.colorOf ? false : false); // placeholder
                ctx.fillStyle = MOVE_COLOR;
                if (state.board[sqIdx]) {
                    ctx.strokeStyle = MOVE_COLOR;
                    ctx.lineWidth = 4;
                    ctx.strokeRect(x+2, y+2, sq-4, sq-4);
                } else {
                    ctx.beginPath();
                    ctx.arc(x+sq/2, y+sq/2, sq*0.15, 0, Math.PI*2);
                    ctx.fill();
                }
            }
            // Selected square ring
            if (sqIdx === selectedSq) {
                ctx.strokeStyle = 'rgba(255,255,80,0.9)';
                ctx.lineWidth = 3;
                ctx.strokeRect(x+1, y+1, sq-2, sq-2);
            }

            // Piece
            const piece = state.board[sqIdx];
            if (piece) {
                const glyph = GLYPHS[piece];
                ctx.font = `bold ${Math.floor(sq*0.78)}px serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                // Shadow for visibility
                ctx.fillStyle = piece <= 6 ? '#333' : '#aaa';
                ctx.fillText(glyph, x+sq/2+1.5, y+sq/2+1.5);
                ctx.fillStyle = piece <= 6 ? '#ffffff' : '#111111';
                ctx.fillText(glyph, x+sq/2, y+sq/2);
            }
        }
    }

    // Draw arrows for engine lines
    ctx.globalAlpha = 0.75;
    for (let ai = 0; ai < arrows.length; ai++) {
        const {from, to} = arrows[ai];
        const colors = ['rgba(255,70,70,0.8)','rgba(80,180,255,0.8)','rgba(200,200,200,0.6)'];
        drawArrow(ctx, from, to, sq, colors[ai] || ARROW_COLOR);
    }
    ctx.globalAlpha = 1;

    // Coordinates — rank numbers on left
    ctx.font = `bold ${Math.floor(sq*0.2)}px monospace`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    for (let r = 0; r < 8; r++) {
        const rankNum = flipped ? r+1 : 8-r;
        ctx.fillStyle = r%2===0 ? DARK : LIGHT;
        ctx.fillText(rankNum, 2, r*sq+2);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    for (let f = 0; f < 8; f++) {
        const fileLet = String.fromCharCode(97 + (flipped ? 7-f : f));
        ctx.fillStyle = f%2===0 ? DARK : LIGHT;
        ctx.fillText(fileLet, (f+1)*sq-2, 8*sq-2);
    }
}

function drawArrow(ctx, from, to, sq, color) {
    const fr = flipped ? Math.floor(from/8) : 7-Math.floor(from/8);
    const ff = flipped ? 7-(from%8)         : from%8;
    const tr = flipped ? Math.floor(to/8)   : 7-Math.floor(to/8);
    const tf = flipped ? 7-(to%8)           : to%8;

    const x1=ff*sq+sq/2, y1=fr*sq+sq/2;
    const x2=tf*sq+sq/2, y2=tr*sq+sq/2;
    const angle=Math.atan2(y2-y1,x2-x1);
    const headLen=sq*0.35, shaftW=sq*0.12;

    ctx.save();
    ctx.strokeStyle=color; ctx.fillStyle=color;
    ctx.lineWidth=shaftW; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(x2,y2);
    ctx.lineTo(x2-headLen*Math.cos(angle-Math.PI/6), y2-headLen*Math.sin(angle-Math.PI/6));
    ctx.lineTo(x2-headLen*Math.cos(angle+Math.PI/6), y2-headLen*Math.sin(angle+Math.PI/6));
    ctx.closePath(); ctx.fill();
    ctx.restore();
}

// ---- Board interaction ----
boardCanvas.addEventListener('click', e => {
    if (!currentState) return;
    const sq   = boardSize() / 8;
    const rect  = boardCanvas.getBoundingClientRect();
    const px   = (e.clientX - rect.left) / (rect.width / boardCanvas.width);
    const py   = (e.clientY - rect.top) / (rect.height / boardCanvas.height);
    const f    = Math.floor(px / sq);
    const r    = Math.floor(py / sq);
    const visF = flipped ? 7-f : f;
    const visR = flipped ? r   : 7-r;
    const sqIdx = visR*8+visF;

    if (selectedSq >= 0 && legalDests.includes(sqIdx)) {
        // Make the move
        const lm = CE.legalMoves(currentState);
        const promoLegal = lm.filter(m=>m.from===selectedSq&&m.to===sqIdx);
        let mv = promoLegal.find(m=>!(m.flags===16||m.flags===17)) || promoLegal[0];
        if (!mv) { selectedSq=-1; legalDests=[]; renderBoard(currentState); return; }
        highlightSqs = [selectedSq, sqIdx];
        currentState = CE.applyMove(currentState, mv);
        selectedSq = -1; legalDests = [];
        fenInput.value = CE.stateToFen(currentState);
        renderBoard(currentState);
        runAnalysis();
        return;
    }

    const piece = currentState.board[sqIdx];
    const sideColor = currentState.side === CE.WHITE ? 1 : 7; // white pieces 1-6, black 7-12
    if (piece && (currentState.side===CE.WHITE ? piece<=6 : piece>=7)) {
        selectedSq  = sqIdx;
        legalDests  = CE.legalMoves(currentState).filter(m=>m.from===sqIdx).map(m=>m.to);
    } else {
        selectedSq=-1; legalDests=[];
    }
    renderBoard(currentState);
});

// ---- Eval bar update ----
function updateEvalBar(cp) {
    // cp: centipawns from white's perspective. Clamp to ±1000 for display.
    const clamped = Math.max(-1000, Math.min(1000, cp));
    const pct = 50 + 50 * (clamped / 1000);
    evalWhite.style.height = pct + '%';
    const display = Math.abs(cp) >= 9000
        ? (cp > 0 ? 'M' : '-M')
        : (cp / 100).toFixed(1);
    evalLabel.textContent = cp > 0 ? '+'+display : display;
}

// ---- Analysis ----
function runAnalysis() {
    if (!currentState) return;
    spinner.classList.add('active');
    arrows = [];

    const depth = parseInt(depthSelect.value, 10) || 3;

    // Use setTimeout to let UI update before blocking computation
    setTimeout(() => {
        try {
            const top = CE.getTopMoves(currentState, depth, 3);
            const {plans, threats} = CE.analyzePosition(currentState);

            // Eval (from white's perspective)
            const rawEval = CE.evaluate(currentState);
            updateEvalBar(rawEval);

            // Engine lines
            renderEngineLines(currentState, top);

            // Set arrows for top 3 moves
            arrows = top.slice(0,3).map(t=>({from:t.mv.from,to:t.mv.to}));

            // Move classification (compare last half-move if there was a previous state)
            renderMoveClass(top);

            // Plans & threats
            renderPlans(plans);
            renderThreats(threats);

            renderBoard(currentState);
        } finally {
            spinner.classList.remove('active');
        }
    }, 20);
}

function renderEngineLines(state, top) {
    if (!top.length) {
        engineLines.innerHTML = '<div class="empty-state">No legal moves</div>';
        return;
    }
    let html = '';
    const lm = CE.legalMoves(state);
    for (const {mv, sc} of top) {
        const cp = state.side===CE.WHITE ? sc : -sc;
        const scoreStr = cp >= 9000 ? 'M'+Math.ceil((10000-Math.abs(sc))/2)
                       : cp <=-9000 ? '-M'+Math.ceil((10000-Math.abs(sc))/2)
                       : (cp>=0?'+':'')+(cp/100).toFixed(2);
        const san = CE.moveToSan(state, mv, lm);
        html += `<div class="engine-line">
            <span class="line-score">${scoreStr}</span>
            <span class="line-moves">${san}</span>
        </div>`;
    }
    engineLines.innerHTML = html;
}

function renderMoveClass(top) {
    if (!top.length) { moveClassDiv.innerHTML='<span class="empty-state">—</span>'; return; }
    const bestCp = top[0].sc;
    // For display, classify the top move as "best" by default
    const cls = 'best';
    const badge = `<span class="class-badge ${cls}">${classIcon(cls)} ${cls}</span>`;
    moveClassDiv.innerHTML = badge + '<span class="class-detail">Top engine move</span>';
}

function classIcon(cls) {
    return {brilliant:'!!',best:'!',good:'⩱',inaccuracy:'?!',mistake:'?',blunder:'??'}[cls]||'';
}

function renderPlans(plans) {
    if (!plans.length) {
        plansList.innerHTML='<div class="empty-state">—</div>'; return;
    }
    plansList.innerHTML = plans.map(p=>`<li>${p}</li>`).join('');
}
function renderThreats(threats) {
    if (!threats.length) {
        threatsList.innerHTML='<div class="empty-state">No immediate threats</div>'; return;
    }
    threatsList.innerHTML = threats.map(t=>`<li>${t}</li>`).join('');
}

// ---- FEN load ----
function loadFen(fen) {
    try {
        currentState = CE.parseFen(fen.trim());
        fenInput.value = CE.stateToFen(currentState);
        selectedSq=-1; legalDests=[]; highlightSqs=[]; arrows=[];
        updateSideButtons();
        renderBoard(currentState);
        runAnalysis();
    } catch(e) {
        alert('Invalid FEN: '+e.message);
    }
}

analyzeBtn.addEventListener('click', ()=>loadFen(fenInput.value||CE.START_FEN));
fenInput.addEventListener('keydown', e=>{ if(e.key==='Enter') loadFen(fenInput.value); });

// ---- Side-to-move toggle ----
function updateSideButtons() {
    if (!currentState) return;
    sideBtns.forEach(b=>{
        b.classList.toggle('active', b.dataset.side===(currentState.side===CE.WHITE?'w':'b'));
    });
}
sideBtns.forEach(b=>{
    b.addEventListener('click', ()=>{
        if (!currentState) return;
        currentState = CE.parseFen(
            CE.stateToFen(currentState).replace(/ [wb] /,
            b.dataset.side==='w' ? ' w ' : ' b ')
        );
        updateSideButtons();
        renderBoard(currentState);
        runAnalysis();
    });
});

// ---- Flip board ----
document.getElementById('flip-btn').addEventListener('click', ()=>{
    flipped=!flipped; renderBoard(currentState);
});

// ---- Depth select ----
depthSelect.addEventListener('change', ()=>{ if(currentState) runAnalysis(); });

// ---- Share image handling ----
shareBtn.addEventListener('click', ()=>{
    // On desktop/browser: prompt for image URL for testing
    const url = prompt('Paste image URL or data URL for board detection:');
    if (url) handleSharedImage(url);
});

// Called by Android via evaluateJavascript
window.loadSharedImage = function(dataUrl) {
    pendingDataUrl = dataUrl;
    sharedImg.src  = dataUrl;
    detectMsg.textContent = 'Tap "Detect Board" to analyse this position.';
    imgModal.classList.add('open');
};

detectBtn.addEventListener('click', async ()=>{
    if (!pendingDataUrl) return;
    detectMsg.textContent = 'Detecting board…';
    try {
        const result = await BD.detectFromDataUrl(pendingDataUrl);
        detectMsg.textContent = result.message;
        if (result.fen) {
            setTimeout(()=>{
                imgModal.classList.remove('open');
                loadFen(result.fen);
            }, 1200);
        }
    } catch(e) {
        detectMsg.textContent = 'Detection failed: '+e.message;
    }
});

cancelBtn.addEventListener('click', ()=>{
    imgModal.classList.remove('open');
    pendingDataUrl=null;
});

// ---- Resize handling ----
window.addEventListener('resize', ()=>{ if(currentState) renderBoard(currentState); });

// ---- Init ----
loadFen(CE.START_FEN);

})();
