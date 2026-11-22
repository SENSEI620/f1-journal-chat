# Ligar o aviso no celular com o app FECHADO (Firebase, grátis)

O celular só recebe aviso com o app fechado se o Google "empurrar" a notificação. Para isso você cria um projeto grátis no Firebase (o plano gratuito "Spark" basta, não pede cartão). Faça **depois** de instalar o servidor 0.7.0 e **antes** de gerar o APK final. Leva uns 15 minutos.

## Parte 1 — Criar o projeto no Firebase
1. Entre em https://console.firebase.google.com com sua conta Google.
2. **Criar um projeto** (ou "Adicionar projeto"). Nome: `f1-journal-chat`. Continue.
3. Pergunta do Google Analytics: **desative** (não precisa). Clique em **Criar projeto** e espere.

## Parte 2 — Registrar o app Android (gera o `google-services.json`)
1. Na tela inicial do projeto, clique no ícone do **Android** (robozinho).
2. **Nome do pacote Android:** `com.f1journalnews.chat` (exatamente assim). Apelido: `Chat`. Clique **Registrar app**.
3. Clique em **Baixar google-services.json** e guarde o arquivo. Pode clicar em "Próxima/Continuar" até sair do assistente (não precisa fazer o resto, é com a gente).

## Parte 3 — Chave para o SERVIDOR mandar os avisos (`firebase.json`)
1. No Firebase: engrenagem (⚙) ao lado de "Visão geral do projeto" > **Configurações do projeto** > aba **Contas de serviço**.
2. Clique em **Gerar nova chave privada** > **Gerar chave**. Baixa um arquivo `.json`.
3. Renomeie esse arquivo para **`firebase.json`**.
4. Coloque no servidor, na pasta `dados` (a mesma do `chat.sqlite`):
   `scp firebase.json sense1_bot@100.75.226.42:~/f1-chat-server/dados/`
5. Reinicie: `cd ~/f1-chat-server && docker compose restart`
6. **Guarde esse arquivo como um segredo** (é a "senha" do projeto): não mande para ninguém nem suba no GitHub.

## Parte 4 — Dar o `google-services.json` ao GitHub (para o APK sair com aviso)
1. No repositório do GitHub: **Settings > Secrets and variables > Actions > New repository secret**.
2. **Name:** `GOOGLE_SERVICES_JSON` (exatamente).
3. **Secret:** abra o `google-services.json` no Bloco de Notas, copie **tudo** e cole. **Add secret.**
4. **Actions > Gerar APK > Run workflow.** No log do passo "Firebase e ajustes do Android" deve aparecer **"Firebase LIGADO neste APK"**.
5. Baixe e instale o APK novo (por cima do antigo).

## Parte 5 — Testar
1. No celular: abra o app, entre com sua conta. O Android pergunta **"Permitir notificações?"** → **Permitir**.
2. No Chat do computador (administrador): ☰ > **Saúde do servidor** > cartão **Aviso no celular**. Tem que mostrar **Ligado** e **Celulares registrados: 1**.
3. Feche o app no celular (deslize para fechar) e toque em **Enviar aviso de teste**. A notificação tem que aparecer.
4. Mande uma mensagem de um bot (pelo n8n ou pelo Studio) e veja chegar. Tocar no aviso abre a conversa do bot.

## Quem recebe o quê
- Administrador: avisos de todos os bots (incluindo Alertas do servidor e Erros do n8n).
- Funcionário: só dos bots que você liberou para ele. Quem sai da conta no app deixa de receber naquele celular.
- Mensagens que você mesmo manda não avisam.

## Privacidade
O texto da mensagem passa pelos servidores do Google para chegar no celular. Se não quiser isso, no `docker-compose.yml` (em `environment:`) coloque `CELULAR_PREVIA: "0"`: o aviso só diz "Nova mensagem" e o nome do bot.

## Se não chegar
- No Chat: ☰ > Saúde > Aviso no celular mostra o motivo (arquivo faltando, erro do Google...).
- Celular com economia de bateria agressiva (Xiaomi, Samsung, Motorola): Configurações > Apps > F1 Journal Chat > Bateria > **Sem restrições**.
- O celular precisa de internet comum (não precisa do Tailscale para **receber**; para **abrir** as mensagens o Tailscale precisa estar ligado).
- Se o log do servidor mostrar erro `PERMISSION_DENIED`: no Google Cloud (console.cloud.google.com, mesmo projeto) ative a API **Firebase Cloud Messaging API**.
