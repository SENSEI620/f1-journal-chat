// app.js — tela do F1 Journal Chat. Sem bibliotecas. Nada de innerHTML com texto de mensagem (evita código malicioso).
// Para mudar tempos: veja o bloco CONFIG logo abaixo.
'use strict';

// ===== CONFIG =====
const CONFIG = {
  atualizarConversaACada: 4,   // segundos (só enquanto a janela está à vista)
  mensagensPorBusca: 50
};

// ---------- utilitários ----------
const $ = (id) => document.getElementById(id);
function el(tag, props, ...filhos) { // cria elemento: el('div', {className:'x', onclick: fn}, 'texto', outroEl)
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'className') e.className = v; else if (k === 'texto') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat()) if (f != null && f !== false) e.append(f.nodeType ? f : document.createTextNode(f));
  return e;
}
montarIcones(); // troca os <i data-ic="…"> do index.html pelos ícones SVG
const chamar = (canal, dados) => window.api.chamar(canal, dados);
const semAcento = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase(); // busca sem diferenciar maiúscula nem acento
const limparErro = (e) => String((e && e.message) || e).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
function aviso(texto, tipo = 'ok') {
  if (tipo === 'erro') Sons.tocar('erro');
  const t = el('div', { className: 'toast ' + (tipo === 'ok' ? '' : tipo), texto });
  $('toasts').append(t); setTimeout(() => t.remove(), tipo === 'erro' ? 6000 : 3200);
}
const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function dataCurta(iso) {
  const d = new Date(iso), h = new Date(), ontem = new Date(Date.now() - 864e5);
  if (d.toDateString() === h.toDateString()) return hora(iso);
  if (d.toDateString() === ontem.toDateString()) return 'ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
function nomeDoDia(iso) {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) return 'Hoje';
  if (d.toDateString() === new Date(Date.now() - 864e5).toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}
const CORES = ['#e10600', '#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2'];
function avatar(bot, tamanho) {
  const a = el('div', { className: 'avatar', texto: bot.avatar ? '' : (bot.nome || '?').trim().charAt(0).toUpperCase() });
  a.style.background = bot.avatar ? `url("${bot.avatar}") center/cover` : CORES[Math.abs(Number(String(bot.id).replace(/\D/g, '')) || 0) % CORES.length];
  if (tamanho) { a.style.width = a.style.height = tamanho + 'px'; }
  return a;
}
function textoComLinks(texto) { // transforma http://... em link clicável, sem usar innerHTML
  const partes = String(texto).split(/(https?:\/\/[^\s<>"]+)/g);
  return partes.map((p, i) => (i % 2 ? el('a', { href: '#', texto: p, onclick: (ev) => { ev.preventDefault(); chamar('abrir-link', { url: p }); } }) : p));
}

// ---------- estado ----------
let bots = [];                 // lista vinda do servidor
let botAtual = null;           // bot aberto
let msgs = [];                 // mensagens do bot aberto (ordem crescente)
const noDom = new Map();       // id da mensagem -> elemento (para atualizar só o que mudou)
let fotoPendente = null;       // {dataUrl, nome}
let comandosDoBot = [];
let ocupadoAtualizando = false;
const rascunhos = new Map();   // botId -> texto que você começou a escrever e não enviou (volta quando você reabre o bot)
let fixados = (() => { try { return JSON.parse(localStorage.getItem('f1chat.fixados') || '[]'); } catch (e) { return []; } })();
const salvarFixados = () => { try { localStorage.setItem('f1chat.fixados', JSON.stringify(fixados)); } catch (e) {} };
function alternarFixo(id) { fixados = fixados.includes(id) ? fixados.filter((x) => x !== id) : [...fixados, id]; salvarFixados(); assinaturaLista = ''; desenharLista(); }

// ---------- lista de bots ----------
function definirStatus(tipo, texto) { const s = $('status'); s.className = 'status ' + tipo; s.querySelector('b').textContent = texto; }
function mostrarAlerta(texto, botao) {
  const a = $('alerta'); a.replaceChildren();
  if (!texto) { a.hidden = true; return; }
  a.hidden = false; a.append(el('div', { texto }), botao ? el('button', { texto: botao.texto, onclick: botao.fazer }) : '');
}
let assinaturaLista = '';
let botsGuardados = []; // lista de bots do histórico local (usada quando o servidor não responde)
const ultimaVista = new Map(); // botId -> ultima_em da última vez (para saber se chegou mensagem nova)
function somDeChegada(lista) { // toca 1 som por rodada: post (imagem) tem som próprio; bot silenciado ou com sons desligados não toca
  let evento = null;
  for (const b of lista) {
    const antes = ultimaVista.get(b.id); ultimaVista.set(b.id, b.ultima_em);
    if (antes === undefined || antes === b.ultima_em || !b.nao_lidas || b.ultima_tipo === 'eu') continue;
    if (!somLigado(b.id) || silenciados.includes(String(b.id))) continue;
    evento = b.ultima_tipo === 'foto' ? 'post' : (evento || 'mensagem');
  }
  if (evento) Sons.tocar(evento);
}
function receberBots(r) {
  if (r.erro) {
    servidorOn = false; definirStatus('off', 'Sem conexão');
    mostrarAlerta(r.erro + (botsGuardados.length ? ' Mostrando o histórico salvo neste computador.' : ''), { texto: 'Abrir configurações', fazer: abrirConfig });
    const jaTem = new Set(botsGuardados.map((b) => b.chave)); // o bot guardado (com mensagens) vale mais que a versão "pendente"; só bots criados aqui e nunca vistos no servidor entram como pendentes
    bots = [...botsGuardados, ...(r.bots || []).filter((b) => !jaTem.has(b.chave))];
  } else {
    definirStatus('on', 'Online'); mostrarAlerta(''); bots = r.bots || []; servidorOn = true; esvaziarFila();
    somDeChegada(bots);
    botsGuardados = bots.filter((b) => !b.pendente); Historico.salvarBots(botsGuardados);
  }
  if (botAtual) { const novo = bots.find((b) => b.id === botAtual.id); if (novo) { const mudou = novo.ultima_em !== botAtual.ultima_em || novo.nao_lidas !== botAtual.nao_lidas; botAtual = novo; if (mudou && !document.hidden) atualizarConversa(); } }
  const ass = JSON.stringify(bots.map((b) => [b.id, b.nome, b.nao_lidas, b.ultima_em, b.ultima_texto, b.avatar && b.avatar.length, b.id === (botAtual && botAtual.id), fixados.includes(b.id), silenciados.includes(String(b.id))]));
  if (ass !== assinaturaLista) { assinaturaLista = ass; desenharLista(); } // só redesenha se algo mudou
}
function desenharLista() {
  const filtro = semAcento($('busca').value.trim()), ul = $('lista');
  const visiveis = bots.filter((b) => !filtro || semAcento(b.nome).includes(filtro)).sort((a, b) => fixados.includes(b.id) - fixados.includes(a.id)); // fixados primeiro (a ordem do servidor continua dentro de cada grupo)
  ul.replaceChildren();
  const achadas = filtro && msgsAchadas.q === filtro ? msgsAchadas.lista : [];
  if (!visiveis.length && !achadas.length) { ul.append(el('li', { className: 'vazio-lista' }, filtro ? 'Nada encontrado (nem nome de bot, nem palavra nas conversas).' : 'Nenhum bot ainda. Abra o menu (três linhas) para criar o primeiro.')); return; }
  for (const b of visiveis) {
    const resumo = b.pendente ? el('span', {}, miniIcone('hourglass'), 'Aguardando registrar no servidor') : (b.ultima_tipo === 'foto' ? el('span', {}, miniIcone('image'), b.ultima_texto || 'Foto') : (b.ultima_texto || 'Sem mensagens'));
    const fixo = fixados.includes(b.id);
    ul.append(el('li', { className: botAtual && botAtual.id === b.id ? 'ativo' : '', title: b.nome, onclick: () => abrirBot(b.id) },
      el('button', { className: 'pin' + (fixo ? ' on' : ''), title: fixo ? 'Desafixar do topo' : 'Fixar no topo', onclick: (ev) => { ev.stopPropagation(); alternarFixo(b.id); } }, icone('pin')),
      avatar(b),
      el('div', { className: 'meio' },
        el('div', { className: 'linha1' }, el('b', { texto: b.nome }, silenciados.includes(String(b.id)) ? el('span', { className: 'mudo', title: 'Notificações silenciadas' }, icone('bell-off')) : ''), el('small', { texto: b.ultima_em ? dataCurta(b.ultima_em) : '' })),
        el('div', { className: 'linha2' }, el('small', {}, resumo), b.nao_lidas ? el('span', { className: 'badge', texto: b.nao_lidas > 99 ? '99+' : b.nao_lidas }) : ''))));
  }
  if (achadas.length) { // palavras achadas dentro das conversas (histórico guardado neste computador)
    ul.append(el('li', { className: 'sec', texto: 'Mensagens (' + achadas.length + (achadas.length >= 40 ? '+' : '') + ')' }));
    for (const m of achadas) {
      const b = bots.find((x) => x.id === m.botId); if (!b) continue;
      ul.append(el('li', { className: 'achado', onclick: async () => { await abrirBot(b.id); irParaMensagem(m.id); } }, avatar(b),
        el('div', { className: 'meio' }, el('div', { className: 'linha1' }, el('b', { texto: b.nome }), el('small', { texto: dataCurta(m.criado_em) })), el('div', { className: 'linha2' }, el('small', {}, trecho(m.texto, filtro))))));
    }
  }
}
// pedaço da mensagem em volta da palavra achada, com a palavra marcada
function trecho(texto, q) {
  const t = String(texto || '').replace(/\s+/g, ' '), n = semAcento(t), i = n.length === t.length ? n.indexOf(q) : t.toLowerCase().indexOf(q);
  if (i < 0) return t.slice(0, 90);
  const ini = Math.max(0, i - 28), fim = Math.min(t.length, i + q.length + 70);
  return [(ini ? '…' : '') + t.slice(ini, i), el('mark', { className: 'trecho', texto: t.slice(i, i + q.length) }), t.slice(i + q.length, fim) + (fim < t.length ? '…' : '')];
}
let msgsAchadas = { q: '', lista: [] }, tempoBuscaLista = null, fichaBusca = 0;
async function buscarPalavras() {
  const q = semAcento($('busca').value.trim()), ficha = ++fichaBusca;
  if (q.length < 2) { if (msgsAchadas.q) { msgsAchadas = { q: '', lista: [] }; desenharLista(); } return; }
  const lista = await Historico.buscar(q, null, 40);
  if (ficha !== fichaBusca) return; // já digitou outra coisa
  msgsAchadas = { q, lista }; desenharLista();
}
$('busca').addEventListener('input', () => { assinaturaLista = ''; desenharLista(); clearTimeout(tempoBuscaLista); tempoBuscaLista = setTimeout(buscarPalavras, 180); });

// ---------- conversa ----------
async function abrirBot(id) {
  const bot = bots.find((b) => b.id === id); if (!bot) return;
  if (botAtual) rascunhos.set(botAtual.id, $('texto').value); // guarda o que estava escrevendo no bot anterior
  document.body.classList.add('estreito-conversa'); // (só vale em janela estreita: mostra a conversa e esconde a lista)
  botAtual = bot; msgs = []; assinaturaMsgs = ''; noDom.clear(); $('msgsLista').replaceChildren(); fotoPendente = null; $('previaFoto').hidden = true;
  $('vazio').hidden = true; $('conversa').hidden = false;
  $('texto').value = rascunhos.get(bot.id) || ''; ajustarAltura(); esconderComandos();
  $('convNome').textContent = bot.nome; $('convSub').textContent = bot.pendente ? 'Ainda não registrado no servidor' : 'Bot • key no n8n';
  $('convAvatar').replaceWith(Object.assign(avatar(bot), { id: 'convAvatar' }));
  assinaturaLista = ''; desenharLista();
  fecharBuscaConv(); aplicarPainel(); carregarComandos().then(aplicarPainel);
  if (bot.pendente) { $('msgsLista').append(el('div', { className: 'dia', texto: 'Conecte ao servidor para conversar.' })); return; }
  if (typeof bot.id === 'number') { // histórico local primeiro (aparece na hora, mesmo sem internet)
    const guardadas = await Historico.lerMensagens(bot.id, CONFIG.mensagensPorBusca);
    if (botAtual && botAtual.id === bot.id && guardadas.length && !msgs.length) { aplicarMensagens(guardadas, { semEstalo: true }); $('msgs').scrollTop = $('msgs').scrollHeight; $('maisAntigas').hidden = guardadas.length < CONFIG.mensagensPorBusca; await mostrarFilaDoBot(bot); }
  }
  await atualizarConversa(true);
  mostrarFilaDoBot(bot); // as que ainda esperam o servidor aparecem com o relógio, no fim
  $('texto').focus();
}
async function carregarComandos() {
  comandosDoBot = [];
  try { comandosDoBot = (await chamar('comandos', { botId: botAtual.id })).comandos || []; } catch (e) {}
}
// ícones (Lucide): icone('nome') cria o SVG; miniIcone() é a versão pequenininha para dentro de textos; rotular() troca ícone+texto de um botão do HTML
const miniIcone = (nome) => el('span', { className: 'mini-ic' }, icone(nome));
function rotular(btn, nomeIc, texto) { const velho = btn.querySelector('.ic'); if (velho) velho.replaceWith(icone(nomeIc)); const r = btn.querySelector('.rot'); if (r) r.textContent = texto; }
function tick(m) {
  const s = m._enviando ? 'enviando' : m.status;
  if (s === 'enviando') return el('span', { className: 'tick enviando', title: 'Enviando…' }, icone('clock'));
  return el('span', { className: 'tick ' + (s === 'lida' ? 'lida' : ''), title: { enviada: 'Enviada', entregue: 'Entregue', lida: 'Lida' }[s] || '' }, icone(s === 'enviada' ? 'check' : 'check-check'));
}
// Foto: usa o link do servidor; se não carregar (sem internet / servidor desligado) usa a cópia guardada no computador
function carregarFoto(img, arquivo) {
  chamar('url-foto', { arquivo }).then((u) => {
    img.addEventListener('error', async () => { const d = await chamar('foto-offline', { arquivo }); if (d) img.src = d; }, { once: true });
    img.src = u; img.onclick = () => abrirLightbox(u, arquivo);
  });
}
// Comandos no FIM da mensagem do bot (linhas só com "/alguma coisa") viram botões; a linha sai do texto.
// Só vale para linha inteira, no final — "/home/pasta" ou uma barra no meio de uma frase continuam texto normal.
const LINHA_COMANDO = /^\/[\p{L}\p{N}_]+(?: [\p{L}\p{N}_]+){0,3}$/u;
function separarComandos(texto) {
  const linhas = String(texto || '').split('\n'), cmds = [];
  while (linhas.length && (linhas[linhas.length - 1].trim() === '' || LINHA_COMANDO.test(linhas[linhas.length - 1].trim()))) { const l = linhas.pop().trim(); if (l) cmds.unshift(l); }
  return cmds.length ? { texto: linhas.join('\n').trim(), comandos: [...new Set(cmds)] } : { texto: String(texto || ''), comandos: [] };
}
const cmdUsados = (() => { try { return new Set(JSON.parse(localStorage.getItem('f1chat.cmdUsados') || '[]')); } catch (e) { return new Set(); } })();
const guardarCmdUsado = (chave) => { cmdUsados.add(chave); try { localStorage.setItem('f1chat.cmdUsados', JSON.stringify([...cmdUsados].slice(-500))); } catch (e) {} };
function somBotao() { if (botAtual && somLigado(botAtual.id)) Sons.tocar('comando'); } // clique do botão de comando; segue o liga/desliga de sons do bot
function botoesDeComando(m, comandos) {
  return el('div', { className: 'cmds' }, comandos.map((c) => {
    const chave = m.id + '|' + c;
    const b = el('button', { className: 'cmd-btn' + (cmdUsados.has(chave) ? ' usado' : ''), title: 'Envia ' + c + ' como se você tivesse digitado', texto: c });
    b.addEventListener('click', () => { somBotao(); b.classList.add('usado', 'brilho'); setTimeout(() => b.classList.remove('brilho'), 800); guardarCmdUsado(chave); enviar(c); });
    return b;
  }));
}
// "Enviar e esperar resposta" do n8n: a mensagem traz botões (Aprovar / Negar ou os que você escolheu). Tocar avisa o n8n e o fluxo continua.
function botoesDePergunta(m) {
  const q = m.pergunta, fim = q.estado !== 'esperando';
  const botoes = el('div', { className: 'cmds' }, q.opcoes.map((o) => {
    const b = el('button', { className: 'cmd-btn' + (fim && q.resposta === o.id ? ' usado' : ''), texto: o.texto, disabled: fim });
    b.addEventListener('click', async () => {
      somBotao(); botoes.querySelectorAll('button').forEach((x) => { x.disabled = true; });
      try {
        const r = await chamar('pergunta-responder', { id: m.id, opcao: o.id }); m.pergunta = r.pergunta; caixa.replaceWith(botoesDePergunta(m)); // (o "caixa" antigo sai; o novo já vem com o botão escolhido dourado)
        if (!r.avisado) aviso('Resposta salva, mas o n8n não respondeu agora. O servidor tenta de novo sozinho.', 'erro');
      } catch (e) { aviso(limparErro(e), 'erro'); atualizarConversa(false); }
    });
    return b;
  }));
  const quando = q.expira_em ? ' até ' + hora(q.expira_em) : '';
  const info = el('small', { className: 'pergunta-info', texto: q.estado === 'esperando' ? 'O fluxo do n8n está esperando sua resposta' + quando : q.estado === 'expirada' ? 'Tempo esgotado: o fluxo seguiu sem resposta' : 'Respondido: ' + ((q.opcoes.find((o) => o.id === q.resposta) || {}).texto || q.resposta) });
  const caixa = el('div', { className: 'pergunta-caixa' }, botoes, info);
  return caixa;
}
function montarMensagem(m, nova) {
  const ehPost = m.marca === 'post' && m.tipo === 'foto' && m.arquivo;
  const caixa = el('div', { className: 'msg ' + (m.de === 'eu' ? 'eu' : 'bot') + (nova ? ' nova' : '') + (m._falhou ? ' falhou' : '') + (ehPost ? ' post' : '') });
  if (ehPost) { // POST: imagem à esquerda, legenda à direita, botões Usar e Postado
    const img = el('img', { className: 'foto', alt: 'Imagem do post', loading: 'lazy' });
    carregarFoto(img, m.arquivo);
    const usar = el('button', { className: 'principal', title: 'Baixa a imagem e copia a legenda', onclick: async () => {
      usar.disabled = true; try { const r = await chamar('usar-post', { id: m.id, arquivo: m.arquivo, legenda: m.texto || '' }); aviso(r && r.aberta === false ? 'Imagem salva na pasta de saída · legenda copiada' : 'Imagem baixada e legenda copiada'); } catch (e) { aviso(limparErro(e), 'erro'); } usar.disabled = false; } }, icone('download'), 'Usar');
    const copiarLeg = el('button', { title: 'Copia só a legenda', onclick: () => { chamar('copiar-texto', { texto: m.texto || '' }); aviso('Legenda copiada'); } }, icone('copy'), 'Copiar legenda');
    const postado = el('button', { title: 'Já postei: tira este post do chat', onclick: () => apagarMensagem(m) }, icone('check'), 'Postado');
    caixa.append(el('div', { className: 'post-corpo' }, img,
      el('div', { className: 'post-lado' }, el('div', { className: 'post-legenda txt' }, textoComLinks(m.texto || '(sem legenda)')), el('div', { className: 'post-botoes' }, usar, copiarLeg, postado))));
    caixa.append(el('div', { className: 'rodape' }, el('span', { texto: hora(m.criado_em) })));
    return caixa;
  }
  if (m.tipo === 'foto' && (m.arquivo || m._previa)) {
    const img = el('img', { className: 'foto', alt: 'Foto', loading: 'lazy' });
    if (m._previa) img.src = m._previa; else carregarFoto(img, m.arquivo);
    if (m._previa) img.onclick = () => abrirLightbox(m._previa, 'foto.jpg');
    caixa.append(img);
  }
  const partes = m.de === 'bot' && m.tipo !== 'foto' ? separarComandos(m.texto) : { texto: m.texto, comandos: [] };
  const temCmds = partes.comandos.length > 0 || !!m.pergunta, balao = temCmds ? el('div', { className: 'balao' }) : caixa; // com comandos: o balão da mensagem fica num lado e os botões numa caixa separada embaixo
  if (partes.texto) balao.append(el('div', { className: 'txt' }, textoComLinks(partes.texto)));
  balao.append(el('div', { className: 'rodape' }, m._falhou ? el('span', { className: 'msg-erro', texto: 'Falhou' }) : '', el('span', { texto: hora(m.criado_em) }), m.de === 'eu' ? tick(m) : ''));
  if (temCmds) { caixa.classList.add('tem-cmds'); caixa.append(balao); if (partes.comandos.length) caixa.append(botoesDeComando(m, partes.comandos)); if (m.pergunta) caixa.append(botoesDePergunta(m)); }
  const acoes = el('div', { className: 'acoes' },
    m.texto ? el('button', { title: 'Copiar texto', onclick: () => { chamar('copiar-texto', { texto: m.texto }); aviso('Texto copiado'); } }, icone('copy')) : '',
    typeof m.id === 'number' ? el('button', { title: 'Apagar mensagem', onclick: () => apagarMensagem(m) }, icone('trash-2')) : '');
  caixa.append(acoes);
  return caixa;
}
// Atualiza só o que mudou: troca o tick das já desenhadas, adiciona as novas, tira as apagadas
let semAnimar = false;
function aplicarMensagens(novas, { antigas = false, semEstalo = false } = {}) {
  const lista = $('msgsLista'), rolagem = $('msgs');
  const colado = rolagem.scrollHeight - rolagem.scrollTop - rolagem.clientHeight < 80;
  const alturaAntes = rolagem.scrollHeight;
  if (!antigas) { // remove do DOM o que não existe mais no servidor (e já não é "enviando")
    const ids = new Set(novas.map((m) => m.id));
    let sumiu = 0;
    for (const [id, e] of noDom) if (!ids.has(id) && typeof id === 'number') {
      noDom.delete(id); msgs = msgs.filter((x) => x.id !== id); removendo.add(id);
      if (semEstalo) { e.remove(); continue; } // ao abrir o bot: o que foi apagado enquanto o Chat estava fechado some sem efeito
      sumiu++; estalar(e, sumiu * 70).then(() => { e.remove(); separarDias(); liberarId(id); }); // apagada de fora (n8n, outro PC): vira poeira também
    }
    if (sumiu) somApagar();
  }
  const frag = document.createDocumentFragment(); let haNova = false;
  for (const m of novas) {
    if (removendo.has(m.id)) continue; // está virando poeira agora
    const antes = msgs.find((x) => x.id === m.id);
    if (antes) {
      const mudouPergunta = JSON.stringify(antes.pergunta || null) !== JSON.stringify(m.pergunta || null);
      if (antes.status !== m.status || mudouPergunta) { Object.assign(antes, m); const e = noDom.get(m.id); const t = e && e.querySelector('.tick'); if (t) t.replaceWith(tick(m)); const p = e && e.querySelector('.pergunta-caixa'); if (p && m.pergunta) p.replaceWith(botoesDePergunta(m)); }
      continue;
    }
    msgs.push(m); haNova = true;
    const e = montarMensagem(m, !antigas && !semAnimar && !semEstalo && msgs.length > novas.length); noDom.set(m.id, e);
    if (antigas) frag.append(e); else lista.append(e);
  }
  if (antigas) lista.prepend(frag);
  msgs.sort((a, b) => { const na = typeof a.id === 'number', nb = typeof b.id === 'number'; return na && nb ? a.id - b.id : na ? -1 : nb ? 1 : 0; }); // as ainda não enviadas ficam no fim
  if (!antigas) reordenarSeNecessario();
  separarDias(); if (!$('buscaConv').hidden) realcar();
  if (antigas) rolagem.scrollTop = rolagem.scrollHeight - alturaAntes;
  else if (colado || haNova && msgs.length === novas.length) rolagem.scrollTop = rolagem.scrollHeight;
}
function reordenarSeNecessario() { // mensagens "enviando" ficam no fim; quando viram reais, entram na ordem
  const lista = $('msgsLista'); let anterior = null;
  for (const m of msgs) { const e = noDom.get(m.id); if (e && e.parentNode === lista) { if (anterior && anterior.nextElementSibling !== e && !e.previousElementSibling?.classList.contains('dia')) lista.insertBefore(e, anterior.nextSibling); anterior = e; } }
}
function separarDias() { // coloca "Hoje / Ontem / data" entre os dias
  const lista = $('msgsLista'); lista.querySelectorAll('.dia').forEach((d) => d.remove()); let ultimo = '';
  for (const m of msgs) {
    const e = noDom.get(m.id); if (!e) continue; const d = new Date(m.criado_em).toDateString();
    if (d !== ultimo) { ultimo = d; lista.insertBefore(el('div', { className: 'dia', texto: nomeDoDia(m.criado_em) }), e); }
  }
}
let assinaturaMsgs = ''; // resumo (ids + status) do que o servidor mandou da última vez: se não mudou nada, não mexe na tela nem no histórico local
async function atualizarConversa(primeira) {
  if (!botAtual || botAtual.pendente || ocupadoAtualizando) return;
  ocupadoAtualizando = true; const id = botAtual.id;
  try {
    const r = await chamar('mensagens', { botId: id, limite: CONFIG.mensagensPorBusca });
    if (!botAtual || botAtual.id !== id) return; // trocou de bot no meio
    const reais = r.mensagens || [];
    const assinatura = id + ':' + reais.map((m) => m.id + m.status + (m.pergunta ? m.pergunta.estado + m.pergunta.resposta : '')).join(',');
    if (primeira || assinatura !== assinaturaMsgs) { // só redesenha e grava quando algo mudou (antes fazia isso a cada poucos segundos, sem necessidade)
      assinaturaMsgs = assinatura;
      aplicarMensagens(reais, { semEstalo: !!primeira });
      $('maisAntigas').hidden = reais.length < CONFIG.mensagensPorBusca;
      if (typeof id === 'number') Historico.salvarMensagens(id, reais, reais.length < CONFIG.mensagensPorBusca); // histórico local: só as que o servidor mandou
      if (primeira) $('msgs').scrollTop = $('msgs').scrollHeight;
    }
    if (reais.some((m) => m.de === 'bot' && m.status !== 'lida') && document.hasFocus()) chamar('lidas', { botId: id }).catch(() => {}); // você viu: ✓✓ azul para o bot
  } catch (e) { definirStatus('off', 'Sem conexão'); } // sem internet: continua mostrando o histórico local
  finally { ocupadoAtualizando = false; }
}
async function carregarAnteriores() {
  const primeiro = msgs.find((m) => typeof m.id === 'number'); if (!primeiro) return false;
  try {
    let r;
    try { r = await chamar('mensagens', { botId: botAtual.id, antes: primeiro.id, limite: CONFIG.mensagensPorBusca }); if (typeof botAtual.id === 'number') Historico.guardar(botAtual.id, r.mensagens || []); }
    catch (e) { r = { mensagens: await Historico.lerMensagens(botAtual.id, CONFIG.mensagensPorBusca, primeiro.id) }; if (!r.mensagens.length) throw e; } // sem servidor: histórico local
    aplicarMensagens(r.mensagens || [], { antigas: true }); $('maisAntigas').hidden = (r.mensagens || []).length < CONFIG.mensagensPorBusca;
    return (r.mensagens || []).length > 0;
  } catch (e) { aviso(limparErro(e), 'erro'); return false; }
}
$('maisAntigas').addEventListener('click', carregarAnteriores);
// rola até uma mensagem e pisca ela; se for antiga, vai carregando as anteriores até achar
async function irParaMensagem(id) {
  for (let i = 0; i < 60 && !noDom.has(id) && !$('maisAntigas').hidden; i++) if (!(await carregarAnteriores())) break;
  const e = noDom.get(id); if (!e) return false;
  e.scrollIntoView({ block: 'center' }); e.classList.remove('salto'); void e.offsetWidth; e.classList.add('salto'); setTimeout(() => e.classList.remove('salto'), 1500);
  return true;
}
setInterval(() => { if (!document.hidden) atualizarConversa(); }, CONFIG.atualizarConversaACada * 1000); // atualiza mesmo sem foco (janela em outro monitor); só marca "lida" com foco
window.addEventListener('focus', () => atualizarConversa());

// ---------- mensagens rápidas: textos que você manda sempre (ficam guardados neste aparelho) ----------
const MAX_RAPIDAS = 30;
let rapidas = (() => { try { return JSON.parse(localStorage.getItem('f1chat.rapidas') || '[]').filter((t) => typeof t === 'string'); } catch (e) { return []; } })();
const salvarRapidas = () => { try { localStorage.setItem('f1chat.rapidas', JSON.stringify(rapidas)); } catch (e) {} };
function abrirRapidas() {
  if (!botAtual || botAtual.pendente) { aviso('Abra um bot primeiro.'); return; }
  const novo = el('textarea', { rows: 3, maxlength: 2000, placeholder: 'Escreva o texto que você manda sempre…' });
  const lista = el('div');
  const inserir = (t) => { const cx = $('texto'); cx.value = cx.value.trim() ? cx.value.replace(/\s*$/, ' ') + t : t; ajustarAltura(); fecharModal(); cx.focus(); };
  const desenhar = () => lista.replaceChildren(...(rapidas.length ? rapidas.map((t, i) => el('div', { className: 'rapida' }, el('span', { className: 'rapida-txt', texto: t }),
    el('div', { className: 'linha' }, el('button', { texto: 'Inserir', onclick: () => inserir(t) }), el('button', { className: 'principal', texto: 'Enviar', onclick: () => { fecharModal(); enviar(t); } }),
      el('button', { className: 'icone perigo', title: 'Apagar esta mensagem rápida', onclick: () => { rapidas.splice(i, 1); salvarRapidas(); desenhar(); } }, icone('trash-2'))))) : [el('p', { className: 'dica', texto: 'Nenhuma ainda. Escreva uma abaixo e salve.' })]));
  const salvar = () => {
    const t = novo.value.trim(); if (!t) return;
    if (rapidas.includes(t)) { aviso('Essa já está na lista.'); return; }
    if (rapidas.length >= MAX_RAPIDAS) { aviso('Máximo de ' + MAX_RAPIDAS + ' mensagens rápidas. Apague alguma.', 'erro'); return; }
    rapidas.push(t); salvarRapidas(); novo.value = ''; desenhar();
  };
  abrirModal('Mensagens rápidas', [lista, el('h4', { texto: 'Nova mensagem rápida' }), novo,
    el('div', { className: 'linha mt8' }, el('button', { className: 'principal', texto: 'Salvar', onclick: salvar })),
    el('p', { className: 'dica', texto: 'Inserir coloca o texto na caixa para você revisar. Enviar manda na hora. Ficam guardadas só neste aparelho.' })]);
  desenhar();
}
$('btnRapidas').addEventListener('click', abrirRapidas);

// ---------- enviar ----------
// ---------- fila de saída ----------
const semConexao = (err) => /não consegui conectar|demorou para responder|Servidor não configurado/i.test(String((err && err.message) || err));
let servidorOn = false, enviandoFila = false;
// Envia, em ordem, o que ficou esperando. Se a conexão cair no meio, para e tenta de novo depois.
// (Raro: se o servidor recebeu mas a resposta se perdeu, a mensagem pode ir duas vezes.)
async function esvaziarFila() {
  if (enviandoFila || !servidorOn) return; enviandoFila = true;
  try {
    for (const it of await Historico.filaLer()) {
      try { await chamar(it.tipo === 'foto' ? 'enviar-foto' : 'enviar', it.tipo === 'foto' ? { botId: it.botId, fotoBase64: it.fotoBase64, legenda: it.legenda } : { botId: it.botId, texto: it.texto }); }
      catch (err) {
        if (semConexao(err)) break;
        await Historico.filaApagar(it.k); const f = msgs.find((x) => x._fila === it.k); // o servidor recusou de verdade: vira "falhou"
        if (f) { f._falhou = true; f._enviando = false; const novo = montarMensagem(f), velho = noDom.get(f.id); if (velho) velho.replaceWith(novo); noDom.set(f.id, novo); }
        aviso(limparErro(err), 'erro'); continue;
      }
      await Historico.filaApagar(it.k);
      if (botAtual && botAtual.id === it.botId) { // a verdadeira entra no lugar da do relógio, sem animar
        semAnimar = true; ocupadoAtualizando = false; try { await atualizarConversa(); } finally { semAnimar = false; }
        const e = noDom.get('fila' + it.k); if (e) { e.remove(); noDom.delete('fila' + it.k); msgs = msgs.filter((x) => x._fila !== it.k); separarDias(); }
      }
    }
  } finally { enviandoFila = false; }
}
setInterval(esvaziarFila, 8000);
async function mostrarFilaDoBot(bot) { // mensagens ainda na fila aparecem com o relógio, também depois de fechar e abrir o Chat
  for (const it of await Historico.filaLer(bot.id)) {
    const f = { id: 'fila' + it.k, de: 'eu', tipo: it.tipo, texto: it.tipo === 'foto' ? it.legenda : it.texto, status: 'enviada', _enviando: true, _fila: it.k, _previa: it.fotoBase64, criado_em: it.criado_em };
    if (noDom.has(f.id) || !botAtual || botAtual.id !== bot.id) continue;
    const e = montarMensagem(f, false); noDom.set(f.id, e); msgs.push(f); $('msgsLista').append(e);
  }
  separarDias(); $('msgs').scrollTop = $('msgs').scrollHeight;
}
async function enviar(textoDoBotao) { // sem argumento: envia o que está digitado; com texto (botão de comando): envia como se você tivesse digitado
  if (!botAtual || botAtual.pendente || soRecebe(botAtual.id)) return;
  const doBotao = typeof textoDoBotao === 'string';
  const texto = (doBotao ? textoDoBotao : $('texto').value).trim(), foto = doBotao ? null : fotoPendente, botId = botAtual.id;
  if (!texto && !foto) return;
  const falso = { id: 'tmp' + Date.now(), de: 'eu', tipo: foto ? 'foto' : 'texto', texto, status: 'enviada', _enviando: true, _previa: foto && foto.dataUrl, criado_em: new Date().toISOString() };
  if (!doBotao) { $('texto').value = ''; ajustarAltura(); fotoPendente = null; $('previaFoto').hidden = true; esconderComandos(); }
  const e = montarMensagem(falso, true); noDom.set(falso.id, e); msgs.push(falso); $('msgsLista').append(e); $('msgs').scrollTop = $('msgs').scrollHeight;
  try {
    await chamar(foto ? 'enviar-foto' : 'enviar', foto ? { botId, fotoBase64: foto.dataUrl, legenda: texto } : { botId, texto });
    if (!doBotao && somLigado(botId)) Sons.tocar('enviar');
    // a verdadeira entra no lugar da de mentira SEM animar de novo (era isso que fazia piscar); a de mentira sai no mesmo instante
    semAnimar = true; ocupadoAtualizando = false;
    try { await atualizarConversa(); } finally { semAnimar = false; }
    e.remove(); noDom.delete(falso.id); msgs = msgs.filter((x) => x !== falso); separarDias(); $('msgs').scrollTop = $('msgs').scrollHeight;
  } catch (err) {
    if (semConexao(err)) { // sem internet/servidor: fica na FILA com o relógio e é enviada sozinha quando o servidor voltar (igual WhatsApp)
      const k = await Historico.filaAdd({ botId, tipo: foto ? 'foto' : 'texto', texto, fotoBase64: foto && foto.dataUrl, legenda: texto, criado_em: falso.criado_em });
      if (k) { noDom.delete(falso.id); falso.id = 'fila' + k; falso._fila = k; noDom.set(falso.id, e); aviso('Sem conexão: a mensagem ficou na fila (relógio) e será enviada quando o servidor voltar'); return; }
    }
    falso._falhou = true; falso._enviando = false; const novo = montarMensagem(falso); e.replaceWith(novo); noDom.set(falso.id, novo);
    aviso(limparErro(err), 'erro'); if (!foto && !doBotao) { $('texto').value = texto; ajustarAltura(); }
  }
}
function ajustarAltura() { const t = $('texto'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 160) + 'px'; }
$('btnEnviar').addEventListener('click', () => enviar());

// ---------- comandos (digitar "/") ----------
let selComando = 0, listaComandos = [];
function esconderComandos() { $('comandos').hidden = true; listaComandos = []; menuComandos = false; }
// Adivinha o comando: começa com o que você digitou > tem no nome > tem na descrição > letras na ordem (ex.: "/pst" acha /post)
function ranquearComandos(consulta, lista) {
  const q = semAcento(consulta).replace(/^\//, ''); if (!q) return [...lista];
  const pontos = (c) => {
    const nome = semAcento(c.comando).replace(/^\//, ''), desc = semAcento(c.descricao);
    if (nome.startsWith(q)) return 0; if (nome.includes(q)) return 1; if (desc.includes(q)) return 2;
    let i = 0; for (const ch of nome) if (ch === q[i]) i++; return i === q.length ? 3 : -1;
  };
  return lista.map((c) => ({ c, p: pontos(c) })).filter((x) => x.p >= 0).sort((a, b) => a.p - b.p || a.c.comando.localeCompare(b.c.comando)).map((x) => x.c);
}
let menuComandos = false; // true = aberto pelo botão "/" ao lado do clipe (mostra todos, rolando)
function desenharComandos() {
  const box = $('comandos'); box.hidden = false; box.classList.toggle('todos', menuComandos); box.replaceChildren();
  if (!listaComandos.length) { box.append(el('p', { className: 'dica', texto: comandosDoBot.length ? 'Nenhum comando parecido.' : 'Este bot ainda não tem comandos. Adicione em ⋮ > Configurações do bot.' })); return; }
  listaComandos.forEach((c, i) => box.append(el('div', { className: i === selComando ? 'sel' : '', onclick: () => escolherComando(c) }, el('b', { texto: c.comando }), el('small', { texto: c.descricao || '' }))));
}
function mostrarComandos() {
  const t = $('texto').value;
  if (!t.startsWith('/') || /\s/.test(t) || !comandosDoBot.length) { if (menuComandos && !t.trim()) { listaComandos = [...comandosDoBot]; selComando = 0; return desenharComandos(); } return esconderComandos(); }
  listaComandos = ranquearComandos(t, comandosDoBot); selComando = 0;
  if (!listaComandos.length) return esconderComandos();
  desenharComandos();
}
// Botão "/" ao lado do clipe: abre a biblioteca com TODOS os comandos do bot (role a lista; toque para usar). Digitar depois filtra.
function alternarMenuComandos() {
  if (!botAtual || botAtual.pendente) { aviso('Abra um bot primeiro.'); return; }
  if (!$('comandos').hidden && menuComandos) { menuComandos = false; return esconderComandos(); }
  menuComandos = true; listaComandos = [...comandosDoBot]; selComando = 0; desenharComandos(); $('texto').focus();
}
function escolherComando(c) { menuComandos = false; $('texto').value = c.comando + ' '; esconderComandos(); $('texto').focus(); ajustarAltura(); }
$('texto').addEventListener('input', () => { ajustarAltura(); mostrarComandos(); });
$('btnComandos').addEventListener('click', alternarMenuComandos);
$('texto').addEventListener('keydown', (ev) => {
  if (listaComandos.length && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) {
    ev.preventDefault(); selComando = (selComando + (ev.key === 'ArrowDown' ? 1 : -1) + listaComandos.length) % listaComandos.length;
    [...$('comandos').children].forEach((d, i) => d.classList.toggle('sel', i === selComando)); return;
  }
  if (listaComandos.length && (ev.key === 'Tab' || (ev.key === 'Enter' && !ev.shiftKey))) { ev.preventDefault(); escolherComando(listaComandos[selComando]); return; }
  if (ev.key === 'Escape') esconderComandos();
  if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); enviar(); }
});

// ---------- fotos: anexar, colar, arrastar ----------
function prepararFoto(dataUrl, nome) {
  if (!botAtual) return aviso('Abra um bot primeiro.', 'aviso');
  fotoPendente = { dataUrl, nome }; $('previaImg').src = dataUrl; $('previaNome').textContent = nome; $('previaFoto').hidden = false; $('texto').focus();
}
$('previaFechar').addEventListener('click', () => { fotoPendente = null; $('previaFoto').hidden = true; });
$('btnAnexo').addEventListener('click', async () => {
  try { const f = await chamar('escolher-foto'); if (f) prepararFoto(f.dataUrl, f.nome); } catch (e) { aviso(limparErro(e), 'erro'); }
});
const lerArquivo = (arq) => new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = falha; r.readAsDataURL(arq); });
document.addEventListener('paste', async (ev) => {
  const item = [...(ev.clipboardData ? ev.clipboardData.items : [])].find((i) => i.type.startsWith('image/'));
  if (!item || !botAtual || soRecebe(botAtual.id)) return;
  ev.preventDefault(); prepararFoto(await lerArquivo(item.getAsFile()), 'imagem-colada.png');
});
['dragover', 'dragleave', 'drop'].forEach((nome) => document.addEventListener(nome, async (ev) => {
  ev.preventDefault();
  if (nome === 'dragover') document.body.classList.add('arrastando');
  else document.body.classList.remove('arrastando');
  if (nome !== 'drop' || (botAtual && soRecebe(botAtual.id))) return;
  const arq = [...ev.dataTransfer.files].find((f) => f.type.startsWith('image/'));
  if (!arq) return aviso('Solte uma imagem (JPG, PNG ou WEBP).', 'aviso');
  if (arq.size > 18 * 1024 * 1024) return aviso('Foto grande demais (máximo ~18 MB).', 'erro');
  prepararFoto(await lerArquivo(arq), arq.name);
}));

// ---------- apagar / limpar ----------
// Estalo do Thanos: o balão é cortado em pedacinhos que somem como poeira ao vento. Só visual — se algo falhar, a mensagem some do mesmo jeito.
function estalar(alvo, atraso = 0) {
  return new Promise((ok) => {
    try {
      if (!alvo || !alvo.isConnected || !alvo.animate) return ok();
      const r = alvo.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return ok();
      const cols = Math.max(2, Math.min(14, Math.round(r.width / 44))), rows = Math.max(2, Math.min(7, Math.round(r.height / 44)));
      const lw = r.width / cols, lh = r.height / rows, frags = [];
      let ultima = Promise.resolve();
      for (let c = 0; c < cols; c++) for (let l = 0; l < rows; l++) {
        const f = document.createElement('div'); f.className = 'poeira-frag';
        f.style.left = r.left + 'px'; f.style.top = r.top + 'px'; f.style.width = r.width + 'px'; f.style.height = r.height + 'px';
        f.style.clipPath = `inset(${l * lh}px ${r.width - (c + 1) * lw}px ${r.height - (l + 1) * lh}px ${c * lw}px)`;
        const copia = alvo.cloneNode(true); copia.classList.remove('nova'); copia.style.width = r.width + 'px'; copia.style.height = r.height + 'px';
        f.append(copia); document.body.append(f); frags.push(f);
        const dx = 50 + Math.random() * 150, dy = -80 + Math.random() * 110, giro = (Math.random() - 0.5) * 70;
        const anim = f.animate([
          { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1, filter: 'blur(0px)' },
          { transform: `translate(${dx}px,${dy}px) rotate(${giro}deg) scale(.6)`, opacity: 0, filter: 'blur(4px)' }
        ], { duration: 900 + Math.random() * 500, delay: atraso + (c / cols) * 550 + Math.random() * 250, easing: 'ease-out', fill: 'both' });
        ultima = anim.finished.catch(() => {});
      }
      alvo.style.visibility = 'hidden'; // o balão original some na hora; no lugar ficam só os pedacinhos
      const limpar = () => { frags.forEach((f) => f.remove()); ok(); };
      ultima.then(() => setTimeout(limpar, 60)); setTimeout(limpar, 3200 + atraso);
    } catch (e) { ok(); }
  });
}
const removendo = new Set(); // ids que estão sendo apagados (não deixa a mensagem "voltar" por um instante)

// Sons: tocar() fica em sons.js. Cada bot liga/desliga os sons em ⋮.
let somDesligado = (() => { try { return JSON.parse(localStorage.getItem('f1chat.somDesligado') || '[]'); } catch (e) { return []; } })();
const somLigado = (id) => !somDesligado.includes(id);
function alternarSom(id) { somDesligado = somLigado(id) ? [...somDesligado, id] : somDesligado.filter((x) => x !== id); try { localStorage.setItem('f1chat.somDesligado', JSON.stringify(somDesligado)); } catch (e) {} }
function somApagar() { if (botAtual && somLigado(botAtual.id)) Sons.tocar('apagar'); }

const liberarId = (id) => setTimeout(() => removendo.delete(id), 5000); // depois que a mensagem some, o id sai da lista de "virando poeira" (assim, se ela for restaurada da lixeira, volta para a conversa)
async function apagarMensagem(m) {
  const e = noDom.get(m.id); removendo.add(m.id); noDom.delete(m.id); msgs = msgs.filter((x) => x.id !== m.id);
  somApagar(); const anim = estalar(e); // a animação começa na hora, junto com o pedido ao servidor
  try { await chamar('apagar-mensagem', { id: m.id }); if (botAtual) Historico.apagarMensagem(botAtual.id, m.id); await anim; if (e) e.remove(); separarDias(); liberarId(m.id); }
  catch (err) { removendo.delete(m.id); if (e) e.remove(); aviso(limparErro(err), 'erro'); }
}
async function limparConversa() {
  try {
    const r = await chamar('limpar', { botId: botAtual.id }); Historico.limparBot(botAtual.id);
    const area = $('msgs').getBoundingClientRect(); // só as mensagens que aparecem na tela viram poeira (as outras somem direto)
    const visiveis = [...$('msgsLista').querySelectorAll('.msg')].filter((x) => { const b = x.getBoundingClientRect(); return b.bottom > area.top && b.top < area.bottom; }).slice(-8);
    msgs.forEach((x) => removendo.add(x.id)); msgs = []; noDom.clear(); somApagar();
    await Promise.all(visiveis.map((x, i) => estalar(x, i * 90)));
    $('msgsLista').replaceChildren(); aviso((r.apagadas || 0) + ' mensagens apagadas');
  }
  catch (e) { aviso(limparErro(e), 'erro'); }
}

// ---------- janelinhas ----------
function abrirModal(titulo, corpo) { $('modalTitulo').textContent = titulo; $('modalCorpo').replaceChildren(...[corpo].flat()); $('modal').hidden = false; const p = $('modalCorpo').querySelector('input,textarea,select'); if (p) p.focus(); }
function fecharModal() { $('modal').hidden = true; }
$('modalFechar').addEventListener('click', fecharModal);
$('modal').addEventListener('mousedown', (ev) => { if (ev.target === $('modal')) fecharModal(); });
function confirmar(titulo, texto, rotulo, fazer) {
  abrirModal(titulo, [el('p', { texto }), el('div', { className: 'linha' }, el('button', { texto: 'Cancelar', onclick: fecharModal }), el('button', { className: 'perigo-solido', texto: rotulo, onclick: () => { fecharModal(); fazer(); } }))]);
}
// Pede para DIGITAR o nome (ou palavra) antes de liberar o botão perigoso
function confirmarDigitando(titulo, texto, exigido, rotulo, fazer) {
  const caixaNome = el('input', { placeholder: exigido, autocomplete: 'off', spellcheck: 'false' });
  const ok = el('button', { className: 'perigo-solido', texto: rotulo, disabled: true, onclick: () => { fecharModal(); fazer(); } });
  caixaNome.addEventListener('input', () => { ok.disabled = caixaNome.value.trim().toLowerCase() !== exigido.trim().toLowerCase(); });
  caixaNome.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ok.disabled) ok.click(); });
  abrirModal(titulo, [el('p', { texto }), el('p', {}, 'Para confirmar, digite o nome do bot: ', el('b', { texto: exigido })), caixaNome, el('div', { className: 'linha' }, el('button', { texto: 'Cancelar', onclick: fecharModal }), ok)]);
}
// ---------- peças visuais das telas de opções: cartão por assunto, linha de opção e interruptor ----------
let contadorOpcao = 0;
function secao(nomeIcone, titulo, descricao, ...filhos) { // cartão com ícone + título (+ explicação curta)
  return el('section', { className: 'cartao' },
    el('header', { className: 'cartao-topo' }, el('span', { className: 'cartao-ic' }, icone(nomeIcone)), el('div', {}, el('h4', { texto: titulo }), descricao ? el('small', { texto: descricao }) : '')),
    el('div', { className: 'cartao-corpo' }, ...filhos));
}
function opcao(titulo, descricao, ...controles) { // linha: título + explicação à esquerda, controle(s) à direita (clicar no texto aciona o último controle)
  const ctl = controles.flat().filter(Boolean), alvo = ctl.filter((c) => /^(INPUT|SELECT)$/.test(c.tagName)).pop(), id = 'op' + (++contadorOpcao);
  if (alvo) alvo.id = id;
  return el('div', { className: 'opcao' }, el('label', { className: 'opcao-txt', for: alvo ? id : null }, el('b', { texto: titulo }), descricao ? el('small', { texto: descricao }) : ''), ...ctl);
}
function interruptor(valor, aoMudar) { // liga/desliga (no lugar da caixinha de marcar)
  const i = el('input', { type: 'checkbox', className: 'sw', role: 'switch' }); i.checked = !!valor;
  if (aoMudar) i.addEventListener('change', () => aoMudar(i.checked));
  return i;
}
const campo = (rotulo, input) => el('label', {}, rotulo, input);
const caixa = (rotulo, input) => el('label', { className: 'caixa' }, input, rotulo);

