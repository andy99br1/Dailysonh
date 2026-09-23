# MP3 → MIDI experimental lab

Este diretório é isolado do site e do MIDI Studio atual.

## O que ele faz

1. Recebe um MP3/WAV/M4A/FLAC/OGG/AAC em `mp3-midi-test/incoming/`.
2. Separa o áudio com Demucs em `vocals`, `bass`, `drums` e `other`.
3. Transcreve:
   - voz/melodia com pYIN após a separação;
   - baixo com pYIN em registro grave;
   - harmonia/outros com Basic Pitch;
   - bateria por detecção de ataques no stem de bateria.
4. Gera `multitrack.mid` e MIDIs individuais.
5. Renderiza `preview.mp3` com SoundFont GM para ouvir rapidamente.
6. Entrega tudo apenas como Artifact do GitHub Actions.

## Isolamento

Este teste NÃO:
- altera `catalog.json`;
- altera `midi-lab/`;
- publica música;
- modifica os áudios do jogo;
- entra no deploy do GitHub Pages;
- escreve resultados na branch.

O resultado existe somente no Artifact da execução por 7 dias.

## Teste

Faça upload de um áudio em `mp3-midi-test/incoming/`. O workflow **MP3 to MIDI experiment** roda automaticamente.

Também pode usar **Run workflow** e informar o caminho do arquivo.

Comece com `htdemucs`. Depois podemos comparar com `htdemucs_ft`, que tende a separar melhor mas é bem mais lento.
