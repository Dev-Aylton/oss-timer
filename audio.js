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

  function tocar(frequencia, duracao, volume, atraso) {
    var audio = contextoDesbloqueado();
    if (!audio) return;
    var inicio = audio.currentTime + (atraso || 0);
    var oscilador = audio.createOscillator();
    var ganho = audio.createGain();
    oscilador.frequency.value = frequencia;
    oscilador.type = "sine";
    ganho.gain.setValueAtTime(volume * volumeBipes, inicio);
    ganho.gain.exponentialRampToValueAtTime(0.001, inicio + duracao);
    oscilador.connect(ganho);
    ganho.connect(audio.destination);
    oscilador.start(inicio);
    oscilador.stop(inicio + duracao);
  }

  function desbloquear() {
    contextoDesbloqueado();
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
      velocidade: velocidade === 0.88 ? 0.88 : 1
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
    tocar(880, 0.09, 0.16);
  }

  function contagem() {
    tocar(660, 0.12, 0.18);
  }

  function gongo() {
    tocar(220, 0.55, 0.22);
    tocar(330, 0.45, 0.12, 0.08);
  }

  root.OssAudio = {
    configurarAudioSession: configurarAudioSession,
    configurarVolumes: configurarVolumes,
    desbloquear: desbloquear,
    reproduzirArquivo: reproduzirArquivo,
    cancelarVoz: cancelarVoz,
    bipe: bipe,
    contagem: contagem,
    gongo: gongo
  };
}(typeof globalThis !== "undefined" ? globalThis : this));
