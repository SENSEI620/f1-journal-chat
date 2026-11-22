// sons.js — efeitos sonoros do Chat. Para trocar um som: troque o arquivo na pasta public/sons/ (mesmo nome).
// Para mudar qual som toca em cada coisa: edite as listas aqui embaixo.
const Sons = (() => {
  const ARQUIVOS = { post: 'sons/post-largada.wav', enviar: 'sons/enviar.wav', erro: 'sons/erro.wav', comando: 'sons/comando.wav', apagar: 'sons/apagar.wav' };
  const ESTILOS_MENSAGEM = { pop: ['Pop suave', 'sons/mensagem-pop.wav'], radio: ['Rádio de box', 'sons/mensagem-radio.wav'], classico: ['8-bit clássico', 'sons/mensagem-classico.wav'] };
  const EVENTOS = [['mensagem', 'Mensagem nova de um bot'], ['post', 'Post novo (imagem de um bot)'], ['enviar', 'Quando você envia'], ['comando', 'Clique em botão de comando'], ['apagar', 'Apagar mensagem'], ['erro', 'Erro']];
  const CHAVE = 'f1chat.sons';
  const PADRAO = { volume: 70, estiloMensagem: 'pop', desligados: [] };
  function ler() { try { return { ...PADRAO, ...JSON.parse(localStorage.getItem(CHAVE) || '{}') }; } catch (e) { return { ...PADRAO }; } }
  function salvar(parte) { try { localStorage.setItem(CHAVE, JSON.stringify({ ...ler(), ...parte })); } catch (e) {} }
  const arquivoDe = (evento, cfg) => evento === 'mensagem' ? (ESTILOS_MENSAGEM[cfg.estiloMensagem] || ESTILOS_MENSAGEM.pop)[1] : ARQUIVOS[evento];
  // tocar('mensagem') respeita o liga/desliga; tocar('mensagem', true) toca sempre (botão "ouvir")
  function tocar(evento, sempre) {
    const cfg = ler(); if (!sempre && cfg.desligados.includes(evento)) return;
    const arq = arquivoDe(evento, cfg); if (!arq) return;
    try { const a = new Audio(arq); a.volume = Math.max(0, Math.min(1, cfg.volume / 100)); const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  }
  return { tocar, ler, salvar, EVENTOS, ESTILOS_MENSAGEM };
})();
