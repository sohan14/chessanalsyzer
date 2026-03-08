package com.chessanalyzer.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chessanalyzer.model.AnalyzedMove
import com.chessanalyzer.model.MoveClassification
import com.chessanalyzer.ui.theme.*
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

// ─────────────────────────────────────────────────────────────────────────────
// 1. ClassificationIcon
// ─────────────────────────────────────────────────────────────────────────────

@Composable
fun ClassificationIcon(
    classification: MoveClassification,
    size: Dp = 24.dp
) {
    val bgColor = classificationColor(classification)
    val symbol = classificationSymbol(classification)

    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(bgColor)
    ) {
        Text(
            text = symbol,
            color = White,
            fontSize = (size.value * 0.5f).sp,
            fontWeight = FontWeight.ExtraBold,
            textAlign = TextAlign.Center,
            lineHeight = (size.value * 0.6f).sp
        )
    }
}

private fun classificationColor(c: MoveClassification): Color = when (c) {
    MoveClassification.BRILLIANT -> BrilliantColor
    MoveClassification.GREAT -> GreatColor
    MoveClassification.BEST -> BestColor
    MoveClassification.EXCELLENT -> ExcellentColor
    MoveClassification.GOOD -> GoodColor
    MoveClassification.BOOK -> BookColor
    MoveClassification.INACCURACY -> InaccuracyColor
    MoveClassification.MISTAKE -> MistakeColor
    MoveClassification.MISS -> MissColor
    MoveClassification.BLUNDER -> BlunderColor
}

private fun classificationSymbol(c: MoveClassification): String = when (c) {
    MoveClassification.BRILLIANT -> "!!"
    MoveClassification.GREAT -> "!"
    MoveClassification.BEST -> "\u2B50"
    MoveClassification.EXCELLENT -> "\uD83D\uDC4D"
    MoveClassification.GOOD -> "\u2713"
    MoveClassification.BOOK -> "\uD83D\uDCD6"
    MoveClassification.INACCURACY -> "?!"
    MoveClassification.MISTAKE -> "?"
    MoveClassification.MISS -> "\u2715"
    MoveClassification.BLUNDER -> "??"
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. CoachBubble
// ─────────────────────────────────────────────────────────────────────────────

@Composable
fun CoachBubble(
    classification: MoveClassification?,
    san: String,
    eval: String,
    explanation: String,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        // Coach avatar - knight icon in circle
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(GreenAccent)
        ) {
            Text(
                text = "\u265E",
                color = White,
                fontSize = 26.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )
        }

        // Speech bubble
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = Color(0xFFF0F0F0),
            shadowElevation = 2.dp,
            modifier = Modifier.weight(1f)
        ) {
            Column(
                modifier = Modifier.padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                // Top row: classification icon + move description + eval badge
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (classification != null) {
                        ClassificationIcon(
                            classification = classification,
                            size = 22.dp
                        )
                    }

                    Text(
                        text = buildClassificationLabel(san, classification),
                        color = Color(0xFF1E1E1E),
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )

                    // Eval badge
                    if (eval.isNotEmpty()) {
                        Box(
                            contentAlignment = Alignment.Center,
                            modifier = Modifier
                                .clip(RoundedCornerShape(4.dp))
                                .background(
                                    if (eval.startsWith("+") || eval.startsWith("0"))
                                        Color(0xFFE8E8E8)
                                    else
                                        Color(0xFF3A3A3A)
                                )
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        ) {
                            Text(
                                text = eval,
                                color = if (eval.startsWith("+") || eval.startsWith("0"))
                                    Color(0xFF1E1E1E)
                                else
                                    White,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                }

                // Explanation text
                if (explanation.isNotEmpty()) {
                    Text(
                        text = explanation,
                        color = Color(0xFF4A4A4A),
                        fontSize = 14.sp,
                        lineHeight = 20.sp
                    )
                }
            }
        }
    }
}

