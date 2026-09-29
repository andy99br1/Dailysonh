package com.musicadodia.app.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.musicadodia.app.GameViewModel
import com.musicadodia.app.data.RoundMark
import coil.compose.AsyncImage
import kotlinx.coroutines.delay

@Composable
fun MusicScreen(viewModel: GameViewModel) {
    val app = viewModel.state
    val music = app.music ?: return
    val song = music.song
    val p = LocalAppPalette.current
    val context = LocalContext.current
    val audioUrl = viewModel.musicAudioUrl()

    val player = remember(song.date) { ExoPlayer.Builder(context).build() }
    var isPlaying by remember(player) { mutableStateOf(false) }
    var positionMs by remember(player) { mutableLongStateOf(0L) }
    var durationMs by remember(player) { mutableLongStateOf(18_000L) }
    var guessOpen by remember { mutableStateOf(false) }
    var volumeOpen by remember { mutableStateOf(false) }

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

    LaunchedEffect(app.volume) { player.volume = app.volume }
    LaunchedEffect(app.repeat) {
        player.repeatMode = if (app.repeat) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
    }

    LaunchedEffect(player, audioUrl) {
        while (true) {
            positionMs = player.currentPosition.coerceAtLeast(0L)
            val d = player.duration
            if (d != C.TIME_UNSET && d > 0) durationMs = d
            delay(200)
        }
    }

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val compact = maxHeight < 650.dp
        val roundHeight = if (compact) 36.dp else 46.dp
        val roundGap = if (compact) 4.dp else 7.dp
        val playSize = if (compact) 62.dp else 68.dp
        val seekSize = if (compact) 44.dp else 47.dp

        Box(Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(top = 2.dp, bottom = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                SongStatsRow(
                    release = song.releaseYear.ifBlank { "—" },
                    views = song.youtubeViews.ifBlank { "—" },
                    difficulty = song.difficulty.ifBlank { "—" }
                )

                Spacer(Modifier.height(if (compact) 5.dp else 8.dp))

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(roundGap)
                ) {
                    song.rounds.forEachIndexed { index, _ ->
                        val unlocked = if (music.finished) index <= song.revealIndex else index <= music.unlockedIndex
                        val selected = index == music.selectedIndex
                        val mark = music.results.getOrNull(index) ?: RoundMark.NONE
                        MusicRoundPill(
                            number = index + 1,
                            label = song.roundLabels.getOrElse(index) { "Faixa ${index + 1}" },
                            selected = selected,
                            unlocked = unlocked,
                            mark = mark,
                            height = roundHeight,
                            onClick = { if (unlocked) viewModel.selectMusicRound(index) }
                        )
                    }
                }

                Spacer(Modifier.height(if (compact) 3.dp else 6.dp))

                VisualizerBars(isPlaying)
                Spacer(Modifier.height(1.dp))

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(playSize + 10.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center
                    ) {
                        Box {
                            CircleControl(
                                size = 38.dp,
                                enabled = true,
                                color = p.controlBackground,
                                border = p.playBorder,
                                onClick = { volumeOpen = true }
                            ) {
                                SpeakerIcon(Color(0xFF191713))
                            }
                            DropdownMenu(
                                expanded = volumeOpen,
                                onDismissRequest = { volumeOpen = false },
                                containerColor = p.surface
                            ) {
                                Column(
                                    Modifier
                                        .width(190.dp)
                                        .padding(horizontal = 14.dp, vertical = 8.dp)
                                ) {
                                    Text(
                                        "Volume  ${(app.volume * 100).toInt()}%",
                                        color = p.text,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Black
                                    )
                                    Slider(
                                        value = app.volume,
                                        onValueChange = viewModel::setVolume,
                                        colors = SliderDefaults.colors(
                                            thumbColor = p.green,
                                            activeTrackColor = p.green,
                                            inactiveTrackColor = p.line
                                        )
                                    )
                                }
                            }
                        }

                        Spacer(Modifier.width(if (compact) 12.dp else 16.dp))

                        SeekControl(
                            size = seekSize,
                            backwards = true,
                            enabled = audioUrl != null,
                            onClick = { player.seekTo((player.currentPosition - 5_000L).coerceAtLeast(0L)) }
                        )

                        Spacer(Modifier.width(if (compact) 12.dp else 14.dp))

                        CircleControl(
                            size = playSize,
                            enabled = audioUrl != null,
                            color = p.controlBackground,
                            border = p.playBorder,
                            borderWidth = 3.dp,
                            onClick = {
                                if (player.isPlaying) player.pause() else player.play()
                            }
                        ) {
                            PlayPauseIcon(isPlaying)
                        }

                        Spacer(Modifier.width(if (compact) 12.dp else 14.dp))

                        SeekControl(
                            size = seekSize,
                            backwards = false,
                            enabled = audioUrl != null,
                            onClick = {
                                val end = if (player.duration > 0) player.duration else Long.MAX_VALUE
                                player.seekTo((player.currentPosition + 5_000L).coerceAtMost(end))
                            }
                        )

                        Spacer(Modifier.width(if (compact) 12.dp else 16.dp))

                        CircleControl(
                            size = 38.dp,
                            enabled = true,
                            color = if (app.repeat) p.green else p.controlBackground,
                            border = p.playBorder,
                            onClick = { viewModel.setRepeat(!app.repeat) }
                        ) {
                            RepeatIcon(if (app.repeat) Color.White else Color(0xFF191713))
                        }
                    }
                }

                Slider(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(18.dp),
                    value = positionMs.coerceAtMost(durationMs).toFloat(),
                    onValueChange = {
                        positionMs = it.toLong()
                        player.seekTo(positionMs)
                    },
                    valueRange = 0f..durationMs.coerceAtLeast(1L).toFloat(),
                    colors = SliderDefaults.colors(
                        thumbColor = p.green,
                        activeTrackColor = p.green,
                        inactiveTrackColor = p.line
                    )
                )

                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(formatTime(positionMs), color = p.muted, fontSize = 10.sp)
                    Text(
                        "${formatTime((durationMs - positionMs).coerceAtLeast(0L))} restantes",
                        color = p.muted,
                        fontSize = 10.sp
                    )
                }

                Spacer(Modifier.height(if (compact) 4.dp else 6.dp))

                if (!music.finished) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        SiteActionButton(
                            text = "PULAR",
                            background = p.skipBackground,
                            modifier = Modifier.weight(1f),
                            onClick = viewModel::skipMusicRound
                        )
                        SiteActionButton(
                            text = "ADIVINHAR",
                            background = p.guessBackground,
                            modifier = Modifier.weight(1f),
                            onClick = { guessOpen = true }
                        )
                    }
                }

                if (music.attempts.isNotEmpty()) {
                    Spacer(Modifier.height(6.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        music.attempts.take(5).forEach { attempt ->
                            Surface(
                                modifier = Modifier.weight(1f),
                                color = p.surface2,
                                shape = RoundedCornerShape(999.dp),
                                border = androidx.compose.foundation.BorderStroke(1.dp, p.line)
                            ) {
                                Row(
                                    Modifier.padding(horizontal = 6.dp, vertical = 5.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text("×", color = p.red, fontSize = 10.sp, fontWeight = FontWeight.Black)
                                    Spacer(Modifier.width(3.dp))
                                    Text(
                                        attempt,
                                        color = p.muted,
                                        fontSize = 8.5.sp,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }
                    }
                }

                Text(
                    music.message,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 4.dp),
                    color = if (music.won) p.green else p.muted,
                    fontSize = 10.5.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center
                )

                Spacer(Modifier.height(if (music.finished) 220.dp else 6.dp))
            }

            AnimatedVisibility(
                visible = guessOpen && !music.finished,
                modifier = Modifier.align(Alignment.BottomCenter),
                enter = slideInVertically(initialOffsetY = { it / 2 }, animationSpec = tween(180)) + fadeIn(tween(160)),
                exit = slideOutVertically(targetOffsetY = { it / 3 }, animationSpec = tween(140)) + fadeOut(tween(120))
            ) {
                GuessSheet(
                    guess = music.guess,
                    onGuess = viewModel::setMusicGuess,
                    onClose = { guessOpen = false },
                    onSubmit = {
                        viewModel.submitMusicGuess()
                        guessOpen = false
                    }
                )
            }

            AnimatedVisibility(
                visible = music.finished,
                modifier = Modifier.align(Alignment.BottomCenter),
                enter = slideInVertically(initialOffsetY = { it / 2 }, animationSpec = tween(220)) + fadeIn(tween(180)),
                exit = fadeOut(tween(120))
            ) {
                RevealSheet(
                    viewModel = viewModel,
                    openUrl = { url ->
                        if (url.isNotBlank()) {
                            runCatching {
                                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                            }
                        }
                    }
                )
            }
        }
    }
}

