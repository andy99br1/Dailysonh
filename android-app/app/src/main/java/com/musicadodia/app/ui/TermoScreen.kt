package com.musicadodia.app.ui

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.musicadodia.app.GameViewModel
import com.musicadodia.app.data.LetterMark

@Composable
fun TermoScreen(viewModel: GameViewModel) {
    val termo = viewModel.state.termo ?: return
    val p = LocalAppPalette.current
    val context = LocalContext.current

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val availableForCells = (maxHeight - 250.dp) / 6f
        val availableByWidth = (maxWidth - 34.dp) / 5f
        val cellSize = minOf(60.dp, availableForCells, availableByWidth).coerceAtLeast(38.dp)
        val compact = maxHeight < 600.dp
        val keyHeight = if (compact) 32.dp else 42.dp

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(top = 1.dp, bottom = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            TermoBoard(
                termo = termo,
                cellSize = cellSize
            )

            Text(
                termo.message,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(16.dp)
                    .padding(top = 2.dp),
                color = when {
                    termo.won -> p.green
                    termo.message.contains("não existe", ignoreCase = true) || termo.message.contains("Preencha", ignoreCase = true) -> p.red
                    else -> p.muted
                },
                fontSize = 8.5.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )

            if (!termo.finished) {
                Spacer(Modifier.weight(1f))
                TermoKeyboard(
                    viewModel = viewModel,
                    keyHeight = keyHeight
                )
                Spacer(Modifier.height(4.dp))
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(if (compact) 36.dp else 42.dp)
                        .clickable(onClick = viewModel::submitTermo),
                    color = if (p.key == "grafite") Color(0xFF171B1F) else p.surface2,
                    shape = RoundedCornerShape(6.dp),
                    border = androidx.compose.foundation.BorderStroke(
                        2.dp,
                        if (p.key == "grafite") Color(0xFF515960) else p.line
                    )
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            "ENVIAR",
                            color = p.text,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Black,
                            letterSpacing = 0.3.sp
                        )
                    }
                }
            } else {
                Spacer(Modifier.height(7.dp))
                TermoResultPanel(
                    viewModel = viewModel,
                    onShare = {
                        val grid = termo.guesses.joinToString("\n") { guess ->
                            guess.marks.joinToString("") { mark ->
                                when (mark) {
                                    LetterMark.CORRECT -> "🟩"
                                    LetterMark.PRESENT -> "🟨"
                                    else -> "⬛"
                                }
                            }
                        }
                        val result = if (termo.won) "${termo.guesses.size}/6" else "X/6"
                        val text = "Termo do Dia #${termo.challengeNumber} $result\n\n$grid\n\nhttps://musicadodia.com/termo/"
                        val intent = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_TEXT, text)
                        }
                        context.startActivity(Intent.createChooser(intent, "Compartilhar resultado"))
                    }
                )
            }
        }
    }
}

@Composable
private fun TermoBoard(
    termo: com.musicadodia.app.TermoUiState,
    cellSize: Dp
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(3.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        repeat(6) { row ->
            val saved = termo.guesses.getOrNull(row)
            val active = if (saved == null && row == termo.guesses.size && !termo.finished) termo.input else ""

            Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                repeat(5) { col ->
                    val letter = when {
                        saved != null -> saved.word.getOrNull(col)?.toString().orEmpty()
                        active.isNotEmpty() -> active.getOrNull(col)?.toString().orEmpty()
                        else -> ""
                    }
                    val mark = saved?.marks?.getOrNull(col) ?: LetterMark.EMPTY
                    TermoCell(letter, mark, cellSize)
                }
            }
        }
    }
}

