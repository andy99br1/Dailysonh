package com.musicadodia.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.musicadodia.app.GameViewModel

enum class AppDestination {
    HOME,
    MUSIC,
    TERMO
}

@Composable
fun MusicaDoDiaApp(viewModel: GameViewModel) {
    val app = viewModel.state
    val p = LocalAppPalette.current
    var destination by remember { mutableStateOf(AppDestination.HOME) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(p.background)
            .siteTexture()
            .statusBarsPadding()
            .navigationBarsPadding()
    ) {
        when {
            app.loading && app.music == null -> {
                Column(
                    modifier = Modifier.align(Alignment.Center),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    CircularProgressIndicator(color = p.green)
                    Text("Carregando desafios...", color = p.muted, fontSize = 12.sp)
                }
            }

            app.error.isNotBlank() && app.music == null -> {
                Column(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .padding(28.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        "Não foi possível abrir o jogo",
                        color = p.text,
                        fontWeight = FontWeight.Black,
                        fontSize = 20.sp
                    )
                    Text(
                        app.error,
                        color = p.muted,
                        textAlign = TextAlign.Center,
                        fontSize = 12.sp
                    )
                    Button(onClick = viewModel::refresh) {
                        Text("Tentar novamente")
                    }
                }
            }

            destination == AppDestination.HOME -> {
                NativeHomeScreen(
                    onMusic = { destination = AppDestination.MUSIC },
                    onTermo = { destination = AppDestination.TERMO }
                )
            }

            else -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .widthInSite()
                        .padding(horizontal = 10.dp, vertical = 6.dp)
                ) {
                    NativeGameTopBar(
                        destination = destination,
                        challengeNumber = when (destination) {
                            AppDestination.MUSIC -> app.music?.challengeNumber ?: 0
                            AppDestination.TERMO -> app.termo?.challengeNumber ?: 0
                            else -> 0
                        },
                        themeKey = app.themeKey,
                        onTheme = viewModel::setTheme,
                        onHome = { destination = AppDestination.HOME },
                        onMusic = { destination = AppDestination.MUSIC },
                        onTermo = { destination = AppDestination.TERMO }
                    )

                    when (destination) {
                        AppDestination.MUSIC -> MusicScreen(viewModel)
                        AppDestination.TERMO -> TermoScreen(viewModel)
                        AppDestination.HOME -> Unit
                    }
                }
            }
        }
    }
}

private fun Modifier.widthInSite(): Modifier =
    this.widthIn(max = 600.dp).fillMaxWidth()

private fun Modifier.siteTexture(): Modifier = this.drawBehind {
    val dot = Color.White.copy(alpha = 0.025f)
    val spacing = 17.dp.toPx()
    val radius = 0.9.dp.toPx()
    var y = 1.dp.toPx()
    while (y < size.height) {
        var x = 1.dp.toPx()
        while (x < size.width) {
            drawCircle(dot, radius, Offset(x, y))
            x += spacing
        }
        y += spacing
    }
}

@Composable
private fun NativeHomeScreen(
    onMusic: () -> Unit,
    onTermo: () -> Unit
) {
    val p = LocalAppPalette.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .widthInSite()
            .padding(horizontal = 18.dp, vertical = 22.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(Modifier.weight(1f))

        MusicLogo(64.dp)

        Spacer(Modifier.height(13.dp))

        Text(
            "Música do Dia",
            color = p.text,
            fontSize = 28.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = (-0.5f).sp
        )
        Text(
            "Escolha um jogo",
            color = p.muted,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 5.dp, bottom = 28.dp)
        )

        HomeGameCard(
            title = "Música do Dia",
            subtitle = "Descubra a música por camadas",
            leading = { MusicLogo(48.dp) },
            onClick = onMusic
        )

        Spacer(Modifier.height(12.dp))

        HomeGameCard(
            title = "Termo do Dia",
            subtitle = "Descubra a palavra de 5 letras",
            leading = { TermoMark(48.dp) },
            onClick = onTermo
        )

        Spacer(Modifier.weight(1f))

        Text(
            "Um novo desafio todos os dias",
            color = p.muted.copy(alpha = 0.78f),
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun HomeGameCard(
    title: String,
    subtitle: String,
    leading: @Composable () -> Unit,
    onClick: () -> Unit
) {
    val p = LocalAppPalette.current
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .clickable(onClick = onClick),
        color = p.surface2,
        shape = RoundedCornerShape(16.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, p.line)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 15.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            leading()
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(title, color = p.text, fontSize = 18.sp, fontWeight = FontWeight.Black)
                Text(
                    subtitle,
                    color = p.muted,
                    fontSize = 10.5.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(top = 3.dp)
                )
            }
            Text("›", color = p.muted, fontSize = 32.sp, fontWeight = FontWeight.Light)
        }
    }
}

