(function () {
  "use strict";
  var APP_VERSION = "0.9.5";
  var dados = OssStorage.ler();
  var treinoAtual = dados.treinos.filter(function (item) { return item.id === dados.treinoAtual; })[0] || dados.treinos[0];
  var config = OssStorage.normalizar(treinoAtual);
  var fases = OssEngine.construirFases(config);
  var timer = new OssEngine.Timer(config);
  var ajustes = OssStorage.lerAjustes();
  var historico = OssStorage.lerHistorico();
  var wakeLock = null;

  var iconePlay = '<svg class="main-action-icon play-icon" viewBox="0 0 64 64" aria-hidden="true"><path d="M25 14a5 5 0 0 1 7.5-4.4l21 18a5 5 0 0 1 0 8.8l-21 18A5 5 0 0 1 25 50Z"/></svg>';
  var iconePausa = '<svg class="main-action-icon pause-icon" viewBox="0 0 64 64" aria-hidden="true"><rect x="16" y="12" width="12" height="40" rx="4"/><rect x="36" y="12" width="12" height="40" rx="4"/></svg>';
  function renderizarBotaoPrincipal(botao, estado, labelId) {
    var rodando = estado.status === "rodando";
    var pausado = estado.status === "pausado";
    var texto = rodando ? "Pausar" : pausado ? "Retomar" : "Iniciar";
    botao.innerHTML = rodando ? iconePausa : iconePlay;
    botao.classList.toggle("is-paused", rodando);
    botao.setAttribute("aria-label", texto);
    document.getElementById(labelId).textContent = texto;
  }

  function tocarAudio(fn) { if (!ajustes.bipes) return; try { fn(); } catch (erro) {} }
  function solicitarWakeLock() {
    if (!ajustes.wake || !navigator.wakeLock) return;
    try {
      Promise.resolve(navigator.wakeLock.request("screen")).then(function (bloqueio) {
        wakeLock = bloqueio;
      }).catch(function () {});
    } catch (erro) {}
  }
  function liberarWakeLock() {
    if (!wakeLock) return;
    try { Promise.resolve(wakeLock.release()).catch(function () {}); } catch (erro) {}
    wakeLock = null;
  }
  timer.aoEvento(function (evento) {
    tocarAudio(function () {
      if (evento.tipo === "fase" || evento.tipo === "fim") OssAudio.gongo();
      else if (evento.tipo === "contagem") OssAudio.contagem();
      else if (evento.tipo === "aviso" || evento.tipo === "proximo") OssAudio.bipe();
    });
    if (ajustes.voz) {
      try { OssVoice.falar(OssVoice.fraseEvento(evento), vozSelecionada()); } catch (erro) {}
    }
    if (evento.tipo === "fim") registrarHistorico();
  });

  function corFase(estado) {
    return OssView.corDaFase(estado.fase, estado.restanteFase, estado.status);
  }
  function renderizarTimer() {
    var estado = timer.estado();
    var cor = corFase(estado);
    document.getElementById("phase-panel").style.setProperty("--phase", cor);
    document.getElementById("tabata-view").style.setProperty("--phase", cor);
    document.getElementById("phase-name").textContent = estado.status === "finalizado" ? "Finalizado" : (estado.nomeFase || "Preparar");
    document.getElementById("timer-display").textContent = OssView.formatarTempo(estado.restanteFase);
    document.getElementById("rounds-left").textContent = estado.status === "finalizado" ? 0 : estado.rondasParaTerminar;
    document.getElementById("cycles-left").textContent = estado.status === "finalizado" ? 0 : estado.ciclosParaTerminar;
    renderizarBotaoPrincipal(document.getElementById("toggle-timer"), estado, "action-label");
    document.getElementById("treino-atual").innerHTML = treinoAtual.nome + "<small>" + OssView.formatarTempo(estado.restanteTotal) + "</small>";
    var proxima = estado.proxima;
    var faixa = document.getElementById("next-phase");
    faixa.hidden = !proxima;
    if (proxima) {
      faixa.style.background = OssView.corDaFase(proxima, proxima.dur, "rodando");
      faixa.style.color = "#0E1116";
      document.getElementById("next-phase-name").textContent = proxima.nome;
      document.getElementById("next-phase-time").textContent = OssView.formatarTempo(proxima.dur);
    }
  }
  document.getElementById("toggle-timer").addEventListener("click", function () {
    timer.alternar();
    if (timer.estado().status === "rodando") {
      try { OssAudio.desbloquear(); } catch (erro) {}
      solicitarWakeLock();
    } else liberarWakeLock();
    renderizarTimer();
  });
  document.addEventListener("visibilitychange", function () {
    if (timer.estado().status === "rodando") timer.tick();
    if (rondasTimer.estado().status === "rodando") rondasTimer.tick();
    if (!document.hidden) {
      renderizarTimer();
      renderizarRondas();
      renderizarLivre();
    }
  });
  window.addEventListener("pagehide", function () { liberarWakeLock(); });
  document.getElementById("skip-phase").addEventListener("click", function () { timer.pular(); renderizarTimer(); });
  document.getElementById("previous-phase").addEventListener("click", function () { timer.anterior(); renderizarTimer(); });
  document.getElementById("reset-timer").addEventListener("click", function () { liberarWakeLock(); timer.reset(); renderizarTimer(); });
  document.getElementById("treino-atual").addEventListener("click", function () { abrirEditor(false); });
  document.getElementById("open-ajustes").addEventListener("click", function () { abrirModal("ajustes-panel"); });

  var rondasCfg = OssStorage.lerRondas();
  var rondasTimer = new OssEngine.Timer(rondasCfg);
  function renderizarRondas() {
    var estado = rondasTimer.estado();
    var cor = corFase(estado);
    document.getElementById("rondas-phase-panel").style.setProperty("--phase", cor);
    document.getElementById("rondas-view").style.setProperty("--phase", cor);
    document.getElementById("rondas-phase-name").textContent = estado.status === "finalizado" ? "Finalizado" : (estado.nomeFase || "Preparar");
    document.getElementById("rondas-display").textContent = OssView.formatarTempo(estado.restanteFase);
    document.getElementById("rondas-left").textContent = estado.status === "finalizado" ? 0 : estado.rondasParaTerminar;
    renderizarBotaoPrincipal(document.getElementById("rondas-toggle"), estado, "rondas-action-label");
    var faixa = document.getElementById("rondas-next");
    faixa.hidden = !estado.proxima;
    if (estado.proxima) {
      faixa.style.background = OssView.corDaFase(estado.proxima, estado.proxima.dur, "rodando");
      faixa.style.color = "#0E1116";
      document.getElementById("rondas-next-name").textContent = estado.proxima.nome;
      document.getElementById("rondas-next-time").textContent = OssView.formatarTempo(estado.proxima.dur);
    }
  }
  document.getElementById("rondas-toggle").addEventListener("click", function () { rondasTimer.alternar(); renderizarRondas(); });
  document.getElementById("rondas-reset").addEventListener("click", function () { rondasTimer.reset(); renderizarRondas(); });
  document.getElementById("rondas-configurar").addEventListener("click", function () { abrirEditor(true); });

  var livre = new OssEngine.Cronometro({ preparar: 0 });
  function formatarLivre(ms) { return OssStorage.formatarDuracao(Math.floor(ms / 1000)); }
  function renderizarLivre() {
    var estadoLivre = livre.estado();
    var ms = estadoLivre.decorrido * 1000;
    document.getElementById("livre-tempo").textContent = formatarLivre(ms);
    renderizarBotaoPrincipal(document.getElementById("livre-toggle"), estadoLivre, "livre-action-label");
    document.getElementById("livre-volta").textContent = "—";
  }
  document.getElementById("livre-toggle").addEventListener("click", function () {
    livre.alternar();
    renderizarLivre();
  });
  document.getElementById("livre-reset").addEventListener("click", function () {
    livre = new OssEngine.Cronometro({ preparar: 0 });
    renderizarLivre();
  });

  function abrirModal(id) { document.getElementById(id).hidden = false; }
  document.querySelectorAll("[data-close]").forEach(function (botao) {
    botao.addEventListener("click", function () { document.getElementById(botao.dataset.close).hidden = true; });
  });
  document.querySelectorAll("[data-panel]").forEach(function (botao) {
    botao.addEventListener("click", function () { abrirModal(botao.dataset.panel + "-panel"); });
  });
  document.querySelectorAll("[data-tab]").forEach(function (botao) {
    botao.addEventListener("click", function () {
      document.querySelectorAll("[data-tab]").forEach(function (item) { item.classList.toggle("active", item === botao); });
      document.querySelectorAll(".screen").forEach(function (tela) { tela.hidden = tela.id !== botao.dataset.tab; });
    });
  });

  var editandoRondas = false;
  var intervaloCampos = [
    ["preparar","Preparar"],["exercicio","Exercício"],["descanso","Descanso"],["rondas","Rondas"],
    ["ciclos","Ciclos"],["descansoCiclo","Descanso entre ciclos"],["relaxe","Relaxe"]
  ];
  function abrirEditor(rondas) {
    editandoRondas = rondas;
    var atual = rondas ? OssStorage.lerRondas() : config;
    document.getElementById("editor-nome").value = rondas ? "Rondas" : treinoAtual.nome;
    var lista = document.getElementById("editor-intervalos");
    lista.textContent = "";
    intervaloCampos.forEach(function (campo) {
      var linha = document.createElement("div");
      linha.className = "interval-row";
      linha.innerHTML = '<span class="interval-dot"></span><span>' + campo[1] + '</span><button type="button" data-dir="-1">−</button><input type="number" min="0" inputmode="numeric" data-campo="' + campo[0] + '" value="' + atual[campo[0]] + '"><button type="button" data-dir="1">+</button>';
      linha.querySelectorAll("button").forEach(function (botao) {
        botao.addEventListener("click", function () {
          var input = linha.querySelector("input");
          var minimo = campo[0] === "rondas" || campo[0] === "ciclos" ? 1 : 0;
          input.value = Math.max(minimo, Number(input.value || 0) + Number(botao.dataset.dir));
        });
      });
      lista.appendChild(linha);
    });
    renderizarListaTreinos();
    abrirModal("editor-panel");
  }
  document.getElementById("salvar-treino").addEventListener("click", function () {
    var botao = this;
    estadoBotao(botao, "Salvando…", "editor-status", "Salvo");
    var copia = {};
    intervaloCampos.forEach(function (campo) { copia[campo[0]] = Number(document.querySelector('[data-campo="' + campo[0] + '"]').value); });
    try {
      var normalizado = OssEngine.normalizar(Object.assign({}, editandoRondas ? OssStorage.lerRondas() : config, copia));
      if (editandoRondas) { OssStorage.salvarRondas(normalizado); rondasCfg = normalizado; rondasTimer = new OssEngine.Timer(normalizado); renderizarRondas(); }
      else { normalizado.nome = document.getElementById("editor-nome").value.trim(); normalizado.id = treinoAtual.id; var lista = dados.treinos.map(function (item) { return item.id === normalizado.id ? normalizado : item; }); dados = OssStorage.salvar({ version:1, treinoAtual:dados.treinoAtual, treinos:lista }); }
    } catch (erro) { document.getElementById("editor-status").textContent = "Erro: " + (erro.message || "valores inválidos"); }
  });
  document.getElementById("novo-treino").addEventListener("click", function () {
    var novo = OssStorage.normalizar(Object.assign({}, config, { id:"treino-" + Date.now(), nome:"Novo treino" }));
    dados = OssStorage.salvar({ version:1, treinoAtual:novo.id, treinos:dados.treinos.concat([novo]) });
    treinoAtual = novo;
    abrirEditor(false);
  });
  function renderizarListaTreinos() {
    var lista = document.getElementById("treino-lista");
    lista.textContent = "";
    dados.treinos.forEach(function (item) {
      var linha = document.createElement("button");
      linha.type = "button";
      linha.textContent = (item.id === dados.treinoAtual ? "● " : "○ ") + item.nome;
      linha.addEventListener("click", function () {
        dados.treinoAtual = item.id;
        OssStorage.salvar(dados);
        treinoAtual = item;
        config = OssStorage.normalizar(item);
        timer = new OssEngine.Timer(config);
        fases = OssEngine.construirFases(config);
        renderizarTimer();
      });
      lista.appendChild(linha);
    });
  }

  function estadoBotao(botao, andamento, statusId, resultado) {
    var texto = botao.textContent;
    botao.disabled = true;
    botao.textContent = andamento;
    var status = document.getElementById(statusId);
    if (status) status.textContent = resultado || andamento;
    window.setTimeout(function () { botao.disabled = false; botao.textContent = texto; }, 2500);
  }
  document.getElementById("exportar-json").addEventListener("click", function () {
    var botao = this;
    estadoBotao(botao, "Exportando…", "storage-mensagem", "Exportando…");
    try { var blob = new Blob([JSON.stringify(dados, null, 2)], {type:"application/json"}); var url = URL.createObjectURL(blob); var link=document.createElement("a"); link.href=url; link.download="oss-timer.json"; link.click(); URL.revokeObjectURL(url); document.getElementById("storage-mensagem").textContent="Exportado"; }
    catch (erro) { document.getElementById("storage-mensagem").textContent="Erro: exportação indisponível"; }
  });
  document.getElementById("copiar-json").addEventListener("click", function () {
    var botao=this;
    estadoBotao(botao,"Copiado","storage-mensagem","Copiado");
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(JSON.stringify(dados, null, 2)); else throw new Error(); }
    catch (erro) { document.getElementById("storage-mensagem").textContent="Erro: copiar indisponível"; }
  });
  document.getElementById("importar-json").addEventListener("change", function (evento) {
    if (!evento.target.files[0]) return;
    estadoBotao(document.querySelector('label[for="importar-json"]'), "Importando…", "storage-mensagem", "Importando…");
    var leitor = new FileReader();
    leitor.onload = function () {
      var resultado = OssStorage.validarImportacao(leitor.result);
      if (!resultado.valido) { document.getElementById("storage-mensagem").textContent = "Erro: " + resultado.erro; return; }
      dados = OssStorage.salvar(resultado.dado);
      document.getElementById("storage-mensagem").textContent = "Importado";
      renderizarListaTreinos();
    };
    leitor.readAsText(evento.target.files[0]);
  });

  function renderizarHistorico() {
    var lista = document.getElementById("historico-lista");
    lista.textContent = "";
    if (!historico.length) {
      lista.innerHTML = '<div class="history-empty"><svg viewBox="0 0 160 160" role="img" aria-label="OSS Timer"><rect width="160" height="160" fill="#0E1116"/><g fill="none" stroke-width="16" transform="rotate(-90 80 80)"><circle cx="80" cy="80" r="52" stroke="#FFB020" stroke-dasharray="100 226.7" stroke-dashoffset="0"/><circle cx="80" cy="80" r="52" stroke="#19C37D" stroke-dasharray="100 226.7" stroke-dashoffset="-108.9"/><circle cx="80" cy="80" r="52" stroke="#E5484D" stroke-dasharray="100 226.7" stroke-dashoffset="-217.8"/></g><text x="80" y="91" fill="#F5F7FA" font-family="Bebas Neue, sans-serif" font-size="40" font-weight="700" letter-spacing="2" text-anchor="middle">OSS</text></svg><p>Nenhum treino concluído.</p></div>';
      return;
    }
    historico.forEach(function (entrada) {
      var item=document.createElement("p"); item.textContent=entrada.nome+" — "+OssStorage.formatarDuracao(entrada.duracao)+" — "+entrada.rondas+" rondas"; lista.appendChild(item);
    });
  }
  function registrarHistorico() {
    historico = OssStorage.adicionarHistorico(historico, { id:"historico-"+Date.now(), data:new Date().toISOString(), nome:treinoAtual.nome, duracao:OssEngine.totalSegundos(fases), rondas:config.rondas });
    OssStorage.salvarHistorico(historico);
    renderizarHistorico();
  }
  document.getElementById("historico-limpar").addEventListener("click", function () {
    if (!window.confirm("Limpar todo o histórico?")) return;
    estadoBotao(this, "Limpando…", "historico-status", "Limpo");
    historico = OssStorage.salvarHistorico([]);
    renderizarHistorico();
  });

  function configurarAjustes() {
    document.getElementById("ajuste-voz").checked = ajustes.voz;
    document.getElementById("ajuste-bipes").checked = ajustes.bipes;
    document.getElementById("ajuste-wake").checked = ajustes.wake;
    ["voz","bipes","wake"].forEach(function (chave) {
      document.getElementById("ajuste-" + chave).addEventListener("change", function () {
        ajustes[chave] = this.checked;
        ajustes = OssStorage.salvarAjustes(ajustes);
      });
    });
    atualizarListaVozes();
  }
  var vocesDisponiveis = [];
  function atualizarListaVozes() {
    vocesDisponiveis = typeof speechSynthesis === "undefined" ? [] : speechSynthesis.getVoices().filter(function (voz) { return voz.lang.toLowerCase().indexOf("pt") === 0; });
    var select = document.getElementById("voz-selecao");
    select.textContent = "";
    select.add(new Option("Automática", ""));
    vocesDisponiveis.forEach(function (voz) { select.add(new Option(voz.name, voz.name)); });
    if (ajustes.vozNome) select.value = ajustes.vozNome;
  }
  if (typeof speechSynthesis !== "undefined") {
    if (speechSynthesis.addEventListener) speechSynthesis.addEventListener("voiceschanged", atualizarListaVozes);
  }
  document.getElementById("voz-selecao").addEventListener("change", function () {
    var voz = vocesDisponiveis.filter(function (item) { return item.name === this.value; })[0];
    ajustes.vozNome = voz ? voz.name : ""; ajustes.vozIdioma = voz ? voz.lang : "";
    ajustes = OssStorage.salvarAjustes(ajustes);
  });
  document.getElementById("testar-voz").addEventListener("click", function () {
    var botao = this; botao.disabled = true; botao.textContent = "Falando…";
    try { OssVoice.falar(OssVoice.FALAS.fase, vozSelecionada(), { onend:function(){botao.disabled=false;botao.textContent="Testar voz";}, onerror:function(){botao.disabled=false;botao.textContent="Erro: voz indisponível";} }); }
    catch (erro) { botao.disabled=false; botao.textContent="Erro: voz indisponível"; }
  });
  function vozSelecionada() {
    if (typeof speechSynthesis === "undefined") return undefined;
    return vocesDisponiveis.filter(function (voz) { return voz.name === ajustes.vozNome && voz.lang === ajustes.vozIdioma; })[0] ||
      OssVoice.resolverVozSelecionada({ nome: ajustes.vozNome, idioma: ajustes.vozIdioma }, speechSynthesis.getVoices());
  }

  document.querySelectorAll(".about-version").forEach(function (el) { el.textContent = APP_VERSION; });
  document.getElementById("more-version").textContent = APP_VERSION;
  document.getElementById("ajustes-version").textContent = APP_VERSION;
  configurarAjustes();
  renderizarTimer();
  renderizarRondas();
  renderizarLivre();
  renderizarHistorico();
  renderizarListaTreinos();
  window.setInterval(function () {
    timer.tick(); rondasTimer.tick(); renderizarTimer(); renderizarRondas(); renderizarLivre();
  }, 200);
  var medicoes = document.getElementById("layout-medicao");
  var painelMedido = document.getElementById("phase-panel").getBoundingClientRect();
  var controlesMedidos = document.querySelector(".timer-controls").getBoundingClientRect();
  medicoes.textContent = JSON.stringify({
    innerHeight: window.innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
    phasePanel: painelMedido,
    timerControls: controlesMedidos
  });
  medicoes.setAttribute("data-medido", "1");
  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) navigator.serviceWorker.register("sw.js").catch(function () {});
}());
