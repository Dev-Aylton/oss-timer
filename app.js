(function () {
  "use strict";
  var APP_VERSION = "0.9.37";
  var dados = OssStorage.ler();
  var treinoAtual = dados.treinos.filter(function (item) { return item.id === dados.treinoAtual; })[0] || dados.treinos[0];
  var config = OssStorage.normalizar(treinoAtual);
  var fases = OssEngine.construirFases(config);
  var timer = new OssEngine.Timer(config);
  var ajustes = OssStorage.lerAjustes();
  var wakeLock = null;
  var wakeLockRequest = 0;
  var desconectarEventosTimer = null;
  var desconectarEventosRondas = null;

  var iconePlay = '<svg class="main-action-icon play-icon" viewBox="0 0 64 64" aria-hidden="true"><path d="M18 7C15.2 5.4 12 7.4 12 10.7v42.6c0 3.3 3.2 5.3 6 3.7l38-21.3c3-1.7 3-5.9 0-7.6L18 7Z"/></svg>';
  var iconePausa = '<svg class="main-action-icon pause-icon" viewBox="0 0 64 64" aria-hidden="true"><rect x="12" y="9" width="15" height="46" rx="3"/><rect x="37" y="9" width="15" height="46" rx="3"/></svg>';
  function renderizarBotaoPrincipal(botao, estado, labelId) {
    var rodando = estado.status === "rodando";
    var pausado = estado.status === "pausado";
    var texto = rodando ? "Pausar" : pausado ? "Retomar" : estado.status === "finalizado" ? "Repetir" : "Iniciar";
    var icone = botao.querySelector(".main-action-icon");
    if (icone) icone.outerHTML = rodando ? iconePausa : iconePlay;
    else botao.innerHTML = rodando ? iconePausa : iconePlay;
    botao.classList.toggle("is-running", rodando);
    botao.setAttribute("aria-label", texto);
    var progresso = botao.querySelector(".progress-ring-value");
    if (progresso) {
      var circunferencia = 2 * Math.PI * 44;
      progresso.style.strokeDashoffset = String(circunferencia * (1 - OssView.progressoFase(estado)));
    }
    document.getElementById(labelId).textContent = texto;
  }

  function tocarAudio(fn) {
    if (!ajustes.bipes) return;
    try { fn(); } catch (erro) { console.warn("Não foi possível reproduzir o áudio:", erro); }
  }
  function solicitarWakeLock() {
    if (!ajustes.wake || !navigator.wakeLock || wakeLock) return;
    var requisicao = ++wakeLockRequest;
    navigator.wakeLock.request("screen").then(function (bloqueio) {
      if (requisicao !== wakeLockRequest) {
        return bloqueio.release().catch(function (erro) {
          console.warn("Não foi possível liberar o bloqueio de tela:", erro);
        });
      }
      wakeLock = bloqueio;
      bloqueio.addEventListener("release", function () {
        if (wakeLock === bloqueio) wakeLock = null;
      }, { once: true });
    }).catch(function (erro) {
      console.warn("Não foi possível manter a tela ativa:", erro);
    });
  }
  function liberarWakeLock() {
    wakeLockRequest += 1;
    if (!wakeLock) return;
    wakeLock.release().catch(function (erro) {
      console.warn("Não foi possível liberar o bloqueio de tela:", erro);
    });
    wakeLock = null;
  }
  function algumTimerEmExecucao() {
    var statusLivre = livre ? livre.estado().status : "parado";
    return timer.estado().status === "rodando" ||
      rondasTimer.estado().status === "rodando" ||
      statusLivre === "rodando" ||
      statusLivre === "preparando";
  }
  function sincronizarWakeLock() {
    if (ajustes.wake && algumTimerEmExecucao()) solicitarWakeLock();
    else liberarWakeLock();
  }
  function desbloquearAudio() {
    try { OssAudio.desbloquear(); }
    catch (erro) { console.warn("Não foi possível ativar o áudio:", erro); }
  }
  function conectarEventosTimer(instancia) {
    return instancia.aoEvento(function (evento) {
      tocarAudio(function () {
        if (evento.tipo === "fase" || evento.tipo === "fim") OssAudio.gongo();
        else if (evento.tipo === "contagem") OssAudio.contagem();
        else if (evento.tipo === "aviso" || evento.tipo === "proximo") OssAudio.bipe();
      });
      if (ajustes.voz) {
        try { OssVoice.falar(OssVoice.fraseEvento(evento), vozSelecionada()); }
        catch (erro) { console.warn("Não foi possível anunciar a fase:", erro); }
      }
    });
  }
  desconectarEventosTimer = conectarEventosTimer(timer);

  function corFase(estado) {
    return OssView.corDaFase(estado.fase, estado.restanteFase, estado.status);
  }
  function tintaDaFase(fase) {
    return fase && fase.tipo === "descanso" ? "#FFFFFF" : "#101512";
  }
  function renderizarTimer() {
    var estado = timer.estado();
    var cor = corFase(estado);
    document.getElementById("phase-panel").style.setProperty("--phase", cor);
    document.getElementById("phase-panel").style.setProperty("--phase-ink", tintaDaFase(estado.fase));
    document.getElementById("tabata-view").style.setProperty("--phase", cor);
    document.getElementById("phase-name").textContent = estado.status === "finalizado" ? "Finalizado" : (estado.nomeFase || "Preparar");
    document.getElementById("timer-display").textContent = OssView.formatarTempo(estado.restanteFase);
    document.getElementById("rounds-left").textContent = estado.status === "finalizado" ? 0 : estado.rondasParaTerminar;
    document.getElementById("cycles-left").textContent = estado.status === "finalizado" ? 0 : estado.ciclosParaTerminar;
    renderizarBotaoPrincipal(document.getElementById("toggle-timer"), estado, "action-label");
    document.getElementById("workout-name").textContent = treinoAtual.nome.toUpperCase();
    document.getElementById("workout-total").textContent = OssView.formatarTempo(estado.restanteTotal);
    var proxima = estado.proxima;
    var faixa = document.getElementById("next-phase");
    faixa.hidden = !proxima;
    if (proxima) {
      var corProxima = OssView.corDaFase(proxima, proxima.dur, "rodando");
      faixa.style.setProperty("--next-phase-color", corProxima);
      faixa.style.setProperty("--next-phase-ink", tintaDaFase(proxima));
      document.getElementById("next-phase-name").textContent = proxima.nome;
      document.getElementById("next-phase-time").textContent = OssView.formatarTempo(proxima.dur);
    }
  }
  document.getElementById("toggle-timer").addEventListener("click", function () {
    timer.alternar();
    if (timer.estado().status === "rodando") desbloquearAudio();
    sincronizarWakeLock();
    renderizarTimer();
  });
  document.addEventListener("visibilitychange", function () {
    if (timer.estado().status === "rodando") timer.tick();
    if (rondasTimer.estado().status === "rodando") rondasTimer.tick();
    if (!document.hidden) {
      sincronizarWakeLock();
      renderizarTimer();
      renderizarRondas();
      renderizarLivre();
    }
  });
  window.addEventListener("pagehide", function () { liberarWakeLock(); });
  document.getElementById("skip-phase").addEventListener("click", function () { timer.pular(); renderizarTimer(); });
  document.getElementById("previous-phase").addEventListener("click", function () { timer.anterior(); renderizarTimer(); });
  document.getElementById("reset-timer").addEventListener("click", function () { timer.reset(); sincronizarWakeLock(); renderizarTimer(); });
  document.getElementById("configurar-sparring").addEventListener("click", function () { abrirEditor(false); });
  document.getElementById("open-ajustes").addEventListener("click", function () { abrirModal("ajustes-panel"); });

  var rondasCfg = OssStorage.lerRondas();
  var duracaoRondas = OssEngine.totalSegundos(OssEngine.construirFases(rondasCfg));
  var rondasTimer = new OssEngine.Timer(rondasCfg);
  desconectarEventosRondas = conectarEventosTimer(rondasTimer);
  function renderizarRondas() {
    var estado = rondasTimer.estado();
    var cor = corFase(estado);
    document.getElementById("rondas-phase-panel").style.setProperty("--phase", cor);
    document.getElementById("rondas-phase-panel").style.setProperty("--phase-ink", tintaDaFase(estado.fase));
    document.getElementById("rondas-view").style.setProperty("--phase", cor);
    document.getElementById("rondas-phase-name").textContent = estado.status === "finalizado" ? "Finalizado" : (estado.nomeFase || "Preparar");
    document.getElementById("rondas-display").textContent = OssView.formatarTempo(estado.restanteFase);
    document.getElementById("rondas-left").textContent = estado.status === "finalizado" ? 0 : estado.rondasParaTerminar;
    document.getElementById("rondas-total").textContent = OssView.formatarTempo(estado.restanteTotal);
    var faseAtual = estado.fase;
    var rondaAtual = faseAtual && faseAtual.ronda > 0 ? faseAtual.ronda : 1;
    var cicloAtual = faseAtual && faseAtual.ciclo > 0 ? faseAtual.ciclo : 1;
    if (faseAtual && faseAtual.tipo === "descanso" && faseAtual.ronda < rondasCfg.rondas) {
      rondaAtual = faseAtual.ronda + 1;
    } else if (faseAtual && faseAtual.tipo === "descansoCiclo") {
      rondaAtual = 1;
      cicloAtual = Math.min(rondasCfg.ciclos, faseAtual.ciclo + 1);
    } else if (faseAtual && faseAtual.tipo === "relaxe") {
      rondaAtual = rondasCfg.rondas;
      cicloAtual = rondasCfg.ciclos;
    }
    if (estado.status === "finalizado") {
      rondaAtual = rondasCfg.rondas;
      cicloAtual = rondasCfg.ciclos;
    }
    document.getElementById("rondas-current").textContent = rondaAtual;
    document.getElementById("rondas-count").textContent = rondasCfg.rondas;
    document.getElementById("rondas-cycle-current").textContent = cicloAtual;
    document.getElementById("rondas-cycle-count").textContent = rondasCfg.ciclos;
    renderizarBotaoPrincipal(document.getElementById("rondas-toggle"), estado, "rondas-action-label");
    var faixa = document.getElementById("rondas-next");
    faixa.hidden = !estado.proxima;
    if (estado.proxima) {
      var corProxima = OssView.corDaFase(estado.proxima, estado.proxima.dur, "rodando");
      faixa.style.setProperty("--next-phase-color", corProxima);
      faixa.style.setProperty("--next-phase-ink", tintaDaFase(estado.proxima));
      document.getElementById("rondas-next-name").textContent = estado.proxima.nome;
      document.getElementById("rondas-next-time").textContent = OssView.formatarTempo(estado.proxima.dur);
    }
  }
  document.getElementById("rondas-toggle").addEventListener("click", function () {
    rondasTimer.alternar();
    if (rondasTimer.estado().status === "rodando") desbloquearAudio();
    sincronizarWakeLock();
    renderizarRondas();
  });
  document.getElementById("rondas-reset").addEventListener("click", function () { rondasTimer.reset(); sincronizarWakeLock(); renderizarRondas(); });
  document.getElementById("rondas-configurar").addEventListener("click", function () { abrirEditor(true); });
  document.getElementById("open-ajustes-rondas").addEventListener("click", function () { abrirModal("ajustes-panel"); });

  var livre = new OssEngine.Cronometro({ preparar: 0 });
  function formatarLivre(ms) { return OssStorage.formatarDuracao(Math.floor(ms / 1000)); }
  function renderizarLivre() {
    var estadoLivre = livre.estado();
    var ms = estadoLivre.decorrido * 1000;
    document.getElementById("livre-tempo").textContent = formatarLivre(ms);
    renderizarBotaoPrincipal(document.getElementById("livre-toggle"), estadoLivre, "livre-action-label");
    var voltas = livre.voltas;
    var ultimaVolta = voltas.length ? voltas[voltas.length - 1] : null;
    document.getElementById("livre-volta").textContent = ultimaVolta
      ? formatarLivre(ultimaVolta.duracao * 1000)
      : "—";
    document.getElementById("livre-volta-numero").textContent = ultimaVolta
      ? "#" + ultimaVolta.numero
      : "—";
    document.getElementById("livre-volta-total").textContent = ultimaVolta
      ? formatarLivre(ultimaVolta.total * 1000)
      : "—";
    var listaVoltas = document.getElementById("livre-lista-voltas");
    listaVoltas.textContent = "";
    voltas.slice(-3).reverse().forEach(function (volta) {
      var item = document.createElement("li");
      var numero = document.createElement("span");
      numero.className = "lap-number";
      numero.textContent = "Volta " + volta.numero;
      var parcial = document.createElement("time");
      parcial.className = "lap-split";
      parcial.textContent = formatarLivre(volta.duracao * 1000);
      var acumulado = document.createElement("span");
      acumulado.className = "lap-total";
      acumulado.textContent = "Total " + formatarLivre(volta.total * 1000);
      item.appendChild(numero);
      item.appendChild(parcial);
      item.appendChild(acumulado);
      listaVoltas.appendChild(item);
    });
    if (!voltas.length) {
      var vazio = document.createElement("li");
      vazio.className = "laps-empty";
      vazio.textContent = "Nenhuma volta registrada ainda.";
      listaVoltas.appendChild(vazio);
    }
    document.getElementById("marcar-volta").disabled = estadoLivre.status === "parado";
  }
  document.getElementById("livre-toggle").addEventListener("click", function () {
    livre.alternar();
    sincronizarWakeLock();
    renderizarLivre();
  });
  document.getElementById("marcar-volta").addEventListener("click", function () {
    livre.volta();
    renderizarLivre();
  });
  document.getElementById("livre-reset").addEventListener("click", function () {
    livre = new OssEngine.Cronometro({ preparar: 0 });
    sincronizarWakeLock();
    renderizarLivre();
  });
  document.getElementById("open-ajustes-crono").addEventListener("click", function () { abrirModal("ajustes-panel"); });

  function abrirModal(id) { document.getElementById(id).hidden = false; }
  document.querySelectorAll("[data-close]").forEach(function (botao) {
    botao.addEventListener("click", function () { document.getElementById(botao.dataset.close).hidden = true; });
  });
  document.querySelectorAll("[data-panel]").forEach(function (botao) {
    botao.addEventListener("click", function () { abrirModal(botao.dataset.panel + "-panel"); });
  });
  document.querySelectorAll("[data-tab]").forEach(function (botao) {
    botao.addEventListener("click", function () {
      document.querySelectorAll("[data-tab]").forEach(function (item) {
        var ativo = item === botao;
        item.classList.toggle("active", ativo);
        item.setAttribute("aria-selected", ativo ? "true" : "false");
      });
      document.querySelectorAll(".screen").forEach(function (tela) { tela.hidden = tela.id !== botao.dataset.tab; });
    });
  });

  var editandoRondas = false;
  var intervaloCampos = [
    { chave:"preparar", nome:"Preparação", descricao:"Tempo antes de começar a primeira ronda.", grupo:"intervalos", tipo:"duracao", minimo:0, maximo:3600, passo:5, cor:"prep" },
    { chave:"exercicio", nome:"Tempo de luta", descricao:"Duração de cada ronda ativa.", grupo:"intervalos", tipo:"duracao", minimo:0, maximo:86400, passo:30, cor:"work" },
    { chave:"descanso", nome:"Descanso entre rondas", descricao:"Pausa entre as rondas do mesmo ciclo.", grupo:"intervalos", tipo:"duracao", minimo:0, maximo:86400, passo:5, cor:"rest" },
    { chave:"rondas", nome:"Rondas por ciclo", descricao:"Quantas vezes o tempo de luta se repete.", grupo:"intervalos", tipo:"quantidade", minimo:1, maximo:100, passo:1, cor:"rounds" },
    { chave:"ciclos", nome:"Ciclos", descricao:"Quantas vezes repetir o bloco de rondas.", grupo:"ciclos", tipo:"quantidade", minimo:1, maximo:100, passo:1, cor:"cycles" },
    { chave:"descansoCiclo", nome:"Descanso entre ciclos", descricao:"Pausa ao terminar cada bloco de rondas.", grupo:"ciclos", tipo:"duracao", minimo:0, maximo:86400, passo:30, cor:"rest" },
    { chave:"relaxe", nome:"Relaxamento final", descricao:"Tempo extra ao concluir todas as rondas.", grupo:"ciclos", tipo:"duracao", minimo:0, maximo:86400, passo:30, cor:"finish" }
  ];
  function formatarDuracaoEditor(segundos) {
    return OssEngine.formatar(segundos);
  }
  function lerCampoEditor(campo, valor) {
    var texto = String(valor).trim();
    if (campo.tipo === "quantidade") {
      if (!/^\d+$/.test(texto)) return NaN;
      return Number(texto);
    }
    if (/^\d+$/.test(texto)) return Number(texto);
    var minutos = texto.match(/^(\d+):([0-5]\d)$/);
    if (minutos) return Number(minutos[1]) * 60 + Number(minutos[2]);
    var horas = texto.match(/^(\d+):([0-5]\d):([0-5]\d)$/);
    if (horas) return Number(horas[1]) * 3600 + Number(horas[2]) * 60 + Number(horas[3]);
    return NaN;
  }
  function valorCampoEditor(campo) {
    var input = document.querySelector('[data-campo="' + campo.chave + '"]');
    return lerCampoEditor(campo, input.value);
  }
  function atualizarResumoEditor() {
    var valores = {};
    var valido = true;
    intervaloCampos.forEach(function (campo) {
      var valor = valorCampoEditor(campo);
      if (!Number.isInteger(valor) || valor < campo.minimo || valor > campo.maximo) valido = false;
      valores[campo.chave] = valor;
    });
    document.getElementById("editor-rounds-summary").textContent =
      Number.isInteger(valores.rondas) ? valores.rondas : "—";
    document.getElementById("editor-cycles-summary").textContent =
      Number.isInteger(valores.ciclos) ? valores.ciclos : "—";
    document.querySelectorAll(".editor-presets button").forEach(function (botao) {
      var campo = intervaloCampos.filter(function (item) { return item.chave === botao.dataset.quickField; })[0];
      var valor = campo ? valorCampoEditor(campo) : NaN;
      botao.setAttribute("aria-pressed", Number(botao.dataset.quickValue) === valor ? "true" : "false");
    });
    var nota = document.getElementById("editor-preview-note");
    if (!valido) {
      document.getElementById("editor-total").textContent = "—";
      nota.textContent = "Confira os valores e use MM:SS nos campos de tempo.";
      return;
    }
    var atual = editandoRondas ? OssStorage.lerRondas() : config;
    var fasesEditor = OssEngine.construirFases(Object.assign({}, atual, valores));
    document.getElementById("editor-total").textContent =
      formatarDuracaoEditor(OssEngine.totalSegundos(fasesEditor));
    nota.textContent = "A duração inclui preparação, intervalos e relaxamento.";
  }
  document.querySelectorAll(".editor-presets button").forEach(function (botao) {
    botao.addEventListener("click", function () {
      var campo = intervaloCampos.filter(function (item) { return item.chave === botao.dataset.quickField; })[0];
      if (!campo) return;
      var input = document.querySelector('[data-campo="' + campo.chave + '"]');
      if (!input) return;
      var valor = Number(botao.dataset.quickValue);
      input.value = campo.tipo === "duracao" ? formatarDuracaoEditor(valor) : String(valor);
      atualizarResumoEditor();
    });
  });
  function abrirEditor(rondas) {
    editandoRondas = rondas;
    var atual = rondas ? OssStorage.lerRondas() : config;
    document.getElementById("editor-titulo").textContent = rondas ? "Ajustar Rondas" : "Ajustar Sparring";
    document.getElementById("editor-contexto").textContent = rondas ? "CONFIGURAÇÃO DE RONDAS" : "CONFIGURAÇÃO DO TREINO";
    document.getElementById("editor-hero-title").textContent = rondas ? "Ajuste o timer de rounds" : "Ajuste o treino no seu ritmo";
    document.getElementById("editor-hero-copy").textContent = rondas
      ? "Tempo, preparação e pausas em um só lugar."
      : "Tempos, pausas e rounds em um só lugar.";
    document.getElementById("editor-fast-title").textContent = rondas ? "Próximas rondas" : "Próximo sparring";
    document.getElementById("editor-fast-duration-title").textContent = rondas ? "Tempo por ronda" : "Tempo de luta";
    document.getElementById("editor-fast-rounds-title").textContent = rondas ? "Rondas no treino" : "Quantidade de rounds";
    document.getElementById("editor-name-field").hidden = rondas;
    document.getElementById("editor-library").hidden = rondas;
    document.getElementById("editor-nome").value = rondas ? "" : treinoAtual.nome;
    document.getElementById("editor-status").textContent = "";
    var lista = document.getElementById("editor-intervalos");
    lista.textContent = "";
    document.getElementById("editor-fast-duration").textContent = "";
    document.getElementById("editor-fast-rounds").textContent = "";
    var grupos = [
      { id:"intervalos", titulo:"Preparação e rondas", descricao:"Aquecimento, luta e pausa entre cada round." },
      { id:"ciclos", titulo:"Ciclos e encerramento", descricao:"Repetições e os intervalos finais do treino." }
    ];
    grupos.forEach(function (grupo) {
      var secao = document.createElement("section");
      secao.className = "interval-group";
      var cabecalho = document.createElement("div");
      cabecalho.className = "interval-group-heading";
      cabecalho.innerHTML = "<strong>" + grupo.titulo + "</strong><small>" + grupo.descricao + "</small>";
      secao.appendChild(cabecalho);
      var camposGrupo = document.createElement("div");
      camposGrupo.className = "interval-group-fields";
      camposGrupo.dataset.grupo = grupo.id;
      secao.appendChild(camposGrupo);
      lista.appendChild(secao);
    });
    intervaloCampos.forEach(function (campo) {
      var idCampo = "editor-campo-" + campo.chave;
      var linha = document.createElement("div");
      linha.className = "interval-row interval-row--" + campo.cor;
      var descricao = document.createElement("span");
      descricao.className = "interval-copy";
      var rotulo = document.createElement("label");
      rotulo.htmlFor = idCampo;
      rotulo.textContent = campo.nome;
      var detalhe = document.createElement("small");
      detalhe.textContent = campo.descricao;
      descricao.appendChild(rotulo);
      descricao.appendChild(detalhe);
      linha.appendChild(descricao);
      var controle = document.createElement("div");
      controle.className = "interval-control";
      var diminuir = document.createElement("button");
      diminuir.type = "button";
      diminuir.dataset.dir = "-1";
      diminuir.setAttribute("aria-label", "Diminuir " + campo.nome.toLowerCase());
      diminuir.textContent = "−";
      var input = document.createElement("input");
      input.id = idCampo;
      input.dataset.campo = campo.chave;
      input.type = campo.tipo === "duracao" ? "text" : "number";
      input.inputMode = "numeric";
      input.setAttribute("aria-label", campo.tipo === "duracao" ? campo.nome + ", minutos e segundos" : campo.nome);
      input.setAttribute("aria-describedby", idCampo + "-ajuda");
      input.autocomplete = "off";
      input.value = campo.tipo === "duracao" ? formatarDuracaoEditor(atual[campo.chave]) : atual[campo.chave];
      input.dataset.tipo = campo.tipo;
      if (campo.tipo === "duracao") {
        input.placeholder = "00:00";
        input.maxLength = 8;
      } else {
        input.min = String(campo.minimo);
        input.max = String(campo.maximo);
        input.step = "1";
      }
      var unidade = document.createElement("span");
      unidade.className = "interval-unit";
      unidade.id = idCampo + "-ajuda";
      unidade.textContent = campo.tipo === "duracao" ? "min:seg" : "un.";
      var aumentar = document.createElement("button");
      aumentar.type = "button";
      aumentar.dataset.dir = "1";
      aumentar.setAttribute("aria-label", "Aumentar " + campo.nome.toLowerCase());
      aumentar.textContent = "+";
      [diminuir, input, unidade, aumentar].forEach(function (elemento) { controle.appendChild(elemento); });
      linha.appendChild(controle);
      [diminuir, aumentar].forEach(function (botao) {
        botao.addEventListener("click", function () {
          var valorAtual = lerCampoEditor(campo, input.value);
          if (!Number.isInteger(valorAtual)) return;
          var proximo = Math.min(campo.maximo, Math.max(campo.minimo,
            valorAtual + Number(botao.dataset.dir) * campo.passo));
          input.value = campo.tipo === "duracao" ? formatarDuracaoEditor(proximo) : proximo;
          atualizarResumoEditor();
        });
      });
      input.addEventListener("input", atualizarResumoEditor);
      if (campo.chave === "exercicio") {
        document.getElementById("editor-fast-duration").appendChild(linha);
      } else if (campo.chave === "rondas") {
        document.getElementById("editor-fast-rounds").appendChild(linha);
      } else {
        document.querySelector('[data-grupo="' + campo.grupo + '"]').appendChild(linha);
      }
    });
    lista.querySelectorAll(".interval-group").forEach(function (secao) {
      if (!secao.querySelector(".interval-row")) secao.remove();
    });
    renderizarListaTreinos();
    atualizarResumoEditor();
    abrirModal("editor-panel");
  }
  function salvarTreino() {
    var copia = {};
    try {
      intervaloCampos.forEach(function (campo) {
        copia[campo.chave] = valorCampoEditor(campo);
        if (!Number.isInteger(copia[campo.chave]) || copia[campo.chave] < campo.minimo || copia[campo.chave] > campo.maximo) {
          throw new Error(campo.tipo === "duracao"
            ? "Informe " + campo.nome.toLowerCase() + " como MM:SS, entre 00:00 e " + formatarDuracaoEditor(campo.maximo) + "."
            : "Informe " + campo.nome.toLowerCase() + " entre " + campo.minimo + " e " + campo.maximo + ".");
        }
      });
      var normalizado = OssStorage.normalizar(Object.assign({}, editandoRondas ? OssStorage.lerRondas() : config, copia));
      if (editandoRondas) {
        normalizado.id = "rondas";
        var erroRondas = OssStorage.validarTreino(normalizado, []);
        if (erroRondas) throw new Error(erroRondas);
        OssStorage.salvarRondas(normalizado);
        rondasCfg = normalizado;
        duracaoRondas = OssEngine.totalSegundos(OssEngine.construirFases(rondasCfg));
        if (desconectarEventosRondas) desconectarEventosRondas();
        rondasTimer = new OssEngine.Timer(normalizado);
        desconectarEventosRondas = conectarEventosTimer(rondasTimer);
        sincronizarWakeLock();
        renderizarRondas();
      }
      else {
        normalizado.nome = document.getElementById("editor-nome").value.trim();
        normalizado.id = treinoAtual.id;
        var erroTreino = OssStorage.validarTreino(normalizado, dados.treinos.filter(function (item) {
          return item.id !== normalizado.id;
        }));
        if (erroTreino) throw new Error(erroTreino);
        var lista = dados.treinos.map(function (item) { return item.id === normalizado.id ? normalizado : item; });
        dados = OssStorage.salvar({ version:1, treinoAtual:dados.treinoAtual, treinos:lista });
        treinoAtual = normalizado;
        config = OssStorage.normalizar(normalizado);
        fases = OssEngine.construirFases(config);
        if (desconectarEventosTimer) desconectarEventosTimer();
        timer = new OssEngine.Timer(config);
        desconectarEventosTimer = conectarEventosTimer(timer);
        sincronizarWakeLock();
        renderizarTimer();
        renderizarListaTreinos();
      }
      document.getElementById("editor-panel").hidden = true;
    } catch (erro) {
      document.getElementById("editor-status").textContent = "Erro: " + (erro.message || "valores inválidos");
    }
  }
  document.getElementById("concluir-editor").addEventListener("click", function () {
    salvarTreino();
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
      linha.className = "saved-workout" + (item.id === dados.treinoAtual ? " is-current" : "");
      linha.setAttribute("aria-pressed", item.id === dados.treinoAtual ? "true" : "false");
      var marcador = document.createElement("span");
      marcador.className = "saved-workout-mark";
      marcador.setAttribute("aria-hidden", "true");
      marcador.textContent = item.id === dados.treinoAtual ? "✓" : "";
      var conteudo = document.createElement("span");
      conteudo.className = "saved-workout-copy";
      var nome = document.createElement("strong");
      nome.textContent = item.nome;
      var detalhe = document.createElement("small");
      detalhe.textContent = item.rondas + " rondas · " + item.ciclos + (item.ciclos === 1 ? " ciclo" : " ciclos");
      conteudo.appendChild(nome);
      conteudo.appendChild(detalhe);
      var seta = document.createElement("span");
      seta.className = "saved-workout-arrow";
      seta.setAttribute("aria-hidden", "true");
      seta.textContent = "›";
      linha.appendChild(marcador);
      linha.appendChild(conteudo);
      linha.appendChild(seta);
      linha.addEventListener("click", function () {
        dados.treinoAtual = item.id;
        OssStorage.salvar(dados);
        treinoAtual = item;
        config = OssStorage.normalizar(item);
        timer = new OssEngine.Timer(config);
        fases = OssEngine.construirFases(config);
        if (desconectarEventosTimer) desconectarEventosTimer();
        desconectarEventosTimer = conectarEventosTimer(timer);
        sincronizarWakeLock();
        renderizarTimer();
        abrirEditor(false);
      });
      lista.appendChild(linha);
    });
  }

  function configurarAjustes() {
    document.getElementById("ajuste-voz").checked = ajustes.voz;
    document.getElementById("ajuste-bipes").checked = ajustes.bipes;
    document.getElementById("ajuste-wake").checked = ajustes.wake;
    ["voz","bipes","wake"].forEach(function (chave) {
      document.getElementById("ajuste-" + chave).addEventListener("change", function () {
        ajustes[chave] = this.checked;
        ajustes = OssStorage.salvarAjustes(ajustes);
        if (chave === "wake") sincronizarWakeLock();
      });
    });
    atualizarListaVozes();
  }
  var vocesDisponiveis = [];
  function atualizarListaVozes() {
    vocesDisponiveis = typeof speechSynthesis === "undefined"
      ? []
      : OssVoice.vozesPortuguese(speechSynthesis.getVoices());
    var select = document.getElementById("voz-selecao");
    select.textContent = "";
    select.add(new Option("Automática — Luciana se disponível", ""));
    vocesDisponiveis.forEach(function (voz) {
      var rotulo = voz.name
        .replace(/^Microsoft\s+/i, "")
        .replace(/\s*-\s*Portuguese\s*\(Brazil\)/i, " · Brasil");
      select.add(new Option(rotulo, voz.name));
    });
    if (ajustes.vozNome) select.value = ajustes.vozNome;
    var statusVoz = document.getElementById("status-voz");
    var luciana = vocesDisponiveis.some(function (voz) { return /luciana/i.test(voz.name) && /^pt[-_]br$/i.test(voz.lang); });
    statusVoz.textContent = luciana
      ? "Luciana está disponível e será usada no modo automático."
      : vocesDisponiveis.length
        ? vocesDisponiveis.length + " voz(es) em português disponível(is)."
        : "Nenhuma voz em português disponível neste dispositivo.";
    document.getElementById("testar-voz").disabled = vocesDisponiveis.length === 0;
  }
  if (typeof speechSynthesis !== "undefined") {
    if (speechSynthesis.addEventListener) speechSynthesis.addEventListener("voiceschanged", atualizarListaVozes);
  }
  document.getElementById("voz-selecao").addEventListener("change", function () {
    var nomeSelecionado = this.value;
    var voz = vocesDisponiveis.filter(function (item) { return item.name === nomeSelecionado; })[0];
    ajustes.vozNome = voz ? voz.name : ""; ajustes.vozIdioma = voz ? voz.lang : "";
    ajustes = OssStorage.salvarAjustes(ajustes);
    atualizarListaVozes();
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
  renderizarListaTreinos();
  window.setInterval(function () {
    timer.tick(); rondasTimer.tick(); renderizarTimer(); renderizarRondas(); renderizarLivre();
    if (wakeLock && !algumTimerEmExecucao()) liberarWakeLock();
  }, 200);
  var medicoes = document.getElementById("layout-medicao");
  var painelMedido = document.getElementById("phase-panel").getBoundingClientRect();
  var elementosControles = document.querySelectorAll("#tabata-view .remaining, #toggle-timer");
  var limitesControles = Array.prototype.reduce.call(elementosControles, function (limites, elemento) {
    var caixa = elemento.getBoundingClientRect();
    if (!limites) return { top: caixa.top, right: caixa.right, bottom: caixa.bottom, left: caixa.left };
    return {
      top: Math.min(limites.top, caixa.top),
      right: Math.max(limites.right, caixa.right),
      bottom: Math.max(limites.bottom, caixa.bottom),
      left: Math.min(limites.left, caixa.left)
    };
  }, null);
  var controlesMedidos = limitesControles && {
    x: limitesControles.left,
    y: limitesControles.top,
    top: limitesControles.top,
    right: limitesControles.right,
    bottom: limitesControles.bottom,
    left: limitesControles.left,
    width: limitesControles.right - limitesControles.left,
    height: limitesControles.bottom - limitesControles.top
  };
  medicoes.textContent = JSON.stringify({
    innerHeight: window.innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
    phasePanel: painelMedido,
    timerControls: controlesMedidos
  });
  medicoes.setAttribute("data-medido", "1");
  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
    navigator.serviceWorker.register("sw.js").catch(function (erro) {
      console.warn("Não foi possível registrar o service worker:", erro);
    });
  }
}());
