package com.chessanalyzer.engine

import com.chessanalyzer.model.*
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.exp
import kotlin.math.ln

data class SearchResult(
    val bestMove: Move?,
    val score: Int,
    val depth: Int,
    val nodes: Long
)

data class ScoredMove(
    val move: Move,
    val san: String,
    val score: Int
)

object ChessEngine {

    // Material values
    private const val PAWN_VALUE = 100
    private const val KNIGHT_VALUE = 320
    private const val BISHOP_VALUE = 330
    private const val ROOK_VALUE = 500
    private const val QUEEN_VALUE = 900
    private const val KING_VALUE = 20000

    private const val MATE_SCORE = 100000
    private const val INFINITY = 999999

    // Knight offsets (rank_delta * 8 + file_delta conceptually, but we use (dr, df) pairs)
    private val KNIGHT_OFFSETS = intArrayOf(-17, -15, -10, -6, 6, 10, 15, 17)
    private val KNIGHT_MOVES = arrayOf(
        intArrayOf(-2, -1), intArrayOf(-2, 1), intArrayOf(-1, -2), intArrayOf(-1, 2),
        intArrayOf(1, -2), intArrayOf(1, 2), intArrayOf(2, -1), intArrayOf(2, 1)
    )
    private val KING_MOVES = arrayOf(
        intArrayOf(-1, -1), intArrayOf(-1, 0), intArrayOf(-1, 1),
        intArrayOf(0, -1), intArrayOf(0, 1),
        intArrayOf(1, -1), intArrayOf(1, 0), intArrayOf(1, 1)
    )
    private val BISHOP_DIRS = arrayOf(intArrayOf(-1, -1), intArrayOf(-1, 1), intArrayOf(1, -1), intArrayOf(1, 1))
    private val ROOK_DIRS = arrayOf(intArrayOf(-1, 0), intArrayOf(1, 0), intArrayOf(0, -1), intArrayOf(0, 1))
    private val QUEEN_DIRS = ROOK_DIRS + BISHOP_DIRS

    // Piece-square tables (from White's perspective, index = rank*8 + file)
    // Flip for black: index = (7-rank)*8 + file

    private val PAWN_PST = intArrayOf(
         0,  0,  0,  0,  0,  0,  0,  0,
        50, 50, 50, 50, 50, 50, 50, 50,
        10, 10, 20, 30, 30, 20, 10, 10,
         5,  5, 10, 25, 25, 10,  5,  5,
         0,  0,  0, 20, 20,  0,  0,  0,
         5, -5,-10,  0,  0,-10, -5,  5,
         5, 10, 10,-20,-20, 10, 10,  5,
         0,  0,  0,  0,  0,  0,  0,  0
    )

    private val KNIGHT_PST = intArrayOf(
        -50,-40,-30,-30,-30,-30,-40,-50,
        -40,-20,  0,  0,  0,  0,-20,-40,
        -30,  0, 10, 15, 15, 10,  0,-30,
        -30,  5, 15, 20, 20, 15,  5,-30,
        -30,  0, 15, 20, 20, 15,  0,-30,
        -30,  5, 10, 15, 15, 10,  5,-30,
        -40,-20,  0,  5,  5,  0,-20,-40,
        -50,-40,-30,-30,-30,-30,-40,-50
    )

    private val BISHOP_PST = intArrayOf(
        -20,-10,-10,-10,-10,-10,-10,-20,
        -10,  0,  0,  0,  0,  0,  0,-10,
        -10,  0,  5, 10, 10,  5,  0,-10,
        -10,  5,  5, 10, 10,  5,  5,-10,
        -10,  0, 10, 10, 10, 10,  0,-10,
        -10, 10, 10, 10, 10, 10, 10,-10,
        -10,  5,  0,  0,  0,  0,  5,-10,
        -20,-10,-10,-10,-10,-10,-10,-20
    )

    private val ROOK_PST = intArrayOf(
         0,  0,  0,  0,  0,  0,  0,  0,
         5, 10, 10, 10, 10, 10, 10,  5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
         0,  0,  0,  5,  5,  0,  0,  0
    )

