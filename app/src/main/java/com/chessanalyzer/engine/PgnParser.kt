package com.chessanalyzer.engine

import com.chessanalyzer.model.*

data class PgnGame(
    val headers: Map<String, String>,
    val moves: List<String>
)

data class ReplayState(
    val board: ChessBoard,
    val move: Move?,
    val san: String?
)

object PgnParser {

    fun parsePgn(pgn: String): PgnGame {
        val headers = mutableMapOf<String, String>()
        val headerRegex = Regex("""\[(\w+)\s+"([^"]*)"\]""")
        val lines = pgn.lines()

        val moveTextBuilder = StringBuilder()
        var inMoveSection = false

        for (line in lines) {
            val trimmed = line.trim()
            if (trimmed.isEmpty()) {
                if (headers.isNotEmpty()) inMoveSection = true
                continue
            }
            val headerMatch = headerRegex.matchEntire(trimmed)
            if (headerMatch != null) {
                headers[headerMatch.groupValues[1]] = headerMatch.groupValues[2]
            } else {
                inMoveSection = true
                moveTextBuilder.append(trimmed).append(' ')
            }
        }

        val moveText = moveTextBuilder.toString()
        val moves = parseMoveText(moveText)

        return PgnGame(headers, moves)
    }

    private fun parseMoveText(text: String): List<String> {
        val moves = mutableListOf<String>()
        // Remove comments in braces
        var cleaned = text.replace(Regex("""\{[^}]*\}"""), " ")
        // Remove variations in parentheses (simple non-nested)
        cleaned = cleaned.replace(Regex("""\([^)]*\)"""), " ")
        // Remove NAGs like $1, $2
        cleaned = cleaned.replace(Regex("""\$\d+"""), " ")
        // Normalize whitespace
        cleaned = cleaned.replace(Regex("""\s+"""), " ").trim()

        val tokens = cleaned.split(" ")
        for (token in tokens) {
            val trimmed = token.trim()
            if (trimmed.isEmpty()) continue
            // Skip move numbers like "1.", "1...", "12."
            if (trimmed.matches(Regex("""^\d+\.+$"""))) continue
            // Skip results
            if (trimmed in listOf("1-0", "0-1", "1/2-1/2", "*")) continue
            // Skip if starts with digit and has a dot (e.g., "1.e4" - split it)
            val moveWithNumber = Regex("""^\d+\.+(.+)$""").matchEntire(trimmed)
            if (moveWithNumber != null) {
                val moveStr = moveWithNumber.groupValues[1]
                if (moveStr.isNotEmpty()) moves.add(moveStr)
                continue
            }
            // Valid move token
            if (trimmed.matches(Regex("""^[a-hKQRBNO].*"""))) {
                moves.add(trimmed)
            }
        }

        return moves
    }

    fun replayGame(moves: List<String>): List<ReplayState> {
        val states = mutableListOf<ReplayState>()
        var board = ChessBoard.startingPosition()
        states.add(ReplayState(board, null, null))

        for (san in moves) {
            val move = sanToMove(board, san)
            if (move != null) {
                board = ChessEngine.applyMove(board, move)
                states.add(ReplayState(board, move, san))
            } else {
                // If we can't parse the move, stop
                break
            }
        }

        return states
    }

    fun sanToMove(board: ChessBoard, san: String): Move? {
        // Clean SAN: remove +, #, !, ?
        val cleanSan = san.replace(Regex("[+#!?]"), "").trim()
        if (cleanSan.isEmpty()) return null

        val legalMoves = ChessEngine.legalMoves(board)
        if (legalMoves.isEmpty()) return null

        // Castling
        if (cleanSan == "O-O" || cleanSan == "0-0") {
            return legalMoves.find { it.isCastle && it.to.file == 6 }
        }
        if (cleanSan == "O-O-O" || cleanSan == "0-0-0") {
            return legalMoves.find { it.isCastle && it.to.file == 2 }
        }

        // Parse promotion
        var remaining = cleanSan
        var promotion: PieceType? = null
        val promoMatch = Regex("""=([QRBN])$""").find(remaining)
        if (promoMatch != null) {
            promotion = when (promoMatch.groupValues[1]) {
                "Q" -> PieceType.QUEEN
                "R" -> PieceType.ROOK
                "B" -> PieceType.BISHOP
                "N" -> PieceType.KNIGHT
                else -> null
            }
            remaining = remaining.substring(0, promoMatch.range.first)
        }

        // Determine piece type
        var pieceType = PieceType.PAWN
        if (remaining.isNotEmpty() && remaining[0] in "KQRBN") {
            pieceType = when (remaining[0]) {
                'K' -> PieceType.KING
                'Q' -> PieceType.QUEEN
                'R' -> PieceType.ROOK
                'B' -> PieceType.BISHOP
                'N' -> PieceType.KNIGHT
                else -> PieceType.PAWN
            }
            remaining = remaining.substring(1)
        }

        // Remove capture marker
        val isCapture = 'x' in remaining
        remaining = remaining.replace("x", "")

        // The last two characters should be the destination square
        if (remaining.length < 2) return null
        val destStr = remaining.substring(remaining.length - 2)
        val destSquare = Square.fromAlgebraic(destStr) ?: return null
        remaining = remaining.substring(0, remaining.length - 2)

        // Remaining characters are disambiguation (file, rank, or both)
        var disambigFile: Int? = null
        var disambigRank: Int? = null
        for (c in remaining) {
            if (c in 'a'..'h') disambigFile = c - 'a'
            else if (c in '1'..'8') disambigRank = c - '1'
        }

        // Find matching legal move
        val candidates = legalMoves.filter { move ->
            val piece = board.pieceAt(move.from) ?: return@filter false
            piece.type == pieceType &&
            move.to == destSquare &&
            (promotion == null || move.promotion == promotion) &&
            (disambigFile == null || move.from.file == disambigFile) &&
            (disambigRank == null || move.from.rank == disambigRank)
        }

        return when {
            candidates.size == 1 -> candidates[0]
            candidates.size > 1 -> {
                // If multiple candidates with promotion, prefer matching promotion
                if (promotion != null) {
                    candidates.find { it.promotion == promotion } ?: candidates[0]
                } else {
                    candidates[0]
                }
            }
            else -> null
        }
    }
}
