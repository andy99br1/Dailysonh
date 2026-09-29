package com.musicadodia.app.data

data class Song(
    val date: String,
    val title: String,
    val artist: String,
    val version: Int,
    val challengeRounds: Int,
    val rounds: List<String>,
    val roundLabels: List<String>,
    val releaseYear: String,
    val youtubeViews: String,
    val difficulty: String,
    val coverUrl: String,
    val youtubeUrl: String,
    val spotifyUrl: String,
    val appleMusicUrl: String,
    val deezerUrl: String
) {
    val revealIndex: Int
        get() = if (challengeRounds < rounds.size) challengeRounds else (rounds.size - 1).coerceAtLeast(0)
}

data class TermoEntry(
    val date: String,
    val word: String,
    val version: Int
)

enum class RoundMark {
    NONE,
    WRONG,
    CORRECT
}

enum class LetterMark {
    EMPTY,
    ABSENT,
    PRESENT,
    CORRECT
}

data class TermoGuess(
    val word: String,
    val marks: List<LetterMark>
)
