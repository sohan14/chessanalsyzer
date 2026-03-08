package com.chessanalyzer.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.chessanalyzer.engine.ChessEngine
import com.chessanalyzer.engine.CoachEngine
import com.chessanalyzer.engine.PgnParser
import com.chessanalyzer.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlin.math.abs

class GameReviewViewModel : ViewModel() {

    private val _gameAnalysis = MutableStateFlow<GameAnalysis?>(null)
    val gameAnalysis = _gameAnalysis.asStateFlow()

    private val _currentMoveIndex = MutableStateFlow(0)
    val currentMoveIndex = _currentMoveIndex.asStateFlow()

    private val _currentBoard = MutableStateFlow<ChessBoard?>(null)
    val currentBoard = _currentBoard.asStateFlow()

    private val _isAnalyzing = MutableStateFlow(false)
    val isAnalyzing = _isAnalyzing.asStateFlow()

    private val _showBestMove = MutableStateFlow(false)
    val showBestMove = _showBestMove.asStateFlow()

    private val _reviewStarted = MutableStateFlow(false)
    val reviewStarted = _reviewStarted.asStateFlow()

    private val _boardHistory = MutableStateFlow<List<ChessBoard>>(emptyList())
    val boardHistory = _boardHistory.asStateFlow()

    private val _pgnText = MutableStateFlow("")
    val pgnText = _pgnText.asStateFlow()

    fun setPgnText(text: String) {
        _pgnText.value = text
    }

    fun analyzePgn(pgn: String) {
        viewModelScope.launch(Dispatchers.Default) {
            _isAnalyzing.value = true
            _reviewStarted.value = false
            _pgnText.value = pgn

            try {
                // 1. Parse PGN to get headers and SAN move list
                val pgnGame = PgnParser.parsePgn(pgn)
                val headers = pgnGame.headers

                val whiteName = headers["White"] ?: "White"
                val blackName = headers["Black"] ?: "Black"
                val result = headers["Result"] ?: "*"
                val opening = headers["Opening"] ?: headers["ECO"] ?: "Unknown Opening"

                // 2. Replay all moves to build board state history and get Move objects
                val replayStates = PgnParser.replayGame(pgnGame.moves)
                val boards = replayStates.map { it.board }.toMutableList()
                val moves = replayStates.drop(1).mapNotNull { it.move }

                _boardHistory.value = boards

                // 3. Analyze each move: get engine eval before and after, find best move
                val analyzedMoves = mutableListOf<AnalyzedMove>()
                val evalHistory = mutableListOf<Int>()
                evalHistory.add(0) // starting eval

                for (i in moves.indices) {
                    val boardBefore = boards[i]
                    val boardAfter = boards[i + 1]
                    val playedMove = moves[i]

                    // Get engine evaluation before the move
                    val topMovesBefore = ChessEngine.getTopMoves(boardBefore, depth = 3, n = 3)
                    val evalBefore = if (topMovesBefore.isNotEmpty()) topMovesBefore[0].score else 0
                    val bestMoveData = if (topMovesBefore.isNotEmpty()) topMovesBefore[0].move else null

                    // Get engine evaluation after the move (from opponent's perspective, negate)
                    val topMovesAfter = ChessEngine.getTopMoves(boardAfter, depth = 3, n = 3)
                    val evalAfter = if (topMovesAfter.isNotEmpty()) -topMovesAfter[0].score else 0

                    evalHistory.add(evalAfter)

                    // 4. Classify the move by comparing played vs best
                    val isWhiteMove = boardBefore.sideToMove == PieceColor.WHITE
                    val cpLoss = if (isWhiteMove) {
                        (evalBefore - evalAfter).coerceAtLeast(0)
                    } else {
                        (evalAfter - evalBefore).coerceAtLeast(0)
                    }

                    val playedSan = ChessEngine.moveToSan(boardBefore, playedMove)
                    val bestSan = bestMoveData?.let { ChessEngine.moveToSan(boardBefore, it) }
                    val isBestMove = bestMoveData != null &&
                            playedMove.from == bestMoveData.from &&
                            playedMove.to == bestMoveData.to

                    val classification = classifyMove(cpLoss, isBestMove, i)

                    // 5. Generate coach explanation
                    val explanation = CoachEngine.explainMove(
                        boardBefore, playedMove, classification, bestMoveData,
                        evalBefore, evalAfter, evalBefore
                    )

                    analyzedMoves.add(
                        AnalyzedMove(
                            move = playedMove,
                            san = playedSan,
                            classification = classification,
                            evalBefore = evalBefore,
                            evalAfter = evalAfter,
                            bestMove = bestMoveData,
                            bestSan = bestSan,
                            cpLoss = cpLoss,
                            explanation = explanation
                        )
                    )
                }

                // 6. Calculate accuracy per player
                val whiteMoves = analyzedMoves.filterIndexed { idx, _ -> idx % 2 == 0 }
                val blackMoves = analyzedMoves.filterIndexed { idx, _ -> idx % 2 == 1 }

                val whiteAccuracy = calculateAccuracy(whiteMoves)
                val blackAccuracy = calculateAccuracy(blackMoves)

                // 7. Determine phase performance
                val totalMoves = analyzedMoves.size
                val openingEnd = (totalMoves * 0.2).toInt().coerceAtLeast(1)
                val middlegameEnd = (totalMoves * 0.7).toInt().coerceAtLeast(openingEnd + 1)

                val openingMoves = analyzedMoves.take(openingEnd)
                val middlegameMoves = analyzedMoves.subList(openingEnd, middlegameEnd.coerceAtMost(totalMoves))
                val endgameMoves = if (middlegameEnd < totalMoves) {
                    analyzedMoves.subList(middlegameEnd, totalMoves)
                } else {
                    emptyList()
                }

                val openingPhaseRating = ratePhase(openingMoves)
                val middlegamePhaseRating = ratePhase(middlegameMoves)
                val endgamePhaseRating = ratePhase(endgameMoves)

                // 8. Generate overall coach comment
                val coachComment = CoachEngine.generateGameSummary(
                    whiteAccuracy, blackAccuracy, whiteName, blackName,
                    result, analyzedMoves, opening
                )

                // 9. Build GameAnalysis
                _gameAnalysis.value = GameAnalysis(
                    moves = analyzedMoves,
                    whiteAccuracy = whiteAccuracy,
                    blackAccuracy = blackAccuracy,
                    result = result,
                    whiteName = whiteName,
                    blackName = blackName,
                    opening = opening,
                    openingPhaseRating = openingPhaseRating,
                    middlegamePhaseRating = middlegamePhaseRating,
                    endgamePhaseRating = endgamePhaseRating,
                    evalHistory = evalHistory,
                    coachComment = coachComment
                )

                // Set initial board state
                _currentMoveIndex.value = 0
                _currentBoard.value = boards.firstOrNull()

            } catch (e: Exception) {
                e.printStackTrace()
            } finally {
                _isAnalyzing.value = false
            }
        }
    }

