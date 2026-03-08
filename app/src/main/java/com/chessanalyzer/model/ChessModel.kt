package com.chessanalyzer.model

import kotlin.math.abs

enum class PieceType {
    PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING
}

enum class PieceColor {
    WHITE, BLACK;

    fun opposite(): PieceColor = if (this == WHITE) BLACK else WHITE
}

data class Piece(val type: PieceType, val color: PieceColor) {
    fun encode(): Int {
        val base = when (type) {
            PieceType.PAWN -> 1
            PieceType.KNIGHT -> 2
            PieceType.BISHOP -> 3
            PieceType.ROOK -> 4
            PieceType.QUEEN -> 5
            PieceType.KING -> 6
        }
        return if (color == PieceColor.WHITE) base else base + 6
    }

    companion object {
        fun decode(code: Int): Piece? {
            if (code == 0) return null
            val color = if (code <= 6) PieceColor.WHITE else PieceColor.BLACK
            val type = when ((code - 1) % 6) {
                0 -> PieceType.PAWN
                1 -> PieceType.KNIGHT
                2 -> PieceType.BISHOP
                3 -> PieceType.ROOK
                4 -> PieceType.QUEEN
                5 -> PieceType.KING
                else -> return null
            }
            return Piece(type, color)
        }
    }
}

data class Square(val file: Int, val rank: Int) {
    fun toAlgebraic(): String {
        val fileChar = ('a' + file)
        val rankChar = ('1' + rank)
        return "$fileChar$rankChar"
    }

    fun toIndex(): Int = rank * 8 + file

    fun isValid(): Boolean = file in 0..7 && rank in 0..7

    companion object {
        fun fromIndex(index: Int): Square = Square(index % 8, index / 8)

        fun fromAlgebraic(s: String): Square? {
            if (s.length < 2) return null
            val file = s[0] - 'a'
            val rank = s[1] - '1'
            if (file !in 0..7 || rank !in 0..7) return null
            return Square(file, rank)
        }
    }
}

data class Move(
    val from: Square,
    val to: Square,
    val promotion: PieceType? = null,
    val isCapture: Boolean = false,
    val isCastle: Boolean = false,
    val isEnPassant: Boolean = false
) {
    fun toUci(): String {
        val promo = when (promotion) {
            PieceType.QUEEN -> "q"
            PieceType.ROOK -> "r"
            PieceType.BISHOP -> "b"
            PieceType.KNIGHT -> "n"
            else -> ""
        }
        return "${from.toAlgebraic()}${to.toAlgebraic()}$promo"
    }
}

enum class MoveClassification(val symbol: String, val label: String, val color: Long) {
    BRILLIANT("!!", "Brilliant", 0xFF1BACA6),
    GREAT("!", "Great", 0xFF5C8BB0),
    BEST("\u2605", "Best", 0xFF96BC4B),
    EXCELLENT("\u2605", "Excellent", 0xFF96BC4B),
    GOOD("\u2605", "Good", 0xFF96BC4B),
    BOOK("\u266A", "Book", 0xFFA88764),
    INACCURACY("?!", "Inaccuracy", 0xFFF7C631),
    MISTAKE("?", "Mistake", 0xFFE58F2A),
    MISS("?", "Miss", 0xFFE58F2A),
    BLUNDER("??", "Blunder", 0xFFCA3431)
}

data class AnalyzedMove(
    val move: Move,
    val san: String,
    val classification: MoveClassification,
    val evalBefore: Int,
    val evalAfter: Int,
    val bestMove: Move?,
    val bestSan: String?,
    val cpLoss: Int,
    val explanation: String
)

data class GameAnalysis(
    val moves: List<AnalyzedMove>,
    val whiteAccuracy: Float,
    val blackAccuracy: Float,
    val result: String,
    val whiteName: String,
    val blackName: String,
    val opening: String,
    val openingPhaseRating: String,
    val middlegamePhaseRating: String,
    val endgamePhaseRating: String,
    val evalHistory: List<Int>,
    val coachComment: String
)