@Composable
private fun SongStatsRow(release: String, views: String, difficulty: String) {
    val p = LocalAppPalette.current
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        SongStat("Lançamento", release, Modifier.weight(1f))
        SongStat("Views no YouTube", views, Modifier.weight(1f))
        SongStat("Dificuldade", difficulty, Modifier.weight(1f))
    }
}

@Composable
private fun SongStat(label: String, value: String, modifier: Modifier) {
    val p = LocalAppPalette.current
    Surface(
        modifier = modifier.height(50.dp),
        color = p.surface2,
        shape = RoundedCornerShape(10.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, p.line)
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 4.dp, vertical = 5.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(1.dp, Alignment.CenterVertically)
        ) {
            Text(
                label,
                color = p.muted,
                fontSize = 8.5.sp,
                lineHeight = 10.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1
            )
            Text(
                value,
                color = p.text,
                fontSize = 12.5.sp,
                lineHeight = 14.sp,
                fontWeight = FontWeight.Black,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun MusicRoundPill(
    number: Int,
    label: String,
    selected: Boolean,
    unlocked: Boolean,
    mark: RoundMark,
    height: androidx.compose.ui.unit.Dp,
    onClick: () -> Unit
) {
    val p = LocalAppPalette.current
    val targetScale by animateFloatAsState(
        targetValue = if (selected) 1.008f else 1f,
        animationSpec = tween(150),
        label = "round-scale"
    )
    val roundColor by animateColorAsState(
        targetValue = if (selected) p.pillActive else p.pill,
        animationSpec = tween(150),
        label = "round-color"
    )
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .height(height)
            .graphicsLayer {
                scaleX = targetScale
                scaleY = targetScale
                translationY = if (selected) -1f else 0f
            }
            .alpha(if (unlocked) 1f else 0.68f)
            .clip(RoundedCornerShape(999.dp))
            .clickable(enabled = unlocked, onClick = onClick),
        color = roundColor,
        shape = RoundedCornerShape(999.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, p.line)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 15.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                number.toString(),
                color = if (selected) p.green else p.text,
                fontSize = 16.sp,
                fontWeight = FontWeight.Black,
                modifier = Modifier.width(24.dp)
            )
            Text(
                label,
                color = if (selected) p.green else p.text,
                fontSize = 16.sp,
                fontWeight = FontWeight.Black,
                modifier = Modifier.weight(1f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                when (mark) {
                    RoundMark.WRONG -> "×"
                    RoundMark.CORRECT -> "✓"
                    RoundMark.NONE -> if (selected) "♫" else ""
                },
                color = when (mark) {
                    RoundMark.WRONG -> p.red
                    RoundMark.CORRECT -> p.green
                    RoundMark.NONE -> p.green
                },
                fontSize = 20.sp,
                fontWeight = FontWeight.Black
            )
        }
    }
}

@Composable
private fun VisualizerBars(playing: Boolean) {
    val p = LocalAppPalette.current
    val transition = rememberInfiniteTransition(label = "audio-visualizer")
    val bases = listOf(3f, 7f, 5f, 9f, 4f)

    Row(
        modifier = Modifier.height(10.dp),
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(3.dp)
    ) {
        bases.forEachIndexed { index, base ->
            val animated by transition.animateFloat(
                initialValue = 0.45f,
                targetValue = 1.15f,
                animationSpec = infiniteRepeatable(
                    animation = tween(durationMillis = 300 + index * 35, delayMillis = index * 55),
                    repeatMode = RepeatMode.Reverse
                ),
                label = "bar-$index"
            )
            val factor = if (playing) animated else 0.45f
            Box(
                Modifier
                    .width(3.dp)
                    .height((base * factor).dp.coerceAtLeast(2.dp))
                    .background(p.green, RoundedCornerShape(3.dp))
            )
        }
    }
}

@Composable
private fun CircleControl(
    size: androidx.compose.ui.unit.Dp,
    enabled: Boolean,
    color: Color,
    border: Color,
    borderWidth: androidx.compose.ui.unit.Dp = 1.dp,
    onClick: () -> Unit,
    content: @Composable () -> Unit
) {
    Surface(
        modifier = Modifier
            .size(size)
            .alpha(if (enabled) 1f else 0.42f)
            .clip(CircleShape)
            .clickable(enabled = enabled, onClick = onClick),
        color = color,
        shape = CircleShape,
        border = androidx.compose.foundation.BorderStroke(borderWidth, border)
    ) {
        Box(contentAlignment = Alignment.Center) { content() }
    }
}

@Composable
private fun SeekControl(
    size: androidx.compose.ui.unit.Dp,
    backwards: Boolean,
    enabled: Boolean,
    onClick: () -> Unit
) {
    val p = LocalAppPalette.current
    CircleControl(size, enabled, p.controlBackground, Color(0xFFC7B99F), onClick = onClick) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            SeekBrowserIcon(backwards = backwards)
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    "5",
                    color = Color(0xFF191713),
                    fontSize = 9.sp,
                    lineHeight = 9.sp,
                    fontWeight = FontWeight.Black
                )
                Text(
                    "s",
                    color = Color(0xFF191713),
                    fontSize = 6.5.sp,
                    lineHeight = 8.sp,
                    fontWeight = FontWeight.Black
                )
            }
        }
    }
}

