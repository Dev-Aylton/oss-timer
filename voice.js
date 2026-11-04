(function (root) {
  "use strict";

  var FALAS = {
    fase: "Prepare-se",
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
    return vozPadrao && /^pt(?:-|$)/i.test(String(vozPadrao.lang || "")) ? vozPadrao : null;
  }

  function vozesPortuguese(voces) {
    voces = Array.isArray(voces) ? voces.slice() : [];
    return voces.filter(function (voz) {
      return /^pt(?:-|$)/i.test(String(voz.lang || ""));
    }).sort(function (a, b) {
      var abR = /^pt-br$/i.test(String(a.lang || "")) ? 0 : 1;
      var bbR = /^pt-br$/i.test(String(b.lang || "")) ? 0 : 1;
      if (abR !== bbR) return abR - bbR;
      return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR");
    });
  }

  function resolverVozSelecionada(selecao, voces) {
    var salva = selecao && selecao.nome ? selecao : null;
    var lista = vozesPortuguese(voces);
    if (!lista.length) return salva ? salva : null;
    if (salva) {
      var encontrada = lista.filter(function (voz) {
        return voz.name === salva.nome && (!salva.idioma || voz.lang === salva.idioma);
      })[0];
      if (encontrada) return encontrada;
    }
    return escolherVoz(null, lista);
  }

  function fraseEvento(evento) {
    if (evento.tipo === "fase") {
      if (evento.fase && evento.fase.tipo === "exercicio") {
        return evento.fase.ciclo === 1 && evento.fase.ronda === 1 ? "Valendo" : "Round";
      }
      if (evento.fase && evento.fase.tipo === "descanso") return "Descanso";
      if (evento.fase && evento.fase.tipo === "preparar") return FALAS.fase;
      return "";
    }
    if (evento.tipo === "aviso" && evento.segundos === 30) return FALAS.aviso30;
    if (evento.tipo === "aviso" && evento.segundos === 10) return FALAS.aviso10;
    if (evento.tipo === "contagem") return String(evento.valor);
    if (evento.tipo === "proximo") return FALAS.proximo;
    if (evento.tipo === "fim") return FALAS.fim;
    return "";
  }

  function falar(texto, selecao, callbacks) {
    if (!texto || !root.speechSynthesis || typeof root.SpeechSynthesisUtterance !== "function") return;
    var fala = new root.SpeechSynthesisUtterance(texto);
    var vozPadrao = root.speechSynthesis.getVoices().filter(function (voz) {
      return voz.default;
    })[0];
    fala.voice = resolverVozSelecionada(selecao, root.speechSynthesis.getVoices()) || escolherVoz(vozPadrao, root.speechSynthesis.getVoices());
    fala.lang = "pt-BR";
    callbacks = callbacks || {};
    if (typeof callbacks.onend === "function") fala.onend = callbacks.onend;
    if (typeof callbacks.onerror === "function") fala.onerror = callbacks.onerror;
    root.speechSynthesis.speak(fala);
  }

  function cancelar() {
    if (root.speechSynthesis && root.speechSynthesis.cancel) root.speechSynthesis.cancel();
  }

  root.OssVoice = {
    FALAS: FALAS,
    escolherVoz: escolherVoz,
    vozesPortuguese: vozesPortuguese,
    resolverVozSelecionada: resolverVozSelecionada,
    fraseEvento: fraseEvento,
    falar: falar,
    cancelar: cancelar
  };
}((typeof globalThis !== "undefined" ? globalThis : this)));
