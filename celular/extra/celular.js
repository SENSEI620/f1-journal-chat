// celular.js — só no app de celular. Cuida de:
//  1) navegação "uma tela por vez" (lista → conversa → voltar) e do botão Voltar do Android;
//  2) barra de baixo estilo Telegram: campo grande em "pílula" + botão "+" que abre Foto / Comandos / Mensagens rápidas;
//  3) segurar a mensagem abre o menu (Copiar / Apagar);
//  4) o "Online" mora dentro do menu ☰ (no canto de baixo) e puxar a lista para baixo atualiza;
//  5) acessibilidade (TalkBack): nomes nos botões, avisos de leitura.
// A tela (app.js) é a mesma do computador: aqui só se mexe no que é de celular. Nada daqui roda no PC.
(function () {
  const $ = (id) => document.getElementById(id);
  const corpo = document.body; corpo.classList.add('celular');
  const vibrar = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };

  // ---------- 1) uma tela por vez ----------
  const topo = document.querySelector('.conv-topo');
  const voltar = document.createElement('button'); voltar.id = 'voltar'; voltar.className = 'icone'; voltar.title = 'Voltar para a lista de bots';
  voltar.appendChild(icone('arrow-left', 20)); topo.insertBefore(voltar, topo.firstChild);
  const abrir = () => { corpo.classList.add('mostra-conversa'); history.pushState({ c: 1 }, ''); };
  const fechar = () => corpo.classList.remove('mostra-conversa');
  $('lista').addEventListener('click', (e) => { const li = e.target.closest('li'); if (li && !li.classList.contains('vazio-lista')) abrir(); }, true);
  window.mostrarConversaCelular = () => { if (!corpo.classList.contains('mostra-conversa')) abrir(); }; // usado pelo aviso (push): tocar no aviso abre a conversa
  voltar.addEventListener('click', () => history.back());
  // Botão Voltar do Android: primeiro fecha menu aberto (+ ou mensagem); só depois sai da conversa
  window.addEventListener('popstate', () => { if (fecharMenus()) { history.pushState({ c: 1 }, ''); return; } fechar(); });

  // ---------- 2) barra de baixo: pílula com "+" ----------
  const compor = document.querySelector('.compor'), texto = $('texto'), enviar = $('btnEnviar');
  const btnMais = document.createElement('button'); btnMais.id = 'btnMais'; btnMais.type = 'button'; btnMais.className = 'icone'; btnMais.title = 'Mais opções: foto, comandos, mensagens rápidas';
  btnMais.setAttribute('aria-haspopup', 'menu'); btnMais.setAttribute('aria-expanded', 'false'); btnMais.appendChild(icone('plus', 22));
  const pilula = document.createElement('div'); pilula.className = 'pilula';
  compor.insertBefore(pilula, enviar); pilula.append(btnMais, texto);   // [ + | campo ........ ]  [ enviar ]
  const menuMais = document.createElement('div'); menuMais.id = 'menuMais'; menuMais.hidden = true; menuMais.setAttribute('role', 'menu'); menuMais.setAttribute('aria-label', 'Mais opções');
  // os botões originais (clipe, comandos, rápidas) ficam escondidos no celular; o menu clica neles (assim a tela do PC continua igual)
  for (const [idOriginal, nomeIcone, rotulo] of [['btnAnexo', 'image', 'Foto'], ['btnComandos', 'square-slash', 'Comandos do bot'], ['btnRapidas', 'zap', 'Mensagens rápidas']]) {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem');
    const t = document.createElement('span'); t.textContent = rotulo; b.append(icone(nomeIcone, 22), t);
    b.addEventListener('click', () => { fecharMenus(); $(idOriginal).click(); });
    menuMais.appendChild(b);
  }
  compor.appendChild(menuMais);
  const alternarMais = () => { const abrirAgora = menuMais.hidden; fecharMenus(); if (abrirAgora) { menuMais.hidden = false; btnMais.setAttribute('aria-expanded', 'true'); const p = menuMais.querySelector('button'); if (p) p.focus(); } };
  btnMais.addEventListener('click', alternarMais);
  document.addEventListener('click', (e) => { if (!menuMais.hidden && !menuMais.contains(e.target) && !btnMais.contains(e.target)) fecharMenus(); }, true);

  // ---------- 3) segurar a mensagem: Copiar / Apagar ----------
  const msgsLista = $('msgsLista');
  let timer = null, inicio = null, segurou = false;
  function abrirFolha(msg) {
    fecharMenus();
    const copiar = msg.querySelector('.acoes button[title="Copiar texto"]'), apagar = msg.querySelector('.acoes button[title="Apagar mensagem"]');
    if (!copiar && !apagar) return;
    const previa = ((msg.querySelector('.txt') || {}).textContent || 'Mensagem').trim().replace(/\s+/g, ' ').slice(0, 90);
    const fundo = document.createElement('div'); fundo.id = 'folhaFundo'; fundo.setAttribute('role', 'button'); fundo.setAttribute('aria-label', 'Fechar menu da mensagem');
    const folha = document.createElement('div'); folha.id = 'folha'; folha.setAttribute('role', 'menu'); folha.setAttribute('aria-label', 'Opções da mensagem');
    const p = document.createElement('p'); p.className = 'folha-previa'; p.textContent = previa; folha.appendChild(p);
    const item = (nomeIcone, rotulo, botaoOriginal, perigo) => {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); if (perigo) b.className = 'perigo';
      const t = document.createElement('span'); t.textContent = rotulo; b.append(icone(nomeIcone, 22), t);
      b.addEventListener('click', () => { fecharMenus(); segurou = false; botaoOriginal.click(); }); folha.appendChild(b);
    };
    if (copiar) item('copy', 'Copiar', copiar, false);
    if (apagar) item('trash-2', 'Apagar', apagar, true);
    fundo.addEventListener('click', fecharMenus);
    msg.classList.add('selecionada'); document.body.append(fundo, folha);
    const primeiro = folha.querySelector('button'); if (primeiro) primeiro.focus();
  }
  msgsLista.addEventListener('touchstart', (e) => {
    const m = e.target.closest('.msg'); if (!m || !m.querySelector('.acoes') || e.touches.length !== 1) return;
    const t = e.touches[0]; inicio = { x: t.clientX, y: t.clientY }; segurou = false; clearTimeout(timer);
    timer = setTimeout(() => { segurou = true; vibrar(20); abrirFolha(m); }, 450);
  }, { passive: true });
  msgsLista.addEventListener('touchmove', (e) => { if (!inicio) return; const t = e.touches[0]; if (Math.abs(t.clientX - inicio.x) > 10 || Math.abs(t.clientY - inicio.y) > 10) { clearTimeout(timer); inicio = null; } }, { passive: true });
  // ao soltar o dedo, o "engolir o clique" vale só por um instante (senão o próximo toque de verdade, como o do botão Copiar, seria perdido)
  for (const nome of ['touchend', 'touchcancel']) msgsLista.addEventListener(nome, () => { clearTimeout(timer); inicio = null; if (segurou) setTimeout(() => { segurou = false; }, 400); }, { passive: true });
  msgsLista.addEventListener('contextmenu', (e) => { if (e.target.closest('.msg')) e.preventDefault(); }); // sem o menu de "selecionar texto" do Android
  msgsLista.addEventListener('click', (e) => { if (segurou) { e.preventDefault(); e.stopPropagation(); segurou = false; } }, true); // o "soltar" depois de segurar não vira clique em link/foto

  // Fecha o que estiver aberto (menu +, menu da mensagem). Devolve true se tinha algo aberto.
  function fecharMenus() {
    let tinha = false;
    if (!menuMais.hidden) { menuMais.hidden = true; btnMais.setAttribute('aria-expanded', 'false'); tinha = true; }
    for (const id of ['folha', 'folhaFundo']) { const e = $(id); if (e) { e.remove(); tinha = true; } }
    document.querySelectorAll('.msg.selecionada').forEach((m) => m.classList.remove('selecionada'));
    return tinha;
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharMenus(); });

  // ---------- 4) "Online" dentro do menu ☰ + puxar a lista para atualizar ----------
  const status = $('status'), versao = $('drawerVersao');
  if (status && versao) { versao.after(status); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); } // o app.js acha pelo id, então continua atualizando
  const listaBots = $('lista'), lado = $('lado'); let yIni = null, atualizando = false;
  listaBots.addEventListener('touchstart', (e) => { yIni = listaBots.scrollTop === 0 && lado.scrollTop === 0 ? e.touches[0].clientY : null; }, { passive: true });
  listaBots.addEventListener('touchend', async (e) => {
    if (yIni === null) return; const dy = e.changedTouches[0].clientY - yIni; yIni = null;
    if (dy < 90 || atualizando) return;
    atualizando = true; vibrar(10);
    try { if (typeof aviso === 'function') aviso('Atualizando…'); receberBots(await window.api.chamar('bots')); } catch (err) { /* sem servidor: o aviso de conexão já aparece sozinho */ }
    atualizando = false;
  }, { passive: true });

  // ---------- 5) acessibilidade (TalkBack) ----------
  // Todo botão que só tem ícone ganha o nome (aria-label) a partir do "title"; campos só com dica ganham nome também.
  function rotular() {
    document.querySelectorAll('button[title]:not([aria-label])').forEach((b) => b.setAttribute('aria-label', b.title));
    document.querySelectorAll('input[placeholder]:not([aria-label]), textarea[placeholder]:not([aria-label])').forEach((c) => c.setAttribute('aria-label', c.placeholder));
  }
  rotular(); let agendado = false;
  new MutationObserver(() => { if (agendado) return; agendado = true; requestAnimationFrame(() => { agendado = false; rotular(); }); }).observe(document.body, { childList: true, subtree: true });
  const toasts = $('toasts'); if (toasts) { toasts.setAttribute('role', 'status'); toasts.setAttribute('aria-live', 'polite'); }
})();