@Composable
private fun TermoCell(
    letter: String,
    mark: LetterMark,
    size: Dp
) {
    val p = LocalAppPalette.current
    val graphite = p.key == "grafite"
    val background = when (mark) {
        LetterMark.CORRECT -> if (graphite) Color(0xFF2F6F2D) else Color(0xFF538D4E)
        LetterMark.PRESENT -> if (graphite) Color(0xFFC39B0B) else Color(0xFFB59F3B)
        LetterMark.ABSENT -> if (graphite) Color(0xFF171B1F) else Color(0xFF657187)
        LetterMark.EMPTY -> if (graphite) Color(0xFF191D21) else p.surface2
    }
    val border = when {
        mark != LetterMark.EMPTY -> background
        graphite && letter.isNotBlank() -> Color(0xFF3D454C)
        graphite -> Color(0xFF252B30)
        letter.isNotBlank() -> p.text.copy(alpha = 0.38f)
        else -> p.line
    }

    Box(
        modifier = Modifier
            .size(size)
            .background(background, RoundedCornerShape(5.dp))
            .border(2.dp, border, RoundedCornerShape(5.dp)),
        contentAlignment = Alignment.Center
    ) {
        Text(
            letter,
            color = if (mark == LetterMark.EMPTY) p.text else Color.White,
            fontSize = (size.value * 0.50f).sp,
            fontWeight = FontWeight.Black,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
private fun TermoKeyboard(
    viewModel: GameViewModel,
    keyHeight: Dp
) {
    val termo = viewModel.state.termo ?: return
    val rows = listOf("QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM")
    val states = keyboardStates(termo.guesses)

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(3.dp)
    ) {
        rows.forEachIndexed { rowIndex, letters ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(3.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                letters.forEach { letter ->
                    TermoKey(
                        label = letter.toString(),
                        state = states[letter] ?: LetterMark.EMPTY,
                        height = keyHeight,
                        modifier = Modifier.weight(1f),
                        onClick = { viewModel.appendTermoLetter(letter) }
                    )
                }
                if (rowIndex == 2) {
                    TermoKey(
                        label = "⌫",
                        state = LetterMark.EMPTY,
                        height = keyHeight,
                        modifier = Modifier.weight(1.45f),
                        onClick = viewModel::backspaceTermo
                    )
                }
            }
        }
    }
}

@Composable
private fun TermoKey(
    label: String,
    state: LetterMark,
    height: Dp,
    modifier: Modifier,
    onClick: () -> Unit
) {
    val p = LocalAppPalette.current
    val graphite = p.key == "grafite"
    val background = when (state) {
        LetterMark.CORRECT -> if (graphite) Color(0xFF2F6F2D) else Color(0xFF538D4E)
        LetterMark.PRESENT -> if (graphite) Color(0xFFC39B0B) else Color(0xFFB59F3B)
        LetterMark.ABSENT -> if (graphite) Color(0xFF2F353A) else Color(0xFF657187)
        LetterMark.EMPTY -> if (graphite) Color(0xFF12161A) else p.pill
    }
    val border = if (graphite && state == LetterMark.EMPTY) Color(0xFF20262B) else if (state == LetterMark.EMPTY) p.line else background

    Surface(
        modifier = modifier
            .height(height)
            .clickable(onClick = onClick),
        color = background,
        shape = RoundedCornerShape(5.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, border)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                label,
                color = if (state == LetterMark.EMPTY) p.text else Color.White,
                fontSize = if (label == "⌫") 18.sp else 12.sp,
                fontWeight = FontWeight.Black
            )
        }
    }
}

private fun keyboardStates(
    guesses: List<com.musicadodia.app.data.TermoGuess>
): Map<Char, LetterMark> {
    val result = mutableMapOf<Char, LetterMark>()
    fun priority(mark: LetterMark): Int = when (mark) {
        LetterMark.CORRECT -> 3
        LetterMark.PRESENT -> 2
        LetterMark.ABSENT -> 1
        LetterMark.EMPTY -> 0
    }
    guesses.forEach { guess ->
        guess.word.forEachIndexed { index, char ->
            val mark = guess.marks.getOrElse(index) { LetterMark.EMPTY }
            if (priority(mark) > priority(result[char] ?: LetterMark.EMPTY)) result[char] = mark
        }
    }
    return result
}

@Composable
private fun TermoResultPanel(
    viewModel: GameViewModel,
    onShare: () -> Unit
) {
    val termo = viewModel.state.termo ?: return
    val p = LocalAppPalette.current
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = if (p.key == "grafite") Color(0xFF181C20) else p.surface,
        shape = RoundedCornerShape(14.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, p.line),
        shadowElevation = 12.dp
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                if (termo.won) "VOCÊ ACERTOU!" else "NÃO FOI DESSA VEZ",
                color = if (termo.won) p.green else p.red,
                fontSize = 20.sp,
                fontWeight = FontWeight.Black
            )
            Text("A palavra era", color = p.muted, fontSize = 9.sp, fontWeight = FontWeight.Bold)
            Text(
                termo.targetWord,
                color = p.text,
                fontSize = 26.sp,
                letterSpacing = 3.sp,
                fontWeight = FontWeight.Black,
                modifier = Modifier.padding(top = 2.dp, bottom = 8.dp)
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(5.dp)
            ) {
                StatBox(termo.stats.played.toString(), "jogos", Modifier.weight(1f))
                StatBox("${termo.stats.winRate}%", "vitórias", Modifier.weight(1f))
                StatBox(termo.stats.streak.toString(), "sequência", Modifier.weight(1f))
                StatBox(termo.stats.best.toString(), "melhor", Modifier.weight(1f))
            }

            Spacer(Modifier.height(8.dp))

            Surface(
                modifier = Modifier
                    .height(38.dp)
                    .clickable(onClick = onShare),
                color = p.surface,
                shape = RoundedCornerShape(10.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, p.line)
            ) {
                Box(Modifier.padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
                    Text("Compartilhar", color = p.text, fontSize = 10.sp, fontWeight = FontWeight.Black)
                }
            }
        }
    }
}

@Composable
private fun StatBox(value: String, label: String, modifier: Modifier) {
    val p = LocalAppPalette.current
    Surface(
        modifier = modifier,
        color = p.surface2,
        shape = RoundedCornerShape(8.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, p.line)
    ) {
        Column(
            modifier = Modifier.padding(vertical = 7.dp, horizontal = 2.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(value, color = p.text, fontSize = 16.sp, fontWeight = FontWeight.Black)
            Text(label, color = p.muted, fontSize = 7.sp, fontWeight = FontWeight.Bold)
        }
    }
}
