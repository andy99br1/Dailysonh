# Música do Dia — Android

Este diretório é isolado do site publicado no GitHub Pages.

O app Android usa Capacitor e carrega diretamente:

https://musicadodia.com/

Alterações dentro de `android-app/` não fazem parte do deploy do site.

## Identidade

- App: Música do Dia
- Package ID: `com.musicadodia.app`
- Capacitor: 8.5.2
- Android: gerado no CI
- APK de teste: `musica-do-dia.apk`

O workflow `.github/workflows/android-apk.yml` gera o APK e o disponibiliza como artifact da execução.
