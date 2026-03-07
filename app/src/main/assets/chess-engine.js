'use strict';
// ============================================================
// Chess Engine — Minimax + Alpha-Beta Pruning (depth 3-4)
// ============================================================
const CE = (() => {

// ---- Piece constants ----
const EMPTY=0, wP=1,wN=2,wB=3,wR=4,wQ=5,wK=6;
const            bP=7,bN=8,bB=9,bR=10,bQ=11,bK=12;
const WHITE=0, BLACK=1;

// ---- Square helpers ----
const rankOf = s => s >> 3;
const fileOf = s => s & 7;
const sq     = (r,f) => r*8+f;
const isValid= s => s>=0 && s<64;

function colorOf(p) {
    if (p>=1&&p<=6) return WHITE;
    if (p>=7&&p<=12) return BLACK;
    return -1;
}
function typeOf(p) {
    if (!p) return 0;
    return p>6 ? p-6 : p;
}

// ---- Piece values (centipawns) ----
const VALUE = [0,100,320,330,500,900,20000, 100,320,330,500,900,20000];

// ---- Castling rights bits ----
const CWK=1, CWQ=2, CBK=4, CBQ=8;

// ---- Piece-Square Tables ----
// Layout: index 0 = a8, index 63 = h1  (visual top-to-bottom, left-to-right)
// For WHITE:  PST index = (7 - rankOf(sq)) * 8 + fileOf(sq)
// For BLACK:  PST index = rankOf(sq) * 8 + fileOf(sq)
// Sign: positive values favour WHITE; we negate for BLACK pieces.

const PST_P = [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0
];
const PST_N = [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50
];
const PST_B = [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20
];
const PST_R = [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0
];
const PST_Q = [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20
];
const PST_K_MG = [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20
];
const PST_TABLES = [null, PST_P, PST_N, PST_B, PST_R, PST_Q, PST_K_MG];

function pstVal(piece, square) {
    const t = typeOf(piece), c = colorOf(piece);
    if (!t || c<0) return 0;
    const tbl = PST_TABLES[t];
    const r = rankOf(square), f = fileOf(square);
    const idx = c===WHITE ? (7-r)*8+f : r*8+f;
    return c===WHITE ? tbl[idx] : -tbl[idx];
}

// ---- Game State ----
class State {
    constructor() {
        this.board    = new Int8Array(64);
        this.side     = WHITE;
        this.castling = 0;
        this.ep       = -1;   // en-passant target square, -1 = none
        this.halfmove = 0;
        this.fullmove = 1;
    }
    clone() {
        const s      = new State();
        s.board.set(this.board);
        s.side     = this.side;
        s.castling = this.castling;
        s.ep       = this.ep;
        s.halfmove = this.halfmove;
        s.fullmove = this.fullmove;
        return s;
    }
}

// ---- FEN ----
const FEN_MAP = {P:wP,N:wN,B:wB,R:wR,Q:wQ,K:wK,p:bP,n:bN,b:bB,r:bR,q:bQ,k:bK};
const PC_CHAR = ['.',  'P','N','B','R','Q','K', 'p','n','b','r','q','k'];

function parseFen(fen) {
    const s = new State();
    const parts = fen.trim().split(/\s+/);
    const rows  = parts[0].split('/');
    for (let r=0; r<8; r++) {
        let f=0;
        for (const ch of rows[r]) {
            if (ch>='1'&&ch<='8') { f+=+ch; }
            else { s.board[(7-r)*8+f] = FEN_MAP[ch]||0; f++; }
        }
    }
    s.side = parts[1]==='b' ? BLACK : WHITE;
    s.castling = 0;
    if (parts[2]&&parts[2]!=='-') {
        if (parts[2].includes('K')) s.castling|=CWK;
        if (parts[2].includes('Q')) s.castling|=CWQ;
        if (parts[2].includes('k')) s.castling|=CBK;
        if (parts[2].includes('q')) s.castling|=CBQ;
    }
    s.ep = parts[3]&&parts[3]!=='-' ? algToSq(parts[3]) : -1;
    s.halfmove = parseInt(parts[4]||'0',10);
    s.fullmove = parseInt(parts[5]||'1',10);
    return s;
}

function algToSq(alg) {
    return (parseInt(alg[1],10)-1)*8 + (alg.charCodeAt(0)-97);
}
function sqToAlg(s) {
    return String.fromCharCode(97+fileOf(s)) + (rankOf(s)+1);
}

function stateToFen(s) {
    let fen='';
    for (let r=7;r>=0;r--) {
        let e=0;
        for (let f=0;f<8;f++) {
            const p=s.board[r*8+f];
            if (!p) { e++; } else { if(e){fen+=e;e=0;} fen+=PC_CHAR[p]; }
        }
        if(e)fen+=e;
        if(r>0)fen+='/';
    }
    fen += ' '+(s.side===WHITE?'w':'b');
    let cr='';
    if(s.castling&CWK)cr+='K'; if(s.castling&CWQ)cr+='Q';
    if(s.castling&CBK)cr+='k'; if(s.castling&CBQ)cr+='q';
    fen += ' '+(cr||'-');
    fen += ' '+(s.ep>=0?sqToAlg(s.ep):'-');
    fen += ' '+s.halfmove+' '+s.fullmove;
    return fen;
}

// ---- Move Generation ----
// move = { from, to, flags, promo }
// flags: 0=quiet, 1=capture, 2=ep, 4=castle-ks, 8=castle-qs, 16=promotion, 17=promo+capture

const KNIGHT_DELTAS = [-17,-15,-10,-6,6,10,15,17];
const KING_DELTAS   = [-9,-8,-7,-1,1,7,8,9];
const DIAG_DIRS     = [7,9,-7,-9];
const ORTH_DIRS     = [8,-8,1,-1];

function slide(s, from, dir, us, moves, captOnly) {
    let cur=from;
    while(true) {
        const next=cur+dir;
        if(!isValid(next)) break;
        if(Math.abs(fileOf(next)-fileOf(cur))>1) break; // file wrap
        const t=s.board[next];
        if(!t) { if(!captOnly) moves.push({from,to:next,flags:0,promo:0}); }
        else if(colorOf(t)!==us) { moves.push({from,to:next,flags:1,promo:0}); break; }
        else break;
        cur=next;
    }
}

function addPawnMoves(s, from, us, moves, captOnly) {
    const dir = us===WHITE ? 1 : -1;
    const startRank = us===WHITE ? 1 : 6;
    const promoRank = us===WHITE ? 7 : 0;
    const r=rankOf(from), f=fileOf(from);

    // Pushes
    if (!captOnly) {
        const to1 = from + 8*dir;
        if (isValid(to1) && !s.board[to1]) {
            if (rankOf(to1)===promoRank) {
                for (const promo of (us===WHITE?[wQ,wR,wB,wN]:[bQ,bR,bB,bN]))
                    moves.push({from,to:to1,flags:16,promo});
            } else {
                moves.push({from,to:to1,flags:0,promo:0});
            }
            if (r===startRank) {
                const to2=from+16*dir;
                if (!s.board[to2]) moves.push({from,to:to2,flags:0,promo:0});
            }
        }
    }
    // Captures
    for (const cf of [-1,1]) {
        const tf=f+cf; if(tf<0||tf>7) continue;
        const to=from+8*dir+cf;
        if (!isValid(to)) continue;
        const t=s.board[to];
        if (t && colorOf(t)!==us) {
            if (rankOf(to)===promoRank) {
                for (const promo of (us===WHITE?[wQ,wR,wB,wN]:[bQ,bR,bB,bN]))
                    moves.push({from,to,flags:17,promo});
            } else moves.push({from,to,flags:1,promo:0});
        } else if (to===s.ep && s.ep>=0) {
            moves.push({from,to,flags:2,promo:0});
        }
    }
}

function isAttacked(brd, square, byColor) {
    const r=rankOf(square), f=fileOf(square);
    // Pawn
    if (byColor===WHITE) {
        if (f>0 && isValid(square-9) && brd[square-9]===wP) return true;
        if (f<7 && isValid(square-7) && brd[square-7]===wP) return true;
    } else {
        if (f>0 && isValid(square+7) && brd[square+7]===bP) return true;
        if (f<7 && isValid(square+9) && brd[square+9]===bP) return true;
    }
    // Knight
    const kn = byColor===WHITE ? wN : bN;
    for (const d of KNIGHT_DELTAS) {
        const s2=square+d;
        if (!isValid(s2)) continue;
        if (Math.abs(fileOf(s2)-f)>2) continue;
        if (brd[s2]===kn) return true;
    }
    // King
    const kg = byColor===WHITE ? wK : bK;
    for (const d of KING_DELTAS) {
        const s2=square+d;
        if (!isValid(s2)) continue;
        if (Math.abs(fileOf(s2)-f)>1) continue;
        if (brd[s2]===kg) return true;
    }
    // Diagonals
    const bi=byColor===WHITE?wB:bB, qu=byColor===WHITE?wQ:bQ;
    for (const d of DIAG_DIRS) {
        let cur=square;
        while(true){
            const n=cur+d; if(!isValid(n)) break;
            if(Math.abs(fileOf(n)-fileOf(cur))>1) break;
            const p=brd[n];
            if(p){ if(p===bi||p===qu) return true; break; }
            cur=n;
        }
    }
    // Orthogonals
    const ro=byColor===WHITE?wR:bR;
    for (const d of ORTH_DIRS) {
        let cur=square;
        while(true){
            const n=cur+d; if(!isValid(n)) break;
            if(Math.abs(fileOf(n)-fileOf(cur))>1) break;
            const p=brd[n];
            if(p){ if(p===ro||p===qu) return true; break; }
            cur=n;
        }
    }
    return false;
}

function generatePseudo(s, captOnly=false) {
    const moves=[], us=s.side, them=1-us;
    for (let from=0;from<64;from++) {
        const p=s.board[from];
        if(!p||colorOf(p)!==us) continue;
        const t=typeOf(p);
        if(t===1) { addPawnMoves(s,from,us,moves,captOnly); continue; }
        if(t===2) {
            for(const d of KNIGHT_DELTAS){
                const to=from+d; if(!isValid(to)) continue;
                if(Math.abs(fileOf(to)-fileOf(from))>2) continue;
                const tt=s.board[to];
                if(!tt){if(!captOnly)moves.push({from,to,flags:0,promo:0});}
                else if(colorOf(tt)===them) moves.push({from,to,flags:1,promo:0});
            }
            continue;
        }
        if(t===3||t===5) for(const d of DIAG_DIRS) slide(s,from,d,us,moves,captOnly);
        if(t===4||t===5) for(const d of ORTH_DIRS) slide(s,from,d,us,moves,captOnly);
        if(t===6) {
            for(const d of KING_DELTAS){
                const to=from+d; if(!isValid(to)) continue;
                if(Math.abs(fileOf(to)-fileOf(from))>1) continue;
                const tt=s.board[to];
                if(!tt){if(!captOnly)moves.push({from,to,flags:0,promo:0});}
                else if(colorOf(tt)===them) moves.push({from,to,flags:1,promo:0});
            }
            // Castling
            if(!captOnly) {
                if(us===WHITE&&from===4) {
                    if((s.castling&CWK)&&!s.board[5]&&!s.board[6]&&
                       !isAttacked(s.board,4,BLACK)&&!isAttacked(s.board,5,BLACK)&&!isAttacked(s.board,6,BLACK))
                        moves.push({from:4,to:6,flags:4,promo:0});
                    if((s.castling&CWQ)&&!s.board[3]&&!s.board[2]&&!s.board[1]&&
                       !isAttacked(s.board,4,BLACK)&&!isAttacked(s.board,3,BLACK)&&!isAttacked(s.board,2,BLACK))
                        moves.push({from:4,to:2,flags:8,promo:0});
                }
                if(us===BLACK&&from===60) {
                    if((s.castling&CBK)&&!s.board[61]&&!s.board[62]&&
                       !isAttacked(s.board,60,WHITE)&&!isAttacked(s.board,61,WHITE)&&!isAttacked(s.board,62,WHITE))
                        moves.push({from:60,to:62,flags:4,promo:0});
                    if((s.castling&CBQ)&&!s.board[59]&&!s.board[58]&&!s.board[57]&&
                       !isAttacked(s.board,60,WHITE)&&!isAttacked(s.board,59,WHITE)&&!isAttacked(s.board,58,WHITE))
                        moves.push({from:60,to:58,flags:8,promo:0});
                }
            }
        }
    }
    return moves;
}

function applyMove(s, mv) {
    const ns = s.clone();
    const {from,to,flags,promo} = mv;
    const p  = ns.board[from];
    const t  = typeOf(p);

    // Castling rights update
    if(t===6) { ns.castling &= ns.side===WHITE ? ~(CWK|CWQ) : ~(CBK|CBQ); }
    if(t===4) {
        if(from===0) ns.castling&=~CWQ; if(from===7) ns.castling&=~CWK;
        if(from===56)ns.castling&=~CBQ; if(from===63)ns.castling&=~CBK;
    }
    if(to===0) ns.castling&=~CWQ; if(to===7) ns.castling&=~CWK;
    if(to===56)ns.castling&=~CBQ; if(to===63)ns.castling&=~CBK;

    // En-passant square
    ns.ep = (t===1 && Math.abs(to-from)===16) ? (from+to)>>1 : -1;

    // Move piece
    ns.board[to]=p; ns.board[from]=0;

    // Special cases
    if(flags===2) { ns.board[ns.side===WHITE?to-8:to+8]=0; }
    else if(flags===4) { // castle KS
        if(ns.side===WHITE){ns.board[5]=wR;ns.board[7]=0;}
        else               {ns.board[61]=bR;ns.board[63]=0;}
    }
    else if(flags===8) { // castle QS
        if(ns.side===WHITE){ns.board[3]=wR;ns.board[0]=0;}
        else               {ns.board[59]=bR;ns.board[56]=0;}
    }
    else if(flags===16||flags===17) { ns.board[to]=promo; }

    ns.halfmove = (t===1||(flags&1)) ? 0 : ns.halfmove+1;
    if(ns.side===BLACK) ns.fullmove++;
    ns.side = 1-ns.side;
    return ns;
}

function findKing(brd, color) {
    const kg = color===WHITE ? wK : bK;
    for(let i=0;i<64;i++) if(brd[i]===kg) return i;
    return -1;
}

function legalMoves(s) {
    const pseudo = generatePseudo(s);
    return pseudo.filter(mv => {
        const ns = applyMove(s, mv);
        const kSq = findKing(ns.board, s.side);
        return kSq>=0 && !isAttacked(ns.board, kSq, ns.side);
    });
}

// ---- Evaluation ----
function evaluate(s) {
    let score=0, wBishops=0, bBishops=0;
    for(let i=0;i<64;i++) {
        const p=s.board[i]; if(!p) continue;
        const c=colorOf(p), sgn=c===WHITE?1:-1;
        score += sgn * VALUE[p];
        score += pstVal(p,i);
        if(p===wB) wBishops++; if(p===bB) bBishops++;
    }
    if(wBishops>=2) score+=30; if(bBishops>=2) score-=30;
    // Tempo
    score += s.side===WHITE ? 10 : -10;
    return score;
}

function evalForSide(s) {
    const e = evaluate(s);
    return s.side===WHITE ? e : -e;
}

// ---- Move ordering ----
function mvvLva(s, mv) {
    const att = typeOf(s.board[mv.from]);
    const vic = typeOf(s.board[mv.to]);
    if(!vic) return 0;
    return vic*10 - att; // most valuable victim, least valuable attacker
}

// ---- Quiescence search ----
function quiesce(s, alpha, beta) {
    const stand = evalForSide(s);
    if(stand>=beta) return beta;
    if(stand>alpha) alpha=stand;
    const caps = generatePseudo(s, true).filter(mv=>{
        const ns=applyMove(s,mv);
        const k=findKing(ns.board,s.side); return k>=0&&!isAttacked(ns.board,k,ns.side);
    });
    caps.sort((a,b)=>mvvLva(s,b)-mvvLva(s,a));
    for(const mv of caps){
        const ns=applyMove(s,mv);
        const sc=-quiesce(ns,-beta,-alpha);
        if(sc>=beta) return beta;
        if(sc>alpha) alpha=sc;
    }
    return alpha;
}

// ---- Negamax ----
const INF=1000000;
function negamax(s, depth, alpha, beta) {
    if(depth===0) return quiesce(s,alpha,beta);
    const moves=legalMoves(s);
    if(!moves.length) {
        const kSq=findKing(s.board,s.side);
        return isAttacked(s.board,kSq,1-s.side) ? -(INF-depth) : 0;
    }
    moves.sort((a,b)=>{
        const ac=(a.flags&1)?mvvLva(s,a):0;
        const bc=(b.flags&1)?mvvLva(s,b):0;
        return bc-ac;
    });
    let best=-INF;
    for(const mv of moves){
        const ns=applyMove(s,mv);
        const sc=-negamax(ns,depth-1,-beta,-alpha);
        if(sc>best) best=sc;
        if(sc>alpha) alpha=sc;
        if(alpha>=beta) break;
    }
    return best;
}

// ---- Public API ----
function getTopMoves(s, depth=3, n=3) {
    const moves=legalMoves(s);
    if(!moves.length) return [];
    const scored=moves.map(mv=>{
        const ns=applyMove(s,mv);
        const sc=-negamax(ns,depth-1,-INF,INF);
        return {mv, sc};
    });
    scored.sort((a,b)=>b.sc-a.sc);
    return scored.slice(0,n);
}

function getBestMove(s, depth=3) {
    const top=getTopMoves(s,depth,1);
    return top.length ? top[0] : null;
}

// Move classification thresholds (centipawns)
const CLASS_THRESHOLDS = {brilliant:0, best:30, good:80, inaccuracy:150, mistake:300};
function classifyMove(bestCp, moveCp) {
    const loss = bestCp - moveCp;
    if(loss<0)          return 'brilliant';   // somehow better than engine found
    if(loss<=0)         return 'best';
    if(loss<=30)        return 'good';
    if(loss<=80)        return 'inaccuracy';
    if(loss<=300)       return 'mistake';
    return 'blunder';
}

// Move notation (simplified SAN)
const PIECE_LETTERS = ['','','N','B','R','Q','K'];
function moveToSan(s, mv, legalList) {
    const {from,to,flags,promo}=mv;
    const p=s.board[from], t=typeOf(p);
    if(flags===4) return 'O-O';
    if(flags===8) return 'O-O-O';
    let san='';
    if(t!==1) san+=PIECE_LETTERS[t];

    // Disambiguation
    if(t!==1) {
        const ambig=legalList.filter(m=>m.to===to&&typeOf(s.board[m.from])===t&&m.from!==from);
        if(ambig.length){
            const sameFile=ambig.some(m=>fileOf(m.from)===fileOf(from));
            const sameRank=ambig.some(m=>rankOf(m.from)===rankOf(from));
            if(!sameFile)      san+=String.fromCharCode(97+fileOf(from));
            else if(!sameRank) san+=(rankOf(from)+1);
            else               san+=sqToAlg(from);
        }
    }

    const isCapture=(flags&1)||flags===2;
    if(isCapture){
        if(t===1) san+=String.fromCharCode(97+fileOf(from));
        san+='x';
    }
    san+=sqToAlg(to);
    if(flags===16||flags===17) san+='='+PIECE_LETTERS[typeOf(promo)];

    // Check / checkmate
    const ns=applyMove(s,mv);
    const opK=findKing(ns.board,ns.side);
    if(opK>=0&&isAttacked(ns.board,opK,s.side)){
        const opMoves=legalMoves(ns);
        san+=opMoves.length?'+':'#';
    }
    return san;
}

// Strategic analysis
function analyzePosition(s) {
    const plans=[], threats=[];

    // Material count
    let wMat=0,bMat=0;
    const pieceCount={wP:0,wN:0,wB:0,wR:0,wQ:0,bP:0,bN:0,bB:0,bR:0,bQ:0};
    for(let i=0;i<64;i++){
        const p=s.board[i];
        if(!p) continue;
        if(colorOf(p)===WHITE) wMat+=VALUE[p]; else bMat+=VALUE[p];
        const n=['','wP','wN','wB','wR','wQ','wK','bP','bN','bB','bR','bQ','bK'][p];
        if(n in pieceCount) pieceCount[n]++;
    }

    // Passed pawns
    for(let i=0;i<64;i++){
        const p=s.board[i]; if(!p) continue;
        if(typeOf(p)!==1) continue;
        const c=colorOf(p), r=rankOf(i), f=fileOf(i);
        let isPassed=true;
        const opPawn=c===WHITE?bP:wP;
        const advDir=c===WHITE?1:-1;
        for(let rr=r+advDir; rr>=0&&rr<8; rr+=advDir){
            for(let ff=Math.max(0,f-1);ff<=Math.min(7,f+1);ff++){
                if(s.board[rr*8+ff]===opPawn){isPassed=false;break;}
            }
            if(!isPassed)break;
        }
        if(isPassed){
            const adv=c===WHITE?r:7-r;
            if(adv>=4) plans.push((c===WHITE?'White':'Black')+' has a passed pawn on '+sqToAlg(i));
        }
    }

    // Hanging pieces
    for(let i=0;i<64;i++){
        const p=s.board[i]; if(!p) continue;
        const c=colorOf(p);
        if(isAttacked(s.board,i,1-c)&&!isAttacked(s.board,i,c)&&typeOf(p)!==6){
            threats.push((c===WHITE?'White':'Black')+' '+PIECE_LETTERS[typeOf(p)]||'P'+' on '+sqToAlg(i)+' is hanging');
        }
    }

    // King safety (simplified)
    for(const color of [WHITE,BLACK]){
        const kSq=findKing(s.board,color);
        if(kSq<0) continue;
        let attackCount=0;
        for(const d of KING_DELTAS){
            const n=kSq+d; if(!isValid(n)) continue;
            if(Math.abs(fileOf(n)-fileOf(kSq))>1) continue;
            if(isAttacked(s.board,n,1-color)) attackCount++;
        }
        if(attackCount>=3) plans.push((color===WHITE?'White':'Black')+' king safety is a concern');
    }

    // Open files for rooks
    for(let f=0;f<8;f++){
        let wP_=false,bP_=false;
        for(let r=0;r<8;r++){
            const p=s.board[r*8+f];
            if(p===wP)wP_=true; if(p===bP)bP_=true;
        }
        if(!wP_&&!bP_){
            // Check if either side has a rook on this file
            for(let r=0;r<8;r++){
                const p=s.board[r*8+f];
                if(p===wR) plans.push('White rook is on open file '+String.fromCharCode(97+f));
                if(p===bR) plans.push('Black rook is on open file '+String.fromCharCode(97+f));
            }
        }
    }

    // Bishop pair
    if(pieceCount.wB>=2) plans.push('White has the bishop pair');
    if(pieceCount.bB>=2) plans.push('Black has the bishop pair');

    return {plans: plans.slice(0,4), threats: threats.slice(0,4)};
}

// Expose public API
return {
    parseFen, stateToFen, algToSq, sqToAlg,
    legalMoves, applyMove,
    getTopMoves, getBestMove,
    classifyMove, moveToSan,
    analyzePosition,
    evaluate,
    WHITE, BLACK,
    PIECE_LETTERS,
    // Starting position FEN
    START_FEN: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
};
})();
