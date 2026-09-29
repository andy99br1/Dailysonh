package com.musicadodia.app

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.musicadodia.app.data.GameRepository
import com.musicadodia.app.data.LetterMark
import com.musicadodia.app.data.RoundMark
import com.musicadodia.app.data.Song
import com.musicadodia.app.data.TermoEntry
import com.musicadodia.app.data.TermoGuess
import com.musicadodia.app.data.isCorrectMusicGuess
import com.musicadodia.app.data.normalizeWord
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import kotlin.math.max

data class MusicUiState(
    val song: Song,
    val challengeNumber: Int,
    val unlockedIndex: Int = 0,
    val selectedIndex: Int = 0,
    val results: List<RoundMark>,
    val attempts: List<String> = emptyList(),
    val finished: Boolean = false,
    val won: Boolean = false,
    val guess: String = "",
    val message: String = "Ouça a primeira faixa e tente descobrir a música."
)

data class TermoStats(
    val played: Int = 0,
    val wins: Int = 0,
    val streak: Int = 0,
    val best: Int = 0
) {
    val winRate: Int get() = if (played == 0) 0 else ((wins.toDouble() / played.toDouble()) * 100.0).toInt()
}

data class TermoUiState(
    val date: String,
    val targetWord: String,
    val challengeNumber: Int,
    val guesses: List<TermoGuess> = emptyList(),
    val input: String = "",
    val cursorIndex: Int = 0,
    val finished: Boolean = false,
    val won: Boolean = false,
    val message: String = "Digite uma palavra de 5 letras.",
    val stats: TermoStats = TermoStats()
)

data class AppUiState(
    val loading: Boolean = true,
    val error: String = "",
    val officialDate: String = "",
    val music: MusicUiState? = null,
    val termo: TermoUiState? = null,
    val volume: Float = 1f,
    val repeat: Boolean = false,
    val themeKey: String = "grafite"
)

class GameViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = GameRepository()
    private val prefs = application.getSharedPreferences("musicadodia_native", 0)

    var state by mutableStateOf(
        AppUiState(
            volume = prefs.getFloat("player_volume", 1f).coerceIn(0f, 1f),
            repeat = prefs.getBoolean("player_repeat", false),
            themeKey = prefs.getString("theme_key", "grafite") ?: "grafite"
        )
    )
        private set

    private var termoCatalog: List<TermoEntry> = emptyList()
    private var automaticWords: List<String> = emptyList()
    private var validWords: Set<String> = emptySet()

    init {
        viewModelScope.launch { loadAll() }
        viewModelScope.launch {
            while (true) {
                delay(1000)
                val current = repository.officialDate()?.toString()
                if (!current.isNullOrBlank() && state.officialDate.isNotBlank() && current != state.officialDate) loadAll()
            }
        }
    }

    fun refresh() { viewModelScope.launch { loadAll() } }

    private suspend fun loadAll() {
        val oldVolume = state.volume
        val oldRepeat = state.repeat
        val oldTheme = state.themeKey
        state = state.copy(loading = true, error = "")
        try {
            val songs = repository.fetchMusicCatalog().sortedBy { it.date }
            termoCatalog = repository.fetchTermoCatalog().sortedBy { it.date }
            automaticWords = repository.fetchTermoAutomaticWords()
            validWords = repository.fetchTermoValidationWords()
            val date = repository.officialDate() ?: throw IllegalStateException("Não foi possível validar a data oficial")
            val today = date.toString()
            val eligibleSongs = songs.filter { it.date <= today }
            val activeSong = eligibleSongs.lastOrNull() ?: throw IllegalStateException("Ainda não há música liberada para hoje")
            val musicNumber = songs.indexOfFirst { it.date == activeSong.date }.let { if (it >= 0) it + 1 else 1 }
            val target = termoForDate(today) ?: throw IllegalStateException("Não foi possível escolher a palavra de hoje")
            val termoNumber = termoChallengeNumber(today, target)

            state = AppUiState(
                loading = false,
                officialDate = today,
                music = restoreMusic(activeSong, musicNumber),
                termo = restoreTermo(today, target, termoNumber),
                volume = oldVolume,
                repeat = oldRepeat,
                themeKey = oldTheme
            )
        } catch (e: Exception) {
            state = state.copy(loading = false, error = e.message ?: "Não foi possível carregar os desafios.")
        }
    }

    fun musicAudioUrl(): String? {
        val music = state.music ?: return null
        val path = music.song.rounds.getOrNull(music.selectedIndex) ?: return null
        return repository.absoluteUrl(path)
    }

    fun setTheme(key: String) {
        val allowed = setOf("creme", "azul", "verde", "rosa", "lilas", "noite", "grafite")
        val value = if (key in allowed) key else "grafite"
        prefs.edit().putString("theme_key", value).apply()
        state = state.copy(themeKey = value)
    }

    fun setMusicGuess(value: String) {
        val music = state.music ?: return
        if (!music.finished) state = state.copy(music = music.copy(guess = value.take(80)))
    }

    fun submitMusicGuess() {
        val music = state.music ?: return
        if (music.finished) return
        val guess = music.guess.trim()
        if (guess.isBlank()) {
            state = state.copy(music = music.copy(message = "Digite o nome da música."))
            return
        }
        val currentRound = music.unlockedIndex.coerceIn(0, music.song.challengeRounds - 1)
        val results = music.results.toMutableList()

        if (isCorrectMusicGuess(guess, music.song.title)) {
            results[currentRound] = RoundMark.CORRECT
            val updated = music.copy(
                unlockedIndex = music.song.revealIndex,
                selectedIndex = music.song.revealIndex,
                results = results,
                finished = true,
                won = true,
                guess = "",
                message = "Acertou!"
            )
            state = state.copy(music = updated)
            saveMusic(updated)
            return
        }

        results[currentRound] = RoundMark.WRONG
        val newAttempts = music.attempts + guess
        val updated = if (currentRound + 1 >= music.song.challengeRounds) {
            music.copy(unlockedIndex = music.song.revealIndex, selectedIndex = music.song.revealIndex, results = results, attempts = newAttempts, finished = true, won = false, guess = "", message = "Não foi dessa vez.")
        } else {
            val next = currentRound + 1
            music.copy(unlockedIndex = next, selectedIndex = next, results = results, attempts = newAttempts, guess = "", message = "Não foi dessa vez. Uma nova camada foi liberada.")
        }
        state = state.copy(music = updated)
        saveMusic(updated)
    }

    fun skipMusicRound() {
        val music = state.music ?: return
        if (music.finished) return
        val currentRound = music.unlockedIndex.coerceIn(0, music.song.challengeRounds - 1)
        val results = music.results.toMutableList()
        results[currentRound] = RoundMark.WRONG
        val newAttempts = music.attempts + "Pulou"
        val updated = if (currentRound + 1 >= music.song.challengeRounds) {
            music.copy(unlockedIndex = music.song.revealIndex, selectedIndex = music.song.revealIndex, results = results, attempts = newAttempts, finished = true, won = false, guess = "", message = "Fim das tentativas.")
        } else {
            val next = currentRound + 1
            music.copy(unlockedIndex = next, selectedIndex = next, results = results, attempts = newAttempts, guess = "", message = "Rodada pulada.")
        }
        state = state.copy(music = updated)
        saveMusic(updated)
    }

    fun selectMusicRound(index: Int) {
        val music = state.music ?: return
        val maxUnlocked = if (music.finished) music.song.revealIndex else music.unlockedIndex
        if (index !in 0..maxUnlocked || index !in music.song.rounds.indices) return
        val updated = music.copy(selectedIndex = index)
        state = state.copy(music = updated)
        saveMusic(updated)
    }

    fun setVolume(value: Float) {
        val v = value.coerceIn(0f, 1f)
        prefs.edit().putFloat("player_volume", v).apply()
        state = state.copy(volume = v)
    }

    fun setRepeat(enabled: Boolean) {
        prefs.edit().putBoolean("player_repeat", enabled).apply()
        state = state.copy(repeat = enabled)
    }

    fun restartMusicGame() {
        val music = state.music ?: return
        prefs.edit().remove(musicKey(music.song)).apply()

        state = state.copy(
            music = MusicUiState(
                song = music.song,
                challengeNumber = music.challengeNumber,
                results = List(music.song.challengeRounds) { RoundMark.NONE },
                message = "Jogo reiniciado. Ouça a primeira faixa e tente novamente."
            )
        )
    }

    fun setTermoInput(value: String) {
        val termo = state.termo ?: return
        if (termo.finished) return
        val clean = normalizeWord(value).take(5)
        state = state.copy(
            termo = termo.copy(
                input = clean,
                cursorIndex = clean.length.coerceIn(0, 4)
            )
        )
    }

    fun setTermoCursor(index: Int) {
        val termo = state.termo ?: return
        if (termo.finished) return
        state = state.copy(termo = termo.copy(cursorIndex = index.coerceIn(0, 4)))
    }

    fun appendTermoLetter(letter: Char) {
        val termo = state.termo ?: return
        if (termo.finished) return

        val slots = termo.input.padEnd(5, ' ').take(5).toCharArray()
        val index = termo.cursorIndex.coerceIn(0, 4)
        slots[index] = letter.uppercaseChar()

        val next = (index + 1).coerceAtMost(4)
        state = state.copy(
            termo = termo.copy(
                input = String(slots).trimEnd(),
                cursorIndex = next,
                message = "Digite uma palavra de 5 letras."
            )
        )
    }

    fun backspaceTermo() {
        val termo = state.termo ?: return
        if (termo.finished) return

        val slots = termo.input.padEnd(5, ' ').take(5).toCharArray()
        var index = termo.cursorIndex.coerceIn(0, 4)

        if (slots[index] == ' ' && index > 0) index -= 1
        slots[index] = ' '

        state = state.copy(
            termo = termo.copy(
                input = String(slots).trimEnd(),
                cursorIndex = index,
                message = "Digite uma palavra de 5 letras."
            )
        )
    }

    fun submitTermo() {
        val termo = state.termo ?: return
        if (termo.finished) return
        val rawGuess = termo.input.padEnd(5, ' ').take(5)
        if (rawGuess.any { it !in 'A'..'Z' }) {
            state = state.copy(termo = termo.copy(message = "Preencha as 5 letras."))
            return
        }
        val guess = rawGuess
        if (guess != termo.targetWord && guess !in validWords) {
            state = state.copy(termo = termo.copy(message = "Essa palavra não existe em português."))
            return
        }
        val marks = evaluateTermo(guess, termo.targetWord)
        val guesses = termo.guesses + TermoGuess(guess, marks)
        val won = guess == termo.targetWord
        val finished = won || guesses.size >= 6
        var updated = termo.copy(
            guesses = guesses,
            input = "",
            cursorIndex = 0,
            finished = finished,
            won = won,
            message = when {
                won -> "Boa! Palavra descoberta."
                finished -> "Não foi dessa vez."
                else -> "Tente outra palavra."
            }
        )
        if (finished) updated = updated.copy(stats = updateTermoStatsIfNeeded(updated))
        state = state.copy(termo = updated)
        saveTermo(updated)
    }

    private fun termoForDate(date: String): String? {
        val manual = termoCatalog.firstOrNull { it.date == date }
        if (manual != null) return normalizeWord(manual.word)
        val used = termoCatalog.map { normalizeWord(it.word) }.filter { it.length == 5 }.toSet()
        var pool = automaticWords.filterNot { it in used }
        if (pool.isEmpty()) pool = automaticWords
        if (pool.isEmpty()) return null
        pool = pool.sortedWith { a, b ->
            val ah = fnv1a32("mdd-termo|$a")
            val bh = fnv1a32("mdd-termo|$b")
            if (ah == bh) a.compareTo(b) else java.lang.Long.compareUnsigned(ah, bh)
        }
        val serial = LocalDate.parse(date).toEpochDay()
        return pool[Math.floorMod(serial, pool.size.toLong()).toInt()]
    }

    private fun termoChallengeNumber(date: String, target: String): Int {
        val manualIndex = termoCatalog.indexOfFirst { it.date == date && normalizeWord(it.word) == target }
        if (manualIndex >= 0) return manualIndex + 1
        val previous = termoCatalog.filter { it.date < date }.sortedBy { it.date }
        if (previous.isEmpty()) return 1
        val last = previous.last()
        val lastIndex = termoCatalog.indexOf(last) + 1
        val delta = max(1L, LocalDate.parse(date).toEpochDay() - LocalDate.parse(last.date).toEpochDay())
        return lastIndex + delta.toInt()
    }

    private fun fnv1a32(value: String): Long {
        var hash = 0x811C9DC5L
        value.forEach { ch ->
            hash = hash xor ch.code.toLong()
            hash = (hash * 0x01000193L) and 0xffffffffL
        }
        return hash
    }

    private fun evaluateTermo(guess: String, answer: String): List<LetterMark> {
        val result = MutableList(5) { LetterMark.ABSENT }
        val remaining = mutableMapOf<Char, Int>()
        for (i in 0 until 5) {
            if (guess[i] == answer[i]) result[i] = LetterMark.CORRECT
            else remaining[answer[i]] = (remaining[answer[i]] ?: 0) + 1
        }
        for (i in 0 until 5) {
            if (result[i] == LetterMark.CORRECT) continue
            val count = remaining[guess[i]] ?: 0
            if (count > 0) {
                result[i] = LetterMark.PRESENT
                remaining[guess[i]] = count - 1
            }
        }
        return result
    }

    private fun musicKey(song: Song) = "music:${song.date}:v${song.version}"

    private fun restoreMusic(song: Song, challengeNumber: Int): MusicUiState {
        val blank = MusicUiState(song = song, challengeNumber = challengeNumber, results = List(song.challengeRounds) { RoundMark.NONE })
        val raw = prefs.getString(musicKey(song), null) ?: return blank
        return try {
            val obj = JSONObject(raw)
            val resultsArray = obj.optJSONArray("results") ?: JSONArray()
            val results = MutableList(song.challengeRounds) { RoundMark.NONE }
            for (i in 0 until minOf(results.size, resultsArray.length())) results[i] = runCatching { RoundMark.valueOf(resultsArray.optString(i)) }.getOrDefault(RoundMark.NONE)
            val attemptsArray = obj.optJSONArray("attempts") ?: JSONArray()
            val attempts = buildList { for (i in 0 until attemptsArray.length()) add(attemptsArray.optString(i)) }
            val finished = obj.optBoolean("finished", false)
            val unlocked = obj.optInt("unlockedIndex", 0).coerceIn(0, song.revealIndex)
            val selected = obj.optInt("selectedIndex", unlocked).coerceIn(0, if (finished) song.revealIndex else unlocked)
            blank.copy(unlockedIndex = unlocked, selectedIndex = selected, results = results, attempts = attempts, finished = finished, won = obj.optBoolean("won", false), message = if (finished) "Desafio concluído." else blank.message)
        } catch (_: Exception) { blank }
    }

    private fun saveMusic(music: MusicUiState) {
        val obj = JSONObject()
            .put("unlockedIndex", music.unlockedIndex)
            .put("selectedIndex", music.selectedIndex)
            .put("finished", music.finished)
            .put("won", music.won)
            .put("results", JSONArray(music.results.map { it.name }))
            .put("attempts", JSONArray(music.attempts))
        prefs.edit().putString(musicKey(music.song), obj.toString()).apply()
    }

    private fun termoKey(date: String) = "termo:$date"

    private fun restoreTermo(date: String, target: String, challengeNumber: Int): TermoUiState {
        val blank = TermoUiState(date = date, targetWord = target, challengeNumber = challengeNumber, stats = readTermoStats())
        val raw = prefs.getString(termoKey(date), null) ?: return blank
        return try {
            val obj = JSONObject(raw)
            val arr = obj.optJSONArray("guesses") ?: JSONArray()
            val guesses = buildList {
                for (i in 0 until arr.length()) {
                    val word = normalizeWord(arr.optString(i))
                    if (word.length == 5) add(TermoGuess(word, evaluateTermo(word, target)))
                }
            }
            val won = guesses.any { it.word == target }
            val finished = won || guesses.size >= 6 || obj.optBoolean("finished", false)
            blank.copy(guesses = guesses.take(6), finished = finished, won = won, message = if (finished) "Desafio concluído." else blank.message, stats = readTermoStats())
        } catch (_: Exception) { blank }
    }

    private fun saveTermo(termo: TermoUiState) {
        val previous = prefs.getString(termoKey(termo.date), null)
        val counted = try { previous?.let { JSONObject(it).optBoolean("counted", false) } ?: false } catch (_: Exception) { false }
        val obj = JSONObject()
            .put("finished", termo.finished)
            .put("won", termo.won)
            .put("guesses", JSONArray(termo.guesses.map { it.word }))
            .put("counted", counted || termo.finished)
        prefs.edit().putString(termoKey(termo.date), obj.toString()).apply()
    }

    private fun updateTermoStatsIfNeeded(termo: TermoUiState): TermoStats {
        val previous = prefs.getString(termoKey(termo.date), null)
        val alreadyCounted = try { previous?.let { JSONObject(it).optBoolean("counted", false) } ?: false } catch (_: Exception) { false }
        if (alreadyCounted) return readTermoStats()
        val current = readTermoStats()
        val best = if (termo.won) {
            if (current.best == 0) termo.guesses.size else minOf(current.best, termo.guesses.size)
        } else current.best
        val updated = current.copy(
            played = current.played + 1,
            wins = current.wins + if (termo.won) 1 else 0,
            streak = if (termo.won) current.streak + 1 else 0,
            best = best
        )
        writeTermoStats(updated)
        return updated
    }

    private fun readTermoStats(): TermoStats {
        val raw = prefs.getString("termo_stats", null) ?: return TermoStats()
        return try {
            val obj = JSONObject(raw)
            TermoStats(obj.optInt("played", 0), obj.optInt("wins", 0), obj.optInt("streak", 0), obj.optInt("best", 0))
        } catch (_: Exception) { TermoStats() }
    }

    private fun writeTermoStats(stats: TermoStats) {
        val obj = JSONObject().put("played", stats.played).put("wins", stats.wins).put("streak", stats.streak).put("best", stats.best)
        prefs.edit().putString("termo_stats", obj.toString()).apply()
    }
}
