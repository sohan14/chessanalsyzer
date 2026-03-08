package com.chessanalyzer.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import com.chessanalyzer.model.MoveClassification
import com.chessanalyzer.model.Piece
import com.chessanalyzer.ui.theme.*
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

data class Arrow(
    val fromSquare: Int,
    val toSquare: Int,
    val color: Color
)

data class ClassificationMarker(
    val square: Int,
    val classification: MoveClassification
)

@Composable
fun ChessBoard(
    board: IntArray,
    flipped: Boolean = false,
    lastMoveFrom: Int = -1,
    lastMoveTo: Int = -1,
    arrows: List<Arrow> = emptyList(),
    classificationMarker: ClassificationMarker? = null,
    highlightSquares: Set<Int> = emptySet(),
    selectedSquare: Int = -1,
    onSquareClick: ((Int) -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    val pieceChars = remember {
        mapOf(
            1 to "\u2659",   // White Pawn
            2 to "\u2658",   // White Knight
            3 to "\u2657",   // White Bishop
            4 to "\u2656",   // White Rook
            5 to "\u2655",   // White Queen
            6 to "\u2654",   // White King
            7 to "\u265F",   // Black Pawn
            8 to "\u265E",   // Black Knight
            9 to "\u265D",   // Black Bishop
            10 to "\u265C",  // Black Rook
            11 to "\u265B",  // Black Queen
            12 to "\u265A"   // Black King
        )
    }

    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(1f)
            .pointerInput(onSquareClick) {
                if (onSquareClick != null) {
                    detectTapGestures { offset ->
                        val sqSize = size.width / 8f
                        val file = (offset.x / sqSize).toInt().coerceIn(0, 7)
                        val rank = (offset.y / sqSize).toInt().coerceIn(0, 7)
                        val actualFile = if (flipped) 7 - file else file
                        val actualRank = if (flipped) rank else 7 - rank
                        val index = actualRank * 8 + actualFile
                        onSquareClick(index)
                    }
                }
            }
    ) {
        val sqSize = size.width / 8f

        // Draw squares
        for (rank in 0..7) {
            for (file in 0..7) {
                val drawFile = if (flipped) 7 - file else file
                val drawRank = if (flipped) rank else 7 - rank
                val index = drawRank * 8 + drawFile

                val isLight = (file + rank) % 2 == 0
                var squareColor = if (isLight) BoardLight else BoardDark

                // Highlight last move
                if (index == lastMoveFrom || index == lastMoveTo) {
                    squareColor = if (isLight) {
                        BoardLastMove
                    } else {
                        Color(0xFFBACA44)
                    }
                }

                // Highlight selected square
                if (index == selectedSquare) {
                    squareColor = BoardHighlight
                }

                // Red tint for highlighted (attacked/blunder) squares
                if (index in highlightSquares) {
                    squareColor = BoardBlunder.copy(alpha = 0.6f)
                }

                drawRect(
                    color = squareColor,
                    topLeft = Offset(file * sqSize, rank * sqSize),
                    size = Size(sqSize, sqSize)
                )
            }
        }

        // Draw coordinate labels
        val coordPaint = android.graphics.Paint().apply {
            textSize = sqSize * 0.16f
            isAntiAlias = true
            typeface = android.graphics.Typeface.create(
                android.graphics.Typeface.SANS_SERIF,
                android.graphics.Typeface.BOLD
            )
        }

        // File labels (a-h) on bottom row
        for (file in 0..7) {
            val displayFile = if (flipped) 7 - file else file
            val label = ('a' + displayFile).toString()
            val isLight = (file + 7) % 2 == 0
            coordPaint.color = if (isLight) {
                android.graphics.Color.rgb(0x76, 0x96, 0x56) // BoardDark as int
            } else {
                android.graphics.Color.rgb(0xEE, 0xEE, 0xD2) // BoardLight as int
            }
            drawContext.canvas.nativeCanvas.drawText(
                label,
                file * sqSize + sqSize - sqSize * 0.2f,
                8 * sqSize - sqSize * 0.06f,
                coordPaint
            )
        }

        // Rank labels (1-8) on left column
        for (rank in 0..7) {
            val displayRank = if (flipped) rank else 7 - rank
            val label = ('1' + displayRank).toString()
            val isLight = (0 + rank) % 2 == 0
            coordPaint.color = if (isLight) {
                android.graphics.Color.rgb(0x76, 0x96, 0x56)
            } else {
                android.graphics.Color.rgb(0xEE, 0xEE, 0xD2)
            }
            drawContext.canvas.nativeCanvas.drawText(
                label,
                sqSize * 0.06f,
                rank * sqSize + sqSize * 0.2f,
                coordPaint
            )
        }

        // Draw pieces
        val piecePaint = android.graphics.Paint().apply {
            textSize = sqSize * 0.78f
            isAntiAlias = true
            textAlign = android.graphics.Paint.Align.CENTER
            typeface = android.graphics.Typeface.DEFAULT
        }

        val pieceOutlinePaint = android.graphics.Paint().apply {
            textSize = sqSize * 0.78f
            isAntiAlias = true
            textAlign = android.graphics.Paint.Align.CENTER
            typeface = android.graphics.Typeface.DEFAULT
            style = android.graphics.Paint.Style.STROKE
            strokeWidth = sqSize * 0.02f
        }

        for (rank in 0..7) {
            for (file in 0..7) {
                val drawFile = if (flipped) 7 - file else file
                val drawRank = if (flipped) rank else 7 - rank
                val index = drawRank * 8 + drawFile
                val pieceCode = board[index]

                if (pieceCode != 0) {
                    val symbol = pieceChars[pieceCode] ?: continue
                    val cx = file * sqSize + sqSize / 2f
                    val cy = rank * sqSize + sqSize * 0.68f

                    val isWhitePiece = pieceCode in 1..6

                    if (isWhitePiece) {
                        // White pieces: white fill with dark outline
                        pieceOutlinePaint.color = android.graphics.Color.rgb(0x30, 0x30, 0x30)
                        pieceOutlinePaint.strokeWidth = sqSize * 0.03f
                        drawContext.canvas.nativeCanvas.drawText(symbol, cx, cy, pieceOutlinePaint)

                        piecePaint.color = android.graphics.Color.WHITE
                        drawContext.canvas.nativeCanvas.drawText(symbol, cx, cy, piecePaint)
                    } else {
                        // Black pieces: dark fill with slight lighter outline
                        pieceOutlinePaint.color = android.graphics.Color.rgb(0x60, 0x60, 0x60)
                        pieceOutlinePaint.strokeWidth = sqSize * 0.02f
                        drawContext.canvas.nativeCanvas.drawText(symbol, cx, cy, pieceOutlinePaint)

                        piecePaint.color = android.graphics.Color.rgb(0x1A, 0x1A, 0x1A)
                        drawContext.canvas.nativeCanvas.drawText(symbol, cx, cy, piecePaint)
                    }
                }
            }
        }

        // Draw arrows
        for (arrow in arrows) {
            drawArrow(
                fromSquare = arrow.fromSquare,
                toSquare = arrow.toSquare,
                color = arrow.color,
                sqSize = sqSize,
                flipped = flipped
            )
        }

        // Draw classification marker
        if (classificationMarker != null) {
            drawClassificationMarker(
                square = classificationMarker.square,
                classification = classificationMarker.classification,
                sqSize = sqSize,
                flipped = flipped
            )
        }
    }
}

