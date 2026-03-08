package com.chessanalyzer.engine

import com.chessanalyzer.model.*

object CoachEngine {

    fun explainMove(
        board: ChessBoard,
        move: Move,
        classification: MoveClassification,
        bestMove: Move?,
        evalBefore: Int,
        evalAfter: Int,
        bestEval: Int
    ): String {
        val san = ChessEngine.moveToSan(board, move)
        val bestSan = bestMove?.let { ChessEngine.moveToSan(board, it) }
        val loss = (bestEval - evalAfter).coerceAtLeast(0)
        val lossStr = "%.1f".format(loss / 100f)
        val piece = board.pieceAt(move.from)
        val pieceName = piece?.type?.name?.lowercase()?.replaceFirstChar { it.uppercase() } ?: "piece"

        return when (classification) {
            MoveClassification.BLUNDER -> buildBlunderExplanation(board, move, bestSan, lossStr, pieceName)
            MoveClassification.MISTAKE -> buildMistakeExplanation(board, move, bestSan, lossStr, pieceName)
            MoveClassification.MISS -> "You missed a tactic here.${bestSan?.let { " $it was winning." } ?: ""}"
            MoveClassification.INACCURACY -> "A slight imprecision.${bestSan?.let { " $it was more accurate." } ?: ""}"
            MoveClassification.GOOD -> "A reasonable move."
            MoveClassification.BOOK -> "A standard book move."
            MoveClassification.EXCELLENT -> "An excellent move, very close to the best."
            MoveClassification.BEST -> buildBestExplanation(board, move, pieceName)
            MoveClassification.GREAT -> "A strong move that maintains the advantage well."
            MoveClassification.BRILLIANT -> "A brilliant sacrifice! This move gives up material but creates an unstoppable attack."
        }
    }

    private fun buildBlunderExplanation(board: ChessBoard, move: Move, bestSan: String?, lossStr: String, pieceName: String): String {
        val afterBoard = ChessEngine.applyMove(board, move)
        val reasons = mutableListOf<String>()

        // Check if piece is left hanging
        if (ChessEngine.isAttacked(afterBoard.board, move.to.toIndex(), board.sideToMove.opposite())) {
            if (!ChessEngine.isAttacked(afterBoard.board, move.to.toIndex(), board.sideToMove)) {
                reasons.add("Ouch! You left your $pieceName hanging.")
            }
        }

        // Check hanging pieces created
        for (i in 0 until 64) {
            val p = Piece.decode(afterBoard.board[i]) ?: continue
            if (p.color != board.sideToMove) continue
            if (p.type == PieceType.KING) continue
            if (ChessEngine.isAttacked(afterBoard.board, i, board.sideToMove.opposite()) &&
                !ChessEngine.isAttacked(afterBoard.board, i, board.sideToMove)
            ) {
                val sq = Square.fromIndex(i)
                val name = p.type.name.lowercase()
                reasons.add("This leaves your $name on ${sq.toAlgebraic()} undefended.")
                break
            }
        }

        if (reasons.isEmpty()) {
            reasons.add("This gives away a significant advantage (-$lossStr pawns).")
        }

        val bestPart = bestSan?.let { " $it was the correct move." } ?: ""
        return reasons.first() + bestPart
    }

    private fun buildMistakeExplanation(board: ChessBoard, move: Move, bestSan: String?, lossStr: String, pieceName: String): String {
        val base = "This loses $lossStr pawns of advantage."
        val bestPart = bestSan?.let { " Better was $it." } ?: ""
        return base + bestPart
    }

    private fun buildBestExplanation(board: ChessBoard, move: Move, pieceName: String): String {
        val afterBoard = ChessEngine.applyMove(board, move)
        val reasons = mutableListOf<String>()

        // Check if it's a capture
        if (move.isCapture) {
            reasons.add("Winning material.")
        }

        // Check center control
        val centralSquares = listOf(27, 28, 35, 36) // d4,e4,d5,e5
        if (move.to.toIndex() in centralSquares) {
            reasons.add("Controlling the center.")
        }

        // Check if it creates a check
        val san = ChessEngine.moveToSan(board, move)
        if (san.contains("+")) {
            reasons.add("Creating a strong check.")
        }

        // Check pawn structure attack
        val toPiece = board.pieceAt(move.to)
        if (toPiece?.type == PieceType.PAWN) {
            reasons.add("Attacking your pawn chain.")
        }

        return if (reasons.isEmpty()) "This is the engine's top choice." else reasons.first()
    }

    fun generateGameCoachComment(analysis: GameAnalysis): String {
        return generateGameSummary(
            analysis.whiteAccuracy, analysis.blackAccuracy,
            analysis.whiteName, analysis.blackName,
            analysis.result, analysis.moves, analysis.opening
        )
    }

