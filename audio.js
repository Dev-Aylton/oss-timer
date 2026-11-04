(function (root) {
  "use strict";

  var contexto = null;

  function contextoDesbloqueado() {
    var construtor = root.AudioContext || root.webkitAudioContext;
    if (!construtor) return null;
    if (!contexto) contexto = new construtor();
    if (contexto.state === "suspended" && contexto.resume) contexto.resume();
    return contexto;
  }

  function tocar(frequencia, duracao, volume, atraso) {
    var audio = contextoDesbloqueado();
    if (!audio) return;
    var inicio = audio.currentTime + (atraso || 0);
    var oscilador = audio.createOscillator();
    var ganho = audio.createGain();
    oscilador.frequency.value = frequencia;
    oscilador.type = "sine";
    ganho.gain.setValueAtTime(volume, inicio);
    ganho.gain.exponentialRampToValueAtTime(0.001, inicio + duracao);
    oscilador.connect(ganho);
    ganho.connect(audio.destination);
    oscilador.start(inicio);
    oscilador.stop(inicio + duracao);
  }

  function desbloquear() {
    contextoDesbloqueado();
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
    desbloquear: desbloquear,
    bipe: bipe,
    contagem: contagem,
    gongo: gongo
  };
}(typeof globalThis !== "undefined" ? globalThis : this));
