(function (root) {
  "use strict";

  var FALAS = {
    fase: "Preparar",
    aviso30: "Trinta segundos",
    aviso10: "Últimos dez segundos",
    contagem: "Contagem",
    proximo: "Próximo round",
    fim: "Treino finalizado"
  };
  var ARQUIVOS_FALA = {
    "Preparar": "audio-voz/preparar.wav",
    "Valendo": "audio-voz/valendo.wav",
    "Round": "audio-voz/round.wav",
    "Descanso": "audio-voz/descanso.wav",
    "Trinta segundos": "audio-voz/trinta-segundos.wav",
    "Últimos dez segundos": "audio-voz/ultimos-dez-segundos.wav",
    "1": "audio-voz/contagem-1.wav",
    "2": "audio-voz/contagem-2.wav",
    "3": "audio-voz/contagem-3.wav",
    "Próximo round": "audio-voz/proximo-round.wav",
    "Treino finalizado": "audio-voz/treino-finalizado.wav"
  };

  function usarClipesOffline(navegador) {
    navegador = navegador || root.navigator;
    if (!navegador) return false;
    var agente = String(navegador.userAgent || "");
    return /iPhone|iPad|iPod/i.test(agente) ||
      (/Macintosh/i.test(agente) && Number(navegador.maxTouchPoints) > 1);
  }

  function escolherVoz(vozPadrao, voces) {
    voces = voces || (root.speechSynthesis && root.speechSynthesis.getVoices
      ? root.speechSynthesis.getVoices()
      : []);
    if (!voces.length) return null;
    for (var i = 0; i < voces.length; i += 1) {
      if (/^pt[-_]br$/i.test(voces[i].lang) && /Luciana/i.test(voces[i].name)) return voces[i];
    }
    for (var j = 0; j < voces.length; j += 1) {
      if (/^pt[-_]br$/i.test(voces[j].lang)) return voces[j];
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
    if (!texto) return;
    callbacks = callbacks || {};
    if (usarClipesOffline()) {
      var arquivo = ARQUIVOS_FALA[texto];
      if (!arquivo || !root.OssAudio || typeof root.OssAudio.reproduzirArquivo !== "function") {
        var erro = new Error("O clipe de voz solicitado não está disponível.");
        if (typeof callbacks.onerror === "function") callbacks.onerror(erro);
        else if (root.console && root.console.error) root.console.error(erro);
        return;
      }
      root.OssAudio.reproduzirArquivo(arquivo, callbacks);
      return;
    }
    if (!root.speechSynthesis || typeof root.SpeechSynthesisUtterance !== "function") return;
    var fala = new root.SpeechSynthesisUtterance(texto);
    var vozPadrao = root.speechSynthesis.getVoices().filter(function (voz) {
      return voz.default;
    })[0];
    fala.voice = resolverVozSelecionada(selecao, root.speechSynthesis.getVoices()) || escolherVoz(vozPadrao, root.speechSynthesis.getVoices());
    fala.lang = "pt-BR";
    if (typeof callbacks.onend === "function") fala.onend = callbacks.onend;
    if (typeof callbacks.onerror === "function") fala.onerror = callbacks.onerror;
    if (root.OssAudio && root.OssAudio.configurarAudioSession) {
      root.OssAudio.configurarAudioSession();
    }
    root.speechSynthesis.speak(fala);
  }

  function cancelar() {
    if (root.speechSynthesis && root.speechSynthesis.cancel) root.speechSynthesis.cancel();
    if (root.OssAudio && root.OssAudio.cancelarVoz) root.OssAudio.cancelarVoz();
  }

  root.OssVoice = {
    FALAS: FALAS,
    usarClipesOffline: usarClipesOffline,
    arquivoDaFala: function (texto) { return ARQUIVOS_FALA[texto] || ""; },
    escolherVoz: escolherVoz,
    vozesPortuguese: vozesPortuguese,
    resolverVozSelecionada: resolverVozSelecionada,
    fraseEvento: fraseEvento,
    falar: falar,
    cancelar: cancelar
  };
}((typeof globalThis !== "undefined" ? globalThis : this)));
