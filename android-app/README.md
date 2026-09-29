# Música do Dia — Android nativo

Aplicativo Android nativo e separado do site, feito em Kotlin + Jetpack Compose.

O app **não abre o site em um WebView**. Ele busca os mesmos dados publicados pelo projeto:

- `https://musicadodia.com/catalog.json`
- `https://musicadodia.com/termo/catalog.json`
- áudios em `/songs/AAAA-MM-DD/`
- listas do Termo em `/termo/`

Assim, o painel continua publicando uma vez e o conteúdo alimenta tanto o site quanto o app.

A pasta `android-app/` não faz parte do workflow do GitHub Pages e não interfere no site.

## Identidade

- Nome: Música do Dia
- Package: `com.musicadodia.app`
- UI: Jetpack Compose
- Áudio: AndroidX Media3 / ExoPlayer
- Relógio diário: cabeçalho HTTP `Date` do servidor + relógio monotônico do Android

O workflow `.github/workflows/android-apk.yml` gera o APK de teste.