    private val QUEEN_PST = intArrayOf(
        -20,-10,-10, -5, -5,-10,-10,-20,
        -10,  0,  0,  0,  0,  0,  0,-10,
        -10,  0,  5,  5,  5,  5,  0,-10,
         -5,  0,  5,  5,  5,  5,  0, -5,
          0,  0,  5,  5,  5,  5,  0, -5,
        -10,  5,  5,  5,  5,  5,  0,-10,
        -10,  0,  5,  0,  0,  0,  0,-10,
        -20,-10,-10, -5, -5,-10,-10,-20
    )

    private val KING_PST = intArrayOf(
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -20,-30,-30,-40,-40,-30,-30,-20,
        -10,-20,-20,-20,-20,-20,-20,-10,
         20, 20,  0,  0,  0,  0, 20, 20,
         20, 30, 10,  0,  0, 10, 30, 20
    )

    // PST tables are stored from white's perspective with rank 7 at index 0.
    // For white piece at (rank, file): pstIndex = (7 - rank) * 8 + file
    // For black piece at (rank, file): pstIndex = rank * 8 + file

    private fun getPstValue(type: PieceType, color: PieceColor, sq: Int): Int {
        val rank = sq / 8
        val file = sq % 8
        val pstIndex = if (color == PieceColor.WHITE) (7 - rank) * 8 + file else rank * 8 + file
        return when (type) {
            PieceType.PAWN -> PAWN_PST[pstIndex]
            PieceType.KNIGHT -> KNIGHT_PST[pstIndex]
            PieceType.BISHOP -> BISHOP_PST[pstIndex]
            PieceType.ROOK -> ROOK_PST[pstIndex]
            PieceType.QUEEN -> QUEEN_PST[pstIndex]
            PieceType.KING -> KING_PST[pstIndex]
        }
    }

    private fun materialValue(type: PieceType): Int = when (type) {
        PieceType.PAWN -> PAWN_VALUE
        PieceType.KNIGHT -> KNIGHT_VALUE
        PieceType.BISHOP -> BISHOP_VALUE
        PieceType.ROOK -> ROOK_VALUE
        PieceType.QUEEN -> QUEEN_VALUE
        PieceType.KING -> KING_VALUE
    }

    private fun isWhitePiece(code: Int): Boolean = code in 1..6
    private fun isBlackPiece(code: Int): Boolean = code in 7..12
    private fun pieceColor(code: Int): PieceColor? = when {
        code in 1..6 -> PieceColor.WHITE
        code in 7..12 -> PieceColor.BLACK
        else -> null
    }
    private fun pieceType(code: Int): PieceType? = when {
        code == 0 -> null
        else -> when ((code - 1) % 6) {
            0 -> PieceType.PAWN
            1 -> PieceType.KNIGHT
            2 -> PieceType.BISHOP
            3 -> PieceType.ROOK
            4 -> PieceType.QUEEN
            5 -> PieceType.KING
            else -> null
        }
    }

    fun findKing(board: IntArray, color: PieceColor): Int {
        val kingCode = if (color == PieceColor.WHITE) ChessBoard.WK else ChessBoard.BK
        for (i in 0..63) {
            if (board[i] == kingCode) return i
        }
        return -1
    }