    fun generateGameSummary(
        whiteAccuracy: Float,
        blackAccuracy: Float,
        whiteName: String,
        blackName: String,
        result: String,
        moves: List<AnalyzedMove>,
        opening: String
    ): String {
        val avgAcc = (whiteAccuracy + blackAccuracy) / 2f
        val blunders = moves.count { it.classification == MoveClassification.BLUNDER }
        val brilliants = moves.count { it.classification == MoveClassification.BRILLIANT }

        return when {
            avgAcc >= 90 -> "An excellent game from both sides! Very precise play throughout."
            avgAcc >= 80 && blunders == 0 -> "A solid game with accurate play. Let's see the key moments!"
            avgAcc >= 70 -> "A solid start lost steam in the middlegame. Let's review with an eye towards accuracy!"
            blunders >= 3 -> "A wild game with lots of action! There are some important learning moments here."
            brilliants > 0 -> "Some brilliant ideas in this game! Let's review the highlights."
            else -> "Not every game goes your way, but there are always some learning moments that are worth reviewing!"
        }
    }

    fun getPhaseRating(moves: List<AnalyzedMove>, phase: String): String {
        val phaseMoves = when (phase) {
            "opening" -> moves.filterIndexed { i, _ -> i < 20 }
            "middlegame" -> moves.filterIndexed { i, _ -> i in 20 until (moves.size - 10).coerceAtLeast(20) }
            "endgame" -> moves.takeLast(10.coerceAtMost(moves.size))
            else -> moves
        }
        if (phaseMoves.isEmpty()) return "-"

        val avgCpl = phaseMoves.map { it.cpLoss }.average().toFloat()
        val acc = ChessEngine.cpToAccuracy(avgCpl)

        return when {
            acc >= 95 -> "\u2B50" // star
            acc >= 85 -> "\uD83D\uDC4D" // thumbs up
            acc >= 75 -> "\u2714" // check
            acc >= 60 -> "?!" // dubious
            else -> "?" // bad
        }
    }

    data class TacticalPattern(
        val type: String,
        val description: String,
        val squares: List<Square>
    )

    fun detectTactics(board: ChessBoard): List<TacticalPattern> {
        val patterns = mutableListOf<TacticalPattern>()
        val us = board.sideToMove
        val them = us.opposite()

        // Hanging pieces
        for (i in 0 until 64) {
            val p = Piece.decode(board.board[i]) ?: continue
            if (p.type == PieceType.KING) continue
            if (ChessEngine.isAttacked(board.board, i, p.color.opposite()) &&
                !ChessEngine.isAttacked(board.board, i, p.color)
            ) {
                val sq = Square.fromIndex(i)
                val name = p.type.name.lowercase()
                val side = if (p.color == PieceColor.WHITE) "White" else "Black"
                patterns.add(
                    TacticalPattern(
                        "hanging",
                        "$side's $name on ${sq.toAlgebraic()} is hanging.",
                        listOf(sq)
                    )
                )
            }
        }

        // Fork detection (knight forks)
        val legalMoves = ChessEngine.legalMoves(board)
        for (mv in legalMoves) {
            val piece = board.pieceAt(mv.from) ?: continue
            if (piece.type != PieceType.KNIGHT) continue
            val ns = ChessEngine.applyMove(board, mv)
            val attacked = mutableListOf<Square>()
            for (i in 0 until 64) {
                val tp = Piece.decode(ns.board[i]) ?: continue
                if (tp.color == us) continue
                if (tp.type == PieceType.PAWN) continue
                if (ChessEngine.isKnightAttacking(mv.to.toIndex(), i)) {
                    attacked.add(Square.fromIndex(i))
                }
            }
            if (attacked.size >= 2) {
                val targets = attacked.joinToString(" and ") {
                    val tp = Piece.decode(ns.board[it.toIndex()])
                    "${tp?.type?.name?.lowercase()} on ${it.toAlgebraic()}"
                }
                patterns.add(
                    TacticalPattern(
                        "fork",
                        "Knight fork attacking $targets",
                        attacked + listOf(mv.to)
                    )
                )
            }
        }

        // Back rank weakness
        for (col in listOf(PieceColor.WHITE, PieceColor.BLACK)) {
            val kSq = ChessEngine.findKing(board.board, col)
            if (kSq < 0) continue
            val backRank = if (col == PieceColor.WHITE) 0 else 7
            if (Square.fromIndex(kSq).rank != backRank) continue
            val kFile = Square.fromIndex(kSq).file
            var trapped = true
            val escapeDir = if (col == PieceColor.WHITE) 1 else -1
            for (df in -1..1) {
                val f = kFile + df
                if (f !in 0..7) continue
                val escRank = backRank + escapeDir
                if (escRank !in 0..7) continue
                val escIdx = escRank * 8 + f
                val ep = board.board[escIdx]
                if (ep == 0 || Piece.decode(ep)?.color != col) {
                    if (!ChessEngine.isAttacked(board.board, escIdx, col.opposite())) {
                        trapped = false; break
                    }
                }
            }
            if (trapped) {
                val side = if (col == PieceColor.WHITE) "White" else "Black"
                patterns.add(
                    TacticalPattern(
                        "back_rank",
                        "$side's king is vulnerable to a back-rank mate.",
                        listOf(Square.fromIndex(kSq))
                    )
                )
            }
        }

        return patterns.take(6)
    }
}
