(function () {
  "use strict";

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
  var pressionado = 0;
  var toqueLongo = false;
  var wakeLock = null;
  var wakePedido = null;
  var abaAtual = "timer-view";

  function solicitarWakeLock() {
    if (!navigator.wakeLock || !navigator.wakeLock.request) return;
    wakePedido = navigator.wakeLock.request("screen").then(function (bloqueio) {
      wakeLock = bloqueio;
      wakePedido = null;
    }).catch(function () {
      wakePedido = null;
    });
  }

  function liberarWakeLock() {
    if (wakeLock && wakeLock.release) {
      wakeLock.release().catch(function () {});
      wakeLock = null;
    }
  }

  function iniciarInteracao() {
    OssAudio.desbloquear();
    if (timer.estado().status !== "rodando") return;
    solicitarWakeLock();
  }

  function lidarEvento(evento) {
    if (evento.tipo === "fase") OssAudio.gongo();
    if (evento.tipo === "contagem") OssAudio.contagem();
    if (evento.tipo === "aviso") OssAudio.bipe();
    if (evento.tipo === "proximo") OssAudio.bipe();
    if (evento.tipo === "fim") OssAudio.gongo();
    OssVoice.falar(OssVoice.fraseEvento(evento));
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
  }

  function alternar() {
    timer.alternar();
    if (timer.estado().status === "rodando") iniciarInteracao();
    if (timer.estado().status !== "rodando") {
      OssVoice.cancelar();
      liberarWakeLock();
    }
    renderizar(timer.estado());
  }

  acao.addEventListener("click", alternar);
  pular.addEventListener("click", function () {
    OssVoice.cancelar();
    timer.pular();
    renderizar(timer.estado());
  });
  reiniciar.addEventListener("click", function () {
    OssVoice.cancelar();
    liberarWakeLock();
    timer.reset();
    renderizar(timer.estado());
  });
  repetir.addEventListener("click", function () {
    OssVoice.cancelar();
    timer.reset();
    timer.iniciar();
    iniciarInteracao();
    renderizar(timer.estado());
  });

  numero.addEventListener("pointerdown", function (evento) {
    if (!evento.isPrimary) return;
    toqueLongo = false;
    window.clearTimeout(pressionado);
    pressionado = window.setTimeout(function () {
      toqueLongo = true;
      timer.anterior();
      renderizar(timer.estado());
    }, 600);
  });
  numero.addEventListener("pointerup", function () {
    window.clearTimeout(pressionado);
  });
  numero.addEventListener("pointercancel", function () {
    window.clearTimeout(pressionado);
    toqueLongo = false;
  });
  numero.addEventListener("click", function () {
    if (toqueLongo) {
      toqueLongo = false;
      return;
    }
    alternar();
  });
  numero.addEventListener("contextmenu", function (evento) {
    evento.preventDefault();
  });

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && timer.estado().status === "rodando" && !wakeLock && !wakePedido) {
      solicitarWakeLock();
    }
  });

  renderizar(timer.estado());
  configurarAbas();
  configurarTreinos();
  window.setInterval(function () {
    timer.tick();
    renderizar(timer.estado());
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
      campos.forEach(function (campo) {
        if (campo[2] === "number") item[campo[0]] = Number(editor.elements[campo[0]].value);
        else item[campo[0]] = editor.elements[campo[0]].value;
      });
      item.avisosFim = avisosInput.value.split(",").map(function (valor) { return Number(valor.trim()); });
      var mensagem = OssStorage.validarTreino(item, dadosTreino.treinos);
      if (mensagem && !treino) mensagem = OssStorage.validarTreino(item, []);
      if (mensagem) { erro.textContent = mensagem; return; }
      if (treino) {
        dadosTreino.treinos[dadosTreino.treinos.indexOf(treino)] = item;
      } else {
        dadosTreino.treinos.push(item);
      }
      OssStorage.salvar(dadosTreino);
      editor.hidden = true;
      renderizarLista();
    };
  }

  function mostrarMensagem(texto) {
    document.getElementById("storage-mensagem").textContent = texto;
  }

  function exportarJson() {
    var blob = new Blob([JSON.stringify(dadosTreino, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "oss-timer-treinos.json";
    link.click();
    URL.revokeObjectURL(url);
    mostrarMensagem("Backup exportado.");
  }

  function copiarJson() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(JSON.stringify(dadosTreino, null, 2)).then(function () {
        mostrarMensagem("JSON copiado.");
      }).catch(function () { mostrarMensagem("Não foi possível copiar o JSON."); });
    } else {
      mostrarMensagem("Não foi possível copiar o JSON neste navegador.");
    }
  }

  function importarJson(evento) {
    var arquivo = evento.target.files[0];
    if (!arquivo) return;
    var leitor = new FileReader();
    leitor.onload = function () {
      var resultado = OssStorage.validarImportacao(leitor.result);
      if (!resultado.valido) { mostrarMensagem(resultado.erro); return; }
      if (!window.confirm("Substituir todos os treinos pelo backup importado?")) return;
      dadosTreino = OssStorage.salvar(resultado.dado);
      mostrarMensagem("Backup importado.");
      renderizarLista();
    };
    leitor.readAsText(arquivo);
  }
}());

if ("serviceWorker" in navigator &&
    (location.protocol === "http:" || location.protocol === "https:")) {
  navigator.serviceWorker.register("sw.js").catch(function () {});
}