@Composable
private fun SeekBrowserIcon(backwards: Boolean) {
    val iconColor = Color(0xFF191713)
    Canvas(Modifier.size(24.dp)) {
        val sx = size.width / 32f
        val sy = size.height / 32f
        val stroke = Stroke(
            width = 2.6f * sx,
            cap = StrokeCap.Round,
            join = StrokeJoin.Round
        )

        scale(
            scaleX = if (backwards) 1f else -1f,
            scaleY = 1f,
            pivot = center
        ) {
            val corner = Path().apply {
                moveTo(9.5f * sx, 8.5f * sy)
                lineTo(4.5f * sx, 8.5f * sy)
                lineTo(4.5f * sx, 3.5f * sy)
            }
            drawPath(corner, iconColor, style = stroke)

            drawArc(
                color = iconColor,
                startAngle = 218f,
                sweepAngle = 302f,
                useCenter = false,
                topLeft = Offset(4f * sx, 5f * sy),
                size = Size(22f * sx, 22f * sy),
                style = stroke
            )
        }
    }
}

@Composable
private fun PlayPauseIcon(playing: Boolean) {
    Canvas(Modifier.size(30.dp)) {
        if (playing) {
            drawRoundRect(
                color = Color(0xFF171512),
                topLeft = Offset(size.width * 0.24f, size.height * 0.12f),
                size = Size(size.width * 0.18f, size.height * 0.76f)
            )
            drawRoundRect(
                color = Color(0xFF171512),
                topLeft = Offset(size.width * 0.58f, size.height * 0.12f),
                size = Size(size.width * 0.18f, size.height * 0.76f)
            )
        } else {
            val path = Path().apply {
                moveTo(size.width * 0.28f, size.height * 0.14f)
                lineTo(size.width * 0.82f, size.height * 0.5f)
                lineTo(size.width * 0.28f, size.height * 0.86f)
                close()
            }
            drawPath(path, Color(0xFF171512))
        }
    }
}

