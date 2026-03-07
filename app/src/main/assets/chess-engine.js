'use strict';
// ============================================================
// Chess Engine — Negamax + Alpha-Beta + Quiescence (depth 3-5)
// Full legal move generation, enhanced evaluation
// ============================================================
const CE = (() => {

// ---- Pieces ----
const EMPTY=0,wP=1,wN=2,wB=3,wR=4,wQ=5,wK=6,bP=7,bN=8,bB=9,bR=10,bQ=11,bK=12;
const WHITE=0, BLACK=1;

const rankOf=s=>s>>3, fileOf=s=>s&7;
const isValid=s=>s>=0&&s<64;
function colorOf(p){if(p>=1&&p<=6)return WHITE;if(p>=7&&p<=12)return BLACK;return -1;}
function typeOf(p){if(!p)return 0;return p>6?p-6:p;}

const VALUE=[0,100,320,330,500,900,20000,100,320,330,500,900,20000];
const CWK=1,CWQ=2,CBK=4,CBQ=8;

// ---- Piece-Square Tables (white perspective, a8=idx0) ----
const PST_P=[0,0,0,0,0,0,0,0,50,50,50,50,50,50,50,50,10,10,20,30,30,20,10,10,5,5,10,25,25,10,5,5,0,0,0,20,20,0,0,0,5,-5,-10,0,0,-10,-5,5,5,10,10,-20,-20,10,10,5,0,0,0,0,0,0,0,0];
const PST_N=[-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30,-30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50];
const PST_B=[-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,10,10,5,0,-10,-10,5,5,10,10,5,5,-10,-10,0,10,10,10,10,0,-10,-10,10,10,10,10,10,10,-10,-10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20];
const PST_R=[0,0,0,0,0,0,0,0,5,10,10,10,10,10,10,5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,0,0,0,5,5,0,0,0];
const PST_Q=[-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5,0,0,5,5,5,5,0,-5,-10,5,5,5,5,5,0,-10,-10,0,5,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20];
const PST_K_MG=[-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10,20,20,0,0,0,0,20,20,20,30,10,0,0,10,30,20];
const PST_K_EG=[-50,-40,-30,-20,-20,-30,-40,-50,-30,-20,-10,0,0,-10,-20,-30,-30,-10,20,30,30,20,-10,-30,-30,-10,30,40,40,30,-10,-30,-30,-10,30,40,40,30,-10,-30,-30,-10,20,30,30,20,-10,-30,-30,-30,0,0,0,0,-30,-30,-50,-30,-30,-30,-30,-30,-30,-50];
const TBLS=[null,PST_P,PST_N,PST_B,PST_R,PST_Q,PST_K_MG];

function pstVal(p,sq){
    const t=typeOf(p),c=colorOf(p);if(!t||c<0)return 0;
    const r=rankOf(sq),f=fileOf(sq);
    const idx=c===WHITE?(7-r)*8+f:r*8+f;
    const v=TBLS[t][idx];
    return c===WHITE?v:-v;
}

// ---- State ----
class State{
    constructor(){this.board=new Int8Array(64);this.side=WHITE;this.castling=0;this.ep=-1;this.halfmove=0;this.fullmove=1;}
    clone(){const s=new State();s.board.set(this.board);s.side=this.side;s.castling=this.castling;s.ep=this.ep;s.halfmove=this.halfmove;s.fullmove=this.fullmove;return s;}
}

// ---- FEN ----
const FEN_MAP={P:wP,N:wN,B:wB,R:wR,Q:wQ,K:wK,p:bP,n:bN,b:bB,r:bR,q:bQ,k:bK};
const PC_CH=['.',  'P','N','B','R','Q','K','p','n','b','r','q','k'];

function parseFen(fen){
    const s=new State(),parts=fen.trim().split(/\s+/),rows=parts[0].split('/');
    for(let r=0;r<8;r++){let f=0;for(const ch of rows[r]){if(ch>='1'&&ch<='8'){f+=+ch;}else{s.board[(7-r)*8+f]=FEN_MAP[ch]||0;f++;}}}
    s.side=parts[1]==='b'?BLACK:WHITE;
    s.castling=0;
    if(parts[2]&&parts[2]!=='-'){if(parts[2].includes('K'))s.castling|=CWK;if(parts[2].includes('Q'))s.castling|=CWQ;if(parts[2].includes('k'))s.castling|=CBK;if(parts[2].includes('q'))s.castling|=CBQ;}
    s.ep=parts[3]&&parts[3]!=='-'?algToSq(parts[3]):-1;
    s.halfmove=parseInt(parts[4]||'0',10);s.fullmove=parseInt(parts[5]||'1',10);
    return s;
}
function algToSq(a){return(parseInt(a[1],10)-1)*8+(a.charCodeAt(0)-97);}
function sqToAlg(s){return String.fromCharCode(97+fileOf(s))+(rankOf(s)+1);}
function stateToFen(s){
    let f='';
    for(let r=7;r>=0;r--){let e=0;for(let i=0;i<8;i++){const p=s.board[r*8+i];if(!p){e++;}else{if(e){f+=e;e=0;}f+=PC_CH[p];}};if(e)f+=e;if(r>0)f+='/';}
    let cr='';if(s.castling&CWK)cr+='K';if(s.castling&CWQ)cr+='Q';if(s.castling&CBK)cr+='k';if(s.castling&CBQ)cr+='q';
    return f+' '+(s.side===WHITE?'w':'b')+' '+(cr||'-')+' '+(s.ep>=0?sqToAlg(s.ep):'-')+' '+s.halfmove+' '+s.fullmove;
}

// ---- Move Generation ----
const KN_D=[-17,-15,-10,-6,6,10,15,17],KG_D=[-9,-8,-7,-1,1,7,8,9],DI_D=[7,9,-7,-9],OR_D=[8,-8,1,-1];
function wrap(a,b){return Math.abs(fileOf(a)-fileOf(b))>1;}

function slide(s,from,dir,us,moves,capOnly){
    let c=from;
    while(1){const n=c+dir;if(!isValid(n)||wrap(n,c))break;const t=s.board[n];if(!t){if(!capOnly)moves.push({from,to:n,flags:0,promo:0});}else if(colorOf(t)!==us){moves.push({from,to:n,flags:1,promo:0});break;}else break;c=n;}
}

function addPawn(s,from,us,moves,capOnly){
    const dir=us===WHITE?1:-1,sr=us===WHITE?1:6,pr=us===WHITE?7:0,f=fileOf(from),r=rankOf(from);
    if(!capOnly){
        const t1=from+8*dir;
        if(isValid(t1)&&!s.board[t1]){
            if(rankOf(t1)===pr){for(const p of(us===WHITE?[wQ,wR,wB,wN]:[bQ,bR,bB,bN]))moves.push({from,to:t1,flags:16,promo:p});}
            else{moves.push({from,to:t1,flags:0,promo:0});if(r===sr){const t2=from+16*dir;if(!s.board[t2])moves.push({from,to:t2,flags:0,promo:0});}}
        }
    }
    for(const cf of[-1,1]){const tf=f+cf;if(tf<0||tf>7)continue;const to=from+8*dir+cf;if(!isValid(to))continue;const t=s.board[to];
        if(t&&colorOf(t)!==us){if(rankOf(to)===pr){for(const p of(us===WHITE?[wQ,wR,wB,wN]:[bQ,bR,bB,bN]))moves.push({from,to,flags:17,promo:p});}else moves.push({from,to,flags:1,promo:0});}
        else if(to===s.ep&&s.ep>=0)moves.push({from,to,flags:2,promo:0});}
}

function isAttacked(brd,sq,byCol){
    const f=fileOf(sq);
    if(byCol===WHITE){if(f>0&&isValid(sq-9)&&brd[sq-9]===wP)return true;if(f<7&&isValid(sq-7)&&brd[sq-7]===wP)return true;}
    else{if(f>0&&isValid(sq+7)&&brd[sq+7]===bP)return true;if(f<7&&isValid(sq+9)&&brd[sq+9]===bP)return true;}
    const kn=byCol===WHITE?wN:bN;
    for(const d of KN_D){const s2=sq+d;if(!isValid(s2)||Math.abs(fileOf(s2)-f)>2)continue;if(brd[s2]===kn)return true;}
    const kg=byCol===WHITE?wK:bK;
    for(const d of KG_D){const s2=sq+d;if(!isValid(s2)||Math.abs(fileOf(s2)-f)>1)continue;if(brd[s2]===kg)return true;}
    const bi=byCol===WHITE?wB:bB,qu=byCol===WHITE?wQ:bQ;
    for(const d of DI_D){let c=sq;while(1){const n=c+d;if(!isValid(n)||wrap(n,c))break;const p=brd[n];if(p){if(p===bi||p===qu)return true;break;}c=n;}}
    const ro=byCol===WHITE?wR:bR;
    for(const d of OR_D){let c=sq;while(1){const n=c+d;if(!isValid(n)||wrap(n,c))break;const p=brd[n];if(p){if(p===ro||p===qu)return true;break;}c=n;}}
    return false;
}

function genPseudo(s,capOnly=false){
    const moves=[],us=s.side,them=1-us;
    for(let from=0;from<64;from++){
        const p=s.board[from];if(!p||colorOf(p)!==us)continue;
        const t=typeOf(p);
        if(t===1){addPawn(s,from,us,moves,capOnly);continue;}
        if(t===2){for(const d of KN_D){const to=from+d;if(!isValid(to)||Math.abs(fileOf(to)-fileOf(from))>2)continue;const tt=s.board[to];if(!tt){if(!capOnly)moves.push({from,to,flags:0,promo:0});}else if(colorOf(tt)===them)moves.push({from,to,flags:1,promo:0});}continue;}
        if(t===3||t===5)for(const d of DI_D)slide(s,from,d,us,moves,capOnly);
        if(t===4||t===5)for(const d of OR_D)slide(s,from,d,us,moves,capOnly);
        if(t===6){
            for(const d of KG_D){const to=from+d;if(!isValid(to)||Math.abs(fileOf(to)-fileOf(from))>1)continue;const tt=s.board[to];if(!tt){if(!capOnly)moves.push({from,to,flags:0,promo:0});}else if(colorOf(tt)===them)moves.push({from,to,flags:1,promo:0});}
            if(!capOnly){
                if(us===WHITE&&from===4){if((s.castling&CWK)&&!s.board[5]&&!s.board[6]&&!isAttacked(s.board,4,BLACK)&&!isAttacked(s.board,5,BLACK)&&!isAttacked(s.board,6,BLACK))moves.push({from:4,to:6,flags:4,promo:0});if((s.castling&CWQ)&&!s.board[3]&&!s.board[2]&&!s.board[1]&&!isAttacked(s.board,4,BLACK)&&!isAttacked(s.board,3,BLACK)&&!isAttacked(s.board,2,BLACK))moves.push({from:4,to:2,flags:8,promo:0});}
                if(us===BLACK&&from===60){if((s.castling&CBK)&&!s.board[61]&&!s.board[62]&&!isAttacked(s.board,60,WHITE)&&!isAttacked(s.board,61,WHITE)&&!isAttacked(s.board,62,WHITE))moves.push({from:60,to:62,flags:4,promo:0});if((s.castling&CBQ)&&!s.board[59]&&!s.board[58]&&!s.board[57]&&!isAttacked(s.board,60,WHITE)&&!isAttacked(s.board,59,WHITE)&&!isAttacked(s.board,58,WHITE))moves.push({from:60,to:58,flags:8,promo:0});}
            }
        }
    }
    return moves;
}

function applyMove(s,mv){
    const ns=s.clone(),{from,to,flags,promo}=mv,p=ns.board[from],t=typeOf(p);
    if(t===6)ns.castling&=ns.side===WHITE?~(CWK|CWQ):~(CBK|CBQ);
    if(t===4){if(from===0)ns.castling&=~CWQ;if(from===7)ns.castling&=~CWK;if(from===56)ns.castling&=~CBQ;if(from===63)ns.castling&=~CBK;}
    if(to===0)ns.castling&=~CWQ;if(to===7)ns.castling&=~CWK;if(to===56)ns.castling&=~CBQ;if(to===63)ns.castling&=~CBK;
    ns.ep=(t===1&&Math.abs(to-from)===16)?(from+to)>>1:-1;
    ns.board[to]=p;ns.board[from]=0;
    if(flags===2)ns.board[ns.side===WHITE?to-8:to+8]=0;
    else if(flags===4){if(ns.side===WHITE){ns.board[5]=wR;ns.board[7]=0;}else{ns.board[61]=bR;ns.board[63]=0;}}
    else if(flags===8){if(ns.side===WHITE){ns.board[3]=wR;ns.board[0]=0;}else{ns.board[59]=bR;ns.board[56]=0;}}
    else if(flags===16||flags===17)ns.board[to]=promo;
    ns.halfmove=(t===1||(flags&1))?0:ns.halfmove+1;
    if(ns.side===BLACK)ns.fullmove++;
    ns.side=1-ns.side;
    return ns;
}

function findKing(brd,col){const k=col===WHITE?wK:bK;for(let i=0;i<64;i++)if(brd[i]===k)return i;return-1;}

function legalMoves(s){
    return genPseudo(s).filter(mv=>{const ns=applyMove(s,mv);const k=findKing(ns.board,s.side);return k>=0&&!isAttacked(ns.board,k,ns.side);});
}

// ---- Evaluation ----
function countMaterial(brd){
    let w=0,b=0;
    for(let i=0;i<64;i++){const p=brd[i];if(!p)continue;if(colorOf(p)===WHITE)w+=VALUE[p];else b+=VALUE[p];}
    return{w,b};
}
function isEndgame(brd){
    const {w,b}=countMaterial(brd);
    return w<1800&&b<1800; // rough endgame threshold
}

function evaluate(s){
    const brd=s.board;
    let score=0;
    let wB=0,bB=0;

    for(let i=0;i<64;i++){
        const p=brd[i];if(!p)continue;
        const c=colorOf(p),sg=c===WHITE?1:-1;
        score+=sg*VALUE[p];

        // PST (switch king table in endgame)
        if(typeOf(p)===6&&isEndgame(brd)){
            const r=rankOf(i),f=fileOf(i),idx=c===WHITE?(7-r)*8+f:r*8+f;
            score+=c===WHITE?PST_K_EG[idx]:-PST_K_EG[idx];
        } else {
            score+=pstVal(p,i);
        }

        if(p===wB)wB++;if(p===bB)bB++;
    }

    // Bishop pair
    if(wB>=2)score+=30;if(bB>=2)score-=30;

    // Pawn structure
    const wPawns=new Array(8).fill(0),bPawns=new Array(8).fill(0);
    for(let i=0;i<64;i++){if(brd[i]===wP)wPawns[fileOf(i)]++;if(brd[i]===bP)bPawns[fileOf(i)]++;}
    for(let f=0;f<8;f++){
        if(wPawns[f]>1)score-=10*wPawns[f]; // doubled
        if(bPawns[f]>1)score+=10*bPawns[f];
        const wIso=(f===0||!wPawns[f-1])&&(f===7||!wPawns[f+1]);
        const bIso=(f===0||!bPawns[f-1])&&(f===7||!bPawns[f+1]);
        if(wPawns[f]&&wIso)score-=15;
        if(bPawns[f]&&bIso)score+=15;
    }

    // Open file rooks
    for(let f=0;f<8;f++){
        const open=!wPawns[f]&&!bPawns[f];
        const semiW=!wPawns[f]&&bPawns[f],semiB=!bPawns[f]&&wPawns[f];
        for(let r=0;r<8;r++){
            const p=brd[r*8+f];
            if(p===wR){if(open)score+=20;else if(semiW)score+=10;}
            if(p===bR){if(open)score-=20;else if(semiB)score-=10;}
        }
    }

    // Tempo
    score+=(s.side===WHITE?8:-8);
    return score;
}

function evalForSide(s){const e=evaluate(s);return s.side===WHITE?e:-e;}

// ---- Move ordering ----
function mvvLva(s,mv){const a=typeOf(s.board[mv.from]),v=typeOf(s.board[mv.to]);return v?v*10-a:0;}
function orderMoves(s,moves){moves.sort((a,b)=>mvvLva(s,b)-mvvLva(s,a));return moves;}

// ---- Quiescence ----
function quiesce(s,alpha,beta,depth=0){
    const stand=evalForSide(s);
    if(stand>=beta)return beta;
    if(stand>alpha)alpha=stand;
    if(depth>4)return alpha;
    const caps=genPseudo(s,true).filter(mv=>{const ns=applyMove(s,mv);const k=findKing(ns.board,s.side);return k>=0&&!isAttacked(ns.board,k,ns.side);});
    orderMoves(s,caps);
    for(const mv of caps){const ns=applyMove(s,mv);const sc=-quiesce(ns,-beta,-alpha,depth+1);if(sc>=beta)return beta;if(sc>alpha)alpha=sc;}
    return alpha;
}

// ---- Negamax ----
const INF=1e6;
function negamax(s,depth,alpha,beta){
    if(depth===0)return quiesce(s,alpha,beta);
    const moves=legalMoves(s);
    if(!moves.length){const k=findKing(s.board,s.side);return isAttacked(s.board,k,1-s.side)?-(INF-depth):0;}
    orderMoves(s,moves);
    let best=-INF;
    for(const mv of moves){const ns=applyMove(s,mv);const sc=-negamax(ns,depth-1,-beta,-alpha);if(sc>best)best=sc;if(sc>alpha)alpha=sc;if(alpha>=beta)break;}
    return best;
}

// ---- Top N moves ----
function getTopMoves(s,depth=3,n=3){
    const moves=legalMoves(s);if(!moves.length)return[];
    orderMoves(s,moves);
    const scored=moves.map(mv=>{const ns=applyMove(s,mv);const sc=-negamax(ns,depth-1,-INF,INF);return{mv,sc};});
    scored.sort((a,b)=>b.sc-a.sc);
    return scored.slice(0,n);
}

function getBestMove(s,depth=3){const top=getTopMoves(s,depth,1);return top[0]||null;}

// ---- Move classification ----
// Returns one of: brilliant great best good book inaccuracy mistake blunder
function classifyMove(bestCp, moveCp, isSacrifice){
    const loss=bestCp-moveCp;
    if(loss<=-30&&isSacrifice)return'brilliant';
    if(loss<=5)return'best';
    if(loss<=30)return'good';
    if(loss<=80)return'inaccuracy';
    if(loss<=300)return'mistake';
    return'blunder';
}

// Detect if a move involves a material sacrifice (capturing piece < captured, or moving to attacked square)
function isMaterialSacrifice(s,mv){
    const attacker=typeOf(s.board[mv.from]),victim=typeOf(s.board[mv.to]);
    if(victim&&VALUE[attacker]>VALUE[victim]+50)return true; // giving up more than we gain
    // Check if moving to an attacked square
    const ns=applyMove(s,mv);
    return isAttacked(ns.board,mv.to,ns.side);
}

// ---- Accuracy formula (Chess.com approximation) ----
function cpToAccuracy(avgCpl){
    return Math.max(0,Math.min(100,103.1668*Math.exp(-0.04354*Math.max(0,avgCpl))-3.1669));
}

// ---- SAN notation ----
const PL=['','','N','B','R','Q','K'];
function moveToSan(s,mv,legal){
    const{from,to,flags,promo}=mv,p=s.board[from],t=typeOf(p);
    if(flags===4)return'O-O';if(flags===8)return'O-O-O';
    let san='';if(t!==1)san+=PL[t];
    // Disambiguation
    if(t!==1){const amb=legal.filter(m=>m.to===to&&typeOf(s.board[m.from])===t&&m.from!==from);
        if(amb.length){const sf=amb.some(m=>fileOf(m.from)===fileOf(from));const sr=amb.some(m=>rankOf(m.from)===rankOf(from));if(!sf)san+=String.fromCharCode(97+fileOf(from));else if(!sr)san+=(rankOf(from)+1);else san+=sqToAlg(from);}}
    const isCap=(flags&1)||flags===2;
    if(isCap){if(t===1)san+=String.fromCharCode(97+fileOf(from));san+='x';}
    san+=sqToAlg(to);
    if(flags===16||flags===17)san+='='+PL[typeOf(promo)];
    const ns=applyMove(s,mv);const opK=findKing(ns.board,ns.side);
    if(opK>=0&&isAttacked(ns.board,opK,s.side)){const opm=legalMoves(ns);san+=opm.length?'+':'#';}
    return san;
}

// ---- Position analysis ----
function analyzePosition(s){
    const plans=[],threats=[];const brd=s.board;
    // Hanging pieces
    for(let i=0;i<64;i++){const p=brd[i];if(!p||typeOf(p)===6)continue;const c=colorOf(p);
        if(isAttacked(brd,i,1-c)&&!isAttacked(brd,i,c))threats.push({side:c===WHITE?'White':'Black',type:'hanging',piece:PL[typeOf(p)]||'P',sq:sqToAlg(i)});}
    // Passed pawns
    for(let i=0;i<64;i++){const p=brd[i];if(typeOf(p)!==1)continue;const c=colorOf(p),r=rankOf(i),f=fileOf(i),adv=c===WHITE?r:7-r;
        if(adv<3)continue;const op=c===WHITE?bP:wP;let passed=true;const dr=c===WHITE?1:-1;
        for(let rr=r+dr;rr>=0&&rr<8;rr+=dr){for(let ff=Math.max(0,f-1);ff<=Math.min(7,f+1);ff++){if(brd[rr*8+ff]===op){passed=false;break;}};if(!passed)break;}
        if(passed)plans.push({text:(c===WHITE?'White':'Black')+' has a passed pawn on '+sqToAlg(i),priority:adv});}
    // Open files for rooks
    const wp=new Array(8).fill(0),bp=new Array(8).fill(0);
    for(let i=0;i<64;i++){if(brd[i]===wP)wp[fileOf(i)]++;if(brd[i]===bP)bp[fileOf(i)]++;}
    for(let f=0;f<8;f++){const open=!wp[f]&&!bp[f];for(let r=0;r<8;r++){const p=brd[r*8+f];
        if(p===wR&&open)plans.push({text:'White rook on open '+String.fromCharCode(97+f)+'-file',priority:3});
        if(p===bR&&open)plans.push({text:'Black rook on open '+String.fromCharCode(97+f)+'-file',priority:3});}}
    // King safety
    for(const col of[WHITE,BLACK]){const kSq=findKing(brd,col);if(kSq<0)continue;
        let att=0;for(const d of KG_D){const n=kSq+d;if(!isValid(n)||Math.abs(fileOf(n)-fileOf(kSq))>1)continue;if(isAttacked(brd,n,1-col))att++;}
        if(att>=3)threats.push({side:col===WHITE?'White':'Black',type:'king',piece:'K',sq:sqToAlg(kSq)});}
    // Weak pawns analysis
    let wDbl=0,bDbl=0,wIso=0,bIso=0;
    for(let f=0;f<8;f++){if(wp[f]>1)wDbl++;if(bp[f]>1)bDbl++;const wi=(f===0||!wp[f-1])&&(f===7||!wp[f+1]);const bi=(f===0||!bp[f-1])&&(f===7||!bp[f+1]);if(wp[f]&&wi)wIso++;if(bp[f]&&bi)bIso++;}
    if(wDbl)plans.push({text:'White has '+wDbl+' doubled pawn file'+(wDbl>1?'s':''),priority:2});
    if(bDbl)plans.push({text:'Black has '+bDbl+' doubled pawn file'+(bDbl>1?'s':''),priority:2});
    if(wIso)plans.push({text:'White has '+wIso+' isolated pawn'+(wIso>1?'s':''),priority:2});
    if(bIso)plans.push({text:'Black has '+bIso+' isolated pawn'+(bIso>1?'s':''),priority:2});

    plans.sort((a,b)=>b.priority-a.priority);
    return{plans:plans.slice(0,5).map(p=>p.text),threats:threats.slice(0,4)};
}

const START_FEN='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

return{parseFen,stateToFen,algToSq,sqToAlg,legalMoves,applyMove,findKing,isAttacked,getTopMoves,getBestMove,classifyMove,isMaterialSacrifice,cpToAccuracy,moveToSan,analyzePosition,evaluate,WHITE,BLACK,VALUE,typeOf,colorOf,rankOf,fileOf,PL,wP,wN,wB,wR,wQ,wK,bP,bN,bB,bR,bQ,bK,START_FEN};
})();