function abrirNovoBot() {
  const nome = el('input', { placeholder: 'Ex.: Entrega de conteúdo', maxlength: 60 });
  const chave = el('input', { placeholder: 'Deixe vazio para gerar uma key nova', autocomplete: 'off', spellcheck: 'false' });
  const msg = el('p', { className: 'msg-erro' });
  const criar = async () => {
    try {
      const r = await chamar('bot-criar', { nome: nome.value, chave: chave.value });
      fecharModal(); aviso(r.aviso || 'Bot criado!', r.aviso ? 'aviso' : 'ok');
      const lista = await chamar('bots'); receberBots(lista);
      const novo = lista.bots.find((b) => b.chave === r.bot.chave); if (novo) { await abrirBot(novo.id); abrirGerenciar(); }
    } catch (e) { msg.textContent = limparErro(e); }
  };
  nome.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') criar(); });
  abrirModal('Criar bot novo', [campo('Nome do bot', nome), campo('Já tenho uma key (opcional — para bot que já está no n8n)', chave), msg,
    el('button', { className: 'principal', texto: 'Criar bot', onclick: criar })]);
}

const soPc = (e) => { e.classList.add('so-pc'); return e; }; // some no app de celular (celular.css)
function abrirGerenciar() {
  const b = botAtual; if (!b) return;
  const opSom = el('input', { type: 'checkbox' }); opSom.checked = somLigado(b.id);
  opSom.addEventListener('change', () => { alternarSom(b.id); aviso(opSom.checked ? 'Efeitos sonoros ligados neste bot' : 'Efeitos sonoros desligados neste bot'); });
  const opSoRecebe = el('input', { type: 'checkbox' }); opSoRecebe.checked = soRecebe(b.id);
  opSoRecebe.addEventListener('change', () => { alternarSoRecebe(b.id); aviso(opSoRecebe.checked ? 'Este bot agora só recebe mensagens' : 'Este bot voltou a poder enviar mensagens'); });
  const opPasta = el('input', { type: 'checkbox' }); opPasta.checked = true;
  chamar('config-ler').then((c) => { opPasta.checked = c.abrirPastaAoUsar; }).catch(() => {});
  opPasta.addEventListener('change', async () => { try { await chamar('config-salvar', { abrirPastaAoUsar: opPasta.checked }); aviso(opPasta.checked ? 'Ao clicar em Usar, a pasta vai abrir' : 'Ao clicar em Usar, a pasta NÃO abre (a imagem fica na pasta de saída)'); } catch (e) { aviso(limparErro(e), 'erro'); } });
  const lblPasta = el('p', { className: 'dica', texto: '…' });
  const mostrarPasta = (c) => { lblPasta.textContent = c.pastaSaidaAtual + (c.pastaSaida ? '' : ' (padrão)'); };
  chamar('config-ler').then(mostrarPasta).catch(() => {});
  const btnPasta = el('button', { type: 'button', className: 'sec' }, icone('folder-open', 16), ' Escolher pasta');
  btnPasta.addEventListener('click', async () => { try { const r = await chamar('escolher-pasta'); if (r.pasta) { await chamar('config-salvar', { pastaSaida: r.pasta }); mostrarPasta(await chamar('config-ler')); aviso('Pasta de saída trocada'); } } catch (e) { aviso(limparErro(e), 'erro'); } });
  const btnPadrao = el('button', { type: 'button', className: 'sec', texto: 'Usar padrão' });
  btnPadrao.addEventListener('click', async () => { try { await chamar('config-salvar', { pastaSaida: '' }); mostrarPasta(await chamar('config-ler')); aviso('Voltou para a pasta padrão'); } catch (e) { aviso(limparErro(e), 'erro'); } });
  const nome = el('input', { value: b.nome, maxlength: 60 }), msg = el('p');
  const chaveBox = el('div', { className: 'chave', texto: b.chave });
  let editando = null; // comando que está sendo editado (null = adicionando um novo)
  const cmdLista = el('div'), cmdNovo = el('input', { placeholder: '/comando' }), cmdDesc = el('input', { placeholder: 'Para que serve (opcional)' });
  const desenharCmds = () => {
    cmdLista.replaceChildren(...(comandosDoBot.length ? comandosDoBot.map((c) => el('div', { className: 'cmd-item' }, el('span', {}, el('b', { texto: c.comando }), ' ', el('small', { texto: c.descricao || '' })),
      el('div', { className: 'linha' }, el('button', { className: 'icone', title: 'Editar comando', onclick: () => { editando = c; cmdNovo.value = c.comando; cmdDesc.value = c.descricao || ''; btnAdd.textContent = 'Salvar alteração'; cmdNovo.focus(); } }, icone('pencil')),
      el('button', { className: 'icone perigo', title: 'Apagar comando', onclick: async () => { try { await chamar('comando-apagar', { id: c.id }); await carregarComandos(); desenharCmds(); } catch (e) { msg.className = 'msg-erro'; msg.textContent = limparErro(e); } } }, icone('trash-2')))))
      : [el('p', { texto: 'Nenhum comando ainda.' })]));
  };
  desenharCmds();
  const btnAdd = el('button', { texto: 'Adicionar', onclick: async () => { // novo comando, ou salva a edição (apaga o antigo e cria de novo; se falhar, devolve o antigo)
    try {
      if (editando) { const antigo = editando; await chamar('comando-apagar', { id: antigo.id });
        try { await chamar('comando-criar', { botId: b.id, comando: cmdNovo.value, descricao: cmdDesc.value }); } catch (e) { await chamar('comando-criar', { botId: b.id, comando: antigo.comando, descricao: antigo.descricao }); throw e; } }
      else await chamar('comando-criar', { botId: b.id, comando: cmdNovo.value, descricao: cmdDesc.value });
      editando = null; btnAdd.textContent = 'Adicionar'; cmdNovo.value = cmdDesc.value = ''; await carregarComandos(); desenharCmds(); falar('');
    } catch (e) { await carregarComandos(); desenharCmds(); falar(limparErro(e), true); } } });
  const falar = (t, erro) => { msg.className = erro ? 'msg-erro' : 'msg-ok'; msg.textContent = t; };
  const fotoInput = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true });
  fotoInput.addEventListener('change', async () => {
    const arq = fotoInput.files[0]; if (!arq) return;
    try { await chamar('bot-avatar', { chave: b.chave, dataUrl: await lerArquivo(arq) }); falar('Foto de perfil salva.'); receberBots(await chamar('bots')); } catch (e) { falar(limparErro(e), true); }
  });
  abrirModal('Bot: ' + b.nome, [
    campo('Nome', el('div', { className: 'linha' }, nome, el('button', { texto: 'Salvar nome', onclick: async () => { try { await chamar('bot-editar', { id: b.id, nome: nome.value }); falar('Nome salvo.'); receberBots(await chamar('bots')); $('convNome').textContent = nome.value; } catch (e) { falar(limparErro(e), true); } } }))),
    el('h4', { texto: 'Key (cole no trigger do n8n)' }), chaveBox,
    el('div', { className: 'linha' },
      el('button', { onclick: () => { chamar('copiar-texto', { texto: b.chave }); falar('Key copiada. Não mostre para ninguém.'); } }, icone('copy'), 'Copiar key'),
      el('button', { onclick: () => fotoInput.click() }, icone('image'), 'Foto de perfil'),
      el('button', { className: 'perigo', onclick: () => confirmar('Gerar key nova', 'A key antiga para de funcionar e você terá que colar a nova no n8n. Continuar?', 'Gerar nova', async () => { try { await chamar('bot-nova-chave', { id: b.id, chave: b.chave }); receberBots(await chamar('bots')); abrirGerenciar(); } catch (e) { aviso(limparErro(e), 'erro'); } }) }, icone('refresh-cw'), 'Gerar key nova')),
    fotoInput,
    el('h4', { texto: 'Comandos (aparecem quando você digita /)' }), cmdLista,
    el('div', { className: 'linha' }, cmdNovo, cmdDesc, btnAdd),
    el('h4', { texto: 'Opções do bot' }), caixa('Efeitos sonoros neste bot (mensagem nova, enviar, apagar, comandos)', opSom), caixa('Bot de avisos: só recebe mensagens (esconde o campo de enviar, o clipe e os comandos)', opSoRecebe), soPc(caixa('Abrir a pasta quando clicar em Usar', opPasta)),
    soPc(el('h4', { texto: 'Pasta das imagens baixadas e do histórico exportado' })), soPc(lblPasta), soPc(el('div', { className: 'linha' }, [btnPasta, btnPadrao])),
    msg, el('h4', { texto: 'Zona de perigo' }),
    el('button', { className: 'perigo', onclick: () => confirmar('Limpar a conversa', `Apagar TODAS as mensagens do bot "${b.nome}"? Isso não dá para desfazer.`, 'Apagar tudo', limparConversa) }, icone('eraser'), 'Limpar a conversa'),
    el('button', { className: 'perigo', onclick: apagarBotAtual }, icone('trash-2'), 'Apagar este bot')]);
}
$('btnBaixarTodas').addEventListener('click', async () => {
  if (!botAtual) return; const b = $('btnBaixarTodas'); b.disabled = true;
  try { const r = await chamar('baixar-posts', { botId: botAtual.id, nome: botAtual.nome }); aviso(r.n ? `${r.n} imagem(ns) baixada(s)` + (r.total > r.n ? ` (${r.total - r.n} falharam)` : '') : 'Nenhum post neste chat.'); }
  catch (e) { aviso(limparErro(e), 'erro'); } b.disabled = false;
});