@Composable
private fun SpeakerIcon(color: Color) {
    Canvas(Modifier.size(22.dp)) {
        val path = Path().apply {
            moveTo(size.width * 0.08f, size.height * 0.38f)
            lineTo(size.width * 0.34f, size.height * 0.38f)
            lineTo(size.width * 0.58f, size.height * 0.18f)
            lineTo(size.width * 0.58f, size.height * 0.82f)
            lineTo(size.width * 0.34f, size.height * 0.62f)
            lineTo(size.width * 0.08f, size.height * 0.62f)
            close()
        }
        drawPath(path, color)
        drawArc(color, -50f, 100f, false, topLeft = Offset(size.width * 0.48f, size.height * 0.28f), size = Size(size.width * 0.35f, size.height * 0.44f), style = Stroke(1.8.dp.toPx()))
    }
}

@Composable
private fun RepeatIcon(color: Color) {
    Canvas(Modifier.size(21.dp)) {
        val sx = size.width / 32f
        val sy = size.height / 32f
        val stroke = Stroke(
            width = 2.7f * sx,
            cap = StrokeCap.Round,
            join = StrokeJoin.Round
        )

        val top = Path().apply {
            moveTo(8f * sx, 10f * sy)
            lineTo(23.3f * sx, 10f * sy)
            moveTo(19.2f * sx, 6.1f * sy)
            lineTo(23.6f * sx, 10f * sy)
            lineTo(19.2f * sx, 14f * sy)
        }
        drawPath(top, color, style = stroke)
        drawArc(
            color = color,
            startAngle = 180f,
            sweepAngle = 90f,
            useCenter = false,
            topLeft = Offset(1.5f * sx, 9.2f * sy),
            size = Size(13f * sx, 13f * sy),
            style = stroke
        )

        val bottom = Path().apply {
            moveTo(24f * sx, 22f * sy)
            lineTo(8.7f * sx, 22f * sy)
            moveTo(12.8f * sx, 18f * sy)
            lineTo(8.4f * sx, 22f * sy)
            lineTo(12.8f * sx, 25.9f * sy)
        }
        drawPath(bottom, color, style = stroke)
        drawArc(
            color = color,
            startAngle = 0f,
            sweepAngle = 90f,
            useCenter = false,
            topLeft = Offset(17.5f * sx, 9.8f * sy),
            size = Size(13f * sx, 13f * sy),
            style = stroke
        )
    }
}