    fun isAttacked(board: IntArray, sq: Int, byColor: PieceColor): Boolean {
        val rank = sq / 8
        val file = sq % 8

        // Pawn attacks
        if (byColor == PieceColor.WHITE) {
            if (rank > 0) {
                if (file > 0 && board[(rank - 1) * 8 + (file - 1)] == ChessBoard.WP) return true
                if (file < 7 && board[(rank - 1) * 8 + (file + 1)] == ChessBoard.WP) return true
            }
        } else {
            if (rank < 7) {
                if (file > 0 && board[(rank + 1) * 8 + (file - 1)] == ChessBoard.BP) return true
                if (file < 7 && board[(rank + 1) * 8 + (file + 1)] == ChessBoard.BP) return true
            }
        }

        // Knight attacks
        for (km in KNIGHT_MOVES) {
            val nr = rank + km[0]
            val nf = file + km[1]
            if (nr in 0..7 && nf in 0..7) {
                val pc = board[nr * 8 + nf]
                if (pc != 0 && pieceColor(pc) == byColor && pieceType(pc) == PieceType.KNIGHT) return true
            }
        }

        // King attacks
        for (km in KING_MOVES) {
            val nr = rank + km[0]
            val nf = file + km[1]
            if (nr in 0..7 && nf in 0..7) {
                val pc = board[nr * 8 + nf]
                if (pc != 0 && pieceColor(pc) == byColor && pieceType(pc) == PieceType.KING) return true
            }
        }

        // Sliding: bishop/queen diagonals
        for (dir in BISHOP_DIRS) {
            var r = rank + dir[0]
            var f = file + dir[1]
            while (r in 0..7 && f in 0..7) {
                val pc = board[r * 8 + f]
                if (pc != 0) {
                    if (pieceColor(pc) == byColor) {
                        val pt = pieceType(pc)
                        if (pt == PieceType.BISHOP || pt == PieceType.QUEEN) return true
                    }
                    break
                }
                r += dir[0]
                f += dir[1]
            }
        }

        // Sliding: rook/queen straights
        for (dir in ROOK_DIRS) {
            var r = rank + dir[0]
            var f = file + dir[1]
            while (r in 0..7 && f in 0..7) {
                val pc = board[r * 8 + f]
                if (pc != 0) {
                    if (pieceColor(pc) == byColor) {
                        val pt = pieceType(pc)
                        if (pt == PieceType.ROOK || pt == PieceType.QUEEN) return true
                    }
                    break
                }
                r += dir[0]
                f += dir[1]
            }
        }

        return false
    }

    fun inCheck(board: ChessBoard): Boolean {
        val kingIdx = findKing(board.board, board.sideToMove)
        if (kingIdx == -1) return false
        return isAttacked(board.board, kingIdx, board.sideToMove.opposite())
    }

    fun legalMoves(board: ChessBoard): List<Move> {
        val pseudo = pseudoLegalMoves(board)
        return pseudo.filter { move ->
            val newBoard = applyMoveUnchecked(board, move)
            val kingIdx = findKing(newBoard.board, board.sideToMove)
            kingIdx != -1 && !isAttacked(newBoard.board, kingIdx, board.sideToMove.opposite())
        }
    }