// ---------- ícone (logo) do programa ----------
async function aplicarLogo() { try { const r = await chamar('icone-ler'); $('logoApp').src = r.dataUrl; return r; } catch (e) { return null; } }
// PNG/JPG/WebP -> PNG 512x512 (corta o centro). O programa ainda reduz para 256 e põe na janela, na bandeja e no atalho.
async function imagemParaPng(arq) {
  const img = new Image(); // (usa data: porque a política de segurança da tela não deixa abrir blob:)
  await new Promise(async (ok, no) => { img.onload = ok; img.onerror = () => no(new Error('Não consegui abrir essa imagem. Use PNG, JPG ou WebP.')); img.src = await lerArquivo(arq); });
  const c = document.createElement('canvas'); c.width = c.height = 512; const l = Math.min(img.naturalWidth, img.naturalHeight);
  c.getContext('2d').drawImage(img, (img.naturalWidth - l) / 2, (img.naturalHeight - l) / 2, l, l, 0, 0, 512, 512);
  return c.toDataURL('image/png');
}
function blocoIcone(falar) {
  const prev = el('img', { className: 'ic-prev', alt: '' }), arqIn = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true });
  aplicarLogo().then((r) => { if (r) prev.src = r.dataUrl; });
  arqIn.addEventListener('change', async () => {
    const arq = arqIn.files[0]; arqIn.value = ''; if (!arq) return;
    try { prev.src = await chamar('icone-definir', { dataUrl: await imagemParaPng(arq) }); await aplicarLogo(); falar('Ícone trocado (janela, bandeja e atalho da área de trabalho).'); } catch (e) { falar(limparErro(e), true); }
  });
  return el('div', {},
    el('div', { className: 'linha ic' }, prev,
      el('button', { className: 'principal', texto: 'Escolher imagem…', onclick: () => arqIn.click() }),
      el('button', { texto: 'Voltar ao padrão', onclick: async () => { try { prev.src = await chamar('icone-restaurar'); await aplicarLogo(); falar('Voltou ao ícone padrão.'); } catch (e) { falar(limparErro(e), true); } } })),
    el('div', { className: 'linha mt8' }, el('button', { onclick: async () => { try { await chamar('icone-atalho'); falar('Atalho criado na área de trabalho.'); } catch (e) { falar(limparErro(e), true); } } }, icone('monitor'), 'Criar/atualizar atalho na área de trabalho')),
    arqIn);
}

