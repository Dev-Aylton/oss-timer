(function (root) {
  "use strict";

  var PRESET_SPARRING = {
    preparar: 10,
    exercicio: 300,
    descanso: 35,
    rondas: 10,
    ciclos: 1,
    descansoCiclo: 0,
    relaxe: 0,
    avisosFim: [30, 10],
    avisoProximo: 10
  };

  function normalizar(cfg) {
    if (cfg === undefined) cfg = {};
    if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) {
      throw new RangeError("A configuração deve ser um objeto.");
    }

    var resultado = {};
    Object.keys(PRESET_SPARRING).forEach(function (chave) {
      resultado[chave] = cfg[chave] === undefined
        ? (Array.isArray(PRESET_SPARRING[chave])
          ? PRESET_SPARRING[chave].slice()
          : PRESET_SPARRING[chave])
        : cfg[chave];
    });

    ["preparar", "exercicio", "descanso", "rondas", "ciclos", "descansoCiclo", "relaxe"]
      .forEach(function (chave) {
        var minimo = chave === "rondas" || chave === "ciclos" ? 1 : 0;
        if (!Number.isInteger(resultado[chave]) || resultado[chave] < minimo) {
          throw new RangeError(
            "O campo \"" + chave + "\" deve ser um número inteiro maior ou igual a " +
            minimo + "."
          );
        }
      });

    if (!Array.isArray(resultado.avisosFim) ||
        resultado.avisosFim.some(function (valor) {
          return !Number.isInteger(valor) || valor <= 0;
        })) {
      throw new RangeError("O campo \"avisosFim\" deve ser uma lista de inteiros maiores que zero.");
    }
    if (!Number.isInteger(resultado.avisoProximo) || resultado.avisoProximo < 0) {
      throw new RangeError("O campo \"avisoProximo\" deve ser um número inteiro maior ou igual a zero.");
    }

    resultado.avisosFim = resultado.avisosFim.slice();
    return resultado;
  }

  function construirFases(cfg) {
    var config = normalizar(cfg);
    var fases = [];

    function adicionar(tipo, nome, dur, ciclo, ronda) {
      if (dur > 0) fases.push({ tipo: tipo, nome: nome, dur: dur, ciclo: ciclo, ronda: ronda });
    }

    adicionar("preparar", "Preparar", config.preparar, 1, 0);
    for (var ciclo = 1; ciclo <= config.ciclos; ciclo += 1) {
      for (var ronda = 1; ronda <= config.rondas; ronda += 1) {
        adicionar("exercicio", "Exercício", config.exercicio, ciclo, ronda);
        if (ronda < config.rondas) {
          adicionar("descanso", "Descanso", config.descanso, ciclo, ronda);
        }
      }
      if (ciclo < config.ciclos) {
        adicionar("descansoCiclo", "Descanso entre ciclos", config.descansoCiclo, ciclo, 0);
      }
    }
    adicionar("relaxe", "Relaxe", config.relaxe, config.ciclos, 0);
    return fases;
  }

  function totalSegundos(fases) {
    return fases.reduce(function (total, fase) {
      return total + fase.dur;
    }, 0);
  }

  function formatar(seg) {
    var segundos = Math.max(0, Math.floor(seg));
    var horas = Math.floor(segundos / 3600);
    var minutos = Math.floor((segundos % 3600) / 60);
    var restantes = segundos % 60;
    function dois(n) { return n < 10 ? "0" + n : String(n); }
    return horas > 0
      ? horas + ":" + dois(minutos) + ":" + dois(restantes)
      : dois(Math.floor(segundos / 60)) + ":" + dois(restantes);
  }

  function Timer(cfg, opcoes) {
    var config = normalizar(cfg);
    var fases = construirFases(config);
    var agora = opcoes && typeof opcoes.now === "function" ? opcoes.now : Date.now;
    var cronograma = [];
    var duracaoTotal = totalSegundos(fases);
    var cursor = 0;
    var ouvintes = [];
    var status = "parado";
    var inicioRelogio = 0;
    var decorridoPausado = 0;
    var revisao = 0;

    function emitir(evento) {
      ouvintes.slice().forEach(function (fn) { fn(evento); });
    }

    function agendar(evento, em) {
      cronograma.push({ em: em, evento: evento, ordem: cronograma.length });
    }

    var inicioFase = 0;
    fases.forEach(function (fase, indice) {
      agendar({ tipo: "fase", fase: fase, indice: indice }, inicioFase);
      // Cadência previsível: contagem regressiva nos três segundos finais.
      if (fase.dur >= 4) {
        [3, 2, 1].forEach(function (valor) {
          agendar({ tipo: "contagem", valor: valor }, inicioFase + fase.dur - valor);
        });
      }
      if (fase.tipo === "exercicio") {
        config.avisosFim.forEach(function (segundos) {
          if (segundos <= fase.dur &&
              !(fase.dur >= 4 && segundos >= 1 && segundos <= 3)) {
            agendar({ tipo: "aviso", segundos: segundos }, inicioFase + fase.dur - segundos);
          }
        });
      } else if ((fase.tipo === "descanso" || fase.tipo === "descansoCiclo") &&
                 config.avisoProximo > 0 &&
                 config.avisoProximo <= fase.dur) {
        agendar(
          { tipo: "proximo", segundos: config.avisoProximo },
          inicioFase + fase.dur - config.avisoProximo
        );
      }
      inicioFase += fase.dur;
    });
    if (fases.length) agendar({ tipo: "fim" }, duracaoTotal);
    cronograma.sort(function (a, b) {
      return a.em - b.em || a.ordem - b.ordem;
    });

    function tempoAtual() {
      return decorridoPausado +
        (status === "rodando" ? Math.max(0, agora() - inicioRelogio) / 1000 : 0);
    }

    function indiceEm(tempo) {
      var acumulado = 0;
      for (var i = 0; i < fases.length; i += 1) {
        acumulado += fases[i].dur;
        if (tempo < acumulado) return i;
      }
      return -1;
    }

    function completarSeNecessario(tempo) {
      if (tempo >= duracaoTotal && status === "rodando") status = "finalizado";
    }

    function avancarCronograma(tempo) {
      var revisaoAtual = revisao;
      while (revisaoAtual === revisao &&
             status === "rodando" &&
             cursor < cronograma.length &&
             cronograma[cursor].em <= tempo) {
        var evento = cronograma[cursor].evento;
        cursor += 1;
        emitir(evento);
      }
      if (revisaoAtual === revisao) completarSeNecessario(tempo);
    }

    function emitirFaseAtual(indice) {
      if (indice >= 0) emitir({ tipo: "fase", fase: fases[indice], indice: indice });
      else emitir({ tipo: "fim" });
    }

    this.iniciar = function () {
      if (status !== "parado") return this.estado();
      status = "rodando";
      inicioRelogio = agora();
      if (fases.length) {
        cursor = 1;
        emitirFaseAtual(0);
      } else {
        status = "finalizado";
        emitir({ tipo: "fim" });
      }
      return this.estado();
    };

    this.pausar = function () {
      if (status !== "rodando") return this.estado();
      var tempo = tempoAtual();
      avancarCronograma(tempo);
      if (status === "rodando") {
        decorridoPausado = tempo;
        status = "pausado";
        emitir({ tipo: "pausa" });
      }
      return this.estado();
    };

    this.alternar = function () {
      if (status === "rodando") return this.pausar();
      if (status === "pausado") {
        status = "rodando";
        inicioRelogio = agora();
        emitir({ tipo: "retomada" });
        return this.estado();
      }
      if (status === "finalizado") this.reset();
      return this.iniciar();
    };

    this.tick = function () {
      if (status === "rodando") avancarCronograma(tempoAtual());
      return this.estado();
    };

    this.pular = function () {
      if (status !== "rodando" && status !== "pausado") return this.estado();
      revisao += 1;
      var tempo = tempoAtual();
      if (status === "rodando") avancarCronograma(tempo);
      if (status === "finalizado") return this.estado();
      var indice = indiceEm(tempo);
      if (indice < 0) {
        status = "finalizado";
        emitir({ tipo: "fim" });
        return this.estado();
      }
      var finalFase = fases.slice(0, indice + 1).reduce(function (total, fase) {
        return total + fase.dur;
      }, 0);
      decorridoPausado = finalFase;
      if (status === "rodando") inicioRelogio = agora();
      // Pular descarta eventos internos à fase; só anuncia a fase seguinte (ou o fim).
      while (cursor < cronograma.length && cronograma[cursor].em < finalFase) cursor += 1;
      var proximoIndice = indice + 1;
      if (proximoIndice >= fases.length) {
        status = "finalizado";
        while (cursor < cronograma.length) {
          if (cronograma[cursor].evento.tipo === "fim") emitir(cronograma[cursor].evento);
          cursor += 1;
        }
      } else {
        emitirFaseAtual(proximoIndice);
        while (cursor < cronograma.length &&
               cronograma[cursor].em === finalFase &&
               cronograma[cursor].evento.tipo === "fase") cursor += 1;
      }
      return this.estado();
    };

    this.anterior = function () {
      if (status !== "rodando" && status !== "pausado") return this.estado();
      var indice = indiceEm(tempoAtual());
      // Volta ao início da fase anterior; na primeira fase, não há ação.
      if (indice <= 0) return this.estado();
      var inicioAnterior = fases.slice(0, indice - 1).reduce(function (total, fase) {
        return total + fase.dur;
      }, 0);
      decorridoPausado = inicioAnterior;
      if (status === "rodando") inicioRelogio = agora();
      cursor = 0;
      while (cursor < cronograma.length && cronograma[cursor].em < inicioAnterior) cursor += 1;
      while (cursor < cronograma.length && cronograma[cursor].em === inicioAnterior) {
        if (cronograma[cursor].evento.tipo === "fase") {
          cursor += 1;
          break;
        }
        cursor += 1;
      }
      emitirFaseAtual(indice - 1);
      return this.estado();
    };

    this.reset = function () {
      status = "parado";
      inicioRelogio = 0;
      decorridoPausado = 0;
      revisao += 1;
      cursor = 0;
      return this.estado();
    };

    this.estado = function () {
      var tempo = Math.min(duracaoTotal, tempoAtual());
      var indice = indiceEm(tempo);
      var restanteTotal = Math.max(0, Math.ceil(duracaoTotal - tempo));
      var fase = indice >= 0 ? fases[indice] : null;
      var inicio = indice >= 0 ? fases.slice(0, indice).reduce(function (t, item) {
        return t + item.dur;
      }, 0) : duracaoTotal;
      var restanteFase = fase ? Math.max(0, Math.ceil(inicio + fase.dur - tempo)) : 0;
      var rodadas = fases.slice(indice >= 0 ? indice : fases.length)
        .filter(function (item) { return item.tipo === "exercicio"; }).length;
      var ciclos = !fase
        ? (status === "finalizado" ? 0 : config.ciclos)
        : fase.tipo === "relaxe"
          ? 0
          : fase.tipo === "preparar"
            ? config.ciclos
            : Math.max(0, config.ciclos - fase.ciclo + 1);
      var proxima = indice >= 0 && indice + 1 < fases.length
        ? { tipo: fases[indice + 1].tipo, nome: fases[indice + 1].nome, dur: fases[indice + 1].dur }
        : null;
      return {
        status: status,
        fase: fase,
        nomeFase: fase ? fase.nome : null,
        restanteFase: restanteFase,
        restanteTotal: restanteTotal,
        rondasParaTerminar: rodadas,
        ciclosParaTerminar: ciclos,
        proxima: proxima
      };
    };

    this.aoEvento = function (fn) {
      if (typeof fn !== "function") throw new TypeError("O ouvinte deve ser uma função.");
      ouvintes.push(fn);
      return function () {
        var indice = ouvintes.indexOf(fn);
        if (indice >= 0) ouvintes.splice(indice, 1);
      };
    };

    this.estado();
  }

  function Cronometro(cfg, opcoes) {
    cfg = cfg || {};
    var preparar = cfg.preparar === undefined ? 0 : cfg.preparar;
    if (!Number.isInteger(preparar) || preparar < 0) {
      throw new RangeError("O campo \"preparar\" deve ser um número inteiro maior ou igual a zero.");
    }
    var agora = opcoes && typeof opcoes.now === "function" ? opcoes.now : Date.now;
    var status = "parado";
    var inicioRelogio = 0;
    var acumulado = 0;
    var voltas = [];
    var ultimaVolta = 0;

    function decorridoMs() {
      return acumulado + (status === "rodando" ? Math.max(0, agora() - inicioRelogio) : 0);
    }

    this.iniciar = function () {
      if (status === "parado") {
        status = "rodando";
        inicioRelogio = agora();
      } else if (status === "pausado") {
        status = "rodando";
        inicioRelogio = agora();
      }
      return this.estado();
    };
    this.pausar = function () {
      if (status === "rodando") {
        acumulado = decorridoMs();
        status = "pausado";
      }
      return this.estado();
    };
    this.alternar = function () {
      return status === "rodando" ? this.pausar() : this.iniciar();
    };
    this.tick = function () { return this.estado(); };
    this.volta = function () {
      var tempo = this.estado().decorrido;
      var volta = { numero: voltas.length + 1, duracao: tempo - ultimaVolta, total: tempo };
      voltas.push(volta);
      ultimaVolta = tempo;
      return volta;
    };
    this.estado = function () {
      var ms = decorridoMs();
      var segundos = Math.max(0, ms / 1000 - preparar);
      return {
        status: status === "rodando" && ms < preparar * 1000
          ? "preparando"
          : status,
        restantePreparar: Math.max(0, Math.ceil(preparar - ms / 1000)),
        decorrido: Math.floor(segundos),
        voltas: voltas.slice()
      };
    };
    Object.defineProperty(this, "voltas", {
      enumerable: true,
      get: function () { return voltas.slice(); }
    });
  }

  root.OssEngine = {
    PRESET_SPARRING: PRESET_SPARRING,
    normalizar: normalizar,
    construirFases: construirFases,
    totalSegundos: totalSegundos,
    formatar: formatar,
    Timer: Timer,
    Cronometro: Cronometro
  };
}(typeof globalThis !== "undefined" ? globalThis : this));