    private fun pseudoLegalMoves(board: ChessBoard): List<Move> {
        val moves = mutableListOf<Move>()
        val color = board.sideToMove
        val b = board.board

        for (sq in 0..63) {
            val pc = b[sq]
            if (pc == 0) continue
            if (pieceColor(pc) != color) continue
            val rank = sq / 8
            val file = sq % 8
            val from = Square(file, rank)
            val type = pieceType(pc) ?: continue

            when (type) {
                PieceType.PAWN -> {
                    val dir = if (color == PieceColor.WHITE) 1 else -1
                    val startRank = if (color == PieceColor.WHITE) 1 else 6
                    val promoRank = if (color == PieceColor.WHITE) 7 else 0

                    // Single push
                    val fwdRank = rank + dir
                    if (fwdRank in 0..7) {
                        val fwdIdx = fwdRank * 8 + file
                        if (b[fwdIdx] == 0) {
                            if (fwdRank == promoRank) {
                                for (pt in listOf(PieceType.QUEEN, PieceType.ROOK, PieceType.BISHOP, PieceType.KNIGHT)) {
                                    moves.add(Move(from, Square(file, fwdRank), promotion = pt))
                                }
                            } else {
                                moves.add(Move(from, Square(file, fwdRank)))
                            }
                            // Double push
                            if (rank == startRank) {
                                val dblRank = rank + 2 * dir
                                val dblIdx = dblRank * 8 + file
                                if (b[dblIdx] == 0) {
                                    moves.add(Move(from, Square(file, dblRank)))
                                }
                            }
                        }
                    }

                    // Captures
                    for (df in intArrayOf(-1, 1)) {
                        val cf = file + df
                        val cr = rank + dir
                        if (cf in 0..7 && cr in 0..7) {
                            val capIdx = cr * 8 + cf
                            val capPc = b[capIdx]
                            val isEp = capIdx == board.epSquare
                            if ((capPc != 0 && pieceColor(capPc) != color) || isEp) {
                                if (cr == promoRank) {
                                    for (pt in listOf(PieceType.QUEEN, PieceType.ROOK, PieceType.BISHOP, PieceType.KNIGHT)) {
                                        moves.add(Move(from, Square(cf, cr), promotion = pt, isCapture = true, isEnPassant = isEp))
                                    }
                                } else {
                                    moves.add(Move(from, Square(cf, cr), isCapture = capPc != 0 || isEp, isEnPassant = isEp))
                                }
                            }
                        }
                    }
                }

                PieceType.KNIGHT -> {
                    for (km in KNIGHT_MOVES) {
                        val nr = rank + km[0]
                        val nf = file + km[1]
                        if (nr in 0..7 && nf in 0..7) {
                            val tgt = b[nr * 8 + nf]
                            if (tgt == 0 || pieceColor(tgt) != color) {
                                moves.add(Move(from, Square(nf, nr), isCapture = tgt != 0))
                            }
                        }
                    }
                }

                PieceType.BISHOP -> addSlidingMoves(b, from, rank, file, color, BISHOP_DIRS, moves)
                PieceType.ROOK -> addSlidingMoves(b, from, rank, file, color, ROOK_DIRS, moves)
                PieceType.QUEEN -> addSlidingMoves(b, from, rank, file, color, QUEEN_DIRS, moves)

                PieceType.KING -> {
                    for (km in KING_MOVES) {
                        val nr = rank + km[0]
                        val nf = file + km[1]
                        if (nr in 0..7 && nf in 0..7) {
                            val tgt = b[nr * 8 + nf]
                            if (tgt == 0 || pieceColor(tgt) != color) {
                                moves.add(Move(from, Square(nf, nr), isCapture = tgt != 0))
                            }
                        }
                    }

                    // Castling
                    if (color == PieceColor.WHITE && rank == 0 && file == 4) {
                        // Kingside
                        if (board.castlingRights and ChessBoard.CASTLE_WK != 0 &&
                            b[5] == 0 && b[6] == 0 &&
                            !isAttacked(b, 4, PieceColor.BLACK) &&
                            !isAttacked(b, 5, PieceColor.BLACK) &&
                            !isAttacked(b, 6, PieceColor.BLACK)) {
                            moves.add(Move(from, Square(6, 0), isCastle = true))
                        }
                        // Queenside
                        if (board.castlingRights and ChessBoard.CASTLE_WQ != 0 &&
                            b[3] == 0 && b[2] == 0 && b[1] == 0 &&
                            !isAttacked(b, 4, PieceColor.BLACK) &&
                            !isAttacked(b, 3, PieceColor.BLACK) &&
                            !isAttacked(b, 2, PieceColor.BLACK)) {
                            moves.add(Move(from, Square(2, 0), isCastle = true))
                        }
                    } else if (color == PieceColor.BLACK && rank == 7 && file == 4) {
                        // Kingside
                        if (board.castlingRights and ChessBoard.CASTLE_BK != 0 &&
                            b[61] == 0 && b[62] == 0 &&
                            !isAttacked(b, 60, PieceColor.WHITE) &&
                            !isAttacked(b, 61, PieceColor.WHITE) &&
                            !isAttacked(b, 62, PieceColor.WHITE)) {
                            moves.add(Move(from, Square(6, 7), isCastle = true))
                        }
                        // Queenside
                        if (board.castlingRights and ChessBoard.CASTLE_BQ != 0 &&
                            b[59] == 0 && b[58] == 0 && b[57] == 0 &&
                            !isAttacked(b, 60, PieceColor.WHITE) &&
                            !isAttacked(b, 59, PieceColor.WHITE) &&
                            !isAttacked(b, 58, PieceColor.WHITE)) {
                            moves.add(Move(from, Square(2, 7), isCastle = true))
                        }
                    }
                }
            }
        }
        return moves
    }

    private fun addSlidingMoves(
        b: IntArray, from: Square, rank: Int, file: Int,
        color: PieceColor, dirs: Array<IntArray>, moves: MutableList<Move>
    ) {
        for (dir in dirs) {
            var r = rank + dir[0]
            var f = file + dir[1]
            while (r in 0..7 && f in 0..7) {
                val tgt = b[r * 8 + f]
                if (tgt == 0) {
                    moves.add(Move(from, Square(f, r)))
                } else {
                    if (pieceColor(tgt) != color) {
                        moves.add(Move(from, Square(f, r), isCapture = true))
                    }
                    break
                }
                r += dir[0]
                f += dir[1]
            }
        }
    }

