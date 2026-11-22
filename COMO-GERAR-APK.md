# Como gerar o APK do F1 Journal Chat (sem Android Studio)

Você vai usar o GitHub como "fábrica": você sobe esta pasta, ele monta o APK sozinho e você baixa. Leva uns 15 minutos na primeira vez; nas próximas é só 2 cliques.

## Parte 1 — Criar o repositório (só uma vez)
1. Entre em https://github.com e faça login (crie a conta grátis se não tiver).
2. Canto de cima, **+ > New repository**.
3. Nome: `f1-journal-chat`. Marque **Private** (privado). **Não** marque "Add a README". Clique **Create repository**.

## Parte 2 — Subir os arquivos
1. Extraia o zip `repo-apk.zip` no computador. Dentro tem: `.github`, `celular`, `chat-app`, `.gitignore`.
2. Na página do repositório novo, clique em **uploading an existing file**.
3. Arraste para lá as pastas **`celular`** e **`chat-app`** e o arquivo **`.gitignore`**. Espere carregar tudo e clique **Commit changes**.
4. **A pasta `.github` é escondida e o navegador às vezes não aceita ela.** Por isso faça assim (funciona sempre):
   - Na página do repositório: **Add file > Create new file**.
   - No campo do nome, digite exatamente: `.github/workflows/apk.yml` (ao digitar a `/` ele cria as pastas sozinho).
   - Abra o arquivo `.github/workflows/apk.yml` do zip no Bloco de Notas, copie TUDO e cole na caixa grande.
   - Clique **Commit changes**.

## Parte 3 — Gerar o APK
1. Clique na aba **Actions** do repositório. (Se aparecer um botão verde pedindo para ativar, clique.)
2. À esquerda: **Gerar APK**. À direita: **Run workflow > Run workflow**.
3. Espere uns 5 a 8 minutos. Bolinha amarela = trabalhando, verde = pronto, vermelha = deu erro.
4. Clique na execução que ficou verde. Lá embaixo, em **Artifacts**, baixe **f1-journal-chat-apk**.
5. Descompacte. Dentro tem o `app-debug.apk`.

## Parte 4 — Instalar no celular
1. Passe o `app-debug.apk` para o celular (cabo, Drive, WhatsApp para você mesmo).
2. Toque nele. O Android vai pedir para permitir "Instalar de fontes desconhecidas": permita só para esse app (Arquivos/Chrome).
3. Se o Play Protect avisar, toque em **Instalar mesmo assim** (é o seu app, sem assinatura da loja).
4. Instale o **Tailscale** no celular e entre na MESMA conta do servidor. Deixe ligado.
5. Abra o F1 Journal Chat > ☰ > **Configurações** > endereço `http://100.75.226.42:3006` > entre com seu usuário e senha (ou o código de acesso) > Salvar.

## Quando eu mudar o Chat
Sempre que sair um Chat novo, o APK precisa ser refeito: substitua no repositório a pasta `chat-app/public` (e `celular`, se eu mandar) pelos arquivos novos e rode **Run workflow** de novo. (Ele também roda sozinho quando você sobe arquivos nessas pastas.)

## Se der erro (bolinha vermelha)
Clique na execução, clique no passo que ficou vermelho e copie as últimas 30 linhas do texto. Me mande.

## Aviso com o app fechado
Depois que o APK estiver funcionando, siga o `COMO-LIGAR-AVISO-NO-CELULAR.md` (Firebase grátis).
