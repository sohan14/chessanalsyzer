package com.chessanalyzer.ui.screens

import androidx.compose.animation.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chessanalyzer.model.*
import com.chessanalyzer.ui.components.*
import com.chessanalyzer.ui.theme.*
import com.chessanalyzer.viewmodel.GameReviewViewModel

@Composable
fun GameReviewScreen(viewModel: GameReviewViewModel, onBack: () -> Unit) {
    val analysis by viewModel.gameAnalysis.collectAsState()
    val currentIndex by viewModel.currentMoveIndex.collectAsState()
    val currentBoard by viewModel.currentBoard.collectAsState()
    val isAnalyzing by viewModel.isAnalyzing.collectAsState()
    val showBest by viewModel.showBestMove.collectAsState()
    val reviewStarted by viewModel.reviewStarted.collectAsState()

    Column(modifier = Modifier.fillMaxSize().background(DarkBackground)) {
        // Nav bar
        ReviewNavBar(onBack = onBack)

        if (isAnalyzing) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = GreenAccent)
                    Spacer(Modifier.height(16.dp))
                    Text("Analyzing game...", color = LightGray, fontSize = 14.sp)
                }
            }
        } else if (analysis == null) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No game loaded", color = DimGray, fontSize = 16.sp)
            }
        } else if (!reviewStarted) {
            GameReviewSummary(analysis = analysis!!, onStartReview = { viewModel.startReview() })
        } else {
            MoveReviewContent(
                analysis = analysis!!,
                currentIndex = currentIndex,
                currentBoard = currentBoard,
                showBest = showBest,
                onPrevious = { viewModel.previousMove() },
                onNext = { viewModel.nextMove() },
                onMoveClick = { viewModel.goToMove(it) },
                onShowBest = { viewModel.toggleBestMove() },
                onRetry = { viewModel.previousMove() }
            )
        }
    }
}

@Composable
fun ReviewNavBar(onBack: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(DarkSurface)
            .padding(horizontal = 12.dp, vertical = 12.dp)
            .statusBarsPadding(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(onClick = onBack) {
            Text("\u2190", color = White, fontSize = 24.sp)
        }
        Text(
            "Game Review",
            color = White,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.weight(1f),
            textAlign = TextAlign.Center
        )
        IconButton(onClick = {}) { Text("\u2699", color = LightGray, fontSize = 20.sp) }
    }
}