    fun applyMove(board: ChessBoard, move: Move): ChessBoard {
        return applyMoveUnchecked(board, move)
    }

    private fun applyMoveUnchecked(board: ChessBoard, move: Move): ChessBoard {
        val b = board.board.copyOf()
        val fromIdx = move.from.toIndex()
        val toIdx = move.to.toIndex()
        val movingPiece = b[fromIdx]
        val capturedPiece = b[toIdx]
        val color = board.sideToMove

        var castling = board.castlingRights
        var ep = -1
        var halfmove = board.halfmoveClock + 1
        val fullmove = if (color == PieceColor.BLACK) board.fullmoveNumber + 1 else board.fullmoveNumber

        // Reset halfmove on pawn move or capture
        val movingType = pieceType(movingPiece)
        if (movingType == PieceType.PAWN || capturedPiece != 0 || move.isEnPassant) {
            halfmove = 0
        }

        // En passant capture
        if (move.isEnPassant) {
            val epCaptureRank = move.from.rank
            b[epCaptureRank * 8 + move.to.file] = 0
        }

        // Move piece
        b[toIdx] = movingPiece
        b[fromIdx] = 0

        // Pawn promotion
        if (move.promotion != null) {
            val promoCode = Piece(move.promotion, color).encode()
            b[toIdx] = promoCode
        }

        // Double pawn push sets ep square
        if (movingType == PieceType.PAWN && abs(move.to.rank - move.from.rank) == 2) {
            val epRank = (move.from.rank + move.to.rank) / 2
            ep = epRank * 8 + move.from.file
        }

        // Castling: move rook
        if (move.isCastle) {
            if (move.to.file == 6) {
                // Kingside
                val rookFrom = move.from.rank * 8 + 7
                val rookTo = move.from.rank * 8 + 5
                b[rookTo] = b[rookFrom]
                b[rookFrom] = 0
            } else if (move.to.file == 2) {
                // Queenside
                val rookFrom = move.from.rank * 8 + 0
                val rookTo = move.from.rank * 8 + 3
                b[rookTo] = b[rookFrom]
                b[rookFrom] = 0
            }
        }

        // Update castling rights
        if (movingType == PieceType.KING) {
            if (color == PieceColor.WHITE) {
                castling = castling and (ChessBoard.CASTLE_WK or ChessBoard.CASTLE_WQ).inv()
            } else {
                castling = castling and (ChessBoard.CASTLE_BK or ChessBoard.CASTLE_BQ).inv()
            }
        }
        if (movingType == PieceType.ROOK) {
            if (fromIdx == 0) castling = castling and ChessBoard.CASTLE_WQ.inv()
            if (fromIdx == 7) castling = castling and ChessBoard.CASTLE_WK.inv()
            if (fromIdx == 56) castling = castling and ChessBoard.CASTLE_BQ.inv()
            if (fromIdx == 63) castling = castling and ChessBoard.CASTLE_BK.inv()
        }
        // If rook captured
        if (toIdx == 0) castling = castling and ChessBoard.CASTLE_WQ.inv()
        if (toIdx == 7) castling = castling and ChessBoard.CASTLE_WK.inv()
        if (toIdx == 56) castling = castling and ChessBoard.CASTLE_BQ.inv()
        if (toIdx == 63) castling = castling and ChessBoard.CASTLE_BK.inv()

        return ChessBoard(b, color.opposite(), castling, ep, halfmove, fullmove)
    }

