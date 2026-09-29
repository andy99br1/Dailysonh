package com.musicadodia.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Graphite = Color(0xFF202428)
val Surface = Color(0xFF292F34)
val Surface2 = Color(0xFF343B42)
val TextPrimary = Color(0xFFF3F4F5)
val TextMuted = Color(0xFFA7ADB3)
val Accent = Color(0xFF8A9AA8)
val Success = Color(0xFF5F9E65)
val ErrorRed = Color(0xFFC86D72)
val TermoYellow = Color(0xFFC39B0B)

private val AppColors = darkColorScheme(
    primary = Accent,
    onPrimary = Color.White,
    secondary = Color(0xFF7F9DA7),
    background = Graphite,
    onBackground = TextPrimary,
    surface = Surface,
    onSurface = TextPrimary,
    surfaceVariant = Surface2,
    onSurfaceVariant = TextMuted,
    error = ErrorRed
)

@Composable
fun MusicaDoDiaTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = AppColors,
        content = content
    )
}