@Composable
private fun SiteActionButton(
    text: String,
    background: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Surface(
        modifier = modifier
            .height(44.dp)
            .clip(RoundedCornerShape(13.dp))
            .clickable(onClick = onClick),
        color = background,
        shape = RoundedCornerShape(13.dp)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(text, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Black)
        }
    }
}

@Composable
private fun GuessSheet(
    guess: String,
    onGuess: (String) -> Unit,
    onClose: () -> Unit,
    onSubmit: () -> Unit,
    modifier: Modifier = Modifier
) {
    val p = LocalAppPalette.current
    val focusRequester = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current

    LaunchedEffect(Unit) {
        delay(100)
        focusRequester.requestFocus()
        keyboard?.show()
    }

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 2.dp, vertical = 8.dp),
        color = p.surface,
        shape = RoundedCornerShape(15.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, p.line),
        shadowElevation = 14.dp
    ) {
        Column(Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Spacer(Modifier.width(34.dp))
                Text(
                    "Qual é a música?",
                    modifier = Modifier.weight(1f),
                    color = p.text,
                    textAlign = TextAlign.Center,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Black
                )
                Surface(
                    modifier = Modifier
                        .size(34.dp)
                        .clip(CircleShape)
                        .clickable(onClick = onClose),
                    color = p.surface2,
                    shape = CircleShape,
                    border = androidx.compose.foundation.BorderStroke(1.dp, p.line)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text("×", color = p.text, fontSize = 22.sp)
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextField(
                    value = guess,
                    onValueChange = onGuess,
                    modifier = Modifier
                        .weight(1f)
                        .height(50.dp)
                        .focusRequester(focusRequester)
                        .border(2.dp, p.green, RoundedCornerShape(11.dp)),
                    placeholder = { Text("Digite o nome da música", fontSize = 11.sp, color = p.muted) },
                    singleLine = true,
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = p.surface2,
                        unfocusedContainerColor = p.surface2,
                        focusedTextColor = p.text,
                        unfocusedTextColor = p.text,
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent
                    ),
                    shape = RoundedCornerShape(11.dp)
                )
                Surface(
                    modifier = Modifier
                        .height(50.dp)
                        .clip(RoundedCornerShape(11.dp))
                        .clickable(onClick = onSubmit),
                    color = p.guessBackground,
                    shape = RoundedCornerShape(11.dp)
                ) {
                    Box(Modifier.padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                        Text("Enviar palpite", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Black)
                    }
                }
            }
        }
    }
}

