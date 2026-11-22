// push.js — aviso com o app FECHADO (Firebase). Só liga se o APK foi gerado com o Firebase (config-build.js diz F1_FIREBASE = true).
// Sem Firebase no APK, este arquivo não faz nada e o app continua igual (avisa só com o app aberto).
(function () {
  const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
  if (!window.F1_FIREBASE || !P) return;
  const guardar = (t) => { try { localStorage.setItem('f1chat.fcm', t); } catch (e) {} };
  const lembrado = () => { try { return localStorage.getItem('f1chat.fcm') || ''; } catch (e) { return ''; } };
  let ligado = false, tentando = false;

  async function preparar() { // roda uma vez: canal de notificação + o que fazer quando chega o "endereço" do aparelho e quando você toca no aviso
    if (ligado) return; ligado = true;
    try { await P.createChannel({ id: 'mensagens', name: 'Mensagens dos bots', description: 'Avisos de mensagens novas', importance: 4, visibility: 1, vibration: true }); } catch (e) { /* canal já existe */ }
    P.addListener('registration', async (t) => { guardar(t.value); try { await window.api.chamar('push-registrar', { token: t.value }); } catch (e) { /* servidor fora: tenta de novo na próxima vez */ } });
    P.addListener('registrationError', () => { /* sem Google Play Services ou sem internet: ignora */ });
    P.addListener('pushNotificationActionPerformed', (a) => { // tocou no aviso: abre a conversa do bot
      const botId = Number(a && a.notification && a.notification.data && a.notification.data.botId);
      if (botId && typeof window.abrirBot === 'function') setTimeout(() => { try { window.abrirBot(botId); if (window.mostrarConversaCelular) window.mostrarConversaCelular(); } catch (e) {} }, 400);
    });
  }
  // Pede permissão (Android 13+) e registra. Pode ser chamada quantas vezes quiser: o servidor só atualiza o registro.
  async function registrar() {
    if (tentando) return; tentando = true;
    try {
      const cfg = await window.api.chamar('config-ler'); if (!cfg.endereco || !(cfg.usuario || cfg.temCodigo)) return;
      await preparar();
      let perm = await P.checkPermissions(); if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await P.requestPermissions();
      if (perm.receive !== 'granted') return;
      await P.register();
    } catch (e) { /* nunca derruba o app por causa do aviso */ } finally { tentando = false; }
  }
  async function remover() { // ao sair da conta: este celular para de receber
    const t = lembrado(); if (!t) return;
    try { await window.api.chamar('push-remover', { token: t }); } catch (e) {}
    guardar('');
  }
  window.f1Push = { registrar, remover };
  window.addEventListener('load', () => setTimeout(registrar, 3000));
})();
