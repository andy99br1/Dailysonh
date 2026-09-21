# Dailysonh

Jogo musical diário inspirado em jogos de adivinhação por camadas de instrumentos.

## Como funciona

1. Abra **Actions → Process daily song → Run workflow**.
2. Cole uma URL do YouTube de uma música que você tem autorização para processar.
3. O workflow baixa o áudio, escolhe automaticamente um trecho de aproximadamente 18 segundos, separa bateria/baixo/vocal/outros com Demucs, extrai a melodia do vocal, sintetiza essa melodia como notas e gera as rodadas.
4. Os arquivos finais são adicionados ao catálogo e o GitHub Pages publica o jogo.

## Rodadas

- 1: bateria
- 2: bateria + baixo
- 3: bateria + baixo + outros instrumentos
- 4: instrumentos + melodia vocal sintetizada
- 5: trecho completo para revelação

## Publicação

Ative **Settings → Pages → Source → GitHub Actions** uma única vez. O workflow `pages.yml` cuida do deploy a cada atualização do catálogo.

## Observação sobre conteúdo

Use apenas conteúdo para o qual você tenha os direitos ou autorização adequada. O projeto não inclui músicas comerciais; ele apenas contém o código de processamento.