private fun DrawScope.squareCenter(square: Int, sqSize: Float, flipped: Boolean): Offset {
    val file = square % 8
    val rank = square / 8
    val drawFile = if (flipped) 7 - file else file
    val drawRank = if (flipped) rank else 7 - rank
    return Offset(
        drawFile * sqSize + sqSize / 2f,
        drawRank * sqSize + sqSize / 2f
    )
}

private fun DrawScope.drawArrow(
    fromSquare: Int,
    toSquare: Int,
    color: Color,
    sqSize: Float,
    flipped: Boolean
) {
    val from = squareCenter(fromSquare, sqSize, flipped)
    val to = squareCenter(toSquare, sqSize, flipped)

    val arrowColor = color.copy(alpha = 0.75f)
    val lineWidth = sqSize * 0.18f
    val headLength = sqSize * 0.45f
    val headWidth = sqSize * 0.4f

    val dx = to.x - from.x
    val dy = to.y - from.y
    val dist = sqrt(dx * dx + dy * dy)
    if (dist < 1f) return

    val ux = dx / dist
    val uy = dy / dist

    // Shorten line so arrow head sits on destination
    val lineEnd = Offset(
        to.x - ux * headLength,
        to.y - uy * headLength
    )

    // Draw line body
    drawLine(
        color = arrowColor,
        start = from,
        end = lineEnd,
        strokeWidth = lineWidth
    )

    // Draw arrowhead
    val perpX = -uy
    val perpY = ux

    val arrowPath = Path().apply {
        moveTo(to.x, to.y)
        lineTo(
            lineEnd.x + perpX * headWidth / 2f,
            lineEnd.y + perpY * headWidth / 2f
        )
        lineTo(
            lineEnd.x - perpX * headWidth / 2f,
            lineEnd.y - perpY * headWidth / 2f
        )
        close()
    }

    drawPath(
        path = arrowPath,
        color = arrowColor,
        style = Fill
    )
}

private fun DrawScope.drawClassificationMarker(
    square: Int,
    classification: MoveClassification,
    sqSize: Float,
    flipped: Boolean
) {
    val file = square % 8
    val rank = square / 8
    val drawFile = if (flipped) 7 - file else file
    val drawRank = if (flipped) rank else 7 - rank

    val markerSize = sqSize * 0.35f
    val cx = drawFile * sqSize + sqSize - markerSize * 0.6f
    val cy = drawRank * sqSize + markerSize * 0.6f

    val markerColor = Color(classification.color)

    // Draw circle background
    drawCircle(
        color = markerColor,
        radius = markerSize,
        center = Offset(cx, cy)
    )

    // Draw symbol text
    val textPaint = android.graphics.Paint().apply {
        color = android.graphics.Color.WHITE
        textSize = markerSize * 1.1f
        isAntiAlias = true
        textAlign = android.graphics.Paint.Align.CENTER
        typeface = android.graphics.Typeface.create(
            android.graphics.Typeface.SANS_SERIF,
            android.graphics.Typeface.BOLD
        )
    }

    drawContext.canvas.nativeCanvas.drawText(
        classification.symbol,
        cx,
        cy + markerSize * 0.38f,
        textPaint
    )
}
