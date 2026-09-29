package com.musicadodia.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.viewmodel.compose.viewModel
import com.musicadodia.app.ui.MusicaDoDiaApp
import com.musicadodia.app.ui.MusicaDoDiaTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            val gameViewModel: GameViewModel = viewModel()
            MusicaDoDiaTheme(themeKey = gameViewModel.state.themeKey) {
                MusicaDoDiaApp(gameViewModel)
            }
        }
    }
}
