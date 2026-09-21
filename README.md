# Dailysonh

Jogo musical diário por camadas de instrumentos.

## Fluxo atual: upload de áudio

1. Abra a pasta `incoming/` no repositório.
2. Use **Add file → Upload files** e envie MP3, WAV, M4A, FLAC, OGG ou AAC.
3. Vá em **Actions → Process uploaded audio → Run workflow**.
4. Você pode deixar `audio_path` vazio para usar automaticamente o áudio mais recente em `incoming/`.
5. `title`, `artist` e `date` são opcionais. Se título/artista ficarem vazios, o script tenta ler as tags do arquivo e depois o nome no formato `Artista - Música.ext`.
6. O GitHub escolhe aproximadamente 18 segundos, separa stems com Demucs, transforma a melodia vocal em notas sintetizadas, gera cinco rodadas e publica o jogo.
7. Ao final, o áudio original é removido da branch principal e ficam apenas os pequenos arquivos das rodadas.

## Rodadas

1. Bateria
2. Bateria + baixo
3. Bateria + baixo + outros instrumentos
4. Instrumentos + melodia vocal sintetizada
5. Trecho completo / revelação

## GitHub Pages

Em **Settings → Pages**, use **GitHub Actions** como Source. Depois do processamento bem-sucedido, o workflow de deploy roda automaticamente.

## Observação

Use somente áudio para o qual você tenha os direitos ou autorização adequada. O repositório não inclui músicas comerciais por padrão.
