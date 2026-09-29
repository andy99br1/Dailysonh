package com.musicadodia.app.data

import android.os.SystemClock
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONObject
import java.text.Normalizer
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.concurrent.TimeUnit

class GameRepository {
    companion object {
        const val BASE_URL = "https://musicadodia.com/"
        private val BRASILIA_ZONE = ZoneId.of("America/Sao_Paulo")
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    @Volatile
    private var trustedEpochMs: Long? = null

    @Volatile
    private var trustedElapsedMs: Long = 0L

    private fun syncTrustedClock(response: Response): Boolean {
        val raw = response.header("Date") ?: return false
        val instant = try {
            ZonedDateTime.parse(raw, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant()
        } catch (_: Exception) {
            try {
                Instant.parse(raw)
            } catch (_: Exception) {
                return false
            }
        }

        trustedEpochMs = instant.toEpochMilli()
        trustedElapsedMs = SystemClock.elapsedRealtime()
        return true
    }

    fun officialInstant(): Instant? {
        val base = trustedEpochMs ?: return null
        val delta = SystemClock.elapsedRealtime() - trustedElapsedMs
        return Instant.ofEpochMilli(base + delta)
    }

    fun officialDate(): LocalDate? =
        officialInstant()?.atZone(BRASILIA_ZONE)?.toLocalDate()

    suspend fun fetchMusicCatalog(): List<Song> = withContext(Dispatchers.IO) {
        val body = fetchText("catalog.json", requireClock = true)
        val root = JSONObject(body)
        val arr = root.optJSONArray("songs") ?: return@withContext emptyList()
        buildList {
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                val roundsArray = obj.optJSONArray("rounds")
                val rounds = buildList {
                    if (roundsArray != null) {
                        for (j in 0 until roundsArray.length()) {
                            val value = roundsArray.optString(j).trim()
                            if (value.isNotBlank()) add(value)
                        }
                    }
                }

                if (rounds.isEmpty()) continue

                val configured = if (obj.has("challengeRounds")) {
                    obj.optInt("challengeRounds", rounds.size)
                } else {
                    rounds.size
                }.coerceIn(1, rounds.size)

                val labelsArray = obj.optJSONArray("roundLabels")
                val defaults = if (rounds.size >= 6) {
                    listOf("Bateria", "Baixo", "Instrumentos 1", "Instrumentos 2", "Melodia", "Revelação")
                } else {
                    listOf("Bateria", "Baixo", "Instrumentos", "Melodia", "Revelação")
                }
                val labels = MutableList(rounds.size) { index ->
                    labelsArray?.optString(index)?.takeIf { it.isNotBlank() }
                        ?: defaults.getOrNull(index)
                        ?: "Faixa ${index + 1}"
                }

                add(
                    Song(
                        date = obj.optString("date"),
                        title = obj.optString("title"),
                        artist = obj.optString("artist"),
                        version = obj.optInt("version", 1).coerceAtLeast(1),
                        challengeRounds = configured,
                        rounds = rounds,
                        roundLabels = labels,
                        releaseYear = obj.optString("releaseYear"),
                        youtubeViews = obj.optString("youtubeViews"),
                        difficulty = obj.optString("difficulty"),
                        coverUrl = obj.optString("coverUrl")
                    )
                )
            }
        }
    }

    suspend fun fetchTermoCatalog(): List<TermoEntry> = withContext(Dispatchers.IO) {
        val body = fetchText("termo/catalog.json", requireClock = true)
        val root = JSONObject(body)
        val arr = root.optJSONArray("words") ?: return@withContext emptyList()
        buildList {
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                val date = obj.optString("date").trim()
                val word = normalizeWord(obj.optString("word"))
                if (date.isNotBlank() && word.length == 5) {
                    add(
                        TermoEntry(
                            date = date,
                            word = word,
                            version = obj.optInt("version", 1).coerceAtLeast(1)
                        )
                    )
                }
            }
        }
    }

    suspend fun fetchTermoValidationWords(): Set<String> = withContext(Dispatchers.IO) {
        fetchText("termo/palavras-ptbr.txt", requireClock = false)
            .lineSequence()
            .map(::normalizeWord)
            .filter { it.length == 5 }
            .toSet()
    }

    suspend fun fetchTermoAutomaticWords(): List<String> = withContext(Dispatchers.IO) {
        fetchText("termo/palavras-sorteio-ptbr.txt", requireClock = false)
            .lineSequence()
            .map(::normalizeWord)
            .filter { it.length == 5 }
            .distinct()
            .toList()
    }

    fun absoluteUrl(path: String): String {
        val clean = path.trim()
        if (clean.startsWith("http://") || clean.startsWith("https://")) return clean
        return BASE_URL + clean.trimStart('/')
    }

    private fun fetchText(path: String, requireClock: Boolean): String {
        val request = Request.Builder()
            .url(absoluteUrl(path) + "?native=" + System.nanoTime())
            .header("Cache-Control", "no-cache")
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IllegalStateException("HTTP ${response.code} em $path")
            }
            val clockOk = syncTrustedClock(response)
            if (requireClock && !clockOk && trustedEpochMs == null) {
                throw IllegalStateException("Não foi possível validar a data oficial")
            }
            return response.body?.string()
                ?: throw IllegalStateException("Resposta vazia em $path")
        }
    }
}

fun normalizeWord(value: String): String =
    Normalizer.normalize(value, Normalizer.Form.NFD)
        .replace(Regex("\\p{Mn}+"), "")
        .replace(Regex("[^A-Za-z]"), "")
        .uppercase()

fun normalizeMusicTitle(value: String): String =
    Normalizer.normalize(value, Normalizer.Form.NFD)
        .replace(Regex("\\p{Mn}+"), "")
        .lowercase()
        .replace(Regex("\\([^)]*\\)|\\[[^]]*]"), " ")
        .replace(Regex("[^a-z0-9]+"), " ")
        .trim()

fun isCorrectMusicGuess(guess: String, answer: String): Boolean {
    val a = normalizeMusicTitle(guess)
    val b = normalizeMusicTitle(answer)
    if (a.isBlank() || b.isBlank()) return false
    return a == b || (b.length >= 7 && (a.contains(b) || b.contains(a)))
}