    fun evaluate(board: ChessBoard): Int {
        var score = 0
        var whiteMaterial = 0
        var blackMaterial = 0

        for (sq in 0..63) {
            val pc = board.board[sq]
            if (pc == 0) continue
            val color = pieceColor(pc) ?: continue
            val type = pieceType(pc) ?: continue
            val mat = materialValue(type)
            val pst = getPstValue(type, color, sq)

            if (color == PieceColor.WHITE) {
                score += mat + pst
                whiteMaterial += mat
            } else {
                score -= mat + pst
                blackMaterial += mat
            }
        }

        // Pawn structure bonus: penalize doubled pawns, reward passed pawns
        score += evaluatePawnStructure(board.board)

        // Mobility bonus
        val savedBoard = board.clone()
        val mobilityScore = evaluateMobility(board)
        score += mobilityScore

        // King safety
        score += evaluateKingSafety(board.board)

        // Return from side-to-move perspective
        return if (board.sideToMove == PieceColor.WHITE) score else -score
    }

    private fun evaluatePawnStructure(board: IntArray): Int {
        var score = 0
        val whiteFiles = IntArray(8)
        val blackFiles = IntArray(8)

        for (sq in 0..63) {
            val file = sq % 8
            when (board[sq]) {
                ChessBoard.WP -> whiteFiles[file]++
                ChessBoard.BP -> blackFiles[file]++
            }
        }

        // Doubled pawns penalty
        for (f in 0..7) {
            if (whiteFiles[f] > 1) score -= 10 * (whiteFiles[f] - 1)
            if (blackFiles[f] > 1) score += 10 * (blackFiles[f] - 1)
        }

        // Isolated pawns penalty
        for (f in 0..7) {
            val leftW = if (f > 0) whiteFiles[f - 1] else 0
            val rightW = if (f < 7) whiteFiles[f + 1] else 0
            if (whiteFiles[f] > 0 && leftW == 0 && rightW == 0) score -= 15

            val leftB = if (f > 0) blackFiles[f - 1] else 0
            val rightB = if (f < 7) blackFiles[f + 1] else 0
            if (blackFiles[f] > 0 && leftB == 0 && rightB == 0) score += 15
        }

        return score
    }

    private fun evaluateMobility(board: ChessBoard): Int {
        // Count pseudo-legal moves for each side as a rough mobility measure
        val whiteMoves = countMobilityForColor(board.board, PieceColor.WHITE)
        val blackMoves = countMobilityForColor(board.board, PieceColor.BLACK)
        return (whiteMoves - blackMoves) * 3
    }

    private fun countMobilityForColor(board: IntArray, color: PieceColor): Int {
        var count = 0
        for (sq in 0..63) {
            val pc = board[sq]
            if (pc == 0 || pieceColor(pc) != color) continue
            val type = pieceType(pc) ?: continue
            val rank = sq / 8
            val file = sq % 8
            when (type) {
                PieceType.KNIGHT -> {
                    for (km in KNIGHT_MOVES) {
                        val nr = rank + km[0]; val nf = file + km[1]
                        if (nr in 0..7 && nf in 0..7) {
                            val tgt = board[nr * 8 + nf]
                            if (tgt == 0 || pieceColor(tgt) != color) count++
                        }
                    }
                }
                PieceType.BISHOP -> count += countSlidingMobility(board, rank, file, color, BISHOP_DIRS)
                PieceType.ROOK -> count += countSlidingMobility(board, rank, file, color, ROOK_DIRS)
                PieceType.QUEEN -> count += countSlidingMobility(board, rank, file, color, QUEEN_DIRS)
                else -> {}
            }
        }
        return count
    }

    private fun countSlidingMobility(board: IntArray, rank: Int, file: Int, color: PieceColor, dirs: Array<IntArray>): Int {
        var count = 0
        for (dir in dirs) {
            var r = rank + dir[0]; var f = file + dir[1]
            while (r in 0..7 && f in 0..7) {
                val tgt = board[r * 8 + f]
                if (tgt == 0) { count++ } else {
                    if (pieceColor(tgt) != color) count++
                    break
                }
                r += dir[0]; f += dir[1]
            }
        }
        return count
    }

    private fun evaluateKingSafety(board: IntArray): Int {
        var score = 0
        val wk = findKing(board, PieceColor.WHITE)
        val bk = findKing(board, PieceColor.BLACK)

        if (wk != -1) score += kingSafetyScore(board, wk, PieceColor.WHITE)
        if (bk != -1) score -= kingSafetyScore(board, bk, PieceColor.BLACK)

        return score
    }

