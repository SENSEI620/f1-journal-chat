// HISTÓRICO LOCAL (como WhatsApp/Telegram): guarda bots e mensagens neste computador (IndexedDB),
// para a conversa aparecer na hora e continuar visível sem internet / com o servidor desligado.
// O servidor continua sendo a "verdade": a cada consulta bem-sucedida o histórico é atualizado e o que foi apagado lá some aqui.
// Tudo aqui é "melhor esforço": se o IndexedDB falhar, o Chat funciona normalmente, só que sem histórico offline.
const Historico = (() => {
  const LIMITE_POR_BOT = 3000;   // guarda no máximo as 3000 mensagens mais novas de cada bot
  let banco = null;
  const abrir = () => banco || (banco = new Promise((ok, falha) => {
    try {
      const r = indexedDB.open('f1chat-historico', 2);
      r.onupgradeneeded = () => { // v1: msgs + meta; v2: saida (mensagens escritas sem conexão, esperando o servidor voltar)
        const db = r.result;
        if (!db.objectStoreNames.contains('msgs')) db.createObjectStore('msgs', { keyPath: ['botId', 'id'] });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
        if (!db.objectStoreNames.contains('saida')) db.createObjectStore('saida', { keyPath: 'k', autoIncrement: true });
      };
      r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error);
    } catch (e) { falha(e); }
  }));
  const pedido = (req) => new Promise((ok, falha) => { req.onsuccess = () => ok(req.result); req.onerror = () => falha(req.error); });
  const fim = (tx) => new Promise((ok, falha) => { tx.oncomplete = () => ok(); tx.onerror = () => falha(tx.error); tx.onabort = () => falha(tx.error); });
  const faixa = (botId) => IDBKeyRange.bound([botId, 0], [botId, Number.MAX_SAFE_INTEGER]);
  const limpa = (m) => { const o = {}; for (const [k, v] of Object.entries(m)) if (!k.startsWith('_')) o[k] = v; o.botId = m.botId; return o; };

  const semAcento = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  async function seguro(fn, padrao) { try { return await fn(await abrir()); } catch (e) { return padrao; } }

  return {
    // ---- lista de bots ----
    salvarBots: (lista) => seguro(async (db) => { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put({ k: 'bots', lista, quando: Date.now() }); await fim(tx); }),
    lerBots: () => seguro(async (db) => { const r = await pedido(db.transaction('meta').objectStore('meta').get('bots')); return r ? r.lista : []; }, []),

    // ---- mensagens ----
    // Guarda as mensagens recebidas do servidor. "completo" = o servidor devolveu TODAS (menos que o limite): tudo que não veio foi apagado lá.
    // Se não for completo, só considera apagado o que é mais novo que a mais antiga recebida.
    salvarMensagens: (botId, reais, completo) => seguro(async (db) => {
      const tx = db.transaction('msgs', 'readwrite'), st = tx.objectStore('msgs');
      const ids = new Set(reais.map((m) => m.id)); const menor = reais.length ? Math.min(...reais.map((m) => m.id)) : 0;
      for (const m of reais) if (typeof m.id === 'number') st.put(limpa({ ...m, botId }));
      const existentes = await pedido(st.getAllKeys(faixa(botId)));
      for (const k of existentes) if (!ids.has(k[1]) && (completo || k[1] >= menor)) st.delete(k);
      const sobra = existentes.length - LIMITE_POR_BOT; // poda as mais velhas
      if (sobra > 0) { const velhas = existentes.filter((k) => !ids.has(k[1])).sort((a, b) => a[1] - b[1]).slice(0, sobra); velhas.forEach((k) => st.delete(k)); }
      await fim(tx);
    }),
    // só adiciona/atualiza (usado nas páginas ANTIGAS: nada é apagado)
    guardar: (botId, lista) => seguro(async (db) => { const tx = db.transaction('msgs', 'readwrite'); for (const m of lista) if (typeof m.id === 'number') tx.objectStore('msgs').put(limpa({ ...m, botId })); await fim(tx); }),
    // últimas N mensagens (ou as N anteriores a "antesId"), em ordem do mais velho para o mais novo
    lerMensagens: (botId, limite = 50, antesId) => seguro(async (db) => {
      const faixaBusca = antesId ? IDBKeyRange.bound([botId, 0], [botId, antesId], false, true) : faixa(botId);
      const lista = [];
      await new Promise((ok, falha) => {
        const c = db.transaction('msgs').objectStore('msgs').openCursor(faixaBusca, 'prev');
        c.onsuccess = () => { const cur = c.result; if (!cur || lista.length >= limite) return ok(); lista.push(cur.value); cur.continue(); }; c.onerror = () => falha(c.error);
      });
      return lista.reverse();
    }, []),
    // procura uma palavra nas mensagens guardadas (sem diferenciar maiúscula/acento). botId vazio = todos os bots. Devolve as mais novas primeiro.
    buscar: (q, botId, limite = 40) => seguro(async (db) => {
      const alvo = semAcento(q); if (!alvo) return [];
      const achadas = [];
      await new Promise((ok, falha) => {
        const c = db.transaction('msgs').objectStore('msgs').openCursor(botId == null ? null : faixa(botId));
        c.onsuccess = () => { const cur = c.result; if (!cur) return ok(); const v = cur.value; if (v.texto && semAcento(v.texto).includes(alvo)) achadas.push(v); cur.continue(); }; c.onerror = () => falha(c.error);
      });
      achadas.sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)) || b.id - a.id);
      return achadas.slice(0, limite);
    }, []),
    // ---- fila de saída (WhatsApp: relógio até o servidor voltar) ----
    filaAdd: (item) => seguro(async (db) => { const tx = db.transaction('saida', 'readwrite'); const k = await pedido(tx.objectStore('saida').add(item)); await fim(tx); return k; }, null),
    filaLer: (botId) => seguro(async (db) => { const todos = await pedido(db.transaction('saida').objectStore('saida').getAll()); return botId === undefined ? todos : todos.filter((i) => i.botId === botId); }, []),
    filaApagar: (k) => seguro(async (db) => { const tx = db.transaction('saida', 'readwrite'); tx.objectStore('saida').delete(k); await fim(tx); }),
    apagarMensagem: (botId, id) => seguro(async (db) => { const tx = db.transaction('msgs', 'readwrite'); tx.objectStore('msgs').delete([botId, id]); await fim(tx); }),
    limparBot: (botId) => seguro(async (db) => { const tx = db.transaction('msgs', 'readwrite'); tx.objectStore('msgs').delete(faixa(botId)); await fim(tx); }),
  };
})();
