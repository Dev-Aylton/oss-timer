(function (root) {
  "use strict";

  function formatarTempo(segundos) {
    return OssEngine.formatar(segundos);
  }

  function corDaFase(fase, restante, status) {
    if (status === "finalizado") return "#8B5CF6";
    if (!fase) return "#0E1116";
    if (fase.tipo === "preparar") return "#FFB020";
    if (fase.tipo === "exercicio") return restante <= 30 ? "#FF7A1A" : "#19C37D";
    if (fase.tipo === "descanso") return "#E5484D";
    if (fase.tipo === "descansoCiclo") return "#3B82F6";
    return "#0E1116";
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
    rotulos: rotulos
  };
}(typeof globalThis !== "undefined" ? globalThis : this));
