package com.musicadodia.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalContext
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.musicadodia.app.GameViewModel
import com.musicadodia.app.RoundMark
import kotlinx.coroutines.delay

@Composable
fun MusicScreen(viewModel: GameViewModel) {
    val app = viewModel.state
    val music = app.music ?: return
    val song = music.song
    val context = LocalContext.current
    val audioUrl = viewModel.musicAudioUrl()

    val player = remember(song.date) {
        ExoPlayer.Builder(context).build()
    }

    var isPlaying by remember(player) { mutableStateOf(false) }
    var positionMs by remember(player) { mutableLongStateOf(0L) }
    var durationMs by remember(player) { mutableLongStateOf(1L) }

    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(value: Boolean) {
                isPlaying = value
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                val duration = player.duration
                if (duration != C.TIME_UNSET && duration > 0) durationMs = duration
            }
        }
        player.addListener(listener)
        onDispose {
            player.removeListener(listener)
            player.release()
        }
    }

    LaunchedEffect(audioUrl) {
        if (!audioUrl.isNullOrBlank()) {
            player.stop()
            player.clearMediaItems()
            player.setMediaItem(MediaItem.fromUri(audioUrl))
            player.prepare()
            positionMs = 0L
        }
    }

    LaunchedEffect(app.volume) {
        player.volume = app.volume
    }

    LaunchedEffect(app.repeat) {
        player.repeatMode = if (app.repeat) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
    }

    LaunchedEffect(player, audioUrl) {
        while (true) {
            positionMs = player.currentPosition.coerceAtLeast(0L)
            val d = player.duration
            if (d != C.TIME_UNSET && d > 0) durationMs = d
            delay(250)
        }
    }

    Column(
        modifier = Modifier
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    "DESAFIO #${music.challengeNumber}",
                    color = TextMuted,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Black
                )
                Text(
                    song.date,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
            }
            Text(
                "${music.selectedIndex + 1}/${song.rounds.size}",
                color = TextMuted,
                fontWeight = FontWeight.Bold
            )
        }

        Card(
            colors = CardDefaults.cardColors(containerColor = Surface),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    if (music.finished) "Desafio concluído" else "Qual é a música?",
                    fontWeight = FontWeight.Black,
                    style = MaterialTheme.typography.titleLarge
                )
                Text(music.message, color = TextMuted)
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
            song.rounds.forEachIndexed { index, _ ->
                val unlocked = if (music.finished) {
                    index <= song.revealIndex
                } else {
                    index <= music.unlockedIndex
                }
                val selected = index == music.selectedIndex
                val mark = music.results.getOrNull(index) ?: RoundMark.NONE

                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = when {
                            selected -> Surface2
                            unlocked -> Surface
                            else -> Color(0xFF24282C)
                        }
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(enabled = unlocked) {
                            viewModel.selectMusicRound(index)
                        }
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 13.dp, vertical = 11.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier.size(28.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                "${index + 1}",
                                fontWeight = FontWeight.Black,
                                color = if (unlocked) TextPrimary else TextMuted
                            )
                        }
                        Text(
                            song.roundLabels.getOrElse(index) { "Faixa ${index + 1}" },
                            modifier = Modifier.weight(1f),
                            color = if (unlocked) TextPrimary else TextMuted,
                            fontWeight = if (selected) FontWeight.Black else FontWeight.Medium
                        )
                        Text(
                            when (mark) {
                                RoundMark.WRONG -> "×"
                                RoundMark.CORRECT -> "✓"
                                RoundMark.NONE -> if (selected && !music.finished) "♪" else ""
                            },
                            fontSize = 22.sp,
                            fontWeight = FontWeight.Black,
                            color = when (mark) {
                                RoundMark.WRONG -> ErrorRed
                                RoundMark.CORRECT -> Success
                                RoundMark.NONE -> if (selected) Success else TextMuted
                            }
                        )
                    }
                }
            }
        }

        Card(
            colors = CardDefaults.cardColors(containerColor = Surface),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    song.roundLabels.getOrElse(music.selectedIndex) { "Faixa" },
                    fontWeight = FontWeight.Black
                )

                Slider(
                    value = positionMs.coerceAtMost(durationMs).toFloat(),
                    onValueChange = { value ->
                        positionMs = value.toLong()
                        player.seekTo(positionMs)
                    },
                    valueRange = 0f..durationMs.coerceAtLeast(1L).toFloat()
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedButton(
                        onClick = {
                            player.seekTo((player.currentPosition - 5000L).coerceAtLeast(0L))
                        }
                    ) {
                        Text("−5s")
                    }

                    Button(
                        onClick = {
                            if (player.isPlaying) player.pause() else player.play()
                        }
                    ) {
                        Text(if (isPlaying) "Pausar" else "Tocar")
                    }

                    OutlinedButton(
                        onClick = {
                            val max = if (player.duration > 0) player.duration else Long.MAX_VALUE
                            player.seekTo((player.currentPosition + 5000L).coerceAtMost(max))
                        }
                    ) {
                        Text("+5s")
                    }
                }

                HorizontalDivider(color = Surface2)

                Text("Volume · ${(app.volume * 100).toInt()}%", color = TextMuted)
                Slider(
                    value = app.volume,
                    onValueChange = viewModel::setVolume,
                    valueRange = 0f..1f
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Repetir faixa", modifier = Modifier.weight(1f))
                    Switch(
                        checked = app.repeat,
                        onCheckedChange = viewModel::setRepeat
                    )
                }
            }
        }

        if (!music.finished) {
            OutlinedTextField(
                value = music.guess,
                onValueChange = viewModel::setMusicGuess,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Nome da música") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { viewModel.submitMusicGuess() })
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(9.dp)
            ) {
                OutlinedButton(
                    onClick = viewModel::skipMusicRound,
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Pular")
                }
                Button(
                    onClick = viewModel::submitMusicGuess,
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Adivinhar")
                }
            }
        } else {
            Card(
                colors = CardDefaults.cardColors(containerColor = Surface),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(5.dp)
                ) {
                    Text(
                        if (music.won) "VOCÊ ACERTOU" else "A MÚSICA ERA",
                        color = if (music.won) Success else TextMuted,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Black
                    )
                    Text(
                        song.title,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Black
                    )
                    Text(song.artist, color = TextMuted)

                    Spacer(Modifier.height(4.dp))

                    val info = listOfNotNull(
                        song.releaseYear.takeIf { it.isNotBlank() }?.let { "Ano: $it" },
                        song.youtubeViews.takeIf { it.isNotBlank() }?.let { "Views: $it" },
                        song.difficulty.takeIf { it.isNotBlank() }?.let { "Dificuldade: $it" }
                    )
                    if (info.isNotEmpty()) {
                        Text(info.joinToString(" · "), color = TextMuted)
                    }
                }
            }
        }

        Spacer(Modifier.height(10.dp))
    }
}