// ============================================================
// GAME REVIEW SUMMARY (Chess.com style)
// ============================================================
@Composable
fun GameReviewSummary(analysis: GameAnalysis, onStartReview: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp)
    ) {
        Spacer(Modifier.height(12.dp))

        // Coach comment bubble
        CoachBubble(
            classification = null,
            san = "",
            eval = "",
            explanation = analysis.coachComment
        )

        Spacer(Modifier.height(16.dp))

        // Eval graph
        EvalGraph(
            evalHistory = analysis.evalHistory,
            currentMoveIndex = analysis.moves.size,
            modifier = Modifier
                .fillMaxWidth()
                .height(80.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(DarkSurface)
        )

        Spacer(Modifier.height(16.dp))

        // Players row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            PlayerColumn(analysis.whiteName, true)
            PlayerColumn(analysis.blackName, false)
        }

        Spacer(Modifier.height(8.dp))

        // Accuracy row
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
            AccuracyCard(name = "Accuracy", accuracy = analysis.whiteAccuracy, isWhite = true)
            Spacer(Modifier.width(12.dp))
            AccuracyCard(name = "Accuracy", accuracy = analysis.blackAccuracy, isWhite = false)
        }

        Spacer(Modifier.height(12.dp))
        HorizontalDivider(color = DarkSurfaceVariant)
        Spacer(Modifier.height(8.dp))

        // Classification breakdown table
        val whiteMoves = analysis.moves.filterIndexed { i, _ -> i % 2 == 0 }
        val blackMoves = analysis.moves.filterIndexed { i, _ -> i % 2 == 1 }

        for (cls in MoveClassification.entries) {
            val wCount = whiteMoves.count { it.classification == cls }
            val bCount = blackMoves.count { it.classification == cls }
            ClassificationRow(
                label = cls.label,
                icon = cls.symbol,
                whiteCount = wCount,
                blackCount = bCount,
                color = Color(cls.color)
            )
        }

        Spacer(Modifier.height(8.dp))
        HorizontalDivider(color = DarkSurfaceVariant)
        Spacer(Modifier.height(12.dp))

        // Phase performance
        Row(modifier = Modifier.fillMaxWidth()) {
            Text("Opening", color = LightGray, fontSize = 14.sp, modifier = Modifier.weight(1f))
            Text(analysis.openingPhaseRating, fontSize = 18.sp, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
            Text(analysis.openingPhaseRating, fontSize = 18.sp, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
        }
        Spacer(Modifier.height(4.dp))
        Row(modifier = Modifier.fillMaxWidth()) {
            Text("Middlegame", color = LightGray, fontSize = 14.sp, modifier = Modifier.weight(1f))
            Text(analysis.middlegamePhaseRating, fontSize = 18.sp, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
            Text(analysis.middlegamePhaseRating, fontSize = 18.sp, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
        }
        Spacer(Modifier.height(4.dp))
        Row(modifier = Modifier.fillMaxWidth()) {
            Text("Endgame", color = LightGray, fontSize = 14.sp, modifier = Modifier.weight(1f))
            Text(analysis.endgamePhaseRating, fontSize = 18.sp, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
            Text(analysis.endgamePhaseRating, fontSize = 18.sp, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
        }

        Spacer(Modifier.height(24.dp))

        // Start Review button
        Button(
            onClick = onStartReview,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            colors = ButtonDefaults.buttonColors(containerColor = GreenAccent),
            shape = RoundedCornerShape(12.dp)
        ) {
            Text("Start Review", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = White)
        }

        Spacer(Modifier.height(24.dp))
    }
}

@Composable
fun PlayerColumn(name: String, isWhite: Boolean) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            modifier = Modifier
                .size(60.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(if (isWhite) Color(0xFF555555) else Color(0xFF333333))
                .border(2.dp, if (isWhite) GreenAccent else DimGray, RoundedCornerShape(8.dp)),
            contentAlignment = Alignment.Center
        ) {
            Text(
                if (isWhite) "\u2654" else "\u265A",
                fontSize = 32.sp,
                color = if (isWhite) White else LightGray
            )
        }
        Spacer(Modifier.height(4.dp))
        Text(name, color = White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}

// ============================================================
// MOVE REVIEW CONTENT (Chess.com style)
// ============================================================
@Composable
fun MoveReviewContent(
    analysis: GameAnalysis,
    currentIndex: Int,
    currentBoard: ChessBoard?,
    showBest: Boolean,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onMoveClick: (Int) -> Unit,
    onShowBest: () -> Unit,
    onRetry: () -> Unit
) {
    val currentMove = if (currentIndex in analysis.moves.indices) analysis.moves[currentIndex] else null
    val board = currentBoard ?: return

    Column(modifier = Modifier.fillMaxSize()) {
        // Coach bubble
        if (currentMove != null) {
            CoachBubble(
                classification = currentMove.classification,
                san = currentMove.san,
                eval = formatEval(currentMove.evalAfter),
                explanation = currentMove.explanation
            )
        } else {
            Spacer(Modifier.height(8.dp))
        }

        // Board + eval bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp),
            verticalAlignment = Alignment.Top
        ) {
            // Eval bar
            EvalBar(
                eval = currentMove?.evalAfter ?: 0,
                modifier = Modifier.width(24.dp).fillMaxHeight()
            )

            Spacer(Modifier.width(4.dp))

            // Chess board
            val arrows = mutableListOf<Arrow>()
            if (currentMove != null) {
                if (currentMove.classification == MoveClassification.BLUNDER ||
                    currentMove.classification == MoveClassification.MISTAKE ||
                    currentMove.classification == MoveClassification.MISS
                ) {
                    // Show best move arrow for bad moves
                    if (showBest && currentMove.bestMove != null) {
                        arrows.add(
                            Arrow(
                                fromSquare = currentMove.bestMove.from.toIndex(),
                                toSquare = currentMove.bestMove.to.toIndex(),
                                color = Color(0xFF81B64C)
                            )
                        )
                    }
                } else {
                    arrows.add(
                        Arrow(
                            fromSquare = currentMove.move.from.toIndex(),
                            toSquare = currentMove.move.to.toIndex(),
                            color = Color(0xFF81B64C)
                        )
                    )
                }
            }

            val marker = if (currentMove != null) {
                ClassificationMarker(
                    square = currentMove.move.to.toIndex(),
                    classification = currentMove.classification
                )
            } else null

            ChessBoard(
                board = board.board,
                flipped = false,
                lastMoveFrom = currentMove?.move?.from?.toIndex() ?: -1,
                lastMoveTo = currentMove?.move?.to?.toIndex() ?: -1,
                arrows = arrows,
                classificationMarker = marker,
                modifier = Modifier
                    .weight(1f)
                    .aspectRatio(1f)
            )
        }

        // Move navigation bar (from Components.kt)
        MoveNavigationBar(
            moves = analysis.moves,
            currentIndex = currentIndex,
            onMoveClick = onMoveClick,
            onPrevious = onPrevious,
            onNext = onNext
        )

        Spacer(Modifier.weight(1f))

        // Bottom action bar (from Components.kt)
        ReviewBottomBar(
            onShow = onShowBest,
            onBest = onShowBest,
            onRetry = onRetry,
            onNext = onNext
        )
    }
}

fun formatEval(cp: Int): String {
    if (kotlin.math.abs(cp) >= 9000) {
        return if (cp > 0) "#" else "-#"
    }
    val sign = if (cp >= 0) "+" else ""
    return "$sign${"%.2f".format(cp / 100f)}"
}