// ---------- atualização automática (Configurações) ----------
let atualizaTimer = null;
function blocoAtualizacao() {
  const texto = el('b', { texto: 'Verificando…' }), barra = el('progress', { className: 'barra-disco', max: 100, value: 0 }), detalhe = el('small', { texto: '' });
  const procurar = el('button', { texto: 'Procurar atualização' }), reiniciar = el('button', { className: 'principal', hidden: true, texto: 'Reiniciar e atualizar' });
  const mostrar = (e) => {
    const f = e.fase;
    texto.textContent = { parado: 'Ainda não procurou', procurando: 'Procurando…', baixando: 'Baixando a versão ' + (e.versaoNova || '') + ' (' + (e.progresso || 0) + '%)', pronta: 'Versão ' + e.versaoNova + ' pronta para instalar',
      atualizado: 'Você está na versão mais nova', erro: 'Não consegui procurar', indisponivel: 'Só funciona no programa instalado' }[f] || f;
    detalhe.textContent = f === 'erro' ? e.erro : (e.verificadoEm && f === 'atualizado' ? 'Última verificação: ' + fmtQuando(new Date(e.verificadoEm).toISOString()) : '');
    barra.hidden = f !== 'baixando'; barra.value = e.progresso || 0; reiniciar.hidden = f !== 'pronta';
    procurar.disabled = f === 'procurando' || f === 'baixando' || f === 'indisponivel' || f === 'pronta';
  };
  const ler = async () => { if ($('modalTitulo').textContent !== 'Configurações' || $('modal').hidden) { clearInterval(atualizaTimer); atualizaTimer = null; return; } try { mostrar(await chamar('atualizacao-estado')); } catch (e) { /* ignora */ } };
  procurar.addEventListener('click', async () => { procurar.disabled = true; try { mostrar(await chamar('atualizacao-procurar')); } catch (e) { aviso(limparErro(e), 'erro'); } });
  reiniciar.addEventListener('click', () => { chamar('atualizacao-instalar'); });
  clearInterval(atualizaTimer); ler(); atualizaTimer = setInterval(ler, 1500); // só olha o andamento enquanto as Configurações estão abertas
  return secao('download', 'Atualização do Chat', 'O Chat pergunta ao seu servidor ao abrir e de tempos em tempos', el('div', { className: 'usr-info' }, texto, detalhe), barra, el('div', { className: 'botoes esq' }, procurar, reiniciar),
    el('p', { className: 'dica', texto: 'Para publicar uma versão nova: coloque o instalador e o latest.yml na pasta dados/atualizacoes do servidor.' }));
}
// Créditos do projeto (um lugar só: para mudar, é só editar aqui)
const CREDITOS = [['Código', 'Claude (IA) e outras ferramentas de IA'], ['Design', 'Figma'], ['Criador', 'SENSE1_BAT (Heljaco Junior)'], ['Empresa', 'Sense1_group'], ['Perfil profissional', 'F1 Journal News']];
async function abrirConfig() {
  const c = await chamar('config-ler');
  const end = el('input', { value: c.endereco, placeholder: 'http://100.75.226.42:3006 (Tailscale) ou http://10.0.0.205:3006 (casa)' });
  const cod = el('input', { type: 'password', placeholder: c.temCodigo ? '•••••••• (já salvo — deixe vazio para manter)' : 'Código de acesso do .env do servidor', autocomplete: 'off' });
  const msg = el('p');
  const seg = interruptor(c.segundoPlano), ini = interruptor(c.iniciarComWindows);
  const dias = el('select', {}, ...[[0, 'Nunca apagar'], [7, 'Depois de 7 dias'], [15, 'Depois de 15 dias'], [30, 'Depois de 30 dias']].map(([v, t]) => el('option', { value: v, texto: t })));
  dias.value = String(c.autoApagarDias);
  const falar = (t, erro) => { msg.className = erro ? 'msg-erro' : 'msg-ok'; msg.textContent = t; };
  const ehAdmin = c.usuario ? c.usuario.admin : c.temCodigo; // entrou como administrador (usuário admin ou código de acesso)
  const usr = el('input', { placeholder: 'Usuário', autocomplete: 'username' }), sen = el('input', { type: 'password', placeholder: 'Senha', autocomplete: 'current-password' });
  const entrarAgora = async () => {
    try { falar('Entrando…'); await chamar('entrar', { endereco: end.value, usuario: usr.value, senha: sen.value }); fecharModal(); aviso('Você entrou como ' + usr.value.trim().toLowerCase()); assinaturaLista = ''; receberBots(await chamar('bots')); }
    catch (e) { falar(limparErro(e), true); }
  };
  sen.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') entrarAgora(); });
  const blocoConta = c.usuario
    ? [el('div', { className: 'conta' }, el('span', { className: 'mini-av grande', texto: (c.usuario.nome || '?').slice(0, 1).toUpperCase() }),
        el('div', {}, el('b', { texto: c.usuario.nome }), el('small', { texto: c.usuario.admin ? 'Administrador' : 'Funcionário' }))),
       el('div', { className: 'botoes' }, el('button', { texto: 'Sair da conta', onclick: async () => { await chamar('sair'); fecharModal(); aviso('Você saiu da conta'); assinaturaLista = ''; receberBots(await chamar('bots')); } }),
         ...(c.usuario.admin ? [el('button', { texto: 'Gerenciar usuários', onclick: () => abrirUsuarios() })] : []))]
    : [campo('Usuário', usr), campo('Senha', sen),
       el('div', { className: 'botoes' }, ...(ehAdmin ? [el('button', { texto: 'Gerenciar usuários', onclick: () => abrirUsuarios() })] : []), el('button', { className: 'principal', texto: 'Entrar', onclick: entrarAgora })),
       el('p', { className: 'dica', texto: 'Funcionários entram só com usuário e senha. O código de acesso é do administrador.' })];
  const infoVersao = el('p', { className: 'info-versao', texto: '' });
  chamar('info').then((i) => { infoVersao.textContent = `F1 Journal Chat V${i.versao} · Electron ${i.electron} · ${i.sistema}`; infoVersao.append(' ', el('button', { className: 'link', texto: 'Copiar para suporte', onclick: () => { chamar('copiar-texto', { texto: `${infoVersao.firstChild.textContent}\nServidor: ${end.value || '(vazio)'}` }); aviso('Copiado (sem o código de acesso)'); } })); }).catch(() => {});
  const testar = el('button', { texto: 'Testar conexão', onclick: async () => { falar('Testando…'); const r = await chamar('testar', { endereco: end.value, codigo: cod.value || undefined }); r.ok ? falar('Conectou! Servidor versão ' + r.versao) : falar(r.erro, true); } });
  const salvarTudo = el('button', { className: 'principal', texto: 'Salvar', onclick: async () => {
    try { await chamar('config-salvar', { endereco: end.value, codigo: cod.value, segundoPlano: seg.checked, iniciarComWindows: ini.checked, autoApagarDias: Number(dias.value) });
      fecharModal(); aviso('Configurações salvas'); receberBots(await chamar('bots')); } catch (e) { falar(limparErro(e), true); } } });
  const gerarZip = el('button', { onclick: async () => { falar('Gerando…'); try { const r = await chamar('zip-projeto'); falar(`Zip pronto (${r.arquivos} arquivos, ${r.kb} KB). Anexe no chat da IA e cole a frase que já foi copiada.`); } catch (e) { falar(limparErro(e), true); } } }, icone('file-down'), 'Gerar zip do projeto para a IA');
  abrirModal('Configurações', [
    secao('server', 'Servidor do Chat', 'Onde o Chat busca e envia as mensagens', campo('Endereço', end)),
    secao('user-round', c.usuario ? 'Sua conta' : 'Entrar na conta', c.usuario ? '' : 'Use o usuário e a senha que o administrador criou', ...blocoConta),
    secao('shield-check', 'Acesso de administrador', 'Só quem cuida do servidor usa o código', campo('Código de acesso', cod)),
    soPc(secao('monitor', 'Programa', 'Como o Chat se comporta neste computador',
      opcao('Continuar na bandeja ao fechar a janela', 'Necessário para receber avisos com a janela fechada', seg),
      opcao('Abrir junto com o Windows', 'O Chat já começa ligado quando você liga o PC', ini))),
    secao('hard-drive', 'Histórico', 'Mensagens guardadas neste aparelho', opcao('Apagar mensagens antigas', 'Limpa sozinho o que passar do prazo', dias)),
    soPc(secao('bell-ring', 'Avisos e sons', 'Notificações de mensagem nova', opcao('Notificações e sons', 'Avisos, sons e quais bots avisam', el('button', { texto: 'Abrir', onclick: () => abrirNotificacoes() })))),
    ...(ehAdmin ? [secao('activity', 'Painel de saúde', 'Só roda enquanto está aberto no menu ☰', opcao('Painel de saúde do servidor', 'Desligado: o botão some do menu', interruptor(painelSaude.ligado(), (v) => painelSaude.definir(v))))] : []),
    soPc(blocoAtualizacao()),
    soPc(secao('sparkles', 'Atualizações futuras com IA', 'Para continuar o projeto em outro chat de IA', el('div', { className: 'botoes esq' }, gerarZip),
      el('p', { className: 'dica', texto: 'Salva um zip na pasta de saída e copia a frase "Leia o LEIA-PRIMEIRO-IA.md e continue de onde parou." Não leva senha nem código de acesso.' }))),
    soPc(secao('image', 'Ícone do programa', 'Janela, bandeja e atalho', blocoIcone(falar))),
    secao('info', 'Sobre', 'Quem fez o F1 Journal Chat', ...CREDITOS.map(([r, v]) => el('p', { className: 'creditos' }, el('small', { texto: r }), el('b', { texto: v })))),
    infoVersao,
    el('div', { className: 'rodape-modal' }, msg, el('div', { className: 'botoes' }, testar, salvarTudo))]);
}
$('btnConfig').addEventListener('click', abrirConfig);

