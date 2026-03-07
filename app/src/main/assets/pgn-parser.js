'use strict';
// ============================================================
// PGN Parser + SAN → Move converter
// ============================================================
const PGN = (() => {

// Parse a PGN string, return { headers, sanMoves }
function parsePgn(pgn) {
    const headers = {};
    const headerRe = /\[(\w+)\s+"([^"]*)"\]/g;
    let m;
    while ((m = headerRe.exec(pgn)) !== null) headers[m[1]] = m[2];

    // Extract move text (after headers)
    let body = pgn.replace(/\[[^\]]*\]/g, '');

    // Remove block comments
    body = body.replace(/\{[^}]*\}/g, '');
    // Remove line comments
    body = body.replace(/;[^\n]*/g, '');
    // Remove variations (nested parentheses, simplified to one level)
    let prev = '';
    while (prev !== body) { prev = body; body = body.replace(/\([^()]*\)/g, ''); }
    // Remove NAGs
    body = body.replace(/\$\d+/g, '');
    // Remove move numbers
    body = body.replace(/\d+\s*\.+\s*/g, '');
    // Remove result
    body = body.replace(/1-0|0-1|1\/2-1\/2|\*/g, '');

    const sanMoves = body.trim().split(/\s+/).filter(t => t && t !== '...');
    return { headers, sanMoves };
}

// Convert a SAN string to an internal move object given the current state.
// Strategy: generate all legal moves, convert each to SAN, find a match.
function sanToMove(state, san) {
    const legal = CE.legalMoves(state);
    // Normalize: strip check/mate/annotation characters
    const norm = san.replace(/[+#!?]/g, '').trim();

    for (const mv of legal) {
        const mvSan = CE.moveToSan(state, mv, legal).replace(/[+#]/g, '');
        if (mvSan === norm) return mv;
    }

    // Fallback: try matching destination square only (for ambiguous positions)
    // Try castling aliases
    if (norm === 'O-O' || norm === '0-0') {
        return legal.find(m => m.flags === 4) || null;
    }
    if (norm === 'O-O-O' || norm === '0-0-0') {
        return legal.find(m => m.flags === 8) || null;
    }
    return null;
}

// Replay a full game from SAN move array; returns array of { state, mv, san }
function replayGame(sanMoves, startFen) {
    let state = CE.parseFen(startFen || CE.START_FEN);
    const history = [{ state: state.clone(), mv: null, san: null }];

    for (const san of sanMoves) {
        const mv = sanToMove(state, san);
        if (!mv) {
            console.warn('Could not parse move:', san);
            break;
        }
        state = CE.applyMove(state, mv);
        history.push({ state: state.clone(), mv, san });
    }
    return history;
}

return { parsePgn, sanToMove, replayGame };
})();
