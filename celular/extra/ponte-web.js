// ponte-web.js — no celular NÃO existe Electron/Node. Este arquivo faz o papel do motor.js + main.js:
// cria window.api.chamar(...) com os MESMOS nomes de rotas que a tela já usa e fala direto com o servidor do Chat.
// A tela (app.js) é a mesma do computador — só este arquivo muda. Config e fotos de perfil ficam no localStorage do app.
(function () {
  const TEMPO = 8000, TEMPO_FOTO = 30000;
  const lerLS = (k, p) => { try { return JSON.parse(localStorage.getItem(k)) ?? p; } catch (e) { return p; } };
  const gravarLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const PADRAO = { endereco: '', codigo: '', token: '', usuario: null, notificarWindows: true, somNotificacao: true, segundoPlano: true, iniciarComWindows: false, autoApagarDias: 0, abrirPastaAoUsar: true, pastaSaida: '', silenciados: [] };
  const cfg = () => ({ ...PADRAO, ...lerLS('f1chat.cfg', {}) });
  const normalizar = (u) => { u = String(u || '').trim(); if (!u) return ''; if (!/^https?:\/\//i.test(u)) u = 'http://' + u; return u.replace(/\/+$/, ''); };
  const id = encodeURIComponent;

  function traduzirErro(msg, status) {
    msg = String(msg || '');
    if (status === 401) return msg && /sessão|usuário ou senha/i.test(msg) ? msg : 'Código de acesso incorreto (401). Confira em Configurações.';
    if (status === 403) return msg || 'Você não tem permissão para isso (403).';
    if (status === 429) return msg || 'Muitas tentativas. Espere alguns minutos.';
    if (status === 404) return 'Não encontrado (404).';
    if (status === 409) return msg || 'Já existe (409).';
    if (/timeout|aborted|TimeoutError/i.test(msg)) return 'O servidor demorou para responder. Confira se o Tailscale/servidor está ligado.';
    if (/fetch|network|failed|load failed|ECONN|ENOTFOUND|EHOST|ENET/i.test(msg)) return 'Não consegui conectar ao servidor. Confira o endereço e se o Tailscale/servidor está ligado.';
    return msg || 'Erro desconhecido.';
  }
  async function servidor(caminho, { metodo = 'GET', corpo, endereco, codigo, tempoMs } = {}) {
    const c = cfg(), base = normalizar(endereco || c.endereco);
    if (!base) throw new Error('Servidor não configurado. Abra Configurações e coloque o endereço.');
    const cod = codigo !== undefined ? String(codigo).trim() : c.codigo;
    const usaToken = codigo === undefined && !!c.token; // logado com usuário/senha: manda o crachá; senão o código de acesso
    const cab = {}; if (usaToken) cab['Authorization'] = 'Bearer ' + c.token; else if (cod) cab['x-access-code'] = cod; if (corpo !== undefined) cab['Content-Type'] = 'application/json';
    let r;
    try { r = await fetch(base + caminho, { method: metodo, headers: cab, body: corpo !== undefined ? JSON.stringify(corpo) : undefined, signal: AbortSignal.timeout(tempoMs || TEMPO) }); }
    catch (e) { throw new Error(traduzirErro(e.message + ' ' + e.name)); }
    const texto = await r.text(); let json = {}; try { json = texto ? JSON.parse(texto) : {}; } catch (e) { json = {}; }
    if (!r.ok) {
      if (r.status === 401 && usaToken) { const c2 = cfg(); c2.token = ''; c2.usuario = null; gravarLS('f1chat.cfg', c2); } // crachá vencido: sai sozinho
      const e = new Error(traduzirErro(json.erro, r.status)); e.status = r.status; throw e; }
    return json;
  }
  const publica = () => { const c = cfg(); return { endereco: c.endereco, temCodigo: !!c.codigo, usuario: c.usuario || null, notificarWindows: c.notificarWindows !== false, somNotificacao: c.somNotificacao !== false, segundoPlano: true, iniciarComWindows: false, autoApagarDias: Number(c.autoApagarDias) || 0, abrirPastaAoUsar: true, pastaSaida: '', pastaSaidaAtual: 'Galeria/Downloads do celular', silenciados: (c.silenciados || []).map(String) }; };
  const copiar = async (t) => { try { await navigator.clipboard.writeText(String(t || '')); return true; } catch (e) { const a = document.createElement('textarea'); a.value = String(t || ''); document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch (x) {} a.remove(); return true; } };
  const NAO = (txt) => () => { throw new Error(txt); };

  const rotas = {
    entrar: async (d) => { if (d.endereco !== undefined) { const c = cfg(); c.endereco = normalizar(d.endereco); gravarLS('f1chat.cfg', c); }
      const r = await servidor('/login', { metodo: 'POST', corpo: { usuario: d.usuario, senha: d.senha }, codigo: '' }); const c = cfg(); c.token = r.token; c.usuario = r.usuario; gravarLS('f1chat.cfg', c); if (window.f1Push) setTimeout(() => window.f1Push.registrar(), 500); return publica(); },
    sair: async () => { if (window.f1Push) { try { await window.f1Push.remover(); } catch (e) {} } try { await servidor('/logout', { metodo: 'POST', corpo: {} }); } catch (e) {} const c = cfg(); c.token = ''; c.usuario = null; gravarLS('f1chat.cfg', c); return publica(); },
    usuarios: () => servidor('/studio/usuarios'),
    'usuario-criar': (d) => servidor('/studio/usuarios', { metodo: 'POST', corpo: d }),
    'usuario-editar': (d) => servidor('/studio/usuarios/' + id(d.id), { metodo: 'PATCH', corpo: d.dados }),
    'usuario-apagar': (d) => servidor('/studio/usuarios/' + id(d.id), { metodo: 'DELETE' }),
    'config-ler': publica,
    'config-salvar': (d) => {
      const c = cfg();
      if (typeof d.codigo === 'string' && d.codigo.trim()) c.codigo = d.codigo.trim();
      if (d.endereco !== undefined) c.endereco = normalizar(d.endereco);
      for (const k of ['notificarWindows', 'somNotificacao']) if (d[k] !== undefined) c[k] = !!d[k];
      if (Array.isArray(d.silenciados)) c.silenciados = [...new Set(d.silenciados.map(String))];
      if (d.autoApagarDias !== undefined) c.autoApagarDias = Math.max(0, Number(d.autoApagarDias) || 0);
      gravarLS('f1chat.cfg', c); if (window.f1Push) setTimeout(() => window.f1Push.registrar(), 500); return publica();
    },
    testar: async (d = {}) => {
      try { const s = await servidor('/saude', { endereco: d.endereco, codigo: '' }); if (!s.ok) return { ok: false, erro: 'O servidor respondeu, mas não está saudável.' };
        await servidor('/studio/bots', { endereco: d.endereco, codigo: d.codigo }); return { ok: true, versao: s.versao }; }
      catch (e) { return { ok: false, erro: e.message }; }
    },
    bots: async () => { // como o motor do PC: sem servidor não dá erro, devolve {erro, bots: []} e a tela mostra o aviso + histórico
      const av = lerLS('f1chat.avatares', {}); try { const r = await servidor('/studio/bots'); return { bots: r.bots.map((b) => ({ ...b, avatar: av[b.chave] || '' })) }; } catch (e) { return { erro: e.message, bots: [] }; } },
    'bot-criar': async (d) => {
      const nome = String(d.nome || '').trim(); if (!nome) throw new Error('Digite o nome do bot.');
      let chave = String(d.chave || '').trim(); if (chave && !/^bot_[0-9a-f]{32}$/.test(chave)) throw new Error('Key inválida. Ela começa com "bot_" e tem 32 letras/números (a–f, 0–9).');
      if (!chave) chave = 'bot_' + Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
      return { bot: (await servidor('/studio/bots', { metodo: 'POST', corpo: { nome, chave } })).bot };
    },
    'bot-editar': (d) => servidor(`/studio/bots/${id(d.id)}`, { metodo: 'PATCH', corpo: { nome: d.nome, ligado: d.ligado } }),
    'bot-apagar': (d) => servidor(`/studio/bots/${id(d.id)}`, { metodo: 'DELETE' }),
    'bot-nova-chave': (d) => servidor(`/studio/bots/${id(d.id)}/nova-chave`, { metodo: 'POST' }),
    'bot-avatar': (d) => { const av = lerLS('f1chat.avatares', {}); if (d.dataUrl) av[d.chave] = d.dataUrl; else delete av[d.chave]; gravarLS('f1chat.avatares', av); return { ok: true }; },
    comandos: (d) => servidor(`/studio/bots/${id(d.botId)}/comandos`),
    'comando-criar': (d) => servidor(`/studio/bots/${id(d.botId)}/comandos`, { metodo: 'POST', corpo: { comando: d.comando, descricao: d.descricao } }),
    'comando-apagar': (d) => servidor(`/studio/comandos/${id(d.id)}`, { metodo: 'DELETE' }),
    mensagens: (d) => servidor(`/studio/bots/${id(d.botId)}/mensagens?limite=${d.limite || 50}` + (d.antes ? `&antes=${id(d.antes)}` : '')),
    lidas: (d) => servidor(`/studio/bots/${id(d.botId)}/lidas`, { metodo: 'POST' }),
    enviar: (d) => { const t = String(d.texto || '').trim(); if (!t) throw new Error('Digite uma mensagem.'); if (t.length > 10000) throw new Error('A mensagem passa de 10.000 caracteres.'); return servidor(`/studio/bots/${id(d.botId)}/mensagens`, { metodo: 'POST', corpo: { texto: t } }); },
    'enviar-foto': (d) => { if (!d.fotoBase64) throw new Error('Escolha ou cole uma foto.'); return servidor(`/studio/bots/${id(d.botId)}/fotos`, { metodo: 'POST', corpo: { fotoBase64: d.fotoBase64, legenda: String(d.legenda || '').trim() }, tempoMs: TEMPO_FOTO }); },
    'apagar-mensagem': (d) => servidor(`/studio/mensagens/${id(d.id)}`, { metodo: 'DELETE' }),
    lixeira: () => servidor('/studio/lixeira'), 'lixeira-restaurar': (d) => servidor(`/studio/lixeira/${id(d.id)}/restaurar`, { metodo: 'POST', corpo: {} }),
    'lixeira-apagar': (d) => servidor(`/studio/lixeira/${id(d.id)}`, { metodo: 'DELETE' }), 'lixeira-esvaziar': () => servidor('/studio/lixeira', { metodo: 'DELETE' }),
    saude: () => servidor('/studio/saude'), 'backup-fazer': () => servidor('/studio/backups', { metodo: 'POST', corpo: {} }),
    limpar: (d) => servidor(`/studio/bots/${id(d.botId)}/mensagens`, { metodo: 'DELETE' }),
    'url-foto': (d) => (d.arquivo ? `${normalizar(cfg().endereco)}/fotos/${id(d.arquivo)}` : ''),
    'foto-offline': () => '',                       // o próprio Android guarda as imagens já vistas
    'contar-posts': async (d) => ({ n: ((await servidor(`/studio/bots/${id(d.botId)}/posts`)).posts || []).length }),
    'copiar-texto': async (d) => copiar(d.texto),
    'usar-post': async (d) => { await copiar(d.legenda); window.open(rotas['url-foto']({ arquivo: d.arquivo }), '_system'); return { caminho: '', aberta: true }; }, // copia a legenda e abre a imagem (segure nela > salvar)
    'abrir-link': (d) => { if (/^https?:\/\//i.test(d.url)) window.open(d.url, '_system'); return true; },
    'escolher-foto': () => new Promise((ok, erro) => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
      i.onchange = () => { const f = i.files[0]; if (!f) return ok(null); if (f.size > 18 * 1024 * 1024) return erro(new Error('Foto grande demais (máximo ~18 MB).'));
        const l = new FileReader(); l.onload = () => ok({ nome: f.name, dataUrl: l.result, bytes: f.size }); l.onerror = () => erro(new Error('Não consegui ler a foto.')); l.readAsDataURL(f); };
      i.click();
    }),
    info: () => ({ versao: 'celular 0.1', electron: '-', sistema: 'Android (Capacitor)' }),
    'janela-acao': () => ({}),
    'baixar-posts': NAO('Baixar todas as imagens só funciona no computador por enquanto.'),
    'exportar-historico': NAO('Exportar histórico só funciona no computador por enquanto.'),
    'baixar-foto': NAO('Salvar foto: segure na imagem aberta e escolha salvar.'),
    'escolher-pasta': NAO('A pasta de saída só existe no computador.'),
    'icone-ler': () => ({ personalizado: false, dataUrl: 'logo.png' }), 'icone-definir': NAO('Trocar o ícone só no computador.'), 'icone-restaurar': () => '', 'icone-atalho': NAO('Atalho só no computador.'), 'atualizacao-estado': () => ({ fase: 'indisponivel' }), 'atualizacao-procurar': () => ({ fase: 'indisponivel' }), 'atualizacao-instalar': () => false, 'pergunta-responder': (d) => servidor(`/studio/mensagens/${id(d.id)}/responder`, { metodo: 'POST', corpo: { opcao: d.opcao } }), 'celular-teste': () => servidor('/studio/dispositivos/teste', { metodo: 'POST', corpo: {} }), 'push-remover': (d) => servidor('/studio/dispositivos?token=' + encodeURIComponent(d.token), { metodo: 'DELETE' }), 'push-registrar': (d) => servidor('/studio/dispositivos', { metodo: 'POST', corpo: { token: d.token } }), 'zip-projeto': NAO('O zip do projeto só existe no computador.')
  };
  window.api = {
    chamar: async (canal, dados) => { if (!Object.prototype.hasOwnProperty.call(rotas, canal)) throw new Error('Canal desconhecido: ' + canal); return rotas[canal](dados || {}); },
    escutar: (canal, fn) => { // no PC o programa avisa a lista de bots; aqui a gente consulta sozinho a cada 5s enquanto o app está aberto
      if (canal !== 'bots') return;
      const buscar = async () => { if (document.hidden) return; fn(await rotas.bots()); };
      setInterval(buscar, 5000); document.addEventListener('visibilitychange', buscar);
    }
  };
})();