    private fun kingSafetyScore(board: IntArray, kingSq: Int, color: PieceColor): Int {
        var safety = 0
        val rank = kingSq / 8
        val file = kingSq % 8
        val pawnCode = if (color == PieceColor.WHITE) ChessBoard.WP else ChessBoard.BP
        val shieldDir = if (color == PieceColor.WHITE) 1 else -1
        val shieldRank = rank + shieldDir

        // Pawn shield bonus
        if (shieldRank in 0..7) {
            for (df in -1..1) {
                val sf = file + df
                if (sf in 0..7 && board[shieldRank * 8 + sf] == pawnCode) {
                    safety += 10
                }
            }
        }
        return safety
    }

    // Search with negamax + alpha-beta + quiescence
    private var nodesSearched = 0L

    fun search(board: ChessBoard, depth: Int): SearchResult {
        nodesSearched = 0
        var bestMove: Move? = null
        var bestScore = -INFINITY

        val moves = orderMoves(board, legalMoves(board))
        if (moves.isEmpty()) {
            return if (inCheck(board)) SearchResult(null, -MATE_SCORE, depth, 0)
            else SearchResult(null, 0, depth, 0) // stalemate
        }

        for (move in moves) {
            val newBoard = applyMove(board, move)
            val score = -negamax(newBoard, depth - 1, -INFINITY, -bestScore)
            if (score > bestScore) {
                bestScore = score
                bestMove = move
            }
        }

        return SearchResult(bestMove, bestScore, depth, nodesSearched)
    }

    private fun negamax(board: ChessBoard, depth: Int, alphaIn: Int, beta: Int): Int {
        nodesSearched++
        val moves = legalMoves(board)

        if (moves.isEmpty()) {
            return if (inCheck(board)) -MATE_SCORE + (100 - depth) else 0
        }

        if (depth <= 0) {
            return quiescence(board, alphaIn, beta, 4)
        }

        var alpha = alphaIn
        val orderedMoves = orderMoves(board, moves)

        for (move in orderedMoves) {
            val newBoard = applyMove(board, move)
            val score = -negamax(newBoard, depth - 1, -beta, -alpha)
            if (score >= beta) return beta
            if (score > alpha) alpha = score
        }

        return alpha
    }

    private fun quiescence(board: ChessBoard, alphaIn: Int, beta: Int, maxDepth: Int): Int {
        nodesSearched++
        val standPat = evaluate(board)
        if (maxDepth <= 0) return standPat
        if (standPat >= beta) return beta

        var alpha = if (standPat > alphaIn) standPat else alphaIn

        val moves = legalMoves(board).filter { it.isCapture }
        val orderedMoves = orderMoves(board, moves)

        for (move in orderedMoves) {
            val newBoard = applyMove(board, move)
            val score = -quiescence(newBoard, -beta, -alpha, maxDepth - 1)
            if (score >= beta) return beta
            if (score > alpha) alpha = score
        }

        return alpha
    }

    private fun orderMoves(board: ChessBoard, moves: List<Move>): List<Move> {
        return moves.sortedByDescending { move ->
            var score = 0
            // MVV-LVA: Most Valuable Victim - Least Valuable Attacker
            if (move.isCapture) {
                val victim = board.pieceAt(move.to)
                val attacker = board.pieceAt(move.from)
                val victimVal = victim?.let { materialValue(it.type) } ?: if (move.isEnPassant) PAWN_VALUE else 0
                val attackerVal = attacker?.let { materialValue(it.type) } ?: 0
                score += victimVal * 10 - attackerVal
            }
            if (move.promotion != null) {
                score += materialValue(move.promotion)
            }
            // Slight bonus for moving towards center
            val toFile = move.to.file
            val toRank = move.to.rank
            score += (3 - abs(toFile - 3)) + (3 - abs(toRank - 3))
            score
        }
    }

    fun getTopMoves(board: ChessBoard, depth: Int, n: Int): List<ScoredMove> {
        val moves = legalMoves(board)
        if (moves.isEmpty()) return emptyList()

        val scored = moves.map { move ->
            nodesSearched = 0
            val newBoard = applyMove(board, move)
            val score = -negamax(newBoard, depth - 1, -INFINITY, INFINITY)
            val san = moveToSan(board, move)
            ScoredMove(move, san, score)
        }

        return scored.sortedByDescending { it.score }.take(n)
    }

