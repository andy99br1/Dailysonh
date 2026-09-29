# Música do Dia — Android independente

Este app **não abre a página do site pela internet**.

A interface do Música do Dia e do Termo é empacotada dentro do próprio APK usando os mesmos arquivos de interface do projeto:

- `index.html`
- `styles.css`
- `app.js`
- `logo.svg`
- `termo/index.html`
- `termo/termo.css`
- `termo/termo.js`

Por isso o visual, controles, temas, player, fases e Termo permanecem iguais aos jogos do site.

O Android apenas usa `musicadodia.com` como origem para os **dados compartilhados** que não ficam presos no APK:

- `catalog.json`
- `termo/catalog.json`
- dicionários do Termo
- áudios de `songs/`
- capas, links e configurações online

Resultado:

- a interface do app é própria e continua dentro do APK;
- o site continua independente;
- publicar música/palavra pelo painel alimenta site e app;
- mudar somente o conteúdo diário não exige novo APK;
- mudar a interface gera uma nova build do APK automaticamente;
- o app mantém armazenamento local próprio, separado do navegador.

O renderizador da interface é o WebView do Android, mas ele renderiza **arquivos locais do APK**, não a página remota do site.