    fun goToMove(index: Int) {
        val boards = _boardHistory.value
        if (boards.isEmpty()) return
        val clampedIndex = index.coerceIn(0, boards.size - 1)
        _currentMoveIndex.value = clampedIndex
        _currentBoard.value = boards[clampedIndex]
        _showBestMove.value = false
    }

    fun nextMove() {
        goToMove(_currentMoveIndex.value + 1)
    }

    fun previousMove() {
        goToMove(_currentMoveIndex.value - 1)
    }

    fun firstMove() {
        goToMove(0)
    }

    fun lastMove() {
        val boards = _boardHistory.value
        if (boards.isNotEmpty()) {
            goToMove(boards.size - 1)
        }
    }

    fun startReview() {
        _reviewStarted.value = true
        goToMove(0)
    }

    fun toggleBestMove() {
        _showBestMove.value = !_showBestMove.value
    }

    fun retryMove() {
        if (_currentMoveIndex.value > 0) {
            goToMove(_currentMoveIndex.value - 1)
        }
    }

    private fun classifyMove(cpLoss: Int, isBestMove: Boolean, moveIndex: Int): MoveClassification {
        // Book moves are the first few moves of the game
        if (moveIndex < 6 && cpLoss == 0) return MoveClassification.BOOK

        return when {
            isBestMove && cpLoss == 0 -> MoveClassification.BEST
            cpLoss <= 5 -> MoveClassification.EXCELLENT
            cpLoss <= 15 -> MoveClassification.GOOD
            cpLoss <= 30 -> MoveClassification.GOOD
            cpLoss <= 50 -> MoveClassification.INACCURACY
            cpLoss <= 100 -> MoveClassification.MISTAKE
            cpLoss <= 200 -> MoveClassification.MISS
            else -> MoveClassification.BLUNDER
        }
    }

    private fun cpToAccuracy(cpLoss: Int): Float {
        // Chess.com-style accuracy formula using a sigmoid-like function
        // Converts centipawn loss to a 0-100 accuracy percentage
        val loss = abs(cpLoss).toFloat()
        return (103.1668f * Math.exp(-0.04354f * loss.toDouble()).toFloat() - 3.1668f)
            .coerceIn(0f, 100f)
    }

    private fun calculateAccuracy(moves: List<AnalyzedMove>): Float {
        if (moves.isEmpty()) return 100f
        val accuracies = moves.map { cpToAccuracy(it.cpLoss) }
        return accuracies.average().toFloat().coerceIn(0f, 100f)
    }

    private fun ratePhase(moves: List<AnalyzedMove>): String {
        if (moves.isEmpty()) return "N/A"
        val avgCpLoss = moves.map { it.cpLoss }.average()
        return when {
            avgCpLoss <= 10 -> "Excellent"
            avgCpLoss <= 25 -> "Good"
            avgCpLoss <= 50 -> "OK"
            avgCpLoss <= 100 -> "Inaccurate"
            else -> "Poor"
        }
    }
}
