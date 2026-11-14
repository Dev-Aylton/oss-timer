(function (root) {
  "use strict";

  var contexto = null;
  var buffersVoz = Object.create(null);
  var filaVoz = [];
  var carregandoVoz = false;
  var fonteVozAtiva = null;
  var saidaVoz = null;
  var volumeVoz = 1.5;
  var volumeBipes = 1;
  var geracaoVoz = 0;
  var bufferGongo = null;
  var carregamentoGongo = null;

  function aplicarTipoAudioAmbient(sessao) {
    if (!sessao) return;
    try { sessao.type = "ambient"; } catch (e) {}
  }

  function monitorarInterrupcaoAudio(sessao) {
    if (!sessao || sessao.__ossAudioSessionMonitorada) return;
    sessao.__ossAudioSessionMonitorada = true;
    var restaurar = function () { aplicarTipoAudioAmbient(sessao); };

    if (typeof sessao.addEventListener === "function") {
      try { sessao.addEventListener("interruptionbegin", restaurar); } catch (e) {}
      try { sessao.addEventListener("interruptionend", restaurar); } catch (e) {}
    }

    try { sessao.oninterruptionbegin = restaurar; } catch (e) {}
    try { sessao.oninterruptionend = restaurar; } catch (e) {}
  }

  function configurarAudioSession(navegador) {
    if (arguments.length === 0) navegador = root.navigator;
    if (typeof navegador !== "undefined" && navegador && navegador.audioSession) {
      aplicarTipoAudioAmbient(navegador.audioSession);
      monitorarInterrupcaoAudio(navegador.audioSession);
    }
  }
  configurarAudioSession();

  function contextoDesbloqueado() {
    var construtor = root.AudioContext || root.webkitAudioContext;
    if (!construtor) return null;
    if (!contexto) {
      contexto = new construtor();
    }
    if (contexto.state === "suspended" && contexto.resume) {
      try {
        Promise.resolve(contexto.resume()).catch(function () {});
      } catch (erro) {}
    }
    return contexto;
  }

  function obterSaidaVoz(audio) {
    if (saidaVoz) return saidaVoz;

    var ganho = audio.createGain();
    ganho.gain.value = 3 * volumeVoz;
    if (typeof audio.createDynamicsCompressor !== "function") {
      ganho.gain.value = volumeVoz;
      ganho.connect(audio.destination);
      saidaVoz = ganho;
      return saidaVoz;
    }

    var compressor = audio.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 12;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    ganho.connect(compressor);
    compressor.connect(audio.destination);
    saidaVoz = ganho;
    return saidaVoz;
  }

  function tocar(frequencia, duracao, volume, atraso, aoTerminar) {
    var audio = contextoDesbloqueado();
    if (!audio) {
      if (typeof aoTerminar === "function") aoTerminar();
      return false;
    }
    var inicio = audio.currentTime + (atraso || 0);
    var oscilador = audio.createOscillator();
    var ganho = audio.createGain();
    oscilador.frequency.value = frequencia;
    oscilador.type = "sine";
    ganho.gain.setValueAtTime(volume * volumeBipes, inicio);
    ganho.gain.setValueAtTime(volume * volumeBipes, inicio + duracao * 0.6);
    ganho.gain.exponentialRampToValueAtTime(0.001, inicio + duracao);
    if (typeof aoTerminar === "function") oscilador.onended = aoTerminar;
    oscilador.connect(ganho);
    ganho.connect(audio.destination);
    oscilador.start(inicio);
    oscilador.stop(inicio + duracao);
    return true;
  }

  function desbloquear() {
    var audio = contextoDesbloqueado();
    if (audio && typeof root.fetch === "function") {
      carregarGongo(audio).catch(function (erro) {
        if (root.console && root.console.warn) root.console.warn("Não foi possível preparar o gongo:", erro);
      });
    }
  }

  function carregarGongo(audio) {
    if (bufferGongo) return Promise.resolve(bufferGongo);
    if (carregamentoGongo) return carregamentoGongo;
    carregamentoGongo = root.fetch("audio-voz/gongo.mp3").then(function (resposta) {
      if (!resposta.ok) throw new Error("Não foi possível carregar o gongo.");
      return resposta.arrayBuffer();
    }).then(function (dados) {
      return audio.decodeAudioData(dados);
    }).then(function (buffer) {
      bufferGongo = buffer;
      carregamentoGongo = null;
      return buffer;
    }).catch(function (erro) {
      carregamentoGongo = null;
      throw erro;
    });
    return carregamentoGongo;
  }

  function carregarBufferVoz(audio, arquivo) {
    if (buffersVoz[arquivo]) return Promise.resolve(buffersVoz[arquivo]);
    return root.fetch(arquivo).then(function (resposta) {
      if (!resposta.ok) throw new Error("Não foi possível carregar o clipe de voz: " + arquivo);
      return resposta.arrayBuffer();
    }).then(function (dados) {
      return audio.decodeAudioData(dados);
    }).then(function (buffer) {
      buffersVoz[arquivo] = buffer;
      return buffer;
    });
  }

  function avancarFilaVoz() {
    if (carregandoVoz || fonteVozAtiva || !filaVoz.length) return;
    var pedido = filaVoz[0];
    var geracao = geracaoVoz;
    carregandoVoz = true;
    var audio = contextoDesbloqueado();
    if (!audio || typeof root.fetch !== "function") {
      finalizarVoz(pedido, geracao, new Error("A reprodução de voz por áudio não está disponível neste dispositivo."));
      return;
    }

    carregarBufferVoz(audio, pedido.arquivo).then(function (buffer) {
      if (geracao !== geracaoVoz || filaVoz[0] !== pedido) return;
      carregandoVoz = false;
      var fonte = audio.createBufferSource();
      fonte.buffer = buffer;
      fonte.playbackRate.value = pedido.velocidade;
      fonte.connect(obterSaidaVoz(audio));
      fonteVozAtiva = fonte;
      fonte.onended = function () {
        if (geracao !== geracaoVoz || filaVoz[0] !== pedido) return;
        fonteVozAtiva = null;
        filaVoz.shift();
        try {
          if (typeof pedido.callbacks.onend === "function") pedido.callbacks.onend();
        } finally {
          avancarFilaVoz();
        }
      };
      fonte.start(0);
    }).catch(function (erro) {
      finalizarVoz(pedido, geracao, erro);
    });
  }

  function finalizarVoz(pedido, geracao, erro) {
    if (geracao !== geracaoVoz || filaVoz[0] !== pedido) return;
    carregandoVoz = false;
    fonteVozAtiva = null;
    filaVoz.shift();
    try {
      if (typeof pedido.callbacks.onerror === "function") pedido.callbacks.onerror(erro);
      else if (root.console && root.console.error) root.console.error("Não foi possível reproduzir o clipe de voz:", erro);
    } finally {
      avancarFilaVoz();
    }
  }

  function reproduzirArquivo(arquivo, callbacks, velocidade) {
    configurarAudioSession();
    filaVoz.push({
      arquivo: arquivo,
      callbacks: callbacks || {},
      velocidade: Math.min(1.3, Math.max(0.75, Number(velocidade) || 1))
    });
    avancarFilaVoz();
  }

  function configurarVolumes(volumes) {
    volumes = volumes || {};
    volumeVoz = Math.min(2.5, Math.max(0.5, Number(volumes.voz) || 1.5));
    volumeBipes = Math.min(2.5, Math.max(0.5, Number(volumes.bipes) || 1));
    if (saidaVoz && saidaVoz.gain) saidaVoz.gain.value = 3 * volumeVoz;
  }

  function cancelarVoz() {
    geracaoVoz += 1;
    filaVoz = [];
    carregandoVoz = false;
    if (fonteVozAtiva) {
      var fonte = fonteVozAtiva;
      fonteVozAtiva = null;
      fonte.onended = null;
      fonte.stop();
    }
  }

  function bipe() {
    tocar(880, 0.09, 0.85 * Math.min(1, 0.95 / (0.85 * volumeBipes)));
  }

  function contagem() {
    return tocar(660, 0.12, 0.95 * Math.min(1, 0.95 / (0.95 * volumeBipes)));
  }

  function criarControleGongo() {
    var preparando = false;
    var esperado = 3;
    return function (evento, bipeTocado) {
      if (evento.tipo === "fase") {
        var inicio = preparando && esperado === 0 && evento.fase &&
          evento.fase.tipo === "exercicio" &&
          evento.fase.ciclo === 1 && evento.fase.ronda === 1;
        preparando = !!(evento.fase && evento.fase.tipo === "preparar");
        esperado = 3;
        return !!inicio;
      }
      if (evento.tipo === "contagem" && preparando) {
        esperado = bipeTocado && evento.valor === esperado ? esperado - 1 : 3;
      } else if (evento.tipo === "fim") {
        preparando = false;
        esperado = 3;
      }
      return false;
    };
  }

  function gongo(aoTerminar) {
    var audio = contextoDesbloqueado();
    if (!audio || typeof root.fetch !== "function") {
      if (root.console && root.console.error) root.console.error("A reprodução do gongo não está disponível.");
      if (typeof aoTerminar === "function") aoTerminar();
      return false;
    }

    carregarGongo(audio).then(function (buffer) {
      var fonte = audio.createBufferSource();
      var ganho = audio.createGain();
      var compressor = typeof audio.createDynamicsCompressor === "function"
        ? audio.createDynamicsCompressor()
        : null;
      var duracao = Math.min(buffer.duration, 2.25);
      var volume = compressor ? 6 * volumeBipes : Math.min(1, volumeBipes);
      var inicio = audio.currentTime;
      fonte.buffer = buffer;
      ganho.gain.setValueAtTime(volume, inicio);
      ganho.gain.setValueAtTime(volume, inicio + Math.max(0, duracao - 0.1));
      ganho.gain.linearRampToValueAtTime(0, inicio + duracao);
      fonte.connect(ganho);
      if (compressor) {
        var saida = audio.createGain();
        saida.gain.value = 3;
        compressor.threshold.value = -12;
        compressor.knee.value = 0;
        compressor.ratio.value = 20;
        compressor.attack.value = 0;
        compressor.release.value = 0.15;
        ganho.connect(compressor);
        compressor.connect(saida);
        saida.connect(audio.destination);
      } else {
        ganho.connect(audio.destination);
      }
      if (typeof aoTerminar === "function") fonte.onended = aoTerminar;
      fonte.start(inicio, 0, duracao);
    }).catch(function (erro) {
      if (root.console && root.console.error) root.console.error("Não foi possível reproduzir o gongo:", erro);
      if (typeof aoTerminar === "function") aoTerminar();
    });
    return true;
  }

  root.OssAudio = {
    configurarAudioSession: configurarAudioSession,
    configurarVolumes: configurarVolumes,
    desbloquear: desbloquear,
    reproduzirArquivo: reproduzirArquivo,
    cancelarVoz: cancelarVoz,
    bipe: bipe,
    contagem: contagem,
    criarControleGongo: criarControleGongo,
    gongo: gongo
  };
}(typeof globalThis !== "undefined" ? globalThis : this));
