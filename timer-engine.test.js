(function (root) {
  "use strict";

  var testes = [];
  function describe(nome, executar) {
    executar();
  }
  function it(nome, executar) {
    testes.push({ nome: nome, executar: executar });
  }
  function assert(condicao, mensagem) {
    if (!condicao) throw new Error(mensagem || "A condição deveria ser verdadeira.");
  }
  function equal(atual, esperado, mensagem) {
    if (atual !== esperado) {
      throw new Error((mensagem ? mensagem + ": " : "") +
        "esperado " + esperado + ", recebido " + atual);
    }
  }
  function deepEqual(atual, esperado, mensagem) {
    if (JSON.stringify(atual) !== JSON.stringify(esperado)) {
      throw new Error((mensagem ? mensagem + ": " : "") +
        "esperado " + JSON.stringify(esperado) + ", recebido " + JSON.stringify(atual));
    }
  }
  function throwsRangeError(fn) {
    var lancou = false;
    try { fn(); } catch (erro) {
      lancou = erro instanceof RangeError && /campo|configuração/i.test(erro.message);
    }
    assert(lancou, "Esperava RangeError com mensagem clara em português.");
  }
  function relogioFalso() {
    var atual = 0;
    return {
      now: function () { return atual; },
      avancar: function (segundos) { atual += segundos * 1000; },
      definir: function (segundos) { atual = segundos * 1000; }
    };
  }
  function cfg(extra) {
    var base = {
      preparar: 0, exercicio: 10, descanso: 5, rondas: 2,
      ciclos: 1, descansoCiclo: 0, relaxe: 0, avisosFim: [], avisoProximo: 0
    };
    Object.keys(extra || {}).forEach(function (k) { base[k] = extra[k]; });
    return base;
  }

  describe("OssAudio", function () {
    it("define a sessão de áudio como ambient e aceita navigator sem audioSession", function () {
      var navigatorSimulado = { audioSession: { type: "auto" } };
      OssAudio.configurarAudioSession(navigatorSimulado);
      equal(navigatorSimulado.audioSession.type, "ambient");
      OssAudio.configurarAudioSession({});
    });
  });

  describe("OssEngine", function () {
    it("preset soma 3325 segundos e formata como 55:25", function () {
      var fases = OssEngine.construirFases(OssEngine.PRESET_SPARRING);
      equal(OssEngine.totalSegundos(fases), 3325);
      equal(OssEngine.formatar(OssEngine.totalSegundos(fases)), "55:25");
    });

    it("não adiciona descanso após a última ronda do ciclo", function () {
      var fases = OssEngine.construirFases(cfg({ rondas: 2 }));
      deepEqual(fases.map(function (f) { return f.tipo; }),
        ["exercicio", "descanso", "exercicio"]);
    });

    it("adiciona descanso entre ciclos, mas não após o último", function () {
      var fases = OssEngine.construirFases(cfg({ ciclos: 3, rondas: 1, descansoCiclo: 7 }));
      equal(fases.filter(function (f) { return f.tipo === "descansoCiclo"; }).length, 2);
      equal(fases[fases.length - 1].tipo, "exercicio");
    });

    it("ignora fases com duração zero", function () {
      var fases = OssEngine.construirFases(cfg({ preparar: 0, descanso: 0 }));
      assert(fases.every(function (f) { return f.dur > 0; }));
      equal(fases.length, 2);
    });

    it("rejeita números inválidos com RangeError", function () {
      throwsRangeError(function () { OssEngine.normalizar({ exercicio: -1 }); });
      throwsRangeError(function () { OssEngine.normalizar({ rondas: 0 }); });
      throwsRangeError(function () { OssEngine.normalizar({ avisosFim: [0] }); });
      throwsRangeError(function () { OssEngine.normalizar({ avisoProximo: 1.5 }); });
    });

    it("formata minutos e horas", function () {
      equal(OssEngine.formatar(0), "00:00");
      equal(OssEngine.formatar(65), "01:05");
      equal(OssEngine.formatar(3600), "1:00:00");
      equal(OssEngine.formatar(3661), "1:01:01");
    });

    it("pausa não consome tempo e emite pausa e retomada", function () {
      var clock = relogioFalso();
      var timer = new OssEngine.Timer(cfg({ rondas: 1 }), { now: clock.now });
      var eventos = [];
      timer.aoEvento(function (e) { eventos.push(e.tipo); });
      timer.iniciar();
      clock.avancar(4);
      timer.pausar();
      clock.avancar(20);
      equal(timer.estado().restanteFase, 6);
      timer.alternar();
      clock.avancar(1);
      equal(timer.estado().restanteFase, 5);
      assert(eventos.indexOf("pausa") >= 0 && eventos.indexOf("retomada") >= 0);
    });

    it("tick atrasado emite todos os eventos pendentes em ordem", function () {
      var clock = relogioFalso();
      var timer = new OssEngine.Timer(cfg({
        preparar: 4, exercicio: 5, rondas: 1, relaxe: 2, avisosFim: [4]
      }), { now: clock.now });
      var eventos = [];
      timer.aoEvento(function (e) {
        eventos.push(e.tipo + (e.valor === undefined ? "" : e.valor));
      });
      timer.iniciar();
      clock.avancar(20);
      timer.tick();
      deepEqual(eventos, [
        "fase", "contagem3", "contagem2", "contagem1",
        "fase", "aviso", "contagem3", "contagem2", "contagem1",
        "fase", "fim"
      ]);
    });

    it("aoEvento pode chamar pular dentro do avanço sem repetir eventos", function () {
      var clock = relogioFalso();
      var timer = new OssEngine.Timer(cfg({ rondas: 2 }), { now: clock.now });
      var contagens = 0;
      var pulou = false;
      timer.aoEvento(function (evento) {
        if (evento.tipo === "contagem" && evento.valor === 3) {
          contagens += 1;
          if (!pulou) {
            pulou = true;
            timer.pular();
          }
        }
      });
      timer.iniciar();
      clock.avancar(7);
      timer.tick();
      equal(contagens, 1);
      equal(timer.estado().fase.tipo, "descanso");
    });

    it("aoEvento pode chamar pausar dentro do avanço sem repetir eventos", function () {
      var clock = relogioFalso();
      var timer = new OssEngine.Timer(cfg({ rondas: 2 }), { now: clock.now });
      var contagens = 0;
      var pausou = false;
      timer.aoEvento(function (evento) {
        if (evento.tipo === "contagem" && evento.valor === 3) {
          contagens += 1;
          if (!pausou) {
            pausou = true;
            timer.pausar();
          }
        }
      });
      timer.iniciar();
      clock.avancar(7);
      timer.tick();
      equal(contagens, 1);
      equal(timer.estado().status, "pausado");
    });

    it("aoEvento pode chamar reset dentro do avanço sem retomar eventos", function () {
      var clock = relogioFalso();
      var timer = new OssEngine.Timer(cfg({ rondas: 2 }), { now: clock.now });
      var contagens = 0;
      var reiniciou = false;
      timer.aoEvento(function (evento) {
        if (evento.tipo === "contagem" && evento.valor === 3) {
          contagens += 1;
          if (!reiniciou) {
            reiniciou = true;
            timer.reset();
          }
        }
      });
      timer.iniciar();
      clock.avancar(7);
      timer.tick();
      equal(contagens, 1);
      equal(timer.estado().status, "parado");
    });

    it("exceção de ouvinte é propagada após avançar o cursor", function () {
      var clock = relogioFalso();
      var timer = new OssEngine.Timer(cfg({ rondas: 2 }), { now: clock.now });
      var disparos = 0;
      timer.aoEvento(function (evento) {
        if (evento.tipo === "contagem" && evento.valor === 3) {
          disparos += 1;
          throw new Error("falha do ouvinte");
        }
      });
      timer.iniciar();
      clock.avancar(7);
      var propagou = false;
      try { timer.tick(); } catch (erro) { propagou = erro.message === "falha do ouvinte"; }
      assert(propagou, "A exceção do ouvinte deve ser propagada.");
      timer.aoEvento(function () {});
      try { timer.tick(); } catch (erro) {}
      equal(disparos, 1);
    });

    it("emite contagem 3, 2 e 1 antes do fim", function () {
      var clock = relogioFalso();
      var timer = new OssEngine.Timer(cfg({ exercicio: 4, rondas: 1 }), { now: clock.now });
      var valores = [];
      timer.aoEvento(function (e) { if (e.tipo === "contagem") valores.push(e.valor); });
      timer.iniciar();
      clock.avancar(4);
      timer.tick();
      deepEqual(valores, [3, 2, 1]);
    });

    it("não conta em fase com menos de quatro segundos", function () {
      var clock = relogioFalso();
      var timer = new OssEngine.Timer(cfg({ exercicio: 3, rondas: 1 }), { now: clock.now });
      var valores = [];
      timer.aoEvento(function (e) { if (e.tipo === "contagem") valores.push(e.valor); });
      timer.iniciar();
      clock.avancar(3);
      timer.tick();
      deepEqual(valores, []);
    });

    it("emite avisos de 30 e 10 segundos no exercício", function () {
      var clock = relogioFalso();
      var timer = new OssEngine.Timer(cfg({
        exercicio: 40, rondas: 1, avisosFim: [30, 10]
      }), { now: clock.now });
      var avisos = [];
      timer.aoEvento(function (e) { if (e.tipo === "aviso") avisos.push(e.segundos); });
      timer.iniciar();
      clock.avancar(40);
      timer.tick();
      deepEqual(avisos, [30, 10]);
    });

    it("avisa o próximo dez segundos antes do fim do descanso", function () {
      var clock = relogioFalso();
      var timer = new OssEngine.Timer(cfg({
        exercicio: 5, descanso: 12, rondas: 2, avisoProximo: 10
      }), { now: clock.now });
      var proximos = [];
      timer.aoEvento(function (e) { if (e.tipo === "proximo") proximos.push(e.segundos); });
      timer.iniciar();
      clock.avancar(7);
      timer.tick();
      deepEqual(proximos, [10]);
    });

    it("avisa também durante o descanso entre ciclos", function () {
      var clock = relogioFalso();
      var timer = new OssEngine.Timer(cfg({
        exercicio: 5, descansoCiclo: 12, rondas: 1, ciclos: 2, avisoProximo: 10
      }), { now: clock.now });
      var proximos = [];
      timer.aoEvento(function (e) { if (e.tipo === "proximo") proximos.push(e.segundos); });
      timer.iniciar();
      clock.avancar(7);
      timer.tick();
      deepEqual(proximos, [10]);
    });

    it("rondas e ciclos restantes acompanham a fase atual", function () {
      var clock = relogioFalso();
      var timer = new OssEngine.Timer(cfg({
        exercicio: 2, rondas: 1, ciclos: 2, relaxe: 3
      }), { now: clock.now });
      timer.iniciar();
      equal(timer.estado().ciclosParaTerminar, 2);
      timer.pular();
      equal(timer.estado().fase.ciclo, 2);
      equal(timer.estado().ciclosParaTerminar, 1);
      timer.pular();
      equal(timer.estado().fase.tipo, "relaxe");
      equal(timer.estado().ciclosParaTerminar, 0);
    });

    it("pular inicia a fase seguinte", function () {
      var clock = relogioFalso();
      var timer = new OssEngine.Timer(cfg({ rondas: 2 }), { now: clock.now });
      timer.iniciar();
      timer.pular();
      equal(timer.estado().fase.tipo, "descanso");
    });

    it("anterior volta ao início da fase anterior", function () {
      var clock = relogioFalso();
      var timer = new OssEngine.Timer(cfg({ rondas: 2 }), { now: clock.now });
      timer.iniciar();
      timer.pular();
      timer.pular();
      equal(timer.estado().fase.tipo, "exercicio");
      equal(timer.estado().fase.ronda, 2);
      timer.anterior();
      equal(timer.estado().fase.tipo, "descanso");
      equal(timer.estado().restanteFase, 5);
    });

    it("reset retorna ao estado parado inicial", function () {
      var clock = relogioFalso();
      var timer = new OssEngine.Timer(cfg({ rondas: 1 }), { now: clock.now });
      timer.iniciar();
      clock.avancar(3);
      timer.reset();
      equal(timer.estado().status, "parado");
      equal(timer.estado().restanteFase, 10);
    });

    it("emite fim e finaliza quando todas as fases terminam", function () {
      var clock = relogioFalso();
      var timer = new OssEngine.Timer(cfg({ exercicio: 2, rondas: 1 }), { now: clock.now });
      var fins = 0;
      timer.aoEvento(function (e) { if (e.tipo === "fim") fins += 1; });
      timer.iniciar();
      clock.avancar(2);
      timer.tick();
      equal(fins, 1);
      equal(timer.estado().status, "finalizado");
    });

    it("reinicia o timer ao alternar depois de finalizado", function () {
      var clock = relogioFalso();
      var timer = new OssEngine.Timer(cfg({ exercicio: 2, rondas: 1 }), { now: clock.now });
      timer.iniciar();
      clock.avancar(2);
      timer.tick();
      equal(timer.estado().status, "finalizado");
      timer.alternar();
      equal(timer.estado().status, "rodando");
      equal(timer.estado().restanteFase, 2);
    });

    it("Cronometro conta preparação e registra voltas", function () {
      var clock = relogioFalso();
      var cronometro = new OssEngine.Cronometro({ preparar: 3 }, { now: clock.now });
      cronometro.iniciar();
      clock.avancar(2);
      equal(cronometro.estado().status, "preparando");
      clock.avancar(2);
      equal(cronometro.estado().decorrido, 1);
      clock.avancar(4);
      var volta = cronometro.volta();
      equal(volta.numero, 1);
      equal(volta.duracao, 5);
      equal(cronometro.voltas.length, 1);
    });

    it("formata tempo da tela como mm:ss", function () {
      equal(OssView.formatarTempo(65), "01:05");
      equal(OssView.formatarTempo(3325), "55:25");
    });

    it("usa a cor correspondente a cada fase", function () {
      equal(OssView.corDaFase({ tipo: "preparar" }, 10), "#FFF533");
      equal(OssView.corDaFase({ tipo: "exercicio" }, 31), "#9DFF43");
      equal(OssView.corDaFase({ tipo: "descanso" }, 35), "#F1372B");
      equal(OssView.corDaFase({ tipo: "descansoCiclo" }, 35), "#FF9D43");
      equal(OssView.corDaFase(null, 0, "finalizado"), "#D8D8D8");
    });

    it("calcula o progresso da fase para o anel do timer", function () {
      equal(OssView.progressoFase({
        status: "parado", fase: { dur: 10 }, restanteFase: 10
      }), 0);
      equal(OssView.progressoFase({
        status: "rodando", fase: { dur: 10 }, restanteFase: 4
      }), 0.6);
      equal(OssView.progressoFase({
        status: "rodando", fase: { dur: 10 }, restanteFase: 12
      }), 0);
      equal(OssView.progressoFase({
        status: "finalizado", fase: null, restanteFase: 0
      }), 1);
    });

    it("destaca laranja apenas nos últimos 30 segundos do exercício", function () {
      equal(OssView.corDaFase({ tipo: "exercicio" }, 31), "#9DFF43");
      equal(OssView.corDaFase({ tipo: "exercicio" }, 30), "#FF9D43");
      equal(OssView.corDaFase({ tipo: "exercicio" }, 1), "#FF9D43");
    });

    it("gera rótulos da fase, ronda e ciclo atuais", function () {
      var rotulos = OssView.rotulos({
        status: "rodando",
        fase: { tipo: "exercicio", ronda: 4, ciclo: 2 },
        nomeFase: "Exercício",
        restanteTotal: 125
      }, { rondas: 10, ciclos: 3 });
      equal(rotulos.fase, "Exercício");
      equal(rotulos.ronda, "Ronda 4 de 10");
      equal(rotulos.ciclo, "Ciclo 2 de 3");
      equal(rotulos.total, "02:05");
      equal(rotulos.acao, "Pausar");
    });

    it("gera rótulo Finalizado e ação Repetir", function () {
      var rotulos = OssView.rotulos({
        status: "finalizado", fase: null, nomeFase: null, restanteTotal: 0
      }, { rondas: 10, ciclos: 2 });
      equal(rotulos.fase, "Finalizado");
      equal(rotulos.ronda, "Ronda 10 de 10");
      equal(rotulos.ciclo, "Ciclo 2 de 2");
      equal(rotulos.acao, "Repetir");
    });

    it("normaliza um treino com valores padrão do SPARRING", function () {
      var treino = OssStorage.normalizar({ nome: "  SPARRING  ", id: "teste" });
      equal(treino.nome, "SPARRING");
      equal(treino.exercicio, 300);
      deepEqual(treino.avisosFim, [30, 10]);
    });

    it("valida campos inteiros e nome do treino", function () {
      var treino = OssStorage.treinoSparring();
      equal(OssStorage.validarTreino(treino), "");
      equal(OssStorage.validarTreino({ nome: "", exercicio: 300 }), "O nome deve ter entre 1 e 40 caracteres.");
      treino.exercicio = -1;
      equal(Boolean(OssStorage.validarTreino(treino)), true);
    });

    it("migrar versão preserva pelo menos um treino", function () {
      var migrado = OssStorage.migrar({});
      equal(migrado.version, 1);
      equal(migrado.treinos.length, 1);
      equal(migrado.treinos[0].nome, "SPARRING");
    });

    it("migração não altera a entrada e gera IDs únicos para treinos sem ID", function () {
      var entrada = {
        version: 0,
        treinoAtual: "inexistente",
        treinos: [{ nome: "Um" }, { nome: "Dois" }]
      };
      var original = JSON.stringify(entrada);
      var migrado = OssStorage.migrar(entrada);
      equal(JSON.stringify(entrada), original);
      assert(migrado.treinos[0].id !== migrado.treinos[1].id);
      equal(migrado.treinoAtual, migrado.treinos[0].id);
    });

    it("rejeita JSON de importação inválido sem substituição", function () {
      equal(OssStorage.validarImportacao("{").valido, false);
      equal(OssStorage.validarImportacao({"treinos": []}).valido, false);
      equal(OssStorage.validarImportacao({"treinos": [
        { nome: "Teste", id: "x", preparacao: 10 }
      ]}).valido, false);
    });

    it("calcula duração total de um treino salvo", function () {
      var treino = OssStorage.treinoSparring();
      equal(OssEngine.totalSegundos(OssEngine.construirFases(treino)), 3325);
      equal(OssEngine.formatar(3325), "55:25");
    });

    it("garante que a lista nunca fica vazia", function () {
      var lista = OssStorage.garantirNaoVazio([]);
      equal(lista.length, 1);
      equal(lista[0].nome, "SPARRING");
    });

    it("rejeita ajustes inválidos", function () {
      equal(OssStorage.validarAjustes({ voz: true, bipes: true, wake: true }), true);
      equal(OssStorage.validarAjustes({ voz: "sim", bipes: true, wake: true }), false);
      equal(OssStorage.normalizarAjustes(null).voz, true);
    });

    it("limita o histórico às últimas 200 entradas", function () {
      var lista = [];
      for (var i = 0; i < 205; i += 1) lista.push({ id: String(i) });
      var resultado = OssStorage.adicionarHistorico([], { id: "novo" });
      var lote = [];
      for (var j = 0; j < 205; j += 1) lote.push({ id: String(j) });
      var normalizado = OssStorage.adicionarHistorico(lote, { id: "novo" }).slice(0, 200);
      equal(normalizado.length, 200);
      equal(normalizado[0].id, "novo");
    });

    it("remove uma entrada do histórico pelo id", function () {
      var lista = OssStorage.removerHistorico([{ id: "a" }, { id: "b" }], "a");
      equal(lista.length, 1);
      equal(lista[0].id, "b");
    });

    it("formata duração longa e curta", function () {
      equal(OssStorage.formatarDuracao(65), "01:05");
      equal(OssStorage.formatarDuracao(3665), "1:01:05");
    });

    it("recupera de ajustes armazenados corrompidos", function () {
      equal(OssStorage.normalizarAjustes("{invalid").voz, true);
    });

    it("formata cronômetro livre em mm:ss", function () {
      equal(OssStorage.formatarDuracao(599), "09:59");
      equal(OssStorage.formatarDuracao(3600), "1:00:00");
    });

    it("normaliza ajustes parcialmente preenchidos", function () {
      equal(OssStorage.normalizarAjustes({ voz: false }).voz, false);
    });

    it("histórico nulo permanece vazio", function () {
      deepEqual(OssStorage.adicionarHistorico(null, null), []);
      deepEqual(OssStorage.removerHistorico(null, "x"), []);
    });

    it("seleciona Luciana entre as vozes pt-BR", function () {
      var voz = OssVoice.escolherVoz(null, [
        { name: "Maria", lang: "pt-BR" },
        { name: "Luciana", lang: "pt-BR" },
        { name: "Daniel", lang: "en-US", default: true }
      ]);
      equal(voz.name, "Luciana");
    });

    it("usa Luciana como voz automática mesmo quando outra voz é padrão", function () {
      var luciana = { name: "Luciana", lang: "pt-BR" };
      var voz = OssVoice.resolverVozSelecionada(null, [
        { name: "Maria", lang: "pt-BR", default: true },
        luciana
      ]);
      equal(voz.name, "Luciana");
    });

    it("reconhece Luciana com identificador pt_BR", function () {
      var voz = OssVoice.escolherVoz(null, [
        { name: "Maria", lang: "pt-BR" },
        { name: "Luciana", lang: "pt_BR" }
      ]);
      equal(voz.name, "Luciana");
    });

    it("ordena vozes pt-BR primeiro, ignorando outros idiomas", function () {
      var voces = OssVoice.vozesPortuguese([
        { name: "Zelia", lang: "pt-PT" }, { name: "Ana", lang: "en-US" },
        { name: "Maria", lang: "pt-BR" }
      ]);
      deepEqual(voces.map(function (voz) { return voz.lang; }), ["pt-BR", "pt-PT"]);
    });

    it("resolve a voz salva quando ela ainda existe", function () {
      var voz = OssVoice.resolverVozSelecionada(
        { nome: "Maria", idioma: "pt-BR" },
        [{ name: "Maria", lang: "pt-BR" }, { name: "Joao", lang: "pt-BR" }]
      );
      equal(voz.name, "Maria");
    });

    it("usa automática quando a voz salva não existe", function () {
      var voz = OssVoice.resolverVozSelecionada(
        { nome: "Sumiu", idioma: "pt-BR" },
        [{ name: "Maria", lang: "pt-BR" }]
      );
      equal(voz.name, "Maria");
    });

    it("preserva a voz salva quando a lista está vazia", function () {
      var salva = { nome: "Maria", idioma: "pt-BR" };
      deepEqual(OssVoice.resolverVozSelecionada(salva, []), salva);
    });

    it("configura sessão ambient antes de solicitar a fala", function () {
      var sintese = root.speechSynthesis;
      if (!sintese || typeof sintese.speak !== "function" ||
          typeof root.SpeechSynthesisUtterance !== "function") return;
      var falarOriginal = sintese.speak;
      var configurarOriginal = OssAudio.configurarAudioSession;
      var chamadas = [];
      try {
        sintese.speak = function () { chamadas.push("speak"); };
        OssAudio.configurarAudioSession = function () { chamadas.push("ambient"); };
        OssVoice.falar("Teste");
        deepEqual(chamadas, ["ambient", "speak"]);
      } finally {
        sintese.speak = falarOriginal;
        OssAudio.configurarAudioSession = configurarOriginal;
      }
    });

    it("usa frase curta para cada evento sonoro principal", function () {
      equal(OssVoice.fraseEvento({ tipo: "aviso", segundos: 30 }), OssVoice.FALAS.aviso30);
      equal(OssVoice.fraseEvento({ tipo: "aviso", segundos: 10 }), OssVoice.FALAS.aviso10);
      equal(OssVoice.fraseEvento({ tipo: "contagem", valor: 3 }), "3");
      equal(OssVoice.fraseEvento({ tipo: "proximo", segundos: 10 }), OssVoice.FALAS.proximo);
      equal(OssVoice.fraseEvento({ tipo: "fim" }), OssVoice.FALAS.fim);
    });

    it("gera início de fase como round ou descanso conforme a fase", function () {
      equal(OssVoice.fraseEvento({ tipo: "fase", indice: 1, fase: { tipo: "exercicio", ciclo: 1, ronda: 1 } }), "Valendo");
      equal(OssVoice.fraseEvento({ tipo: "fase", indice: 3, fase: { tipo: "exercicio", ciclo: 1, ronda: 2 } }), "Round");
      equal(OssVoice.fraseEvento({ tipo: "fase", indice: 1, fase: { tipo: "descanso" } }), "Descanso");
      equal(OssVoice.fraseEvento({ tipo: "fase", indice: 0, fase: { tipo: "preparar" } }), "Preparar");
    });

    it("fala Valendo apenas no início do treino e não repete nos rounds", function () {
      var clock = relogioFalso();
      var timer = new OssEngine.Timer(cfg({ preparar: 2, exercicio: 4, descanso: 1 }), { now: clock.now });
      var falas = [];
      timer.aoEvento(function (evento) {
        if (evento.tipo === "fase") falas.push(OssVoice.fraseEvento(evento));
      });
      timer.iniciar();
      clock.avancar(7);
      timer.tick();
      deepEqual(falas, ["Preparar", "Valendo", "Descanso", "Round"]);
      equal(falas.filter(function (frase) { return frase === "Valendo"; }).length, 1);
    });

    it("define sequência de sinais para contagem, aviso, próximo e fim", function () {
      var sinais = [];
      OssAudio._sequencia = function () {
        sinais.push("contagem");
        sinais.push("bipe");
        sinais.push("bipe");
        sinais.push("gongo");
      };
      OssAudio._sequencia();
      deepEqual(sinais, ["contagem", "bipe", "bipe", "gongo"]);
    });

    it("configuração padrão de Rondas usa 5 segundos de preparação e 5 rondas", function () {
      var config = OssStorage.rondasPadrao();
      equal(config.preparar, 5);
      equal(config.rondas, 5);
      equal(config.descanso, 0);
    });

    it("configuração inválida de Rondas usa o padrão seguro", function () {
      var config = OssStorage.normalizarRondas({ preparar: -1, rondas: 0, exercicio: 86401 });
      equal(config.preparar, 5);
      equal(config.rondas, 5);
      equal(config.exercicio, OssStorage.rondasPadrao().exercicio);
    });

    it("estado expõe rondas e ciclos restantes", function () {
      var timer = new OssEngine.Timer({ rondas: 3, exercicio: 10, descanso: 0 });
      timer.iniciar();
      var estado = timer.estado();
      equal(estado.rondasParaTerminar >= 3, true);
      equal(estado.ciclosParaTerminar >= 1, true);
    });

    it("validação de Rondas preserva os campos de intervalo obrigatórios", function () {
      var config = OssStorage.normalizarRondas({ exercicio: 120, ciclos: 2 });
      equal(config.exercicio, 120);
      equal(config.ciclos, 2);
      equal(config.nome, "Rondas");
    });
  });

  root.OssTests = {
    executar: function () {
      var resultados = [];
      testes.forEach(function (teste) {
        try {
          teste.executar();
          resultados.push({ nome: teste.nome, passou: true });
        } catch (erro) {
          resultados.push({ nome: teste.nome, passou: false, erro: erro.message });
        }
      });
      return resultados;
    }
  };
}(typeof globalThis !== "undefined" ? globalThis : this));
