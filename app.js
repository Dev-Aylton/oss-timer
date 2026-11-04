(function () {
  "use strict";

  var config = OssEngine.PRESET_SPARRING;
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
  window.setInterval(function () {
    timer.tick();
    renderizar(timer.estado());
  }, 200);
}());
