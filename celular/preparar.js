// preparar.js — monta a pasta www/ (o que vai dentro do app) a partir da tela do computador + os 3 arquivos de celular.
// Uso: node preparar.js     (o GitHub Actions roda isso sozinho antes de gerar o APK)
const fs = require('fs'), path = require('path');
const origem = path.join(__dirname, '..', 'chat-app', 'public'), www = path.join(__dirname, 'www'), extra = path.join(__dirname, 'extra');
fs.rmSync(www, { recursive: true, force: true }); fs.mkdirSync(www, { recursive: true });
fs.cpSync(origem, www, { recursive: true });
// config-build.js: o workflow diz se o APK tem Firebase (FIREBASE_LIGADO=1). Sem ele, o app não tenta registrar aviso (evita erro).
fs.writeFileSync(path.join(www, 'config-build.js'), 'window.F1_FIREBASE = ' + (process.env.FIREBASE_LIGADO === '1' ? 'true' : 'false') + ';\n');
for (const f of ['ponte-web.js', 'celular.js', 'celular.css', 'push.js']) fs.copyFileSync(path.join(extra, f), path.join(www, f));
let h = fs.readFileSync(path.join(www, 'index.html'), 'utf8');
const antes = h;
h = h.replace('content="width=device-width, initial-scale=1"', 'content="width=device-width, initial-scale=1, viewport-fit=cover"')
  .replace('<link rel="stylesheet" href="estilo.css">', '<link rel="stylesheet" href="estilo.css"><link rel="stylesheet" href="celular.css">')
  .replace('<script src="app.js"></script>', '<script src="config-build.js"></script><script src="ponte-web.js"></script><script src="app.js"></script><script src="celular.js"></script><script src="push.js"></script>');
// o servidor é http:// (Tailscale): a tela precisa poder falar com ele
h = h.replace("default-src 'self';", "default-src 'self'; connect-src *;");
if (h === antes || !h.includes('ponte-web.js') || !h.includes('celular.css')) throw new Error('Não achei os pontos do index.html para ajustar. Veja preparar.js.');
fs.writeFileSync(path.join(www, 'index.html'), h);
console.log('www/ pronto (' + fs.readdirSync(www).length + ' arquivos)');
