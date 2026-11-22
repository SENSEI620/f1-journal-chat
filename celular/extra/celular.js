// celular.js — liga a navegação "uma tela por vez" (lista → conversa → voltar) e o botão Voltar do Android.
(function () {
  const corpo = document.body; corpo.classList.add('celular');
  const topo = document.querySelector('.conv-topo');
  const voltar = document.createElement('button'); voltar.id = 'voltar'; voltar.className = 'icone'; voltar.title = 'Voltar';
  voltar.appendChild(icone('arrow-left', 20)); topo.insertBefore(voltar, topo.firstChild);
  const abrir = () => { corpo.classList.add('mostra-conversa'); history.pushState({ c: 1 }, ''); };
  const fechar = () => corpo.classList.remove('mostra-conversa');
  document.getElementById('lista').addEventListener('click', (e) => { const li = e.target.closest('li'); if (li && !li.classList.contains('vazio-lista')) abrir(); }, true);
  window.mostrarConversaCelular = () => { if (!corpo.classList.contains('mostra-conversa')) abrir(); }; // usado pelo aviso (push): tocar no aviso abre a conversa
  voltar.addEventListener('click', () => history.back());
  window.addEventListener('popstate', fechar);   // botão Voltar do Android
})();
