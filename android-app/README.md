# Música do Dia — aplicativo Android nativo

O aplicativo Android é um projeto independente do site.

## Tecnologia

- Kotlin
- Jetpack Compose
- AndroidX Media3 / ExoPlayer
- OkHttp
- SharedPreferences para progresso e preferências
- Package ID: `com.musicadodia.app`

**Não existe WebView na interface atual.** As telas do Música do Dia, Termo, seletor de jogos, player, teclado, resultados e temas são componentes Android nativos em Compose.

## Relação com o site

O visual do app é recriado nativamente para acompanhar a identidade do site, mas os dois códigos de interface são independentes.

O que é compartilhado são os dados publicados pelo projeto:

- `https://musicadodia.com/catalog.json`
- `https://musicadodia.com/termo/catalog.json`
- listas de palavras do Termo
- áudios em `/songs/`
- capas e links de plataformas

Assim, publicar uma música ou palavra pelo painel continua alimentando site e app sem exigir uma nova versão do APK.

Alterações de interface do app ficam em `android-app/` e não alteram o GitHub Pages.

## Arquitetura de telas

O app tem navegação própria, começando por um seletor entre:

- Música do Dia
- Termo do Dia

Novas áreas podem ser adicionadas sem depender do site, por exemplo uma futura página de compras/loja, conta, notificações ou recursos exclusivos do aplicativo.

## Data diária

A data usada para liberar os desafios é validada pelo cabeçalho HTTP `Date` do servidor e avançada pelo relógio monotônico do Android, evitando que simplesmente adiantar a data do celular libere jogos futuros.

O workflow `.github/workflows/android-apk.yml` gera o APK nativo de teste.