// ---------- Notificações: tudo sobre avisos de mensagem nova num lugar só ----------
// bloco "Sons" da tela Notificações: volume, estilo da mensagem nova e liga/desliga de cada som (guardado neste aparelho, em sons.js)
function blocoSons() {
  const cfg = Sons.ler();
  const vol = el('input', { type: 'range', min: 0, max: 100, step: 5, className: 'volume' }); vol.value = cfg.volume;
  vol.addEventListener('input', () => Sons.salvar({ volume: Number(vol.value) })); vol.addEventListener('change', () => Sons.tocar('mensagem', true));
  const estilo = el('select', {}, ...Object.entries(Sons.ESTILOS_MENSAGEM).map(([k, v]) => el('option', { value: k, texto: v[0] }))); estilo.value = cfg.estiloMensagem;
  estilo.addEventListener('change', () => { Sons.salvar({ estiloMensagem: estilo.value }); Sons.tocar('mensagem', true); });
  const linhas = Sons.EVENTOS.map(([ev, nome]) => {
    const sw = interruptor(!cfg.desligados.includes(ev), (ligado) => { const d = Sons.ler().desligados.filter((x) => x !== ev); Sons.salvar({ desligados: ligado ? d : [...d, ev] }); });
    const linha = opcao(nome, '', el('button', { className: 'icone', title: 'Ouvir', onclick: () => Sons.tocar(ev, true) }, icone('volume-2')), sw); linha.classList.add('som-linha'); return linha;
  });
  return [opcao('Volume', '', vol), opcao('Som da mensagem nova', 'Escolha o estilo', estilo), el('h5', { texto: 'Quando tocar' }), ...linhas, el('p', { className: 'dica', texto: 'Cada bot também pode ficar sem sons: ⋮ > Opções do bot.' })];
}
async function abrirNotificacoes() {
  const c = await chamar('config-ler');
  const salvar = async (parte) => { try { await chamar('config-salvar', parte); } catch (e) { aviso(limparErro(e), 'erro'); } };
  const sw = (valor, chave) => interruptor(valor, (v) => salvar({ [chave]: v }));
  const seg = el('select', {}, ...[3, 5, 8, 12, 20, 30].map((v) => el('option', { value: v, texto: v + ' segundos' }))); seg.value = String(c.avisoSegundos); seg.addEventListener('change', () => salvar({ avisoSegundos: Number(seg.value) }));
  const resp = el('p', { className: 'dica' });
  const testar = async (tipo) => { resp.textContent = 'Testando…'; try { resp.textContent = (await chamar('aviso-testar', { tipo })).texto; } catch (e) { resp.textContent = limparErro(e); } atualizarDiario(); };
  const diario = el('pre', { className: 'diario', texto: '' });
  const atualizarDiario = async () => { try { const l = (await chamar('aviso-diario')).linhas; diario.textContent = l.length ? l.join('\n') : 'Nenhuma mensagem nova chegou desde que o Chat abriu.'; } catch (e) { diario.textContent = ''; } };
  const mudos = c.silenciados || [];
  const listaBots = bots.length ? bots.map((b) => {
    const i = interruptor(!mudos.includes(String(b.id)), async (ligado) => { const atual = (await chamar('config-ler')).silenciados || []; const novo = ligado ? atual.filter((x) => x !== String(b.id)) : [...new Set([...atual, String(b.id)])]; await salvar({ silenciados: novo }); silenciados = novo; assinaturaLista = ''; desenharLista(); });
    const linha = opcao(b.nome, '', i); linha.prepend(el('span', { className: 'mini-av', texto: (b.nome || '?').slice(0, 1).toUpperCase() })); return linha;
  }) : [el('p', { className: 'dica', texto: 'Nenhum bot ainda.' })];
  abrirModal('Notificações', [
    el('p', { className: 'dica sem-margem', texto: 'Tudo aqui salva na hora.' }),
    secao('bell-ring', 'Avisos de mensagem nova', 'Quando o Chat está fora de foco',
      opcao('Avisar quando chegar mensagem', '', sw(c.notificarWindows, 'notificarWindows')),
      opcao('Aviso do Chat no canto da tela', 'Se a janelinha não aparecer, o Chat usa o aviso padrão do Windows sozinho', sw(c.avisoPersonalizado !== false, 'avisoPersonalizado')),
      opcao('Piscar o ícone na barra de tarefas', '', sw(c.piscarIcone, 'piscarIcone')),
      opcao('Som do Windows no aviso padrão', '', sw(c.somNotificacao, 'somNotificacao')),
      opcao('Tempo do aviso na tela', '', seg)),
    secao('volume-2', 'Sons', 'Efeitos do Chat, guardados neste aparelho', ...blocoSons()),
    secao('bot', 'Quais bots avisam', 'Desligue os que você não quer ouvir', ...listaBots),
    secao('flask-conical', 'Testar', 'Veja se os avisos estão aparecendo',
      el('div', { className: 'botoes esq' }, el('button', { className: 'principal', texto: 'Testar aviso do Chat', onclick: () => testar('personalizado') }), el('button', { texto: 'Testar aviso do Windows', onclick: () => testar('windows') })),
      resp,
      el('details', { className: 'detalhes' }, el('summary', { texto: 'O aviso do Windows não aparece?' }), el('p', { className: 'dica', texto: 'Abra Configurações do Windows > Sistema > Notificações e confira se "Não incomodar" / "Assistência de foco" está desligado e se o F1 Journal Chat está permitido.' }))),
    secao('scroll-text', 'O que aconteceu nas últimas mensagens', 'Ajuda a descobrir por que um aviso não saiu', diario)]);
  atualizarDiario();
}
$('btnNotif').addEventListener('click', abrirNotificacoes);

