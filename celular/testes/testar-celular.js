// Testa a tela do CELULAR (ponte-web.js de verdade, sem motor/Electron) contra um servidor real em memória, num Chromium com tela de celular.
// Rodar (de dentro de celular/):  node --disable-warning=ExperimentalWarning testes/testar-celular.js
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs');
const { chromium } = require('playwright');
const { criarServidor, lerConfig } = require('../../servidor/servidor.js');
const CODIGO = 'codigo-de-teste-123';
let falhas = 0, total = 0;
async function teste(n, f) { total++; try { await f(); console.log('  ok  ' + n); } catch (e) { falhas++; console.log('FALHOU ' + n + '\n       ' + String(e.message).split('\n')[0]); } }
(async () => {
  require('../preparar.js');
  const servidor = criarServidor({ ...lerConfig({}), caminhoBanco: ':memory:', codigoAcesso: CODIGO, botsDoSistema: false, manutencaoMs: 0, lixeiraVerificaMs: 0, pastaBackups: require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'f1bkp-')), pastaAtualizacoes: require('os').tmpdir() });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const nav = await chromium.launch({ args: ['--disable-web-security', '--allow-file-access-from-files'] });
  const ctx = await nav.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
  const pag = await ctx.newPage(); const erros = [];
  pag.on('pageerror', (e) => erros.push(e.message)); pag.on('console', (c) => { if (c.type() === 'error' && !/Failed to load resource/.test(c.text())) erros.push(c.text()); });
  await pag.goto('file://' + path.resolve(__dirname, '../www/index.html'));
  const pasta = path.join(__dirname, 'capturas'); fs.mkdirSync(pasta, { recursive: true });
  await teste('sem configuração: avisa que o servidor não está configurado', async () => { await pag.waitForSelector('#alerta:not([hidden])'); });
  await teste('salvar endereço + código e conectar', async () => {
    await pag.evaluate(async ([b, c]) => { await window.api.chamar('config-salvar', { endereco: b, codigo: c }); }, [base, CODIGO]);
    await pag.waitForSelector('#status.on', { timeout: 9000 }); if (await pag.isVisible('#modalFechar')) await pag.tap('#modalFechar');
  });
  await teste('criar bot, listar, abrir conversa (uma tela por vez) e voltar', async () => {
    await pag.evaluate(() => window.api.chamar('bot-criar', { nome: 'Entrega' }));
    await pag.waitForSelector('#lista li:not(.vazio-lista)', { timeout: 9000 });
    assert.ok(await pag.isVisible('#lado')); assert.ok(!(await pag.isVisible('#principal')));
    await pag.tap('#lista li:not(.vazio-lista)'); await pag.waitForSelector('#conversa:not([hidden])');
    assert.ok(await pag.isVisible('#principal')); assert.ok(!(await pag.isVisible('#lado')));
    await pag.screenshot({ path: path.join(pasta, 'conversa-celular.png') });
    await pag.tap('#voltar'); await pag.waitForSelector('#lado', { state: 'visible' });
  });
  await teste('enviar mensagem e ver ✓ na conversa', async () => {
    await pag.tap('#lista li:not(.vazio-lista)'); await pag.waitForSelector('#texto'); await pag.fill('#texto', 'oi celular'); await pag.keyboard.press('Enter');
    await pag.waitForSelector('.msg:has-text("oi celular")', { timeout: 9000 });
  });
  await teste('post do n8n aparece e "Usar" copia a legenda', async () => {
    const bot = (await (await fetch(base + '/studio/bots', { headers: { 'x-access-code': CODIGO } })).json()).bots[0];
    const r = await fetch(base + '/bot/posts', { method: 'POST', headers: { 'x-bot-key': bot.chave, 'Content-Type': 'application/json' }, body: JSON.stringify({ fotoBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', legenda: 'Legenda de teste' }) });
    assert.equal(r.status, 200);
    await pag.waitForSelector('.msg.post', { timeout: 9000 }); await pag.tap('.msg.post button:has-text("Usar")'); await pag.waitForSelector('.toast:has-text("legenda copiada")');
  });
  await teste('layout sem rolagem horizontal', async () => { assert.ok(await pag.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)); });
  await teste('nenhum erro de JavaScript', async () => { assert.deepEqual(erros, [], erros.join(' | ')); });
  // ---------- aviso com o app fechado (Firebase): usa um "plugin" de mentira no lugar do Capacitor ----------
  await teste('push: sem Firebase no APK (padrão) o app não tenta registrar nada', async () => { assert.equal(await pag.evaluate(() => window.F1_FIREBASE === false && !window.f1Push), true); });
  await teste('push: com Firebase no APK pede permissão, registra o aparelho no servidor, abre o bot ao tocar no aviso e remove ao sair', async () => {
    require('child_process').execFileSync('node', [path.resolve(__dirname, '../preparar.js')], { env: { ...process.env, FIREBASE_LIGADO: '1' }, stdio: 'ignore' });
    const p2 = await ctx.newPage(); const erros2 = []; p2.on('pageerror', (e) => erros2.push(e.message));
    await p2.addInitScript(() => { const ouvintes = {}; window.__push = { chamadas: [], ouvintes };
      window.Capacitor = { Plugins: { PushNotifications: { createChannel: async (c) => { window.__push.chamadas.push('canal:' + c.id); }, checkPermissions: async () => ({ receive: 'prompt' }),
        requestPermissions: async () => { window.__push.chamadas.push('pediu-permissao'); return { receive: 'granted' }; },
        register: async () => { window.__push.chamadas.push('register'); setTimeout(() => (ouvintes.registration || []).forEach((f) => f({ value: 'token-fcm-de-teste-1234567890abcdef' })), 20); },
        addListener: (nome, f) => { (ouvintes[nome] = ouvintes[nome] || []).push(f); return { remove() {} }; } } } }; });
    await p2.goto('file://' + path.resolve(__dirname, '../www/index.html'));
    await p2.evaluate(async ([b, c]) => { await window.api.chamar('config-salvar', { endereco: b, codigo: c }); }, [base, CODIGO]); // salvar a config dispara o registro
    await p2.waitForFunction(() => window.__push.chamadas.includes('register'), null, { timeout: 8000 });
    assert.deepEqual(await p2.evaluate(() => window.__push.chamadas.slice(0, 3)), ['canal:mensagens', 'pediu-permissao', 'register']);
    for (let i = 0; i < 40; i++) { const s = await (await fetch(base + '/studio/saude', { headers: { 'x-access-code': CODIGO } })).json(); if (s.celular.aparelhos === 1) break; await new Promise((r) => setTimeout(r, 100)); }
    assert.equal((await (await fetch(base + '/studio/saude', { headers: { 'x-access-code': CODIGO } })).json()).celular.aparelhos, 1, 'servidor recebeu o aparelho');
    const bot = (await (await fetch(base + '/studio/bots', { headers: { 'x-access-code': CODIGO } })).json()).bots[0]; await p2.waitForSelector('#lista li:not(.vazio-lista)', { timeout: 9000 });
    await p2.evaluate((id) => window.__push.ouvintes.pushNotificationActionPerformed.forEach((f) => f({ notification: { data: { botId: String(id) } } })), bot.id); // tocou no aviso
    await p2.waitForSelector('#conversa:not([hidden])', { timeout: 6000 });
    await p2.evaluate(() => window.f1Push.remover()); // sair da conta
    assert.equal((await (await fetch(base + '/studio/saude', { headers: { 'x-access-code': CODIGO } })).json()).celular.aparelhos, 0, 'servidor removeu o aparelho');
    assert.deepEqual(erros2, [], erros2.join(' | ')); await p2.close();
    require('child_process').execFileSync('node', [path.resolve(__dirname, '../preparar.js')], { stdio: 'ignore' }); // deixa o www limpo (sem Firebase)
  });
  console.log('\n' + total + ' testes. FALHAS: ' + falhas); await nav.close(); servidor.close(); process.exit(falhas ? 1 : 0);
})();
