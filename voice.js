(function (root) {
  "use strict";

  var FALAS = {
    fase: "Iniciar fase",
    aviso30: "Trinta segundos",
    aviso10: "Últimos dez segundos",
    contagem: "Contagem",
    proximo: "Próximo round",
    fim: "Treino finalizado"
  };

  function escolherVoz(vozPadrao, voces) {
    voces = voces || (root.speechSynthesis && root.speechSynthesis.getVoices
      ? root.speechSynthesis.getVoices()
      : []);
    if (!voces.length) return null;
    for (var i = 0; i < voces.length; i += 1) {
      if (/pt-BR/i.test(voces[i].lang) && /Luciana/i.test(voces[i].name)) return voces[i];
    }
    for (var j = 0; j < voces.length; j += 1) {
      if (/pt-BR/i.test(voces[j].lang)) return voces[j];
    }
    if (vozPadrao) return vozPadrao;
    return voces[0];
  }

  function fraseEvento(evento) {
    if (evento.tipo === "fase") {
      if (evento.fase && evento.fase.tipo === "exercicio") return "Round";
      if (evento.fase && evento.fase.tipo === "descanso") return "Descanso";
      return FALAS.fase;
    }
    if (evento.tipo === "aviso" && evento.segundos === 30) return FALAS.aviso30;
    if (evento.tipo === "aviso" && evento.segundos === 10) return FALAS.aviso10;
    if (evento.tipo === "contagem") return String(evento.valor);
    if (evento.tipo === "proximo") return FALAS.proximo;
    if (evento.tipo === "fim") return FALAS.fim;
    return "";
  }

  function falar(texto) {
    if (!texto || !root.speechSynthesis || typeof root.SpeechSynthesisUtterance !== "function") return;
    var fala = new root.SpeechSynthesisUtterance(texto);
    var vozPadrao = root.speechSynthesis.getVoices().filter(function (voz) {
      return voz.default;
    })[0];
    fala.voice = escolherVoz(vozPadrao, root.speechSynthesis.getVoices());
    fala.lang = "pt-BR";
    root.speechSynthesis.speak(fala);
  }

  function cancelar() {
    if (root.speechSynthesis && root.speechSynthesis.cancel) root.speechSynthesis.cancel();
  }

  root.OssVoice = {
    FALAS: FALAS,
    escolherVoz: escolherVoz,
    fraseEvento: fraseEvento,
    falar: falar,
    cancelar: cancelar
  };
}((typeof globalThis !== "undefined" ? globalThis : this)));