@Composable
private fun RevealSheet(
    viewModel: GameViewModel,
    modifier: Modifier = Modifier,
    openUrl: (String) -> Unit
) {
    val music = viewModel.state.music ?: return
    val song = music.song
    val p = LocalAppPalette.current

    val links = listOf(
        Triple("YouTube", "youtube", song.youtubeUrl.ifBlank { platformSearchUrl("youtube", song.artist, song.title) }),
        Triple("Spotify", "spotify", song.spotifyUrl.ifBlank { platformSearchUrl("spotify", song.artist, song.title) }),
        Triple("Apple Music", "apple", song.appleMusicUrl.ifBlank { platformSearchUrl("apple", song.artist, song.title) }),
        Triple("Deezer", "deezer", song.deezerUrl.ifBlank { platformSearchUrl("deezer", song.artist, song.title) })
    )

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(max = 500.dp)
            .padding(horizontal = 2.dp, vertical = 8.dp),
        color = p.surface,
        shape = RoundedCornerShape(17.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, p.line),
        shadowElevation = 16.dp
    ) {
        Column(
            Modifier
                .padding(15.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                if (music.won) "VOCÊ ACERTOU!" else "NÃO FOI DESSA VEZ",
                color = if (music.won) p.green else p.red,
                fontSize = 23.sp,
                fontWeight = FontWeight.Black
            )
            Text("A música era", color = p.muted, fontSize = 10.sp, fontWeight = FontWeight.Bold)

            if (song.coverUrl.isNotBlank()) {
                Spacer(Modifier.height(9.dp))
                AsyncImage(
                    model = song.coverUrl,
                    contentDescription = "Capa de ${song.title}",
                    modifier = Modifier
                        .size(116.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .border(1.dp, p.line, RoundedCornerShape(12.dp)),
                    contentScale = ContentScale.Crop
                )
                Spacer(Modifier.height(8.dp))
            } else {
                Spacer(Modifier.height(4.dp))
            }

            Text(
                song.title,
                color = p.text,
                fontSize = 22.sp,
                fontWeight = FontWeight.Black,
                textAlign = TextAlign.Center
            )
            Text(song.artist, color = p.muted, fontSize = 12.sp, fontWeight = FontWeight.Bold)

            Spacer(Modifier.height(10.dp))
            Text(
                "OUÇA NAS PLATAFORMAS",
                color = p.muted,
                fontSize = 9.sp,
                fontWeight = FontWeight.Black
            )
            Spacer(Modifier.height(6.dp))

            links.chunked(2).forEach { pair ->
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(7.dp)
                ) {
                    pair.forEach { (name, platform, url) ->
                        Surface(
                            modifier = Modifier
                                .weight(1f)
                                .height(44.dp)
                                .clip(RoundedCornerShape(11.dp))
                                .clickable { openUrl(url) },
                            color = p.surface2,
                            shape = RoundedCornerShape(11.dp),
                            border = androidx.compose.foundation.BorderStroke(1.dp, p.line)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.Center
                            ) {
                                PlatformLogo(platform)
                                Spacer(Modifier.width(7.dp))
                                Text(
                                    name,
                                    color = p.text,
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Black,
                                    maxLines = 1
                                )
                            }
                        }
                    }
                }
                Spacer(Modifier.height(7.dp))
            }

            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(43.dp)
                    .clip(RoundedCornerShape(11.dp))
                    .clickable { viewModel.restartMusicGame() },
                color = p.guessBackground,
                shape = RoundedCornerShape(11.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        "TENTAR NOVAMENTE",
                        color = Color.White,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Black
                    )
                }
            }
        }
    }
}

@Composable
private fun PlatformLogo(platform: String) {
    when (platform) {
        "youtube" -> {
            Surface(
                modifier = Modifier.size(24.dp),
                color = Color(0xFFFF0033),
                shape = RoundedCornerShape(6.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text("▶", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Black)
                }
            }
        }
        "spotify" -> {
            Surface(
                modifier = Modifier.size(24.dp),
                color = Color(0xFF1ED760),
                shape = CircleShape
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text("≋", color = Color(0xFF111111), fontSize = 17.sp, fontWeight = FontWeight.Black)
                }
            }
        }
        "apple" -> {
            Surface(
                modifier = Modifier.size(24.dp),
                color = Color(0xFFFA466A),
                shape = RoundedCornerShape(7.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text("♪", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Black)
                }
            }
        }
        else -> {
            Surface(
                modifier = Modifier.size(24.dp),
                color = Color(0xFF8B45D6),
                shape = RoundedCornerShape(6.dp)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 4.dp, vertical = 5.dp),
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(1.dp)
                ) {
                    listOf(6, 9, 12, 8).forEach { h ->
                        Box(
                            Modifier
                                .width(2.dp)
                                .height(h.dp)
                                .background(Color.White, RoundedCornerShape(1.dp))
                        )
                    }
                }
            }
        }
    }
}

private fun platformSearchUrl(platform: String, artist: String, title: String): String {
    val query = Uri.encode(listOf(artist, title).filter { it.isNotBlank() }.joinToString(" "))
    return when (platform) {
        "youtube" -> "https://www.youtube.com/results?search_query=$query"
        "spotify" -> "https://open.spotify.com/search/$query"
        "apple" -> "https://music.apple.com/br/search?term=$query"
        else -> "https://www.deezer.com/search/$query"
    }
}

private fun formatTime(ms: Long): String {
    val total = (ms / 1000L).coerceAtLeast(0L)
    val minutes = total / 60L
    val seconds = total % 60L
    return "$minutes:${seconds.toString().padStart(2, '0')}"
}
