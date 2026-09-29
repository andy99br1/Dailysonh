package com.musicadodia.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

@Immutable
data class AppPaletteColors(
    val key: String,
    val background: Color,
    val surface: Color,
    val surface2: Color,
    val peach: Color,
    val pill: Color,
    val pillActive: Color,
    val text: Color,
    val muted: Color,
    val line: Color,
    val green: Color,
    val red: Color,
    val playBorder: Color,
    val controlBackground: Color,
    val skipBackground: Color,
    val guessBackground: Color,
    val isDark: Boolean
)

private val palettes = listOf(
    AppPaletteColors("creme", Color(0xFFF5EFE4), Color(0xFFFFFAF2), Color(0xFFFFFAF2), Color(0xFFE9AD6E), Color(0xFFF7DDA8), Color(0xFFFFFDF8), Color(0xFF1D1A16), Color(0xFF6F675C), Color(0xFFCBB99A), Color(0xFF3F9A54), Color(0xFFC94E42), Color(0xFF756147), Color.White, Color(0xFF5F6D8C), Color(0xFF1494D0), false),
    AppPaletteColors("azul", Color(0xFFEEF5FB), Color(0xFFF9FCFF), Color(0xFFF9FCFF), Color(0xFF9EC8EA), Color(0xFFD7EAFB), Color.White, Color(0xFF14243A), Color(0xFF5D7188), Color(0xFFAAC4DA), Color(0xFF2D83BD), Color(0xFFC95555), Color(0xFF47708F), Color.White, Color(0xFF687B9B), Color(0xFF1E8FD0), false),
    AppPaletteColors("verde", Color(0xFFEEF4EC), Color(0xFFFBFDF9), Color(0xFFFBFDF9), Color(0xFFA8C99B), Color(0xFFDBE9D4), Color.White, Color(0xFF1F2A20), Color(0xFF627064), Color(0xFFAFC2AA), Color(0xFF4F8D57), Color(0xFFBF5750), Color(0xFF55715A), Color.White, Color(0xFF6E7F78), Color(0xFF4F9F69), false),
    AppPaletteColors("rosa", Color(0xFFFBF0F2), Color(0xFFFFFAFB), Color(0xFFFFFAFB), Color(0xFFE7AAB6), Color(0xFFF3D7DD), Color.White, Color(0xFF342026), Color(0xFF80646C), Color(0xFFD6B3BC), Color(0xFFBB637B), Color(0xFFBF4C59), Color(0xFF8A6470), Color.White, Color(0xFF816F80), Color(0xFFD06F88), false),
    AppPaletteColors("lilas", Color(0xFFF3EFFA), Color(0xFFFCFAFF), Color(0xFFFCFAFF), Color(0xFFB9A6DF), Color(0xFFE1D8F3), Color.White, Color(0xFF29223A), Color(0xFF716780), Color(0xFFC7BADE), Color(0xFF8066B8), Color(0xFFBD5568), Color(0xFF6D6182), Color.White, Color(0xFF736D8F), Color(0xFF8A6DC8), false),
    AppPaletteColors("noite", Color(0xFF071632), Color(0xFF0C2148), Color(0xFF0C2148), Color(0xFF193864), Color(0xFF142D56), Color(0xFF1B3B6B), Color(0xFFF5F7FF), Color(0xFFB6C1D7), Color(0xFF34476A), Color(0xFF6DCA82), Color(0xFFFF766D), Color(0xFFEFE3CF), Color(0xFFF9F6EF), Color(0xFF2C4068), Color(0xFF168BC6), true),
    AppPaletteColors("grafite", Color(0xFF202428), Color(0xFF202428), Color(0xFF181C20), Color(0xFF2B3035), Color(0xFF171B1F), Color(0xFF242A2F), Color(0xFFF7F7F7), Color(0xFFA7ADB3), Color(0xFF343A40), Color(0xFF538D4E), Color(0xFFD3625B), Color(0xFF5A626A), Color(0xFFF4F4F4), Color(0xFF31383F), Color(0xFF538D4E), true)
)

fun paletteFor(key: String): AppPaletteColors =
    palettes.firstOrNull { it.key == key } ?: palettes.last()

val LocalAppPalette = staticCompositionLocalOf { paletteFor("grafite") }

val AppThemeChoices: List<Pair<String, String>> = listOf(
    "creme" to "Creme",
    "azul" to "Azul",
    "verde" to "Verde",
    "rosa" to "Rosa",
    "lilas" to "Lilás",
    "noite" to "Noite",
    "grafite" to "Grafite"
)

@Composable
fun MusicaDoDiaTheme(
    themeKey: String = "grafite",
    content: @Composable () -> Unit
) {
    val p = paletteFor(themeKey)
    val scheme = if (p.isDark) {
        darkColorScheme(
            primary = p.green,
            onPrimary = Color.White,
            background = p.background,
            onBackground = p.text,
            surface = p.surface,
            onSurface = p.text,
            surfaceVariant = p.surface2,
            onSurfaceVariant = p.muted,
            error = p.red
        )
    } else {
        lightColorScheme(
            primary = p.green,
            onPrimary = Color.White,
            background = p.background,
            onBackground = p.text,
            surface = p.surface,
            onSurface = p.text,
            surfaceVariant = p.surface2,
            onSurfaceVariant = p.muted,
            error = p.red
        )
    }

    androidx.compose.runtime.CompositionLocalProvider(LocalAppPalette provides p) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
