'use strict';
// ============================================================
// Chess Coach -- Fully Offline AI Coach
// Template-based intelligence with voice, puzzles, style analysis
// ============================================================
const COACH = (() => {

const LEVEL_KEY = 'chess_coach_level';
const PUZZLE_KEY = 'chess_puzzles';
const VOICE_KEY = 'chess_voice_mode';

function getLevel() { try { return localStorage.getItem(LEVEL_KEY) || 'intermediate'; } catch(e) { return 'intermediate'; } }
function setLevel(l) { try { localStorage.setItem(LEVEL_KEY, l); } catch(e) {} }
function getVoiceMode() { try { return localStorage.getItem(VOICE_KEY) || 'mistakes'; } catch(e) { return 'mistakes'; } }
function setVoiceMode(m) { try { localStorage.setItem(VOICE_KEY, m); } catch(e) {} }

// ---- Move Explanation Generator ----
const PIECE_NAMES_FULL = {1:'pawn',2:'knight',3:'bishop',4:'rook',5:'queen',6:'king'};

function pieceName(p) { return PIECE_NAMES_FULL[CE.typeOf(p)] || 'piece'; }
function sideName(s) { return s === CE.WHITE ? 'White' : 'Black'; }

function explainClassification(cls, state, mv, bestMv, evalBefore, evalAfter, bestEval) {
    const level = getLevel();
    const side = sideName(state.side);
    const piece = pieceName(state.board[mv.from]);
    const legal = CE.legalMoves(state);
    const san = CE.moveToSan(state, mv, legal);
    const bestSan = bestMv ? CE.moveToSan(state, bestMv, legal) : null;
    const loss = Math.abs((bestEval || 0) - (evalAfter || 0));
    const lossStr = (loss / 100).toFixed(1);

    const explanations = {
        brilliant: {
            beginner: side + ' played ' + san + ' -- a brilliant sacrifice! This move gives up material but creates an unstoppable attack.',
            intermediate: side + ' found ' + san + ', a brilliant sacrifice. Despite losing material on the surface, this move creates threats that more than compensate.',
            advanced: san + ' is a brilliant sacrifice. The material investment is justified by the resulting tactical complications and initiative that the opponent cannot neutralize.'
        },
        great: {
            beginner: san + ' is a great move! It is very close to the best move and keeps the advantage.',
            intermediate: san + ' is a strong move that maintains the position\'s dynamics well.',
            advanced: san + ' is an excellent practical choice, nearly matching the engine\'s top line.'
        },
        best: {
            beginner: san + ' is the best move in this position!',
            intermediate: san + ' is the engine\'s top choice -- perfect play.',
            advanced: san + ' matches the engine\'s first line.'
        },
        excellent: {
            beginner: san + ' is an excellent move! Very close to the best.',
            intermediate: san + ' is an excellent choice, only marginally different from the best move.',
            advanced: san + ' is effectively equivalent to the engine\'s top line.'
        },
        good: {
            beginner: san + ' is a decent move, but there was something slightly better.',
            intermediate: san + ' is reasonable but ' + (bestSan || 'another move') + ' would have been slightly more precise.',
            advanced: san + ' is playable but ' + (bestSan || 'the engine line') + ' offered a marginal improvement of ~' + lossStr + ' pawns.'
        },
        book: {
            beginner: san + ' is a well-known opening move played by many grandmasters.',
            intermediate: san + ' is a standard book move in this opening.',
            advanced: san + ' is theory.'
        },
        inaccuracy: {
            beginner: san + ' is not the best move. It loses about ' + lossStr + ' pawns worth of advantage. ' + (bestSan ? 'Better was ' + bestSan + '.' : ''),
            intermediate: san + ' is an inaccuracy (loses ~' + lossStr + ' pawns). ' + (bestSan ? bestSan + ' was more accurate' : '') + '.' + getInaccuracyReason(state, mv, bestMv),
            advanced: san + ' is imprecise (-' + lossStr + '). ' + (bestSan ? bestSan + ' was stronger' : '') + '.' + getInaccuracyReason(state, mv, bestMv)
        },
        mistake: {
            beginner: san + ' is a mistake! It loses ' + lossStr + ' pawns of advantage. ' + (bestSan ? 'You should have played ' + bestSan + ' instead.' : ''),
            intermediate: san + ' is a mistake (-' + lossStr + '). ' + getBlunderReason(state, mv, bestMv, false) + (bestSan ? ' Better was ' + bestSan + '.' : ''),
            advanced: san + ' is a significant error (-' + lossStr + '). ' + getBlunderReason(state, mv, bestMv, false) + (bestSan ? ' ' + bestSan + ' was called for.' : '')
        },
        blunder: {
            beginner: san + ' is a blunder! This loses ' + lossStr + ' pawns. ' + getBlunderReason(state, mv, bestMv, true) + (bestSan ? ' The correct move was ' + bestSan + '.' : ''),
            intermediate: san + ' is a serious blunder (-' + lossStr + '). ' + getBlunderReason(state, mv, bestMv, true) + (bestSan ? ' ' + bestSan + ' was necessary.' : ''),
            advanced: san + ' loses ' + lossStr + ' pawns. ' + getBlunderReason(state, mv, bestMv, true) + (bestSan ? ' Critical was ' + bestSan + '.' : '')
        }
    };

    const expSet = explanations[cls];
    if (!expSet) return san + ' -- ' + cls;
    return expSet[level] || expSet.intermediate;
}

function getInaccuracyReason(state, mv, bestMv) {
    const reasons = [];
    const ns = CE.applyMove(state, mv);
    const piece = pieceName(state.board[mv.from]);

    // Check if the move weakens king safety
    const kSq = CE.findKing(state.board, state.side);
    if (kSq >= 0) {
        const kFile = CE.fileOf(kSq);
        const pawnF = CE.fileOf(mv.from);
        if (CE.typeOf(state.board[mv.from]) === 1 && Math.abs(pawnF - kFile) <= 1 && CE.rankOf(mv.from) === (state.side === CE.WHITE ? 1 : 6)) {
            reasons.push(' Moving a pawn near the king weakens the pawn shield.');
        }
    }

    // Check if piece moves to a less active square
    if (CE.typeOf(state.board[mv.from]) === 2 || CE.typeOf(state.board[mv.from]) === 3) {
        const fromCenter = Math.abs(3.5 - CE.fileOf(mv.from)) + Math.abs(3.5 - CE.rankOf(mv.from));
        const toCenter = Math.abs(3.5 - CE.fileOf(mv.to)) + Math.abs(3.5 - CE.rankOf(mv.to));
        if (toCenter > fromCenter + 1) {
            reasons.push(' The ' + piece + ' moves away from the center to a less active square.');
        }
    }

    // Check if a defender is moved
    if (bestMv) {
        const bestNs = CE.applyMove(state, bestMv);
        const nsEval = CE.evaluate(ns);
        const bestEval = CE.evaluate(bestNs);
        if (Math.abs(nsEval - bestEval) > 50) {
            reasons.push(' This allows the opponent more counterplay.');
        }
    }

    return reasons.length ? reasons[0] : '';
}

function getBlunderReason(state, mv, bestMv, isBlunder) {
    const ns = CE.applyMove(state, mv);
    const piece = pieceName(state.board[mv.from]);
    const reasons = [];

    // Check if piece moves to attacked square
    if (CE.isAttacked(ns.board, mv.to, ns.side)) {
        const defended = CE.isAttacked(ns.board, mv.to, state.side);
        if (!defended) {
            reasons.push('The ' + piece + ' on ' + CE.sqToAlg(mv.to) + ' is left undefended and can be captured.');
        } else {
            const attackerVal = CE.VALUE[state.board[mv.from]];
            const defenderPieces = [];
            for (let i = 0; i < 64; i++) {
                if (ns.board[i] && CE.colorOf(ns.board[i]) === ns.side && CE.VALUE[ns.board[i]] < attackerVal) {
                    defenderPieces.push(i);
                }
            }
            if (defenderPieces.length > 0) {
                reasons.push('The ' + piece + ' can be captured by a less valuable piece.');
            }
        }
    }

    // Check if it creates a tactic for opponent
    const oppTactics = CE.detectTactics(ns);
    for (const tac of oppTactics) {
        if (tac.side === ns.side) {
            if (tac.type === 'fork') { reasons.push('This allows a fork: ' + tac.text + '.'); break; }
            if (tac.type === 'pin') { reasons.push('This creates a pin: ' + tac.text + '.'); break; }
            if (tac.type === 'skewer') { reasons.push('This allows a skewer: ' + tac.text + '.'); break; }
            if (tac.type === 'back_rank_weakness') { reasons.push('This exposes back-rank vulnerability.'); break; }
        }
    }

    // Check for hanging pieces created
    for (let i = 0; i < 64; i++) {
        const p = ns.board[i];
        if (!p || CE.colorOf(p) !== state.side || CE.typeOf(p) === 6) continue;
        if (CE.isAttacked(ns.board, i, ns.side) && !CE.isAttacked(ns.board, i, state.side)) {
            if (CE.VALUE[p] >= 300) {
                reasons.push('This leaves the ' + pieceName(p) + ' on ' + CE.sqToAlg(i) + ' undefended.');
                break;
            }
        }
    }

    // Check if king safety deteriorated
    if (state.side === CE.WHITE) {
        const before = CE.getKingSafetyPercent(state.board, CE.WHITE);
        const after = CE.getKingSafetyPercent(ns.board, CE.WHITE);
        if (after < before - 15) {
            reasons.push('This significantly weakens king safety.');
        }
    } else {
        const before = CE.getKingSafetyPercent(state.board, CE.BLACK);
        const after = CE.getKingSafetyPercent(ns.board, CE.BLACK);
        if (after < before - 15) {
            reasons.push('This significantly weakens king safety.');
        }
    }

    if (reasons.length === 0) {
        if (isBlunder) return 'This gives away a significant advantage.';
        return 'This allows the opponent to improve their position.';
    }
    return reasons.slice(0, 2).join(' ');
}

// ---- Tactical Motif Detector ----
function detectMotifs(state) {
    const motifs = [];
    const tactics = CE.detectTactics(state);

    for (const t of tactics) {
        switch (t.type) {
            case 'fork':
                motifs.push({icon: 'Y', name: 'Fork', description: t.text, severity: 'high'}); break;
            case 'pin':
                motifs.push({icon: '|', name: 'Pin', description: t.text, severity: 'high'}); break;
            case 'skewer':
                motifs.push({icon: '/', name: 'Skewer', description: t.text, severity: 'high'}); break;
            case 'hanging':
                motifs.push({icon: '!', name: 'Hanging Piece', description: t.text, severity: 'medium'}); break;
            case 'back_rank_weakness':
                motifs.push({icon: '#', name: 'Back Rank Threat', description: t.text, severity: 'high'}); break;
            case 'discovered_attack':
                motifs.push({icon: 'D', name: 'Discovered Attack', description: t.text, severity: 'high'}); break;
        }
    }

    // Smothered mate check
    const lm = CE.legalMoves(state);
    for (const mv of lm) {
        if (CE.typeOf(state.board[mv.from]) !== 2) continue;
        const ns = CE.applyMove(state, mv);
        const oppK = CE.findKing(ns.board, ns.side);
        if (oppK < 0) continue;
        if (CE.isAttacked(ns.board, oppK, state.side)) {
            const oppMoves = CE.legalMoves(ns);
            if (oppMoves.length === 0) {
                let surrounded = true;
                for (const d of [-9,-8,-7,-1,1,7,8,9]) {
                    const n = oppK + d;
                    if (!CE.isValid(n) || Math.abs(CE.fileOf(n) - CE.fileOf(oppK)) > 1) continue;
                    if (!ns.board[n] || CE.colorOf(ns.board[n]) !== ns.side) { surrounded = false; break; }
                }
                if (surrounded) {
                    motifs.push({icon: 'S', name: 'Smothered Mate', description: 'Smothered mate with ' + CE.moveToSan(state, mv, lm), severity: 'critical'});
                }
            }
        }
    }

    // Perpetual check detection (simplified)
    if (CE.inCheck(state)) {
        const escapes = CE.legalMoves(state);
        let allLeadToCheck = true;
        for (const esc of escapes.slice(0, 5)) {
            const ns = CE.applyMove(state, esc);
            if (!CE.inCheck(ns)) { allLeadToCheck = false; break; }
        }
        if (allLeadToCheck && escapes.length > 0) {
            motifs.push({icon: 'P', name: 'Perpetual Check Risk', description: 'All escape moves may lead back to check', severity: 'medium'});
        }
    }

    // Greek gift sacrifice potential (Bxh7+ or Bxh2+)
    for (const mv of lm) {
        if (CE.typeOf(state.board[mv.from]) !== 3) continue;
        const target = state.board[mv.to];
        if (CE.typeOf(target) !== 1) continue;
        const ns = CE.applyMove(state, mv);
        const oppK = CE.findKing(ns.board, ns.side);
        if (oppK >= 0 && CE.isAttacked(ns.board, oppK, state.side)) {
            const tSq = CE.sqToAlg(mv.to);
            if (tSq === 'h7' || tSq === 'h2' || tSq === 'g7' || tSq === 'g2') {
                motifs.push({icon: 'G', name: 'Greek Gift', description: 'Greek gift sacrifice possible with ' + CE.moveToSan(state, mv, lm), severity: 'high'});
            }
        }
    }

    return motifs.slice(0, 6);
}

// ---- Voice Coach ----
function speakMove(san, cls) {
    if (!window.speechSynthesis) return;
    const mode = getVoiceMode();
    if (mode === 'off') return;
    if (mode === 'mistakes') return; // In mistakes mode, only speakExplanation is used
    window.speechSynthesis.cancel();
    const spoken = CE.sanToSpoken(san);
    const u = new SpeechSynthesisUtterance(spoken);
    u.rate = 1.05;
    u.pitch = 1.0;
    window.speechSynthesis.speak(u);
}

function speakText(text) {
    if (!window.speechSynthesis) return;
    if (getVoiceMode() === 'off') return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.pitch = 1.0;
    window.speechSynthesis.speak(u);
}

function speakExplanation(cls, san, explanation) {
    if (!window.speechSynthesis) return;
    const mode = getVoiceMode();
    if (mode === 'off') return;
    if (mode === 'mistakes' && cls !== 'blunder' && cls !== 'mistake' && cls !== 'inaccuracy' && cls !== 'brilliant') return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const spoken = CE.sanToSpoken(san);
    let text = spoken + '. ';
    if (cls === 'blunder') text += 'This is a blunder! ';
    else if (cls === 'mistake') text += 'This is a mistake. ';
    else if (cls === 'inaccuracy') text += 'Inaccuracy. ';
    else if (cls === 'brilliant') text += 'Brilliant move! ';
    else if (cls === 'great') text += 'Great move! ';

    if (explanation && explanation.length < 200) {
        text += explanation;
    }

    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9;
    u.pitch = cls === 'blunder' ? 0.8 : cls === 'brilliant' ? 1.2 : 1.0;
    window.speechSynthesis.speak(u);
}

function speakMoveNavigation(san, cls) {
    if (!window.speechSynthesis) return;
    const mode = getVoiceMode();
    if (mode === 'off') return;
    if (mode === 'mistakes') return; // Only speak explanations in mistakes mode
    window.speechSynthesis.cancel();
    const spoken = CE.sanToSpoken(san);
    const u = new SpeechSynthesisUtterance(spoken);
    u.rate = 1.1;
    window.speechSynthesis.speak(u);
}

// ---- Game Style Analysis ----
function analyzeGameStyle(moveHistory) {
    if (!moveHistory || moveHistory.length < 10) return null;

    const stats = {
        sacrifices: 0, checks: 0, captures: 0,
        centerMoves: 0, kingsideMoves: 0, queensideMoves: 0,
        earlyPawnMoves: 0, pieceDevelopment: 0,
        blunders: 0, mistakes: 0, brilliants: 0, bests: 0,
        totalMoves: 0, endgameMoves: 0,
        attackingMoves: 0, defensiveMoves: 0
    };

    for (let i = 1; i < moveHistory.length; i++) {
        const h = moveHistory[i];
        if (!h.mv) continue;
        stats.totalMoves++;
        const mv = h.mv;
        const state = moveHistory[i - 1].state;
        const piece = CE.typeOf(state.board[mv.from]);
        const toFile = CE.fileOf(mv.to), toRank = CE.rankOf(mv.to);
        const isWhite = state.side === CE.WHITE;

        if (mv.flags & 1) stats.captures++;
        if (h.san && h.san.includes('+')) stats.checks++;
        if (h.san && h.san.includes('#')) stats.checks++;
        if (h.class === 'brilliant') stats.brilliants++;
        if (h.class === 'best' || h.class === 'excellent') stats.bests++;
        if (h.class === 'blunder') stats.blunders++;
        if (h.class === 'mistake') stats.mistakes++;

        if (CE.isMaterialSacrifice(state, mv)) stats.sacrifices++;
        if (toFile >= 2 && toFile <= 5 && toRank >= 2 && toRank <= 5) stats.centerMoves++;
        if (toFile >= 5) stats.kingsideMoves++;
        if (toFile <= 2) stats.queensideMoves++;
        if (piece === 1 && i <= 20) stats.earlyPawnMoves++;
        if ((piece === 2 || piece === 3) && i <= 16) stats.pieceDevelopment++;

        if (CE.isEndgame(state.board)) stats.endgameMoves++;

        // Attacking vs defensive: is the target square closer to opponent's king?
        const oppKing = CE.findKing(state.board, 1 - state.side);
        if (oppKing >= 0) {
            const distToOppK = Math.abs(CE.fileOf(oppKing) - toFile) + Math.abs(CE.rankOf(oppKing) - toRank);
            if (distToOppK <= 3) stats.attackingMoves++;
            else stats.defensiveMoves++;
        }
    }

    const n = stats.totalMoves || 1;
    const captureRate = stats.captures / n;
    const checkRate = stats.checks / n;
    const sacRate = stats.sacrifices / n;
    const centerRate = stats.centerMoves / n;
    const attackRate = stats.attackingMoves / n;
    const endgameRate = stats.endgameMoves / n;
    const accuracyRate = stats.bests / n;

    let style = 'Balanced Player';
    let description = '';
    const strengths = [];
    const weaknesses = [];
    const suggestions = [];

    if (sacRate > 0.05 && attackRate > 0.35) {
        style = 'Aggressive Attacker';
        description = 'You play an aggressive, attacking style with frequent sacrifices and checks. You aim to dominate the opponent with initiative.';
    } else if (captureRate > 0.25 && checkRate > 0.08) {
        style = 'Tactical Player';
        description = 'You have a strong tactical eye, frequently winning material through captures and checks. You thrive in complex positions.';
    } else if (centerRate > 0.35 && accuracyRate > 0.4) {
        style = 'Positional Grinder';
        description = 'You play a solid, positional style focused on center control and accurate moves. You gradually accumulate small advantages.';
    } else if (endgameRate > 0.3) {
        style = 'Endgame Specialist';
        description = 'You often reach endgames and handle them well. Your patient play allows you to convert small advantages.';
    } else {
        description = 'You play a balanced style mixing tactics and positional play. This versatility is a strength.';
    }

    if (stats.brilliants > 0) strengths.push('Found ' + stats.brilliants + ' brilliant move' + (stats.brilliants > 1 ? 's' : ''));
    if (accuracyRate > 0.5) strengths.push('High accuracy -- many best/excellent moves');
    if (captureRate > 0.2) strengths.push('Good at finding tactical opportunities');
    if (stats.pieceDevelopment > 3) strengths.push('Good piece development in the opening');
    if (attackRate > 0.3) strengths.push('Strong attacking instinct');
    if (endgameRate > 0.25 && stats.blunders === 0) strengths.push('Solid endgame technique');
    if (strengths.length === 0) strengths.push('Consistent play throughout');

    if (stats.blunders > 1) weaknesses.push('Made ' + stats.blunders + ' blunder' + (stats.blunders > 1 ? 's' : '') + ' -- focus on checking for opponent threats before moving');
    if (stats.mistakes > 2) weaknesses.push('Multiple mistakes -- take more time to verify candidate moves');
    if (stats.earlyPawnMoves > 4 && stats.pieceDevelopment < 3) weaknesses.push('Too many early pawn moves instead of developing pieces');
    if (centerRate < 0.2) weaknesses.push('Insufficient center control -- contest the center with pawns and pieces');
    if (attackRate < 0.15) weaknesses.push('Passive play -- look for ways to create threats');
    if (weaknesses.length === 0) weaknesses.push('No major weaknesses detected in this game');

    if (stats.blunders > 0) suggestions.push('Practice tactics puzzles daily to reduce blunders');
    if (stats.earlyPawnMoves > 4) suggestions.push('Study opening principles: develop pieces before pushing pawns');
    if (centerRate < 0.2) suggestions.push('Study classical games to understand center control');
    if (attackRate < 0.15) suggestions.push('Study attacking games by Tal, Kasparov, and Nezhmetdinov');
    if (endgameRate > 0.3 && stats.mistakes > 0) suggestions.push('Study basic endgame techniques (king and pawn, rook endgames)');
    if (suggestions.length === 0) suggestions.push('Keep up the good work -- review your games regularly');

    return {style, description, strengths, weaknesses, suggestions, stats};
}

// ---- Position Advice (fully offline) ----
function localAdvice(state, sanHistory, opening, evalCp) {
    const lines = [];
    const side = state.side === CE.WHITE ? 'White' : 'Black';
    const evalStr = evalCp >= 0 ? '+' + (evalCp / 100).toFixed(1) : (evalCp / 100).toFixed(1);
    const level = getLevel();

    let totalPieces = 0;
    for (let i = 0; i < 64; i++) if (state.board[i]) totalPieces++;
    const phase = totalPieces >= 28 ? 'opening' : totalPieces >= 14 ? 'middlegame' : 'endgame';

    lines.push('**Evaluation**: ' + evalStr + ' (' + (evalCp > 50 ? 'White' : evalCp < -50 ? 'Black' : 'Equal') + ' is better)');
    lines.push('**Phase**: ' + phase.charAt(0).toUpperCase() + phase.slice(1));

    if (opening) {
        lines.push('**Opening**: ' + opening.name + ' (' + opening.eco + ')');
        if (opening.description && level !== 'advanced') {
            lines.push(opening.description);
        }
        if (opening.winPct) {
            const wp = Math.round(opening.winPct * 100);
            lines.push('Historical win rate: White ' + wp + '% / Black ' + (100 - wp) + '%');
        }
    }

    const {plans, threats} = CE.analyzePosition(state);

    if (phase === 'opening') {
        lines.push('');
        lines.push('**Opening Principles:**');
        const wK = CE.findKing(state.board, CE.WHITE);
        const bK = CE.findKing(state.board, CE.BLACK);

        let wDev = 0, bDev = 0;
        for (const sq of [1, 2, 5, 6]) if (state.board[sq] === 0) wDev++;
        for (const sq of [57, 58, 61, 62]) if (state.board[sq] === 0) bDev++;

        if (side === 'White' && wDev < 2) lines.push('* Develop knights and bishops toward the center');
        if (side === 'Black' && bDev < 2) lines.push('* Develop knights and bishops toward the center');

        const centerSqs = [27, 28, 35, 36];
        let wCenter = 0, bCenter = 0;
        for (const sq of centerSqs) {
            if (CE.isAttacked(state.board, sq, CE.WHITE)) wCenter++;
            if (CE.isAttacked(state.board, sq, CE.BLACK)) bCenter++;
        }
        if (wCenter > bCenter) lines.push('* White controls the center -- maintain this advantage');
        else if (bCenter > wCenter) lines.push('* Black controls the center -- challenge it with pawn breaks');
        else lines.push('* Center is contested -- fight for control');

        if (wK === 4 && sanHistory.length > 10) lines.push('* Warning: White king is still in the center -- castle soon');
        if (bK === 60 && sanHistory.length > 10) lines.push('* Warning: Black king is still in the center -- castle soon');
        if (wK !== 4 && CE.rankOf(wK) === 0) lines.push('* White has castled -- good king safety');
        if (bK !== 60 && CE.rankOf(bK) === 7) lines.push('* Black has castled -- good king safety');
    }

    if (phase === 'middlegame') {
        lines.push('');
        lines.push('**Middlegame Ideas:**');
        if (plans.length) {
            for (const p of plans.slice(0, 3)) lines.push('* ' + p);
        }
        if (level === 'beginner') {
            lines.push('* Look for pieces that are undefended');
            lines.push('* Try to coordinate your rooks on open files');
        } else {
            lines.push('* Look for tactical motifs: pins, forks, discovered attacks');
            lines.push('* Improve your worst-placed piece');
        }
    }

    if (phase === 'endgame') {
        lines.push('');
        lines.push('**Endgame Technique:**');
        lines.push('* Activate your king -- it is a fighting piece in the endgame');
        lines.push('* Advance passed pawns with king support');
        if (plans.length) {
            for (const p of plans.slice(0, 2)) lines.push('* ' + p);
        }
        if (level !== 'beginner') {
            lines.push('* Consider pawn breaks to create weaknesses');
            lines.push('* Place rooks behind passed pawns (yours or opponent\'s)');
        }
    }

    if (threats.length) {
        lines.push('');
        lines.push('**Alerts:**');
        for (const t of threats) {
            if (t.type === 'hanging') lines.push('* ' + t.side + '\'s ' + (t.piece || 'P') + ' on ' + t.sq + ' is undefended!');
            if (t.type === 'king') lines.push('* ' + t.side + '\'s king on ' + t.sq + ' faces threats -- address king safety!');
        }
    }

    // Tactical motifs
    const motifs = detectMotifs(state);
    if (motifs.length) {
        lines.push('');
        lines.push('**Tactical Patterns:**');
        for (const m of motifs.slice(0, 3)) {
            lines.push('* ' + m.name + ': ' + m.description);
        }
    }

    return lines.join('\n');
}

// ---- Puzzle Generator ----
function generatePuzzles(moveHistory) {
    const puzzles = [];
    for (let i = 1; i < moveHistory.length; i++) {
        const h = moveHistory[i];
        if (!h.class || (h.class !== 'blunder' && h.class !== 'mistake')) continue;
        const prevState = moveHistory[i - 1].state;
        const bestTop = CE.getTopMoves(prevState, 3, 1);
        if (!bestTop.length) continue;
        const legal = CE.legalMoves(prevState);
        const bestSan = CE.moveToSan(prevState, bestTop[0].mv, legal);

        puzzles.push({
            fen: CE.stateToFen(prevState),
            bestMove: bestSan,
            bestMoveObj: bestTop[0].mv,
            moveNumber: i,
            playedMove: h.san,
            playedClass: h.class,
            cpLoss: h.cpLoss || 0,
            side: prevState.side,
            hint1: 'Look for the most forcing move.',
            hint2: 'Consider ' + CE.PIECE_NAMES[CE.typeOf(prevState.board[bestTop[0].mv.from])] + ' moves.',
            hint3: 'The best move is ' + bestSan.charAt(0) + '...'
        });
    }

    // Store in localStorage
    try {
        const existing = JSON.parse(localStorage.getItem(PUZZLE_KEY) || '[]');
        const combined = [...existing, ...puzzles].slice(-50);
        localStorage.setItem(PUZZLE_KEY, JSON.stringify(combined));
    } catch (e) {}

    return puzzles;
}

function getSavedPuzzles() {
    try {
        return JSON.parse(localStorage.getItem(PUZZLE_KEY) || '[]');
    } catch (e) { return []; }
}

function clearPuzzles() {
    try { localStorage.removeItem(PUZZLE_KEY); } catch (e) {}
}

// ---- Weakness Report ----
function generateWeaknessReport(moveHistory) {
    if (moveHistory.length < 4) return null;

    const whiteMoves = moveHistory.filter((_, i) => i % 2 === 1);
    const blackMoves = moveHistory.filter((_, i) => i % 2 === 0 && i > 0);

    function stats(moves) {
        const counts = {brilliant: 0, great: 0, best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, book: 0};
        let totalCpl = 0, moveCount = 0;
        for (const m of moves) {
            if (m.class) counts[m.class] = (counts[m.class] || 0) + 1;
            if (m.cpLoss != null) { totalCpl += m.cpLoss; moveCount++; }
        }
        const avgCpl = moveCount ? totalCpl / moveCount : 0;
        const accuracy = CE.cpToAccuracy(avgCpl);
        return {counts, avgCpl, accuracy};
    }

    const wStats = stats(whiteMoves);
    const bStats = stats(blackMoves);

    const allMoves = moveHistory.filter(m => m.mv);
    const bigMistakes = allMoves
        .filter(m => m.class === 'blunder' || m.class === 'mistake')
        .sort((a, b) => (b.cpLoss || 0) - (a.cpLoss || 0))
        .slice(0, 5);

    const openingMoves = allMoves.slice(0, 20);
    const openingBlunders = openingMoves.filter(m => m.class === 'blunder' || m.class === 'mistake');

    const styleAnalysis = analyzeGameStyle(moveHistory);

    return {wStats, bStats, bigMistakes, openingBlunders, styleAnalysis};
}

// ---- Format advice as HTML ----
function formatAdviceHtml(text) {
    if (!text) return '';
    return text
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/^\* /gm, '<span class="coach-bullet">&#9656;</span> ')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        .replace(/^/, '<p>')
        .replace(/$/, '</p>');
}

return {
    getLevel, setLevel, getVoiceMode, setVoiceMode,
    explainClassification, getBlunderReason,
    detectMotifs, speakMove, speakText, speakExplanation, speakMoveNavigation,
    analyzeGameStyle, localAdvice,
    generatePuzzles, getSavedPuzzles, clearPuzzles,
    generateWeaknessReport, formatAdviceHtml
};
})();
