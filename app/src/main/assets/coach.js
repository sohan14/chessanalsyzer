'use strict';
// ============================================================
// Chess Coach — Local heuristics + Claude API coaching
// ============================================================
const COACH = (() => {

const STORAGE_KEY = 'chess_analyzer_api_key';

function getApiKey() { try { return localStorage.getItem(STORAGE_KEY) || ''; } catch(e) { return ''; } }
function saveApiKey(k) { try { localStorage.setItem(STORAGE_KEY, k); } catch(e) {} }

// ---- Local coaching (no API needed) ----
function localAdvice(state, sanHistory, opening, evalCp) {
    const lines = [];
    const side = state.side === CE.WHITE ? 'White' : 'Black';
    const opp = state.side === CE.WHITE ? 'Black' : 'White';
    const evalStr = evalCp >= 0 ? `+${(evalCp/100).toFixed(1)}` : `${(evalCp/100).toFixed(1)}`;

    // Game phase
    let totalPieces = 0;
    for (let i = 0; i < 64; i++) if (state.board[i]) totalPieces++;
    const phase = totalPieces >= 28 ? 'opening' : totalPieces >= 14 ? 'middlegame' : 'endgame';

    lines.push(`📊 **Evaluation**: ${evalStr} (${evalCp > 50 ? 'White' : evalCp < -50 ? 'Black' : 'Equal'} is better)`);
    lines.push(`🎯 **Phase**: ${phase.charAt(0).toUpperCase() + phase.slice(1)}`);

    if (opening) lines.push(`📖 **Opening**: ${opening.name} (${opening.eco})`);

    const {plans, threats} = CE.analyzePosition(state);

    // Phase-specific advice
    if (phase === 'opening') {
        lines.push('\n**Opening Principles:**');
        // Count developed pieces
        let wDevW = 0, wDevB = 0;
        const wDevSqs = [1,2,5,6], bDevSqs = [57,58,61,62]; // knight starting squares
        for (const sq of wDevSqs) if (state.board[sq] === 0) wDevW++;
        for (const sq of bDevSqs) if (state.board[sq] === 0) wDevB++;
        if (wDevW < 2) lines.push('• White should develop knights and bishops');
        if (wDevB < 2) lines.push('• Black should develop knights and bishops');

        // Center control
        const centerSqs = [27, 28, 35, 36]; // d4,e4,d5,e5
        let wCenter = 0, bCenter = 0;
        for (const sq of centerSqs) {
            if (CE.isAttacked(state.board, sq, CE.WHITE)) wCenter++;
            if (CE.isAttacked(state.board, sq, CE.BLACK)) bCenter++;
        }
        if (wCenter > bCenter) lines.push('• White controls the center — maintain this advantage');
        else if (bCenter > wCenter) lines.push('• Black controls the center — challenge it with pawn breaks');
        else lines.push('• Center is contested — fight for control with pawns and pieces');

        // King safety
        const wK = CE.findKing(state.board, CE.WHITE);
        const bK = CE.findKing(state.board, CE.BLACK);
        if (wK !== 4 && CE.rankOf(wK) === 0) lines.push('• White has castled — good king safety');
        else if (wK === 4 && sanHistory.length > 10) lines.push('• ⚠️ White king is still in the center — consider castling');
        if (bK !== 60 && CE.rankOf(bK) === 7) lines.push('• Black has castled — good king safety');
        else if (bK === 60 && sanHistory.length > 10) lines.push('• ⚠️ Black king is still in the center — consider castling');
    }

    if (phase === 'middlegame') {
        lines.push('\n**Middlegame Ideas:**');
        if (plans.length) {
            for (const p of plans.slice(0, 3)) lines.push('• ' + p);
        }
        lines.push('• Look for tactical opportunities: pins, forks, skewers');
        lines.push('• Coordinate rooks on open files');
    }

    if (phase === 'endgame') {
        lines.push('\n**Endgame Technique:**');
        lines.push('• Activate your king — it is a strong piece in the endgame');
        lines.push('• Advance passed pawns with king support');
        if (plans.length) {
            for (const p of plans.slice(0, 2)) lines.push('• ' + p);
        }
    }

    // Threats
    if (threats.length) {
        lines.push('\n**⚠️ Alerts:**');
        for (const t of threats) {
            if (t.type === 'hanging') lines.push(`• ${t.side}'s ${t.piece || 'pawn'} on ${t.sq} is undefended!`);
            if (t.type === 'king') lines.push(`• ${t.side}'s king on ${t.sq} faces threats — address king safety!`);
        }
    }

    return lines.join('\n');
}

// ---- Claude API coaching ----
async function askClaude(state, sanHistory, opening, evalCp, customQuestion) {
    const apiKey = getApiKey();
    if (!apiKey) return null;

    const fen = CE.stateToFen(state);
    const evalStr = (evalCp / 100).toFixed(2);
    const openingStr = opening ? `${opening.name} (${opening.eco})` : 'Unknown opening';
    const movesStr = sanHistory.slice(-20).join(' ');
    const sideToMove = state.side === CE.WHITE ? 'White' : 'Black';

    const question = customQuestion ||
        `Analyze this position and give me specific, actionable coaching advice.
        Focus on: key strategic plans, tactical opportunities, weaknesses to fix, and what ${sideToMove} should do next.`;

    const prompt = `You are an expert chess coach (GM level). Analyze this position concisely.

Position (FEN): ${fen}
Opening: ${openingStr}
Recent moves: ${movesStr}
Engine evaluation: ${evalStr} (positive = White advantage)
Side to move: ${sideToMove}

Question: ${question}

Respond in clear, practical coaching language. Use chess terminology.
Format with bullet points. Be specific about squares and pieces.
Keep it under 250 words. Start directly with the analysis.`;

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 400,
                system: 'You are an expert chess coach providing concise, actionable analysis. Always be specific about moves, squares, and plans.',
                messages: [{ role: 'user', content: prompt }]
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `API error ${response.status}`);
        }

        const data = await response.json();
        return data.content[0]?.text || null;
    } catch (e) {
        throw e;
    }
}