    fun classifyMove(bestCp: Int, moveCp: Int, isSacrifice: Boolean): MoveClassification {
        val cpLoss = bestCp - moveCp

        if (isSacrifice && cpLoss <= 0) return MoveClassification.BRILLIANT
        if (cpLoss <= 0) return MoveClassification.BEST

        return when {
            cpLoss <= 10 -> MoveClassification.EXCELLENT
            cpLoss <= 25 -> MoveClassification.GOOD
            cpLoss <= 50 -> MoveClassification.INACCURACY
            cpLoss <= 100 -> MoveClassification.MISTAKE
            cpLoss <= 200 -> MoveClassification.MISS
            else -> MoveClassification.BLUNDER
        }
    }

    fun moveToSan(board: ChessBoard, move: Move): String {
        val piece = board.pieceAt(move.from) ?: return move.toUci()
        val sb = StringBuilder()

        // Castling
        if (move.isCastle) {
            return if (move.to.file == 6) "O-O" else "O-O-O"
        }

        // Piece letter
        if (piece.type != PieceType.PAWN) {
            sb.append(when (piece.type) {
                PieceType.KNIGHT -> 'N'
                PieceType.BISHOP -> 'B'
                PieceType.ROOK -> 'R'
                PieceType.QUEEN -> 'Q'
                PieceType.KING -> 'K'
                else -> '?'
            })

            // Disambiguation
            val legalMvs = legalMoves(board)
            val ambiguous = legalMvs.filter { m ->
                m != move &&
                board.pieceAt(m.from)?.type == piece.type &&
                m.to == move.to
            }
            if (ambiguous.isNotEmpty()) {
                val sameFile = ambiguous.any { it.from.file == move.from.file }
                val sameRank = ambiguous.any { it.from.rank == move.from.rank }
                if (!sameFile) {
                    sb.append('a' + move.from.file)
                } else if (!sameRank) {
                    sb.append('1' + move.from.rank)
                } else {
                    sb.append('a' + move.from.file)
                    sb.append('1' + move.from.rank)
                }
            }
        } else if (move.isCapture) {
            sb.append('a' + move.from.file)
        }

        // Capture
        if (move.isCapture) {
            sb.append('x')
        }

        // Destination
        sb.append(move.to.toAlgebraic())

        // Promotion
        if (move.promotion != null) {
            sb.append('=')
            sb.append(when (move.promotion) {
                PieceType.QUEEN -> 'Q'
                PieceType.ROOK -> 'R'
                PieceType.BISHOP -> 'B'
                PieceType.KNIGHT -> 'N'
                else -> '?'
            })
        }

        // Check / checkmate
        val newBoard = applyMove(board, move)
        if (inCheck(newBoard)) {
            val hasLegal = legalMoves(newBoard).isNotEmpty()
            sb.append(if (hasLegal) '+' else '#')
        }

        return sb.toString()
    }

    fun cpToWinPct(cp: Int): Float {
        // Based on Lichess model: 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)
        val exp = Math.exp(-0.00368208 * cp)
        return (50.0 + 50.0 * (2.0 / (1.0 + exp) - 1.0)).toFloat()
    }

    fun isKnightAttacking(knightSquare: Int, targetSquare: Int): Boolean {
        val kFile = knightSquare % 8
        val kRank = knightSquare / 8
        val tFile = targetSquare % 8
        val tRank = targetSquare / 8
        val df = kotlin.math.abs(kFile - tFile)
        val dr = kotlin.math.abs(kRank - tRank)
        return (df == 1 && dr == 2) || (df == 2 && dr == 1)
    }

    fun cpToAccuracy(avgCpl: Float): Float {
        // Chess.com-style accuracy formula
        // accuracy = 103.1668 * exp(-0.04354 * avgCpl) - 3.1668
        if (avgCpl <= 0f) return 100f
        val accuracy = 103.1668 * Math.exp(-0.04354 * avgCpl.toDouble()) - 3.1668
        return accuracy.toFloat().coerceIn(0f, 100f)
    }
}
