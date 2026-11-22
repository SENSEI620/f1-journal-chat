# F1 Journal Chat — Celular (Android)

A tela é **a mesma do computador** (`../chat-app/public`). O que muda é só a "ponte" (`extra/ponte-web.js`), que no lugar do Electron fala direto com o servidor do Chat. Quando você mexer na tela do PC, o app do celular recebe a mudança no próximo build.

## Novidade da v0.4
**Aviso com o app fechado** (Firebase). Só liga no APK se existir o segredo `GOOGLE_SERVICES_JSON` no GitHub (guia: `COMO-LIGAR-AVISO-NO-CELULAR.md`). Sem o segredo o APK funciona igual à v0.3.

## O que já funciona (v0.3)
Tudo da v0.1 mais: Lixeira (☰), mensagens rápidas, sons, painel de saúde (admin), login por usuário e senha, novo visual de Configurações.

## Versão antiga (v0.1)
Lista de bots, conversa, enviar texto e foto, Post (Usar = copia a legenda e abre a imagem), apagar, comandos, key do bot, estalo do Thanos, histórico local offline, fila com relógio, tema claro/escuro. Uma tela por vez (lista → conversa), botão Voltar do Android funciona.

## Ainda não tem (de propósito, fica pra próxima)
- Baixar todas as imagens / exportar histórico / pasta de saída (coisas de PC).
- Login por usuário e senha (futuro, vale pro PC e pro celular).

## Como gerar o APK (sem Android Studio)
1. Suba o projeto inteiro (`chat-app`, `servidor`, `celular`...) para um repositório no GitHub.
2. Copie `celular/github-workflow-apk.yml` para `.github/workflows/apk.yml` do repositório.
3. No GitHub: **Actions → Gerar APK → Run workflow** (também roda sozinho a cada push em `celular/` ou `chat-app/public/`).
4. Quando terminar (uns 5–8 min), baixe o **f1-journal-chat-apk** em *Artifacts*, descompacte e instale o `app-debug.apk` no celular (permitir "fontes desconhecidas").
5. Abra o app → ☰ → Configurações → endereço `http://100.75.226.42:3006` + código de acesso. **O celular precisa ter o Tailscale instalado e ligado**, na mesma conta.

## Testar no computador (sem celular)
```
cd celular
node preparar.js              # monta a pasta www/
node testes/testar-celular.js # teste automático com tela de celular
```
(abra `www/index.html` no navegador com a segurança de CORS desligada se quiser ver na mão).

## Pastas
- `extra/ponte-web.js` — substitui motor.js + main.js (config, chamadas ao servidor, rotas iguais).
- `extra/celular.js` / `celular.css` — navegação uma-tela-por-vez e esconde o que é só de PC (`.so-pc`).
- `preparar.js` — copia a tela do PC + extras para `www/` e ajusta o index.html.
- `capacitor.config.json` — `CapacitorHttp` ligado (deixa o app falar com `http://` do Tailscale sem bloqueio).
