(function (root) {
  "use strict";

  function formatarTempo(segundos) {
    return OssEngine.formatar(segundos);
  }

  function corDaFase(fase, restante, status) {
    if (status === "finalizado") return "#D8D8D8";
    if (!fase) return "#FFF533";
    if (fase.tipo === "preparar") return "#FFF533";
    if (fase.tipo === "exercicio") return restante <= 30 ? "#FF9D43" : "#9DFF43";
    if (fase.tipo === "descanso") return "#F1372B";
    if (fase.tipo === "descansoCiclo") return "#FF9D43";
    return "#FF9D43";
  }

  function progressoFase(estado) {
    if (estado.status === "finalizado") return 1;
    if (!estado.fase || !Number.isFinite(estado.fase.dur) || estado.fase.dur <= 0) return 0;
    return Math.min(1, Math.max(0, (estado.fase.dur - estado.restanteFase) / estado.fase.dur));
  }

  function rotulos(estado, config) {
    var fase = estado.fase;
    var ronda = fase && fase.ronda > 0
      ? fase.ronda
      : (fase && fase.tipo !== "preparar" ? config.rondas : 1);
    var ciclo = fase && fase.ciclo > 0 ? fase.ciclo : 1;
    if (estado.status === "finalizado") {
      ronda = config.rondas;
      ciclo = config.ciclos;
    }

    return {
      fase: estado.status === "finalizado" ? "Finalizado" : (estado.nomeFase || "Preparar"),
      ronda: "Ronda " + ronda + " de " + config.rondas,
      ciclo: "Ciclo " + ciclo + " de " + config.ciclos,
      total: formatarTempo(estado.restanteTotal),
      acao: estado.status === "finalizado"
        ? "Repetir"
        : estado.status === "rodando"
          ? "Pausar"
          : estado.status === "pausado"
            ? "Retomar"
            : "Iniciar"
    };
  }

  root.OssView = {
    formatarTempo: formatarTempo,
    corDaFase: corDaFase,
    progressoFase: progressoFase,
    rotulos: rotulos
  };
}(typeof globalThis !== "undefined" ? globalThis : this));