private fun buildClassificationLabel(san: String, classification: MoveClassification?): String {
    if (classification == null) return san
    return "$san is ${classification.label.lowercase()}"
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. EvalBar
// ─────────────────────────────────────────────────────────────────────────────

@Composable
fun EvalBar(
    eval: Int,
    modifier: Modifier = Modifier
) {
    // eval in centipawns; positive = white advantage
    // Clamp to [-1000, 1000] for display, map to 0..1 fraction
    val clampedEval = eval.coerceIn(-1000, 1000)
    val targetFraction = 0.5f - (clampedEval / 2000f)

    val animatedFraction by animateFloatAsState(
        targetValue = targetFraction,
        animationSpec = tween(durationMillis = 400),
        label = "evalBarAnimation"
    )

    val evalText = remember(eval) {
        if (abs(eval) >= 10000) {
            if (eval > 0) "M${(10000 - eval + 1) / 2}" else "M${(-10000 - eval + 1) / 2}"
        } else {
            val absEval = abs(eval)
            val sign = if (eval >= 0) "" else ""
            "${absEval / 100}.${absEval % 100 / 10}"
        }
    }

    Box(
        modifier = modifier
            .width(28.dp)
            .clip(RoundedCornerShape(4.dp))
            .border(1.dp, DimGray.copy(alpha = 0.3f), RoundedCornerShape(4.dp))
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val blackHeight = size.height * animatedFraction
            val whiteHeight = size.height - blackHeight

            // Black section from top
            drawRect(
                color = Color(0xFF3A3A3A),
                topLeft = Offset.Zero,
                size = Size(size.width, blackHeight)
            )

            // White section from bottom
            drawRect(
                color = Color(0xFFF0F0F0),
                topLeft = Offset(0f, blackHeight),
                size = Size(size.width, whiteHeight)
            )
        }

        // Show eval text on the advantaged side
        val textColor: Color
        val textAlignment: Alignment

        if (eval >= 0) {
            textColor = Color(0xFF3A3A3A)
            textAlignment = Alignment.BottomCenter
        } else {
            textColor = Color(0xFFF0F0F0)
            textAlignment = Alignment.TopCenter
        }

        Text(
            text = evalText,
            color = textColor,
            fontSize = 9.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .align(textAlignment)
                .padding(vertical = 4.dp)
                .fillMaxWidth()
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ClassificationRow
// ─────────────────────────────────────────────────────────────────────────────

@Composable
fun ClassificationRow(
    label: String,
    icon: String,
    whiteCount: Int,
    blackCount: Int,
    color: Color,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // White count
        Text(
            text = whiteCount.toString(),
            color = White,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.End,
            modifier = Modifier.width(32.dp)
        )

        Spacer(modifier = Modifier.width(12.dp))

        // Icon circle
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(22.dp)
                .clip(CircleShape)
                .background(color)
        ) {
            Text(
                text = icon,
                color = White,
                fontSize = 10.sp,
                fontWeight = FontWeight.ExtraBold,
                textAlign = TextAlign.Center
            )
        }

        Spacer(modifier = Modifier.width(8.dp))

        // Label
        Text(
            text = label,
            color = LightGray,
            fontSize = 14.sp,
            modifier = Modifier.weight(1f)
        )

        // Black count
        Text(
            text = blackCount.toString(),
            color = White,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Start,
            modifier = Modifier.width(32.dp)
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. AccuracyCard
// ─────────────────────────────────────────────────────────────────────────────

@Composable
fun AccuracyCard(
    name: String,
    accuracy: Float,
    isWhite: Boolean,
    modifier: Modifier = Modifier
) {
    val bgColor = if (isWhite) Color(0xFFF0F0F0) else Color(0xFF3A3A3A)
    val textColor = if (isWhite) Color(0xFF1E1E1E) else White
    val accuracyColor = when {
        accuracy >= 80f -> GreenAccent
        accuracy >= 60f -> InaccuracyColor
        else -> BlunderColor
    }

    Surface(
        shape = RoundedCornerShape(12.dp),
        color = bgColor,
        modifier = modifier
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            // Player piece icon
            Text(
                text = if (isWhite) "\u2654" else "\u265A",
                fontSize = 20.sp,
                color = textColor
            )

            // Player name
            Text(
                text = name,
                color = textColor,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            // Accuracy score
            Text(
                text = String.format("%.1f", accuracy),
                color = accuracyColor,
                fontSize = 36.sp,
                fontWeight = FontWeight.Bold,
                lineHeight = 40.sp
            )

            Text(
                text = "Accuracy",
                color = if (isWhite) Color(0xFF808080) else DimGray,
                fontSize = 12.sp
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. EvalGraph
// ─────────────────────────────────────────────────────────────────────────────

@Composable
fun EvalGraph(
    evalHistory: List<Int>,
    currentMoveIndex: Int,
    modifier: Modifier = Modifier
) {
    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(80.dp)
            .clip(RoundedCornerShape(8.dp))
    ) {
        val w = size.width
        val h = size.height
        val midY = h / 2f

        // Background
        drawRect(color = Color(0xFF2B2B2B))

        if (evalHistory.isEmpty()) return@Canvas

        // Draw center line
        drawLine(
            color = DimGray.copy(alpha = 0.4f),
            start = Offset(0f, midY),
            end = Offset(w, midY),
            strokeWidth = 1f
        )

        val maxEval = 500f // clamp display to +/- 5 pawns
        val stepX = if (evalHistory.size > 1) w / (evalHistory.size - 1).toFloat() else w

        // Build white area path (above midline for white advantage)
        val whitePath = Path().apply {
            moveTo(0f, midY)
            for (i in evalHistory.indices) {
                val x = i * stepX
                val clampedEval = evalHistory[i].coerceIn(-maxEval.toInt(), maxEval.toInt())
                val y = midY - (clampedEval / maxEval) * midY
                lineTo(x, y)
            }
            lineTo((evalHistory.size - 1) * stepX, midY)
            close()
        }

        // White advantage area
        drawPath(
            path = whitePath,
            color = Color(0xFFF0F0F0).copy(alpha = 0.8f),
            style = Fill
        )

        // Black advantage area (below midline)
        val blackPath = Path().apply {
            moveTo(0f, midY)
            for (i in evalHistory.indices) {
                val x = i * stepX
                val clampedEval = evalHistory[i].coerceIn(-maxEval.toInt(), maxEval.toInt())
                val y = midY - (clampedEval / maxEval) * midY
                lineTo(x, y)
            }
            lineTo((evalHistory.size - 1) * stepX, midY)
            close()
        }

        // Actually draw the eval line in green
        val linePath = Path().apply {
            for (i in evalHistory.indices) {
                val x = i * stepX
                val clampedEval = evalHistory[i].coerceIn(-maxEval.toInt(), maxEval.toInt())
                val y = midY - (clampedEval / maxEval) * midY
                if (i == 0) moveTo(x, y) else lineTo(x, y)
            }
        }

        drawPath(
            path = linePath,
            color = GreenAccent,
            style = Stroke(width = 2f)
        )

        // Draw current position marker
        if (currentMoveIndex in evalHistory.indices) {
            val markerX = currentMoveIndex * stepX
            val clampedEval = evalHistory[currentMoveIndex].coerceIn(-maxEval.toInt(), maxEval.toInt())
            val markerY = midY - (clampedEval / maxEval) * midY

            // Vertical line at current position
            drawLine(
                color = White.copy(alpha = 0.5f),
                start = Offset(markerX, 0f),
                end = Offset(markerX, h),
                strokeWidth = 1.5f
            )

            // Circle marker
            drawCircle(
                color = GreenAccent,
                radius = 5f,
                center = Offset(markerX, markerY)
            )
            drawCircle(
                color = White,
                radius = 3f,
                center = Offset(markerX, markerY)
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. MoveNavigationBar
// ─────────────────────────────────────────────────────────────────────────────

@Composable
fun MoveNavigationBar(
    moves: List<AnalyzedMove>,
    currentIndex: Int,
    onMoveClick: (Int) -> Unit,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    modifier: Modifier = Modifier
) {
    val scrollState = rememberScrollState()

    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(DarkSurface)
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Previous button
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(40.dp)
                .clickable { onPrevious() }
        ) {
            Text(
                text = "\u25C0",
                color = White,
                fontSize = 16.sp
            )
        }

        // Scrollable move list
        Row(
            modifier = Modifier
                .weight(1f)
                .horizontalScroll(scrollState)
                .padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            for (i in moves.indices) {
                val move = moves[i]
                val isActive = i == currentIndex
                val moveNumber = (i / 2) + 1
                val isWhiteMove = i % 2 == 0

                // Show move number before white's move
                if (isWhiteMove) {
                    Text(
                        text = "$moveNumber.",
                        color = DimGray,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.padding(start = 4.dp, end = 2.dp)
                    )
                }

                // Move with optional classification
                val moveColor = classificationTextColor(move.classification)
                val bgModifier = if (isActive) {
                    Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(DarkSurfaceVariant)
                } else {
                    Modifier
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = bgModifier
                        .clickable { onMoveClick(i) }
                        .padding(horizontal = 4.dp, vertical = 4.dp)
                ) {
                    // Small classification icon for non-normal moves
                    if (move.classification != MoveClassification.BEST &&
                        move.classification != MoveClassification.GOOD &&
                        move.classification != MoveClassification.EXCELLENT &&
                        move.classification != MoveClassification.BOOK
                    ) {
                        ClassificationIcon(
                            classification = move.classification,
                            size = 14.dp
                        )
                        Spacer(modifier = Modifier.width(2.dp))
                    }

                    Text(
                        text = move.san,
                        color = if (isActive) White else moveColor,
                        fontSize = 13.sp,
                        fontWeight = if (isActive) FontWeight.Bold else FontWeight.Normal
                    )

                    // Show classification symbol for mistakes/blunders
                    if (move.classification == MoveClassification.BLUNDER ||
                        move.classification == MoveClassification.MISTAKE ||
                        move.classification == MoveClassification.MISS ||
                        move.classification == MoveClassification.INACCURACY
                    ) {
                        Text(
                            text = " ${move.classification.symbol}",
                            color = moveColor,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                Spacer(modifier = Modifier.width(2.dp))
            }
        }

        // Next button
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(40.dp)
                .clickable { onNext() }
        ) {
            Text(
                text = "\u25B6",
                color = White,
                fontSize = 16.sp
            )
        }
    }
}

private fun classificationTextColor(c: MoveClassification): Color = when (c) {
    MoveClassification.BRILLIANT -> BrilliantColor
    MoveClassification.GREAT -> GreatColor
    MoveClassification.BEST -> White
    MoveClassification.EXCELLENT -> White
    MoveClassification.GOOD -> White
    MoveClassification.BOOK -> BookColor
    MoveClassification.INACCURACY -> InaccuracyColor
    MoveClassification.MISTAKE -> MistakeColor
    MoveClassification.MISS -> MissColor
    MoveClassification.BLUNDER -> BlunderColor
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. ReviewBottomBar
// ─────────────────────────────────────────────────────────────────────────────

@Composable
fun ReviewBottomBar(
    onShow: () -> Unit,
    onBest: () -> Unit,
    onRetry: () -> Unit,
    onNext: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(DarkSurface)
            .padding(horizontal = 8.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Show button
        ReviewButton(
            icon = "\uD83D\uDC41",
            label = "Show",
            onClick = onShow,
            backgroundColor = DarkSurfaceVariant,
            textColor = White,
            modifier = Modifier.weight(1f)
        )

        // Best button
        ReviewButton(
            icon = "\u2605",
            label = "Best",
            onClick = onBest,
            backgroundColor = DarkSurfaceVariant,
            textColor = White,
            modifier = Modifier.weight(1f)
        )

        // Retry button
        ReviewButton(
            icon = "\u21BA",
            label = "Retry",
            onClick = onRetry,
            backgroundColor = DarkSurfaceVariant,
            textColor = White,
            modifier = Modifier.weight(1f)
        )

        // Next button (green, Chess.com style)
        ReviewButton(
            icon = "\u25B6",
            label = "Next",
            onClick = onNext,
            backgroundColor = GreenAccent,
            textColor = White,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun ReviewButton(
    icon: String,
    label: String,
    onClick: () -> Unit,
    backgroundColor: Color,
    textColor: Color,
    modifier: Modifier = Modifier
) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = backgroundColor,
        modifier = modifier
            .height(44.dp)
            .clickable { onClick() }
    ) {
        Row(
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 8.dp)
        ) {
            Text(
                text = icon,
                color = textColor,
                fontSize = 16.sp
            )
            Spacer(modifier = Modifier.width(4.dp))
            Text(
                text = label,
                color = textColor,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold
            )
        }
    }
}
