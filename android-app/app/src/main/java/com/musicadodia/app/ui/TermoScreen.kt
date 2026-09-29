package com.musicadodia.app.ui

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.musicadodia.app.GameViewModel
import com.musicadodia.app.data.LetterMark

@Composable
fun TermoScreen(viewModel: GameViewModel) {
    val termo = viewModel.state.termo ?: return
    val context = LocalContext.current

    Column(
        modifier = Modifier
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    "TERMO DO DIA #${termo.challengeNumber}",
                    color = TextMuted,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Black
                )
                Text(
                    termo.date,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
            }
            Text(
                "${termo.guesses.size}/6",
                color = TextMuted,
                fontWeight = FontWeight.Bold
            )
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Surface)
        ) {
            Column(
                modifier = Modifier.padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    if (termo.finished) "Desafio concluído" else "Descubra a palavra",
                    fontWeight = FontWeight.Black,
                    style = MaterialTheme.typography.titleLarge
                )
                Text(termo.message, color = TextMuted)
            }
        }

        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(6.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            repeat(6) { row ->
                val saved = termo.guesses.getOrNull(row)
                val activeLetters = if (saved == null && row == termo.guesses.size && !termo.finished) {
                    termo.input.padEnd(5, ' ')
                } else {
                    ""
                }

                Row(
                    modifier = Modifier.fillMaxWidth(0.88f),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    repeat(5) { col ->
                        val letter = when {
                            saved != null -> saved.word.getOrNull(col)?.toString().orEmpty()
                            activeLetters.isNotEmpty() -> activeLetters.getOrNull(col)?.takeIf { it != ' ' }?.toString().orEmpty()
                            else -> ""
                        }
                        val mark = saved?.marks?.getOrNull(col) ?: LetterMark.EMPTY
                        TermoCell(
                            letter = letter,
                            mark = mark,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }
        }

        if (!termo.finished) {
            OutlinedTextField(
                value = termo.input,
                onValueChange = viewModel::setTermoInput,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Palavra de 5 letras") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(
                    capitalization = KeyboardCapitalization.Characters,
                    imeAction = ImeAction.Done
                ),
                keyboardActions = KeyboardActions(onDone = { viewModel.submitTermo() })
            )

            Button(
                onClick = viewModel::submitTermo,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("ENVIAR")
            }
        } else {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Surface)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(7.dp)
                ) {
                    Text(
                        if (termo.won) "VOCÊ ACERTOU" else "A PALAVRA ERA",
                        color = if (termo.won) Success else TextMuted,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Black
                    )
                    Text(
                        termo.targetWord,
                        fontSize = 30.sp,
                        fontWeight = FontWeight.Black,
                        letterSpacing = 4.sp
                    )

                    Button(
                        onClick = {
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
                    ) {
                        Text("Compartilhar")
                    }
                }
            }
        }
    }
}

@Composable
private fun TermoCell(
    letter: String,
    mark: LetterMark,
    modifier: Modifier = Modifier
) {
    val background = when (mark) {
        LetterMark.CORRECT -> Success
        LetterMark.PRESENT -> TermoYellow
        LetterMark.ABSENT -> Color(0xFF171B1F)
        LetterMark.EMPTY -> Color(0xFF191D21)
    }

    val borderLike = if (letter.isNotBlank() && mark == LetterMark.EMPTY) {
        Color(0xFF515960)
    } else {
        Surface2
    }

    Box(
        modifier = modifier
            .aspectRatio(1f)
            .background(borderLike, RoundedCornerShape(7.dp))
            .padding(2.dp)
            .background(background, RoundedCornerShape(6.dp)),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = letter,
            color = TextPrimary,
            fontSize = 24.sp,
            fontWeight = FontWeight.Black,
            textAlign = TextAlign.Center
        )
    }
}