@Composable
fun NativeGameTopBar(
    destination: AppDestination,
    challengeNumber: Int,
    themeKey: String,
    onTheme: (String) -> Unit,
    onHome: () -> Unit,
    onMusic: () -> Unit,
    onTermo: () -> Unit
) {
    val p = LocalAppPalette.current
    var themeOpen by remember { mutableStateOf(false) }
    var gameOpen by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box {
            Surface(
                modifier = Modifier
                    .size(40.dp)
                    .clickable { themeOpen = true },
                color = p.surface2,
                shape = CircleShape,
                border = androidx.compose.foundation.BorderStroke(1.dp, p.line)
            ) {
                PaletteIcon()
            }

            DropdownMenu(
                expanded = themeOpen,
                onDismissRequest = { themeOpen = false },
                containerColor = p.surface
            ) {
                AppThemeChoices.forEach { (key, label) ->
                    val swatch = paletteFor(key)
                    DropdownMenuItem(
                        text = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    Modifier
                                        .size(18.dp)
                                        .background(swatch.background, CircleShape)
                                )
                                Spacer(Modifier.width(10.dp))
                                Text(
                                    label,
                                    color = p.text,
                                    fontWeight = if (themeKey == key) FontWeight.Black else FontWeight.Bold
                                )
                            }
                        },
                        onClick = {
                            onTheme(key)
                            themeOpen = false
                        }
                    )
                }
            }
        }

        Box(
            modifier = Modifier.weight(1f),
            contentAlignment = Alignment.Center
        ) {
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .clickable { gameOpen = true }
                    .padding(horizontal = 6.dp, vertical = 3.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                if (destination == AppDestination.TERMO) TermoMark(39.dp) else MusicLogo(39.dp)
                Spacer(Modifier.width(7.dp))
                Text(
                    if (destination == AppDestination.TERMO) "Termo do Dia" else "Música do Dia",
                    color = p.text,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = (-0.5).sp
                )
                Spacer(Modifier.width(4.dp))
                Text("⌄", color = p.muted, fontSize = 16.sp, fontWeight = FontWeight.Black)
            }

            DropdownMenu(
                expanded = gameOpen,
                onDismissRequest = { gameOpen = false },
                containerColor = p.surface
            ) {
                DropdownMenuItem(
                    text = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            MusicLogo(30.dp)
                            Spacer(Modifier.width(9.dp))
                            Text("Música do Dia", color = p.text, fontWeight = FontWeight.Black)
                        }
                    },
                    onClick = {
                        onMusic()
                        gameOpen = false
                    }
                )
                DropdownMenuItem(
                    text = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            TermoMark(30.dp)
                            Spacer(Modifier.width(9.dp))
                            Text("Termo do Dia", color = p.text, fontWeight = FontWeight.Black)
                        }
                    },
                    onClick = {
                        onTermo()
                        gameOpen = false
                    }
                )
                DropdownMenuItem(
                    text = {
                        Text("Voltar ao início", color = p.muted, fontWeight = FontWeight.Bold)
                    },
                    onClick = {
                        onHome()
                        gameOpen = false
                    }
                )
            }
        }

        Surface(
            modifier = Modifier.size(40.dp),
            color = p.surface2,
            shape = CircleShape,
            border = androidx.compose.foundation.BorderStroke(1.dp, p.line)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text(
                    if (challengeNumber > 0) "#$challengeNumber" else "#—",
                    color = p.text,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Black
                )
            }
        }
    }
}

@Composable
private fun PaletteIcon() {
    val p = LocalAppPalette.current
    Box(contentAlignment = Alignment.Center) {
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                Box(Modifier.size(7.dp).background(p.peach, CircleShape))
                Box(Modifier.size(7.dp).background(p.green, CircleShape))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                Box(Modifier.size(7.dp).background(p.guessBackground, CircleShape))
                Box(Modifier.size(7.dp).background(p.red, CircleShape))
            }
        }
    }
}

@Composable
fun MusicLogo(size: androidx.compose.ui.unit.Dp) {
    Canvas(modifier = Modifier.size(size)) {
        val scale = this.size.width / 64f
        drawCircle(Color(0xFF1D1A16), radius = 28.5f * scale, center = center)
        val widths = 6f * scale
        val xs = listOf(11f, 20f, 29f, 38f, 47f)
        val tops = listOf(26f, 20f, 15f, 20f, 26f)
        val heights = listOf(12f, 24f, 34f, 24f, 12f)
        xs.indices.forEach { i ->
            drawRoundRect(
                color = if (i == 2) Color(0xFFE9AD6E) else Color(0xFFFFFAF2),
                topLeft = Offset(xs[i] * scale, tops[i] * scale),
                size = androidx.compose.ui.geometry.Size(widths, heights[i] * scale),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(3f * scale, 3f * scale)
            )
        }
    }
}

@Composable
fun TermoMark(size: androidx.compose.ui.unit.Dp) {
    val p = LocalAppPalette.current
    Surface(
        modifier = Modifier.size(size),
        color = p.green,
        shape = RoundedCornerShape(size * 0.22f)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                "T",
                color = Color.White,
                fontWeight = FontWeight.Black,
                fontSize = (size.value * 0.52f).sp
            )
        }
    }
}