// ---- Game weakness report ----
function generateWeaknessReport(moveHistory) {
    // moveHistory: array of {state, mv, san, class, cpLoss}
    if (moveHistory.length < 4) return null;

    const whiteMoves = moveHistory.filter((_, i) => i % 2 === 1); // odd indices = white's moves
    const blackMoves = moveHistory.filter((_, i) => i % 2 === 0 && i > 0);

    function stats(moves) {
        const counts = { brilliant:0, best:0, good:0, inaccuracy:0, mistake:0, blunder:0, book:0 };
        let totalCpl = 0, moveCount = 0;
        for (const m of moves) {
            if (m.class) counts[m.class] = (counts[m.class] || 0) + 1;
            if (m.cpLoss != null) { totalCpl += m.cpLoss; moveCount++; }
        }
        const avgCpl = moveCount ? totalCpl / moveCount : 0;
        const accuracy = CE.cpToAccuracy(avgCpl);
        return { counts, avgCpl, accuracy };
    }

    const wStats = stats(whiteMoves);
    const bStats = stats(blackMoves);

    // Find biggest mistakes
    const allMoves = moveHistory.filter(m => m.mv);
    const bigMistakes = allMoves
        .filter(m => m.class === 'blunder' || m.class === 'mistake')
        .sort((a, b) => (b.cpLoss || 0) - (a.cpLoss || 0))
        .slice(0, 3);

    // Opening phase (first 10 moves)
    const openingMoves = allMoves.slice(0, 20);
    const openingBlunders = openingMoves.filter(m => m.class === 'blunder' || m.class === 'mistake');

    return { wStats, bStats, bigMistakes, openingBlunders };
}

// ---- Format advice as HTML ----
function formatAdviceHtml(text) {
    if (!text) return '';
    return text
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/^• /gm, '<span class="coach-bullet">▸</span> ')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        .replace(/^/, '<p>')
        .replace(/$/, '</p>');
}

return { getApiKey, saveApiKey, localAdvice, askClaude, generateWeaknessReport, formatAdviceHtml };
})();
