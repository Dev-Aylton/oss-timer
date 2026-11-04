(function () {
  "use strict";
  var APP_VERSION = "0.7.0";

  var dadosTreino = OssStorage.ler();
  var treinoAtual = dadosTreino.treinos.filter(function (item) {
    return item.id === dadosTreino.treinoAtual;
  })[0] || dadosTreino.treinos[0];
  var config = OssStorage.normalizar(treinoAtual);
  var timer = new OssEngine.Timer(config);
  var app = document.getElementById("app");
  var numero = document.getElementById("timer-display");
  var fase = document.getElementById("phase-name");
  var ronda = document.getElementById("round-label");
  var ciclo = document.getElementById("cycle-label");
  var total = document.getElementById("total-remaining");
  var acao = document.getElementById("toggle-timer");
  var pular = document.getElementById("skip-phase");
  var reiniciar = document.getElementById("reset-timer");
  var repetir = document.getElementById("repeat-timer");
  var anterior = document.getElementById("previous-phase");
  var wakeLock = null;
  var wakePedido = null;
  var abaAtual = "timer-view";
  var ajustes = OssStorage.lerAjustes();
  var fases = OssEngine.construirFases(config);

  function solicitarWakeLock() {
    if (!ajustes.wake || !navigator.wakeLock || !navigator.wakeLock.request) return;
    try {
      wakePedido = navigator.wakeLock.request("screen").then(function (bloqueio) {
        wakeLock = bloqueio;
        wakePedido = null;
      }).catch(function () {
        wakePedido = null;
      });
    } catch (erro) {
      wakePedido = null;
    }
  }

  function liberarWakeLock() {
    if (wakeLock && wakeLock.release) {
      try {
        Promise.resolve(wakeLock.release()).catch(function () {});
      } catch (erro) {}
      wakeLock = null;
    }
  }

  function iniciarInteracao() {
    if (ajustes.bipes) {
      try { OssAudio.desbloquear(); } catch (erro) {}
    }
    if (timer.estado().status !== "rodando") return;
    solicitarWakeLock();
  }

  function lidarEvento(evento) {
    if (ajustes.bipes) {
      try {
        if (evento.tipo === "fase" || evento.tipo === "fim") OssAudio.gongo();
        else if (evento.tipo === "contagem") OssAudio.contagem();
        else if (evento.tipo === "aviso" || evento.tipo === "proximo") OssAudio.bipe();
      } catch (erro) {}
    }
    if (ajustes.voz) {
      try { OssVoice.falar(OssVoice.fraseEvento(evento)); } catch (erro) {}
    }
    if (evento.tipo === "fim") registrarHistorico();
  }

  timer.aoEvento(lidarEvento);

  function renderizar(estado) {
    var rotulos = OssView.rotulos(estado, config);
    app.style.setProperty("--phase-color", OssView.corDaFase(
      estado.fase,
      estado.restanteFase,
      estado.status
    ));
    app.dataset.phase = estado.status === "finalizado"
      ? "finalizado"
      : (estado.fase ? estado.fase.tipo : "neutro");
    app.dataset.status = estado.status;
    fase.textContent = rotulos.fase;
    numero.textContent = OssView.formatarTempo(estado.restanteFase);
    ronda.textContent = rotulos.ronda;
    ciclo.textContent = rotulos.ciclo;
    total.textContent = rotulos.total;
    acao.textContent = rotulos.acao;
    acao.hidden = estado.status === "finalizado";
    pular.hidden = estado.status === "finalizado";
    reiniciar.hidden = estado.status === "finalizado";
    repetir.hidden = estado.status !== "finalizado";
    anterior.disabled = estado.status === "parado" || estado.fase === fases[0] || estado.status === "finalizado";
    acao.disabled = estado.status === "finalizado";
    reiniciar.disabled = estado.status === "parado";
    pular.disabled = estado.status === "finalizado";
  }

  function alternar() {
    timer.alternar();
    if (timer.estado().status === "rodando") iniciarInteracao();
    if (timer.estado().status !== "rodando") {
      try { OssVoice.cancelar(); } catch (erro) {}
      liberarWakeLock();
    }
    renderizar(timer.estado());
  }

  acao.addEventListener("click", alternar);
  pular.addEventListener("click", function () {
    try { OssVoice.cancelar(); } catch (erro) {}
    timer.pular();
    renderizar(timer.estado());
  });
  reiniciar.addEventListener("click", function () {
    try { OssVoice.cancelar(); } catch (erro) {}
    liberarWakeLock();
    timer.reset();
    renderizar(timer.estado());
  });
  anterior.addEventListener("click", function () {
    if (anterior.disabled) return;
    timer.anterior();
    renderizar(timer.estado());
  });
  repetir.addEventListener("click", function () {
    try { OssVoice.cancelar(); } catch (erro) {}
    timer.reset();
    timer.iniciar();
    iniciarInteracao();
    renderizar(timer.estado());
  });

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && timer.estado().status === "rodando" && !wakeLock && !wakePedido) {
      solicitarWakeLock();
    }
  });

  renderizar(timer.estado());
  configurarAbas();
  configurarTreinos();
  configurarLivre();
  configurarHistorico();
  configurarAjustes();
  window.setInterval(function () {
    timer.tick();
    renderizar(timer.estado());
    renderizarLivre();
  }, 200);

  function configurarAbas() {
    document.querySelectorAll("[data-tab]").forEach(function (botao) {
      botao.addEventListener("click", function () {
        abaAtual = botao.dataset.tab;
        document.querySelectorAll("[data-tab]").forEach(function (item) {
          item.setAttribute("aria-current", item === botao ? "page" : "false");
        });
        document.querySelectorAll(".tab-view, .app").forEach(function (view) {
          view.hidden = view.id !== abaAtual;
        });
        if (abaAtual === "treinos-view") renderizarLista();
      });
    });
  }

  function configurarTreinos() {
    document.getElementById("novo-treino").addEventListener("click", function () {
      abrirEditor();
    });
    document.getElementById("exportar-json").addEventListener("click", exportarJson);
    document.getElementById("copiar-json").addEventListener("click", copiarJson);
    document.getElementById("importar-json").addEventListener("change", importarJson);
  }

  var livreInicio = 0;
  var livreAcumulado = 0;
  var livreRodando = false;
  var livreWake = null;

  function configurarLivre() {
    document.getElementById("livre-toggle").addEventListener("click", function () {
      var botao = this;
      if (livreRodando) {
        livreAcumulado += Date.now() - livreInicio;
        livreRodando = false;
        this.textContent = "Iniciar";
        liberarLivreWake();
        estadoBotao(botao, "Pausado", "livre-status", "Pausado");
      } else {
        livreInicio = Date.now();
        livreRodando = true;
        this.textContent = "Pausar";
        solicitarLivreWake();
        estadoBotao(botao, "Iniciando…", "livre-status", "Em andamento");
      }
      renderizarLivre();
    });
    document.getElementById("livre-reset").addEventListener("click", function () {
      var botao = this;
      livreAcumulado = 0;
      livreInicio = Date.now();
      renderizarLivre();
      estadoBotao(botao, "Zerando…", "livre-status", "Zerado");
    });
    renderizarLivre();
  }

  function renderizarLivre() {
    var ms = livreAcumulado + (livreRodando ? Date.now() - livreInicio : 0);
    document.getElementById("livre-tempo").textContent =
      OssStorage.formatarDuracao(Math.floor(ms / 1000));
    document.getElementById("livre-reset").disabled = livreRodando && livreAcumulado === 0 && Date.now() - livreInicio < 1000;
  }

  function solicitarLivreWake() {
    if (!ajustes.wake || !navigator.wakeLock || !navigator.wakeLock.request) return;
    try {
      navigator.wakeLock.request("screen").then(function (bloqueio) {
        livreWake = bloqueio;
      }).catch(function () {});
    } catch (erro) {}
  }

  function liberarLivreWake() {
    if (!livreWake) return;
    try { Promise.resolve(livreWake.release()).catch(function () {}); } catch (erro) {}
    livreWake = null;
  }

  var historico = OssStorage.lerHistorico();

  function registrarHistorico() {
    historico = OssStorage.adicionarHistorico(historico, {
      id: "historico-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      data: new Date().toISOString(),
      nome: treinoAtual.nome,
      duracao: OssEngine.totalSegundos(fases),
      rondas: config.rondas
    });
    OssStorage.salvarHistorico(historico);
    renderizarHistorico();
  }

  function configurarHistorico() {
    document.getElementById("historico-limpar").addEventListener("click", function () {
      if (!historico.length || !window.confirm("Limpar todo o histórico?")) return;
      var botao = this;
      estadoBotao(botao, "Limpando…", "historico-status", "Limpo");
      historico = OssStorage.salvarHistorico([]);
      renderizarHistorico();
    });
    renderizarHistorico();
  }

  function renderizarHistorico() {
    var lista = document.getElementById("historico-lista");
    lista.textContent = "";
    if (!historico.length) {
      var vazio = document.createElement("p");
      vazio.textContent = "Nenhum treino concluído.";
      lista.appendChild(vazio);
      return;
    }
    historico.slice().sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); }).forEach(function (entrada) {
      var item = document.createElement("article");
      item.className = "historico-item";
      var texto = document.createElement("p");
      texto.textContent = entrada.nome + " — " + OssStorage.formatarDuracao(entrada.duracao) +
        " — " + entrada.rondas + " rondas — " + new Date(entrada.data).toLocaleString("pt-BR");
      var apagar = document.createElement("button");
      apagar.type = "button";
      apagar.textContent = "Apagar";
      apagar.addEventListener("click", function () {
        if (!window.confirm("Apagar esta entrada?")) return;
        estadoBotao(apagar, "Apagando…", "historico-status", "Apagado");
        historico = OssStorage.salvarHistorico(OssStorage.removerHistorico(historico, entrada.id));
        renderizarHistorico();
      });
      item.appendChild(texto);
      item.appendChild(apagar);
      lista.appendChild(item);
    });
  }

  function configurarAjustes() {
    document.getElementById("app-version").textContent = "Versão " + APP_VERSION;
    var voz = document.getElementById("ajuste-voz");
    var bipes = document.getElementById("ajuste-bipes");
    var wake = document.getElementById("ajuste-wake");
    voz.checked = ajustes.voz;
    bipes.checked = ajustes.bipes;
    wake.checked = ajustes.wake;
    [voz, bipes, wake].forEach(function (campo) {
      campo.addEventListener("change", function () {
        ajustes = OssStorage.salvarAjustes({
          voz: voz.checked, bipes: bipes.checked, wake: wake.checked
        });
        atualizarStatusAjustes();
      });
    });
    atualizarStatusAjustes();
  }

  function atualizarStatusAjustes() {
    var vozNome = "voz padrão";
    if (typeof speechSynthesis !== "undefined" && speechSynthesis.getVoices) {
      var voces = speechSynthesis.getVoices();
      var pt = voces.filter(function (item) { return String(item.lang).toLowerCase().indexOf("pt-br") === 0; })[0];
      if (pt) vozNome = pt.name;
    }
    document.getElementById("status-voz").textContent = ajustes.voz
      ? "Voz: " + vozNome : "Voz: desativada";
    document.getElementById("status-bipes").textContent = ajustes.bipes ? "Bipes: ativados" : "Bipes: desativados";
    document.getElementById("status-wake").textContent = ajustes.wake && navigator.wakeLock
      ? "Tela sempre ligada: ativa" : "Tela sempre ligada: desativada / indisponível neste aparelho";
  }

  function renderizarLista() {
    var lista = document.getElementById("treino-lista");
    lista.textContent = "";
    dadosTreino.treinos.forEach(function (treino) {
      var card = document.createElement("article");
      card.className = "treino-card";
      var fases = OssEngine.construirFases(treino);
      var titulo = document.createElement("button");
      titulo.type = "button";
      titulo.className = "treino-escolha";
      titulo.textContent = treino.nome + " — " + OssEngine.formatar(OssEngine.totalSegundos(fases));
      titulo.addEventListener("click", function () { escolherTreino(treino.id); });
      var actions = document.createElement("div");
      actions.className = "treino-actions";
      actions.appendChild(botaoAcao("Editar", function () { abrirEditor(treino); }));
      actions.appendChild(botaoAcao("Duplicar", function () { duplicarTreino(treino); }));
      actions.appendChild(botaoAcao("Excluir", function () { excluirTreino(treino); }, true));
      card.appendChild(titulo);
      card.appendChild(actions);
      lista.appendChild(card);
    });
  }

  function botaoAcao(texto, acao, excluir) {
    var botao = document.createElement("button");
    botao.type = "button";
    botao.textContent = texto;
    if (excluir) botao.className = "perigo";
    botao.addEventListener("click", acao);
    return botao;
  }

  function escolherTreino(id) {
    dadosTreino.treinoAtual = id;
    dadosTreino = OssStorage.salvar(dadosTreino);
    treinoAtual = dadosTreino.treinos.filter(function (item) { return item.id === id; })[0];
    config = OssStorage.normalizar(treinoAtual);
    timer = new OssEngine.Timer(config);
    timer.aoEvento(lidarEvento);
    renderizar(timer.estado());
  }

  function duplicarTreino(treino) {
    var copia = OssStorage.normalizar(treino);
    copia.id = "treino-" + Date.now().toString(36);
    copia.nome = (copia.nome + " cópia").slice(0, 40);
    dadosTreino.treinos.push(copia);
    OssStorage.salvar(dadosTreino);
    renderizarLista();
  }

  function excluirTreino(treino) {
    if (dadosTreino.treinos.length === 1) {
      mostrarMensagem("É necessário manter pelo menos um treino.");
      return;
    }
    if (!window.confirm("Excluir \"" + treino.nome + "\"?")) return;
    estadoBotao(document.activeElement, "Excluindo…", "storage-mensagem", "Excluído");
    dadosTreino.treinos = dadosTreino.treinos.filter(function (item) { return item.id !== treino.id; });
    dadosTreino.treinos = OssStorage.garantirNaoVazio(dadosTreino.treinos);
    if (dadosTreino.treinoAtual === treino.id) dadosTreino.treinoAtual = dadosTreino.treinos[0].id;
    OssStorage.salvar(dadosTreino);
    renderizarLista();
  }

  function abrirEditor(treino) {
    var editor = document.getElementById("treino-editor");
    var item = treino ? OssStorage.normalizar(treino) : OssStorage.normalizar({
      id: "treino-" + Date.now().toString(36),
      nome: "Novo treino",
      preparar: 10, exercicio: 300, descanso: 35, rondas: 10, ciclos: 1,
      descansoCiclo: 0, relaxe: 0, avisosFim: [30, 10], avisoProximo: 10
    });
    editor.innerHTML = "";
    editor.hidden = false;
    var campos = [
      ["nome", "Nome", "text"], ["preparar", "Preparar (s)", "number"],
      ["exercicio", "Exercício (s)", "number"], ["descanso", "Descanso (s)", "number"],
      ["rondas", "Rondas", "number"], ["ciclos", "Ciclos", "number"],
      ["descansoCiclo", "Descanso entre ciclos (s)", "number"],
      ["relaxe", "Relaxe (s)", "number"], ["avisoProximo", "Aviso próximo (s)", "number"]
    ];
    campos.forEach(function (campo) {
      var label = document.createElement("label");
      label.textContent = campo[1];
      var input = document.createElement("input");
      input.name = campo[0];
      input.type = campo[2];
      input.value = item[campo[0]];
      label.appendChild(input);
      editor.appendChild(label);
    });
    var avisos = document.createElement("label");
    avisos.textContent = "Avisos do fim, separados por vírgula";
    var avisosInput = document.createElement("input");
    avisosInput.name = "avisosFim";
    avisosInput.value = item.avisosFim.join(", ");
    avisos.appendChild(avisosInput);
    editor.appendChild(avisos);
    var erro = document.createElement("p");
    erro.className = "mensagem";
    erro.id = "editor-erro";
    erro.setAttribute("role", "status");
    erro.setAttribute("aria-live", "polite");
    editor.appendChild(erro);
    var salvar = document.createElement("button");
    salvar.type = "submit";
    salvar.textContent = "Salvar";
    editor.appendChild(salvar);
    var cancelar = document.createElement("button");
    cancelar.type = "button";
    cancelar.textContent = "Cancelar";
    cancelar.addEventListener("click", function () { editor.hidden = true; });
    editor.appendChild(cancelar);
    editor.onsubmit = function (evento) {
      evento.preventDefault();
      salvar.disabled = true;
      salvar.textContent = "Salvando…";
      campos.forEach(function (campo) {
        if (campo[2] === "number") item[campo[0]] = Number(editor.elements[campo[0]].value);
        else item[campo[0]] = editor.elements[campo[0]].value;
      });
      item.avisosFim = avisosInput.value.split(",").map(function (valor) { return Number(valor.trim()); });
      var mensagem = OssStorage.validarTreino(item, dadosTreino.treinos);
      if (mensagem && !treino) mensagem = OssStorage.validarTreino(item, []);
      if (mensagem) { erro.textContent = "Erro: " + mensagem; salvar.disabled = false; salvar.textContent = "Salvar"; return; }
      if (treino) {
        dadosTreino.treinos[dadosTreino.treinos.indexOf(treino)] = item;
      } else {
        dadosTreino.treinos.push(item);
      }
      OssStorage.salvar(dadosTreino);
      erro.textContent = "Salvo";
      renderizarLista();
      window.setTimeout(function () { editor.hidden = true; salvar.disabled = false; salvar.textContent = "Salvar"; }, 2500);
    };
  }

  function mostrarMensagem(texto) {
    document.getElementById("storage-mensagem").textContent = texto;
  }

  function estadoBotao(botao, andamento, statusId, resultado) {
    var original = botao.textContent;
    var status = document.getElementById(statusId);
    botao.disabled = true;
    botao.setAttribute("aria-disabled", "true");
    botao.textContent = andamento;
    if (status) status.textContent = resultado || andamento;
    window.setTimeout(function () {
      botao.disabled = false;
      botao.removeAttribute("aria-disabled");
      botao.textContent = original;
    }, 2500);
  }

  function mensagemAcao(botao, texto, retorna) {
    var original = botao.textContent;
    botao.disabled = true;
    botao.textContent = texto;
    window.setTimeout(function () {
      botao.disabled = false;
      botao.textContent = retorna || original;
    }, 2500);
  }

  function exportarJson() {
    var botao = document.getElementById("exportar-json");
    estadoBotao(botao, "Exportando…", "storage-mensagem", "Exportando…");
    var blob = new Blob([JSON.stringify(dadosTreino, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "oss-timer-treinos.json";
    link.click();
    URL.revokeObjectURL(url);
    mostrarMensagem("Exportado");
    botao.textContent = "Exportar JSON";
    window.setTimeout(function () {
      botao.disabled = false;
      botao.textContent = "Exportar JSON";
    }, 2500);
  }

  function copiarJson() {
    var botao = document.getElementById("copiar-json");
    estadoBotao(botao, "Copiando…", "storage-mensagem", "Copiado");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(JSON.stringify(dadosTreino, null, 2)).then(function () {
        mostrarMensagem("Copiado");
      }).catch(function () { mostrarMensagem("Erro: não foi possível copiar"); });
    } else {
      mostrarMensagem("Erro: copiar indisponível");
    }
  }

  function importarJson(evento) {
    var arquivo = evento.target.files[0];
    if (!arquivo) return;
    var botao = document.querySelector('label[for="importar-json"]');
    estadoBotao(botao, "Importando…", "storage-mensagem", "Importando…");
    var leitor = new FileReader();
    leitor.onload = function () {
      var resultado = OssStorage.validarImportacao(leitor.result);
      if (!resultado.valido) { mostrarMensagem("Erro: " + resultado.erro); botao.removeAttribute("aria-disabled"); botao.textContent = "Importar JSON"; return; }
      if (!window.confirm("Substituir todos os treinos pelo backup importado?")) { botao.removeAttribute("aria-disabled"); botao.textContent = "Importar JSON"; return; }
      dadosTreino = OssStorage.salvar(resultado.dado);
      mostrarMensagem("Importado");
      renderizarLista();
    };
    leitor.readAsText(arquivo);
  }
}());

if ("serviceWorker" in navigator &&
    (location.protocol === "http:" || location.protocol === "https:")) {
  navigator.serviceWorker.register("sw.js").catch(function () {});
}