// ---------- Lixeira: mensagens apagadas ficam aqui por alguns minutos e dá para restaurar (precisa do servidor 0.6.0) ----------
const fmtBytes = (n) => { if (n == null) return '—'; const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0, v = n; while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; } return v.toLocaleString('pt-BR', { maximumFractionDigits: i ? 1 : 0 }) + ' ' + u[i]; };
const fmtDuracao = (seg) => { const d = Math.floor(seg / 86400), h = Math.floor(seg % 86400 / 3600), m = Math.floor(seg % 3600 / 60); return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`; };
const fmtQuando = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
function fmtRestante(ms) { const s = Math.max(0, Math.round(ms / 1000)); return s >= 60 ? Math.ceil(s / 60) + ' min' : s + ' s'; }
async function abrirLixeira() {
  let r; try { r = await chamar('lixeira'); } catch (e) { aviso(limparErro(e), 'erro'); return; }
  let itens = r.mensagens || []; const minutos = r.minutos || 20;
  const lista = el('div', { className: 'lixo-lista' });
  const apagarTudo = el('button', { className: 'perigo', texto: 'Esvaziar lixeira', onclick: async () => {
    if (!apagarTudo.dataset.certeza) { apagarTudo.dataset.certeza = '1'; apagarTudo.textContent = 'Clique de novo para esvaziar'; return; }
    try { await chamar('lixeira-esvaziar'); itens = []; desenhar(); aviso('Lixeira esvaziada'); } catch (e) { aviso(limparErro(e), 'erro'); } } });
  const tirar = (m) => { itens = itens.filter((x) => x.id !== m.id); desenhar(); };
  const restaurar = async (m) => {
    try { await chamar('lixeira-restaurar', { id: m.id }); removendo.delete(m.id); tirar(m); aviso('Mensagem restaurada em ' + m.bot_nome);
      assinaturaLista = ''; assinaturaMsgs = ''; receberBots(await chamar('bots')); if (botAtual && botAtual.id === m.bot_id) atualizarConversa(false);
    } catch (e) { aviso(limparErro(e), 'erro'); tirar(m); }
  };
  const apagarDeVez = async (m) => { try { await chamar('lixeira-apagar', { id: m.id }); tirar(m); } catch (e) { aviso(limparErro(e), 'erro'); } };
  function cartao(m) {
    const restante = Math.min(minutos * 60000, Date.parse(m.expira_em) - Date.now());
    const conteudo = m.tipo === 'foto'
      ? [(() => { const img = el('img', { className: 'lixo-foto', alt: '' }); if (m.arquivo) carregarFoto(img, m.arquivo); img.onclick = null; return img; })(), m.texto ? el('p', { className: 'lixo-txt', texto: m.texto }) : '']
      : [el('p', { className: 'lixo-txt', texto: m.texto })];
    return el('div', { className: 'lixo-item' },
      el('div', { className: 'lixo-topo' }, el('span', { className: 'mini-av', texto: (m.bot_nome || '?').slice(0, 1).toUpperCase() }), el('b', { texto: m.bot_nome }), el('small', { className: 'lixo-tempo', texto: 'some em ' + fmtRestante(restante) })),
      ...conteudo,
      el('div', { className: 'botoes' }, el('button', { className: 'icone perigo', title: 'Apagar de vez', onclick: () => apagarDeVez(m) }, icone('trash-2')), el('button', { className: 'principal', onclick: () => restaurar(m) }, icone('rotate-ccw'), 'Restaurar')));
  }
  function desenhar() {
    lista.replaceChildren(...(itens.length ? itens.map(cartao) : [el('div', { className: 'lixo-vazio' }, icone('trash-2'), el('p', { texto: 'A lixeira está vazia.' }))]));
    apagarTudo.hidden = !itens.length;
  }
  abrirModal('Lixeira', [el('p', { className: 'dica sem-margem', texto: `Mensagens apagadas ficam aqui por ${minutos} minutos e depois somem de vez.` }), lista, el('div', { className: 'botoes' }, apagarTudo)]);
  desenhar();
  const relogio = setInterval(async () => { // com a tela aberta: atualiza a contagem e some o que venceu
    if (!lista.isConnected) { clearInterval(relogio); return; }
    try { itens = (await chamar('lixeira')).mensagens || []; desenhar(); } catch (e) {}
  }, 15000);
}
$('btnLixeira').addEventListener('click', abrirLixeira);

// ---------- Saúde do servidor (só administrador; precisa do servidor 0.6.0) ----------
const painelSaude = { ligado: () => { try { return localStorage.getItem('f1chat.saudeOff') !== '1'; } catch (e) { return true; } },
  definir: (v) => { try { v ? localStorage.removeItem('f1chat.saudeOff') : localStorage.setItem('f1chat.saudeOff', '1'); } catch (e) { /* sem armazenamento: ignora */ } } };
let saudeTimer = null;
const pararSaude = () => { clearInterval(saudeTimer); saudeTimer = null; }; // o painel só trabalha enquanto está aberto
async function abrirSaude() {
  pararSaude();
  const refazer = async () => {
    let s; try { s = await chamar('saude'); } catch (e) { aviso(limparErro(e), 'erro'); return; }
    const linha = (t, d, v) => opcao(t, d, el('span', { className: 'valor', texto: String(v) }));
    const disco = s.disco ? [linha('Espaço livre', 'No disco do servidor', `${fmtBytes(s.disco.livreBytes)} de ${fmtBytes(s.disco.totalBytes)}`),
      el('progress', { className: 'barra-disco', max: 100, value: Math.round((1 - s.disco.livreBytes / s.disco.totalBytes) * 100) })] : [linha('Espaço livre', '', 'não informado')];
    const bk = s.backup, fazer = el('button', { className: 'principal', onclick: async () => { fazer.disabled = true; try { const r = await chamar('backup-fazer'); aviso('Backup feito (' + fmtBytes(r.backup.bytes) + ')'); } catch (e) { aviso(limparErro(e), 'erro'); } refazer(); } }, icone('hard-drive'), 'Fazer backup agora');
    $('modalCorpo').replaceChildren(
      el('div', { className: 'saude-banner ' + (s.ok ? 'ok' : 'problema') }, icone(s.ok ? 'check' : 'triangle-alert'), el('div', {}, el('b', { texto: s.ok ? 'Tudo certo com o servidor' : 'Atenção' }), ...(s.ok ? [] : s.problemas.map((p) => el('small', { texto: p }))))),
      secao('server', 'Servidor', 'Programa que guarda as mensagens', linha('Versão', '', s.servidor.versao), linha('Ligado há', '', fmtDuracao(s.servidor.ligadoHaSegundos))),
      secao('hard-drive', 'Banco de dados', 'Tudo que está guardado', linha('Bots', '', s.banco.bots), linha('Usuários', '', s.banco.usuarios), linha('Mensagens', '', s.banco.mensagens), linha('Na lixeira', 'Somem de vez em ' + s.lixeiraMinutos + ' min', s.banco.naLixeira), linha('Tamanho do banco', '', fmtBytes(s.banco.bytes)), linha('Imagens', '', `${s.fotos.quantidade} (${fmtBytes(s.fotos.bytes)})`)),
      secao('server', 'Disco', null, ...disco),
      secao('download', 'Backup', `Automático a cada ${bk.aCadaHoras} h, guarda os ${bk.mantem} mais novos`, linha('Último backup', '', bk.ultimo ? `${fmtQuando(bk.ultimo.em)} (${fmtBytes(bk.ultimo.bytes)})` : 'nenhum ainda'), linha('Guardados', '', `${bk.total} de ${bk.mantem}`), el('div', { className: 'botoes esq' }, fazer),
        el('p', { className: 'dica', texto: 'Os backups ficam no mesmo disco do servidor. De vez em quando copie a pasta dados/backups para outro lugar.' })),
      ...(s.celular ? [secao('smartphone', 'Aviso no celular', 'Notificação com o app fechado (Firebase)',
        linha('Estado', s.celular.ligado ? 'Projeto ' + s.celular.projeto : s.celular.motivo, s.celular.ligado ? 'Ligado' : 'Desligado'),
        linha('Celulares registrados', 'Abra o app no celular e entre na conta', s.celular.aparelhos),
        linha('Último aviso enviado', s.celular.ultimo && s.celular.ultimo.erros.length ? 'Erro: ' + s.celular.ultimo.erros[0] : '', s.celular.ultimo ? fmtQuando(s.celular.ultimo.em) + ' (' + s.celular.ultimo.enviados + ' enviado(s))' : 'nenhum ainda'),
        el('div', { className: 'botoes esq' }, el('button', { onclick: async () => { try { const r = await chamar('celular-teste'); aviso('Teste enviado para ' + r.enviados + ' celular(es).' + (r.erros.length ? ' Erro: ' + r.erros[0] : '')); } catch (e) { aviso(limparErro(e), 'erro'); } } }, icone('send'), 'Enviar aviso de teste')))] : []),
      secao('bot', 'n8n', 'O que o servidor sabe sobre ele', linha('Triggers ao vivo', 'Registrados no servidor', s.n8n.triggersAoVivo), linha('Suas mensagens esperando o n8n', 'Se ficar sempre maior que 0, o n8n não está pegando', s.n8n.mensagensSuasEsperando)),
      el('div', { className: 'rodape-modal' }, el('div', { className: 'botoes' }, el('button', { onclick: () => { pararSaude(); fecharModal(); painelSaude.definir(false); $('btnSaude').hidden = true; aviso('Painel de saúde desativado. Para ligar de novo: Configurações.'); } }, icone('power'), 'Desativar painel'), el('button', { onclick: refazer }, icone('refresh-cw'), 'Atualizar'))));
  };
  abrirModal('Saúde do servidor', [el('p', { className: 'dica', texto: 'Carregando…' })]);
  await refazer();
  saudeTimer = setInterval(() => { if ($('modal').hidden || $('modalTitulo').textContent !== 'Saúde do servidor') pararSaude(); else refazer(); }, 5000); // atualiza sozinho a cada 5 s só com o painel aberto; ao sair, para
}
$('btnSaude').addEventListener('click', abrirSaude);

// ---------- usuários (só administrador): criar funcionários e escolher quais bots cada um enxerga ----------
async function abrirUsuarios() {
  let lista; try { lista = (await chamar('usuarios')).usuarios; } catch (e) { aviso(limparErro(e), 'erro'); return; }
  const nomeBot = (idB) => (bots.find((b) => b.id === idB) || {}).nome || '#' + idB;
  const linhas = lista.map((u) => {
    let apagar;
    apagar = el('button', { className: 'perigo', texto: 'Apagar', onclick: async () => {
      if (!apagar.dataset.certeza) { apagar.dataset.certeza = '1'; apagar.textContent = 'Clique de novo para apagar'; return; }
      try { await chamar('usuario-apagar', { id: u.id }); abrirUsuarios(); } catch (e) { aviso(limparErro(e), 'erro'); } } });
    return el('div', { className: 'usr' + (u.ativo ? '' : ' inativo') },
      el('div', { className: 'usr-info' }, el('b', { texto: u.nome }), u.admin ? el('span', { className: 'selo', texto: 'admin' }) : '', u.ativo ? '' : el('span', { className: 'selo off', texto: 'desativado' }),
        el('small', { texto: u.admin ? 'Vê todos os bots' : (u.bots.length ? u.bots.map(nomeBot).join(', ') : 'Nenhum bot liberado') })),
      el('div', { className: 'linha' }, el('button', { texto: 'Editar', onclick: () => formUsuario(u) }), apagar));
  });
  abrirModal('Usuários', [
    el('p', { className: 'dica', texto: 'Cada funcionário entra no Chat com usuário e senha e só enxerga os bots que você liberar aqui.' }),
    ...(linhas.length ? linhas : [el('p', { className: 'dica', texto: 'Nenhum usuário ainda.' })]),
    el('div', { className: 'linha mt8' }, el('button', { className: 'principal', texto: 'Novo usuário', onclick: () => formUsuario(null) }), el('button', { texto: 'Voltar', onclick: () => abrirConfig() }))]);
}
function formUsuario(u) {
  const msg = el('p'), falar = (t) => { msg.className = 'msg-erro'; msg.textContent = t; };
  const nome = el('input', { value: u ? u.nome : '', placeholder: 'ex.: ana (3 a 32 letras minúsculas/números)', autocomplete: 'off' }); if (u) nome.disabled = true;
  const senha = el('input', { type: 'password', placeholder: u ? 'Deixe vazio para manter a senha' : 'Mínimo 8 caracteres', autocomplete: 'new-password' });
  const admin = el('input', { type: 'checkbox' }), ativo = el('input', { type: 'checkbox' }); admin.checked = !!(u && u.admin); ativo.checked = u ? u.ativo : true;
  const reais = bots.filter((b) => typeof b.id === 'number'), marcas = new Map(reais.map((b) => [b.id, Object.assign(el('input', { type: 'checkbox' }), { checked: !!(u && u.bots.includes(b.id)) })]));
  const salvar = async () => {
    try {
      const botsLiberados = reais.filter((b) => marcas.get(b.id).checked).map((b) => b.id);
      if (u) await chamar('usuario-editar', { id: u.id, dados: { senha: senha.value, admin: admin.checked, ativo: ativo.checked, bots: botsLiberados } });
      else await chamar('usuario-criar', { usuario: nome.value, senha: senha.value, admin: admin.checked, bots: botsLiberados });
      aviso(u ? 'Usuário atualizado' : 'Usuário criado'); abrirUsuarios();
    } catch (e) { falar(limparErro(e)); }
  };
  abrirModal(u ? 'Editar ' + u.nome : 'Novo usuário', [
    campo('Usuário', nome), campo(u ? 'Nova senha' : 'Senha', senha), caixa('Administrador (vê tudo e gerencia usuários)', admin), ...(u ? [caixa('Conta ativa', ativo)] : []),
    el('h4', { texto: 'Bots que este usuário enxerga' }), ...(reais.length ? reais.map((b) => caixa(b.nome, marcas.get(b.id))) : [el('p', { className: 'dica', texto: 'Ainda não há bots.' })]),
    msg, el('div', { className: 'linha mt8' }, el('button', { className: 'principal', texto: 'Salvar', onclick: salvar }), el('button', { texto: 'Cancelar', onclick: () => abrirUsuarios() }))]);
}

// ---------- visualizador de foto ----------
let fotoAberta = { url: '', nome: '' };
function abrirLightbox(url, nome) { fotoAberta = { url, nome }; $('lbImg').onerror = async () => { $('lbImg').onerror = null; const d = await chamar('foto-offline', { arquivo: nome }); if (d) $('lbImg').src = d; }; $('lbImg').src = url; $('lbTitulo').textContent = nome; $('lightbox').hidden = false; }
const fecharLightbox = () => { $('lightbox').hidden = true; $('lbImg').removeAttribute('src'); };
$('lbFechar').addEventListener('click', fecharLightbox);
$('lightbox').addEventListener('click', (ev) => { if (ev.target === $('lightbox') || ev.target === $('lbImg')) fecharLightbox(); });
$('lbCopiar').addEventListener('click', () => { chamar('copiar-texto', { texto: fotoAberta.url }); aviso('Link da foto copiado'); });
$('lbBaixar').addEventListener('click', async () => { try { const r = await chamar('baixar-foto', { url: fotoAberta.url, nome: fotoAberta.nome }); if (r.ok) aviso('Foto salva'); } catch (e) { aviso(limparErro(e), 'erro'); } });
document.addEventListener('keydown', (ev) => { if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); $('busca').focus(); $('busca').select(); return; } if (ev.key === 'Escape') { if (!$('lightbox').hidden) fecharLightbox(); else if (!$('modal').hidden) fecharModal(); } });


// ---------- estilo Telegram: menu ⋮, painel de perfil, busca na conversa, menu ☰, tema ----------
let silenciados = [];
async function carregarSilenciados() { try { silenciados = (await chamar('config-ler')).silenciados || []; assinaturaLista = ''; desenharLista(); aplicarPainel(); } catch (e) {} }
async function alternarSilencio() {
  if (!botAtual) return;
  try {
    const id = String(botAtual.id), lista = (await chamar('config-ler')).silenciados || [];
    const novo = lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id];
    await chamar('config-salvar', { silenciados: novo }); silenciados = novo; assinaturaLista = ''; desenharLista(); aplicarPainel();
    aviso(novo.includes(id) ? 'Notificações deste bot silenciadas (o contador continua aparecendo)' : 'Notificações deste bot ativadas');
  } catch (e) { aviso(limparErro(e), 'erro'); }
}
function apagarBotAtual() {
  const b = botAtual; if (!b) return;
  confirmarDigitando('Apagar bot', `Apagar o bot "${b.nome}" e todas as mensagens dele? O n8n deixa de conseguir usar a key.`, b.nome, 'Apagar bot', async () => {
    try { await chamar('bot-apagar', { id: b.id, chave: b.chave }); Historico.limparBot(b.id); botAtual = null; $('conversa').hidden = true; $('vazio').hidden = false; aplicarPainel(); receberBots(await chamar('bots')); } catch (e) { aviso(limparErro(e), 'erro'); } });
}
// menu ⋮
const fecharMenu = () => { $('menuConv').hidden = true; };
$('btnMenu').addEventListener('click', (ev) => {
  ev.stopPropagation(); if (!$('menuConv').hidden) return fecharMenu(); if (!botAtual) return;
  rotular($('mnSilenciar'), silenciados.includes(String(botAtual.id)) ? 'bell' : 'bell-off', silenciados.includes(String(botAtual.id)) ? 'Ativar notificações' : 'Silenciar notificações'); $('menuConv').hidden = false;
});
$('menuConv').addEventListener('click', fecharMenu);
document.addEventListener('click', (ev) => { if (!ev.target.closest('.menu-wrap')) fecharMenu(); });
$('mnSilenciar').addEventListener('click', alternarSilencio);
$('mnPerfil').addEventListener('click', () => { painelAberto = true; salvarPainel(); aplicarPainel(); });
$('mnGerenciar').addEventListener('click', abrirGerenciar);
$('mnExportar').addEventListener('click', async () => {
  if (!botAtual) return; aviso('Exportando o histórico…');
  try { const r = await chamar('exportar-historico', { botId: botAtual.id, nome: botAtual.nome }); aviso(`Histórico salvo (${r.n} mensagens) na pasta de saída`); } catch (e) { aviso(limparErro(e), 'erro'); }
});
$('mnLimpar').addEventListener('click', () => { if (botAtual) confirmar('Limpar histórico', `Apagar TODAS as mensagens do bot "${botAtual.nome}"? Isso não dá para desfazer.`, 'Apagar tudo', limparConversa); });
$('mnApagar').addEventListener('click', apagarBotAtual);

// painel de perfil (à direita)
let painelAberto = (() => { try { return localStorage.getItem('f1chat.painel') === '1'; } catch (e) { return false; } })();
const salvarPainel = () => { try { localStorage.setItem('f1chat.painel', painelAberto ? '1' : '0'); } catch (e) {} };
// Bot "só recebe" (avisos): some o campo de escrever, o clipe e os comandos
let soRecebeLista = (() => { try { return JSON.parse(localStorage.getItem('f1chat.soRecebe') || '[]'); } catch (e) { return []; } })();
const soRecebe = (id) => soRecebeLista.includes(id);
function alternarSoRecebe(id) { soRecebeLista = soRecebe(id) ? soRecebeLista.filter((x) => x !== id) : [...soRecebeLista, id]; try { localStorage.setItem('f1chat.soRecebe', JSON.stringify(soRecebeLista)); } catch (e) {} aplicarSoRecebe(); }
function aplicarSoRecebe() { const so = !!(botAtual && soRecebe(botAtual.id)); $('rodapeCompor').hidden = so; if (so) { esconderComandos(); fotoPendente = null; $('previaFoto').hidden = true; } }
function aplicarPainel() { aplicarSoRecebe(); const p = $('painelBot'); p.hidden = !painelAberto || !botAtual; if (!p.hidden) renderPainel(); }
function renderPainel() {
  const b = botAtual, p = $('painelBot'); if (!b) return;
  const mudo = silenciados.includes(String(b.id)), nPosts = el('b', { texto: '…' });
  const botao = (nomeIc, rotulo, fazer) => el('button', { onclick: fazer }, icone(nomeIc), rotulo);
  p.replaceChildren(
    el('div', { className: 'pn-topo' }, avatar(b), el('h3', { texto: b.nome }), el('small', { texto: 'bot' + (mudo ? ' • notificações silenciadas' : '') })),
    el('div', { className: 'pn-botoes' }, botao('message-circle', 'Mensagem', () => $('texto').focus()), botao(mudo ? 'bell' : 'bell-off', mudo ? 'Ativar' : 'Silenciar', alternarSilencio), botao('settings', 'Gerenciar', abrirGerenciar)),
    el('div', { className: 'pn-info' },
      el('div', { className: 'l' }, el('span', { texto: 'Posts aguardando' }), nPosts),
      el('div', { className: 'l' }, el('span', { texto: 'Key do bot' }), el('button', { className: 'link', onclick: () => { chamar('copiar-texto', { texto: b.chave }); aviso('Key copiada. Não mostre para ninguém.'); } }, icone('copy'), 'Copiar')),
      el('b', { texto: 'Comandos' }),
      ...(comandosDoBot.length ? comandosDoBot.map((c) => el('div', { className: 'pn-cmd' }, el('code', { texto: c.comando }), el('small', { texto: c.descricao || '' }))) : [el('small', { texto: 'Nenhum comando ainda.' })])));
  chamar('contar-posts', { botId: b.id }).then((r) => { if (botAtual && botAtual.id === b.id) nPosts.textContent = r.n; }).catch(() => { nPosts.textContent = '–'; });
}
$('btnPainel').addEventListener('click', () => { painelAberto = !painelAberto; salvarPainel(); aplicarPainel(); });

// busca dentro da conversa (lupa / Ctrl+F): acha em TODO o histórico guardado, marca as palavras, e Enter / setinhas pulam de uma em uma
let achados = [], achadoI = -1, fichaConv = 0;
function realcar() { // pinta as palavras nas mensagens que estão na tela (sem mexer no conteúdo delas)
  if (!window.CSS || !CSS.highlights) return;
  CSS.highlights.delete('achado'); CSS.highlights.delete('achado-atual');
  const q = semAcento($('buscaConvInput').value.trim()); if (!q || $('buscaConv').hidden) return;
  const todos = [], atual = [], idAtual = achados[achadoI] && achados[achadoI].id;
  for (const [id, e] of noDom) for (const t of e.querySelectorAll('.txt')) {
    const it = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
    for (let no = it.nextNode(); no; no = it.nextNode()) {
      const n = semAcento(no.data), base = n.length === no.data.length ? n : no.data.toLowerCase();
      for (let i = base.indexOf(q); i >= 0; i = base.indexOf(q, i + q.length)) { const r = new Range(); r.setStart(no, i); r.setEnd(no, i + q.length); (id === idAtual ? atual : todos).push(r); }
    }
  }
  if (todos.length) CSS.highlights.set('achado', new Highlight(...todos));
  if (atual.length) CSS.highlights.set('achado-atual', new Highlight(...atual));
}
function textoQtd() { $('buscaConvQtd').textContent = !$('buscaConvInput').value.trim() ? '' : achados.length ? `${achadoI + 1} de ${achados.length}` : 'Nada encontrado'; }
async function mostrarAchado() { textoQtd(); const a = achados[achadoI]; if (a) await irParaMensagem(a.id); realcar(); }
async function filtrarBusca() {
  const q = semAcento($('buscaConvInput').value.trim()), ficha = ++fichaConv;
  if (!q) { achados = []; achadoI = -1; textoQtd(); realcar(); return; }
  const lista = botAtual && typeof botAtual.id === 'number' ? await Historico.buscar(q, botAtual.id, 1000) : [];
  if (ficha !== fichaConv) return;
  const ids = new Set(lista.map((m) => m.id));
  for (const m of msgs) if (!ids.has(m.id) && semAcento(m.texto).includes(q)) lista.push(m); // as que ainda não foram guardadas
  achados = lista.sort((a, b) => (typeof a.id === 'number' ? a.id : 1e15) - (typeof b.id === 'number' ? b.id : 1e15));
  achadoI = achados.length - 1; // começa na mais nova
  await mostrarAchado();
}
function pularAchado(delta) { if (!achados.length) return; achadoI = (achadoI + delta + achados.length) % achados.length; mostrarAchado(); }
function abrirBuscaConv() { if (!botAtual) return; $('buscaConv').hidden = false; $('buscaConvInput').focus(); $('buscaConvInput').select(); }
function fecharBuscaConv() { $('buscaConv').hidden = true; $('buscaConvInput').value = ''; filtrarBusca(); }
$('btnBuscaConv').addEventListener('click', () => ($('buscaConv').hidden ? abrirBuscaConv() : fecharBuscaConv()));
$('buscaConvFechar').addEventListener('click', fecharBuscaConv);
let tempoBuscaConv = null;
$('buscaConvInput').addEventListener('input', () => { clearTimeout(tempoBuscaConv); tempoBuscaConv = setTimeout(filtrarBusca, 150); });
$('buscaConvInput').addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); fecharBuscaConv(); } else if (ev.key === 'Enter') { ev.preventDefault(); clearTimeout(tempoBuscaConv); if (ev.shiftKey) pularAchado(1); else pularAchado(-1); } });
$('buscaAnt').addEventListener('click', () => pularAchado(-1)); $('buscaProx').addEventListener('click', () => pularAchado(1));
document.addEventListener('keydown', (ev) => { if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'f' && botAtual) { ev.preventDefault(); abrirBuscaConv(); } if (ev.key === 'Escape') { fecharMenu(); fecharDrawer(); } });

// menu lateral ☰ e tema claro/escuro
const fecharDrawer = () => { $('drawer').hidden = true; };
// lista compacta (só ícones): automática quando a janela fica estreita, ou pelo botão de minimizar
let ladoMin = (() => { try { return localStorage.getItem('f1chat.ladoMin') === '1'; } catch (e) { return false; } })();
function aplicarCompacto() {
  $('app').classList.toggle('lado-min', ladoMin); $('lado').classList.toggle('manual', ladoMin);
  const unica = matchMedia('(max-width: 560px)').matches; // janela bem estreita: uma tela por vez, sem modo compacto
  $('lado').classList.toggle('compacto', !unica && (ladoMin || $('lado').offsetWidth < 200));
  rotular($('btnCompactar'), ladoMin ? 'panel-left-open' : 'panel-left-close', ladoMin ? 'Expandir a lista' : 'Minimizar a lista (só os ícones)'); $('btnCompactar').title = ladoMin ? 'Expandir a lista' : 'Minimizar a lista (só os ícones)';
}
$('voltarPc').addEventListener('click', () => document.body.classList.remove('estreito-conversa'));
$('btnCompactar').addEventListener('click', () => { ladoMin = !ladoMin; try { localStorage.setItem('f1chat.ladoMin', ladoMin ? '1' : '0'); } catch (e) {} aplicarCompacto(); });
new ResizeObserver(aplicarCompacto).observe($('lado')); aplicarCompacto();
$('btnMenuLado').addEventListener('click', () => { $('drawer').hidden = false; $('drawerLogo').src = $('logoApp').src; chamar('config-ler').then((c) => { $('btnSaude').hidden = !painelSaude.ligado() || !(c.usuario ? c.usuario.admin : c.temCodigo); }).catch(() => {}); chamar('info').then((i) => { $('drawerVersao').textContent = 'Versão ' + i.versao; }).catch(() => {}); });
$('drawerFundo').addEventListener('click', fecharDrawer);
$('drawer').addEventListener('click', (ev) => { if (ev.target.closest('.drawer-caixa > button')) fecharDrawer(); });
$('drNovo').addEventListener('click', abrirNovoBot);
function aplicarTema(t) { document.documentElement.setAttribute('data-tema', t === 'claro' ? 'claro' : 'escuro'); rotular($('btnTema'), t === 'claro' ? 'sun' : 'moon', t === 'claro' ? 'Tema: claro (clique para escuro)' : 'Tema: escuro (clique para claro)'); }
const temaAtual = () => document.documentElement.getAttribute('data-tema') === 'claro' ? 'claro' : 'escuro';
$('btnTema').addEventListener('click', () => { const novo = temaAtual() === 'claro' ? 'escuro' : 'claro'; aplicarTema(novo); try { localStorage.setItem('f1chat.tema', novo); } catch (e) {} });
try { aplicarTema(localStorage.getItem('f1chat.tema') === 'claro' ? 'claro' : 'escuro'); } catch (e) { aplicarTema('escuro'); }

// ---------- começar ----------
window.api.escutar('bots', receberBots);                 // o programa avisa quando a lista muda (consulta única em segundo plano)
window.api.escutar('abrir-bot', (id) => abrirBot(id));   // clicou na notificação do Windows
(async () => {
  botsGuardados = await Historico.lerBots(); // histórico local primeiro: a lista aparece mesmo sem servidor
  aplicarLogo(); carregarSilenciados();
  const c = await chamar('config-ler');
  if (!c.endereco) { definirStatus('off', 'Não configurado'); abrirConfig(); }
  receberBots(await chamar('bots'));
})();

// janela sem a barra do Windows: os 3 botões coloridos (minimizar, maximizar, fechar) ficam no canto direito do cabeçalho
for (const [id, acao] of [['jMin', 'minimizar'], ['jMax', 'maximizar'], ['jFechar', 'fechar']]) $(id).addEventListener('click', () => chamar('janela-acao', { acao }).catch(() => {}));

document.addEventListener('dragstart', (e) => { if (e.target && e.target.tagName === 'IMG') e.preventDefault(); }); // garantia: nenhuma imagem sai arrastada
