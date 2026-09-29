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
    val finished: Boolean = false,
    val won: Boolean = false,
    val guess: String = "",
    val message: String = "Ouça a primeira faixa e tente descobrir a música."
)

data class TermoUiState(
    val date: String,
    val targetWord: String,
    val challengeNumber: Int,
    val guesses: List<TermoGuess> = emptyList(),
    val input: String = "",
    val finished: Boolean = false,
    val won: Boolean = false,
    val message: String = "Digite uma palavra de 5 letras."
)

data class AppUiState(
    val loading: Boolean = true,
    val error: String = "",
    val officialDate: String = "",
    val music: MusicUiState? = null,
    val termo: TermoUiState? = null,
    val volume: Float = 1f,
    val repeat: Boolean = false
)

class GameViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = GameRepository()
    private val prefs = application.getSharedPreferences("musicadodia_native", 0)

    var state by mutableStateOf(
        AppUiState(
            volume = prefs.getFloat("player_volume", 1f).coerceIn(0f, 1f),
            repeat = prefs.getBoolean("player_repeat", false)
        )
    )
        private set

    private var termoCatalog: List<TermoEntry> = emptyList()
    private var automaticWords: List<String> = emptyList()
    private var validWords: Set<String> = emptySet()

    init {
        viewModelScope.launch {
            loadAll()
        }
        viewModelScope.launch {
            while (true) {
                delay(1000)
                val current = repository.officialDate()?.toString()
                if (!current.isNullOrBlank() && state.officialDate.isNotBlank() && current != state.officialDate) {
                    loadAll()
                }
            }
        }
    }

    fun refresh() {
        viewModelScope.launch { loadAll() }
    }

    private suspend fun loadAll() {
        val oldVolume = state.volume
        val oldRepeat = state.repeat
        state = state.copy(loading = true, error = "")

        try {
            val songs = repository.fetchMusicCatalog().sortedBy { it.date }
            termoCatalog = repository.fetchTermoCatalog().sortedBy { it.date }
            automaticWords = repository.fetchTermoAutomaticWords()
            validWords = repository.fetchTermoValidationWords()

            val date = repository.officialDate()
                ?: throw IllegalStateException("Não foi possível validar a data oficial")
            val today = date.toString()

            val eligibleSongs = songs.filter { it.date <= today }
            val activeSong = eligibleSongs.lastOrNull()
                ?: throw IllegalStateException("Ainda não há música liberada para hoje")
            val musicNumber = songs.indexOfFirst { it.date == activeSong.date }.let { if (it >= 0) it + 1 else 1 }

            val target = termoForDate(today)
                ?: throw IllegalStateException("Não foi possível escolher a palavra de hoje")
            val termoNumber = termoChallengeNumber(today, target)

            state = AppUiState(
                loading = false,
                officialDate = today,
                music = restoreMusic(activeSong, musicNumber),
                termo = restoreTermo(today, target, termoNumber),
                volume = oldVolume,
                repeat = oldRepeat
            )
        } catch (e: Exception) {
            state = state.copy(
                loading = false,
                error = e.message ?: "Não foi possível carregar os desafios."
            )
        }
    }

    fun musicAudioUrl(): String? {
        val music = state.music ?: return null
        val path = music.song.rounds.getOrNull(music.selectedIndex) ?: return null
        return repository.absoluteUrl(path)
    }

    fun setMusicGuess(value: String) {
        val music = state.music ?: return
        if (music.finished) return
        state = state.copy(music = music.copy(guess = value.take(80)))
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
        if (currentRound + 1 >= music.song.challengeRounds) {
            val updated = music.copy(
                unlockedIndex = music.song.revealIndex,
                selectedIndex = music.song.revealIndex,
                results = results,
                finished = true,
                won = false,
                guess = "",
                message = "Não foi dessa vez."
            )
            state = state.copy(music = updated)
            saveMusic(updated)
        } else {
            val next = currentRound + 1
            val updated = music.copy(
                unlockedIndex = next,
                selectedIndex = next,
                results = results,
                guess = "",
                message = "Não foi dessa vez. Uma nova camada foi liberada."
            )
            state = state.copy(music = updated)
            saveMusic(updated)
        }
    }

    fun skipMusicRound() {
        val music = state.music ?: return
        if (music.finished) return
        val currentRound = music.unlockedIndex.coerceIn(0, music.song.challengeRounds - 1)
        val results = music.results.toMutableList()
        results[currentRound] = RoundMark.WRONG

        val updated = if (currentRound + 1 >= music.song.challengeRounds) {
            music.copy(
                unlockedIndex = music.song.revealIndex,
                selectedIndex = music.song.revealIndex,
                results = results,
                finished = true,
                won = false,
                guess = "",
                message = "Fim das tentativas."
            )
        } else {
            val next = currentRound + 1
            music.copy(
                unlockedIndex = next,
                selectedIndex = next,
                results = results,
                guess = "",
                message = "Rodada pulada."
            )
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

    fun setTermoInput(value: String) {
        val termo = state.termo ?: return
        if (termo.finished) return
        val clean = normalizeWord(value).take(5)
        state = state.copy(termo = termo.copy(input = clean))
    }

    fun submitTermo() {
        val termo = state.termo ?: return
        if (termo.finished) return
        val guess = normalizeWord(termo.input)

        if (guess.length != 5) {
            state = state.copy(termo = termo.copy(message = "Preencha as 5 letras."))
            return
        }

        if (guess != termo.targetWord && guess !in validWords) {
            state = state.copy(termo = termo.copy(message = "Essa palavra não existe em português."))
            return
        }

        val marks = evaluateTermo(guess, termo.targetWord)
        val guesses = termo.guesses + TermoGuess(guess, marks)
        val won = guess == termo.targetWord
        val finished = won || guesses.size >= 6

        val updated = termo.copy(
            guesses = guesses,
            input = "",
            finished = finished,
            won = won,
            message = when {
                won -> "Boa! Palavra descoberta."
                finished -> "Não foi dessa vez."
                else -> "Tente outra palavra."
            }
        )
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
        val index = Math.floorMod(serial, pool.size.toLong()).toInt()
        return pool[index]
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
            if (guess[i] == answer[i]) {
                result[i] = LetterMark.CORRECT
            } else {
                remaining[answer[i]] = (remaining[answer[i]] ?: 0) + 1
            }
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
        val blank = MusicUiState(
            song = song,
            challengeNumber = challengeNumber,
            results = List(song.challengeRounds) { RoundMark.NONE }
        )
        val raw = prefs.getString(musicKey(song), null) ?: return blank

        return try {
            val obj = JSONObject(raw)
            val resultsArray = obj.optJSONArray("results") ?: JSONArray()
            val results = MutableList(song.challengeRounds) { RoundMark.NONE }
            for (i in 0 until minOf(results.size, resultsArray.length())) {
                results[i] = runCatching { RoundMark.valueOf(resultsArray.optString(i)) }
                    .getOrDefault(RoundMark.NONE)
            }
            val finished = obj.optBoolean("finished", false)
            val unlocked = obj.optInt("unlockedIndex", 0).coerceIn(0, song.revealIndex)
            val selected = obj.optInt("selectedIndex", unlocked)
                .coerceIn(0, if (finished) song.revealIndex else unlocked)
            blank.copy(
                unlockedIndex = unlocked,
                selectedIndex = selected,
                results = results,
                finished = finished,
                won = obj.optBoolean("won", false),
                message = if (finished) "Desafio concluído." else blank.message
            )
        } catch (_: Exception) {
            blank
        }
    }

    private fun saveMusic(music: MusicUiState) {
        val obj = JSONObject()
            .put("unlockedIndex", music.unlockedIndex)
            .put("selectedIndex", music.selectedIndex)
            .put("finished", music.finished)
            .put("won", music.won)
            .put("results", JSONArray(music.results.map { it.name }))
        prefs.edit().putString(musicKey(music.song), obj.toString()).apply()
    }

    private fun termoKey(date: String) = "termo:$date"

    private fun restoreTermo(date: String, target: String, challengeNumber: Int): TermoUiState {
        val blank = TermoUiState(
            date = date,
            targetWord = target,
            challengeNumber = challengeNumber
        )
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
            blank.copy(
                guesses = guesses.take(6),
                finished = finished,
                won = won,
                message = if (finished) "Desafio concluído." else blank.message
            )
        } catch (_: Exception) {
            blank
        }
    }

    private fun saveTermo(termo: TermoUiState) {
        val obj = JSONObject()
            .put("finished", termo.finished)
            .put("won", termo.won)
            .put("guesses", JSONArray(termo.guesses.map { it.word }))
        prefs.edit().putString(termoKey(termo.date), obj.toString()).apply()
    }
}