data class ChessBoard(
    val board: IntArray,
    val sideToMove: PieceColor,
    val castlingRights: Int,
    val epSquare: Int,
    val halfmoveClock: Int,
    val fullmoveNumber: Int
) {
    fun pieceAt(sq: Square): Piece? {
        if (!sq.isValid()) return null
        return Piece.decode(board[sq.toIndex()])
    }

    fun pieceAt(index: Int): Piece? {
        if (index < 0 || index > 63) return null
        return Piece.decode(board[index])
    }

    fun clone(): ChessBoard = ChessBoard(
        board = board.copyOf(),
        sideToMove = sideToMove,
        castlingRights = castlingRights,
        epSquare = epSquare,
        halfmoveClock = halfmoveClock,
        fullmoveNumber = fullmoveNumber
    )

    fun toFen(): String {
        val sb = StringBuilder()
        for (rank in 7 downTo 0) {
            var empty = 0
            for (file in 0..7) {
                val piece = board[rank * 8 + file]
                if (piece == 0) {
                    empty++
                } else {
                    if (empty > 0) {
                        sb.append(empty)
                        empty = 0
                    }
                    sb.append(pieceToFenChar(piece))
                }
            }
            if (empty > 0) sb.append(empty)
            if (rank > 0) sb.append('/')
        }
        sb.append(' ')
        sb.append(if (sideToMove == PieceColor.WHITE) 'w' else 'b')
        sb.append(' ')

        val castleStr = StringBuilder()
        if (castlingRights and CASTLE_WK != 0) castleStr.append('K')
        if (castlingRights and CASTLE_WQ != 0) castleStr.append('Q')
        if (castlingRights and CASTLE_BK != 0) castleStr.append('k')
        if (castlingRights and CASTLE_BQ != 0) castleStr.append('q')
        sb.append(if (castleStr.isEmpty()) "-" else castleStr)

        sb.append(' ')
        if (epSquare == -1) {
            sb.append('-')
        } else {
            sb.append(Square.fromIndex(epSquare).toAlgebraic())
        }
        sb.append(' ')
        sb.append(halfmoveClock)
        sb.append(' ')
        sb.append(fullmoveNumber)

        return sb.toString()
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is ChessBoard) return false
        return board.contentEquals(other.board) &&
                sideToMove == other.sideToMove &&
                castlingRights == other.castlingRights &&
                epSquare == other.epSquare &&
                halfmoveClock == other.halfmoveClock &&
                fullmoveNumber == other.fullmoveNumber
    }

    override fun hashCode(): Int {
        var result = board.contentHashCode()
        result = 31 * result + sideToMove.hashCode()
        result = 31 * result + castlingRights
        result = 31 * result + epSquare
        result = 31 * result + halfmoveClock
        result = 31 * result + fullmoveNumber
        return result
    }

    companion object {
        const val CASTLE_WK = 1
        const val CASTLE_WQ = 2
        const val CASTLE_BK = 4
        const val CASTLE_BQ = 8

        // Piece encoding: 0=empty, 1=wP, 2=wN, 3=wB, 4=wR, 5=wQ, 6=wK, 7=bP, 8=bN, 9=bB, 10=bR, 11=bQ, 12=bK
        const val EMPTY = 0
        const val WP = 1; const val WN = 2; const val WB = 3; const val WR = 4; const val WQ = 5; const val WK = 6
        const val BP = 7; const val BN = 8; const val BB = 9; const val BR = 10; const val BQ = 11; const val BK = 12

        fun pieceToFenChar(code: Int): Char = when (code) {
            WP -> 'P'; WN -> 'N'; WB -> 'B'; WR -> 'R'; WQ -> 'Q'; WK -> 'K'
            BP -> 'p'; BN -> 'n'; BB -> 'b'; BR -> 'r'; BQ -> 'q'; BK -> 'k'
            else -> '?'
        }

        fun fenCharToPiece(c: Char): Int = when (c) {
            'P' -> WP; 'N' -> WN; 'B' -> WB; 'R' -> WR; 'Q' -> WQ; 'K' -> WK
            'p' -> BP; 'n' -> BN; 'b' -> BB; 'r' -> BR; 'q' -> BQ; 'k' -> BK
            else -> EMPTY
        }

        fun startingPosition(): ChessBoard = parseFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")

        fun parseFen(fen: String): ChessBoard {
            val parts = fen.trim().split("\\s+".toRegex())
            val board = IntArray(64)

            val rows = parts[0].split("/")
            for ((rowIdx, row) in rows.withIndex()) {
                val rank = 7 - rowIdx
                var file = 0
                for (c in row) {
                    if (c.isDigit()) {
                        file += c.digitToInt()
                    } else {
                        board[rank * 8 + file] = fenCharToPiece(c)
                        file++
                    }
                }
            }

            val sideToMove = if (parts.getOrElse(1) { "w" } == "w") PieceColor.WHITE else PieceColor.BLACK

            var castling = 0
            val castleStr = parts.getOrElse(2) { "-" }
            if ('K' in castleStr) castling = castling or CASTLE_WK
            if ('Q' in castleStr) castling = castling or CASTLE_WQ
            if ('k' in castleStr) castling = castling or CASTLE_BK
            if ('q' in castleStr) castling = castling or CASTLE_BQ

            val epStr = parts.getOrElse(3) { "-" }
            val epSquare = if (epStr == "-") -1 else {
                val sq = Square.fromAlgebraic(epStr)
                sq?.toIndex() ?: -1
            }

            val halfmove = parts.getOrElse(4) { "0" }.toIntOrNull() ?: 0
            val fullmove = parts.getOrElse(5) { "1" }.toIntOrNull() ?: 1

            return ChessBoard(board, sideToMove, castling, epSquare, halfmove, fullmove)
        }
    }
}
