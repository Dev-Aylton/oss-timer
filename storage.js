(function (root) {
  "use strict";

  var CHAVE = "oss-timer.treinos.v1";
  var memoria = null;
  var inteiros = ["preparar", "exercicio", "descanso", "rondas", "ciclos", "descansoCiclo", "relaxe", "avisoProximo"];
  var limites = {
    preparar: [0, 3600], exercicio: [0, 86400], descanso: [0, 86400],
    rondas: [1, 100], ciclos: [1, 100], descansoCiclo: [0, 86400],
    relaxe: [0, 86400], avisoProximo: [0, 3600]
  };

  function idNovo() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return "treino-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function treinoSparring() {
    return {
      id: "sparring",
      nome: "SPARRING",
      preparar: 10, exercicio: 300, descanso: 35, rondas: 10, ciclos: 1,
      descansoCiclo: 0, relaxe: 0, avisosFim: [30, 10], avisoProximo: 10
    };
  }

  function validarTreino(treino, lista) {
    lista = lista || [];
    if (!treino || typeof treino !== "object") return "Treino inválido.";
    if (typeof treino.nome !== "string" || treino.nome.trim().length < 1 || treino.nome.trim().length > 40)
      return "O nome deve ter entre 1 e 40 caracteres.";
    for (var i = 0; i < inteiros.length; i += 1) {
      var campo = inteiros[i];
      var limite = limites[campo];
      if (!Number.isInteger(treino[campo]) || treino[campo] < limite[0] || treino[campo] > limite[1])
        return "O campo \"" + campo + "\" está fora da faixa permitida.";
    }
    if (!Array.isArray(treino.avisosFim) || treino.avisosFim.some(function (valor) {
      return !Number.isInteger(valor) || valor < 1 || valor > 86400;
    })) return "Avisos do fim devem ser inteiros entre 1 e 86400.";
    if (typeof treino.id !== "string" || !treino.id) return "O ID do treino é obrigatório.";
    if (lista.some(function (outro) { return outro && outro.id === treino.id && outro !== treino; }))
      return "Existe outro treino com o mesmo ID.";
    return "";
  }

  function normalizar(dado) {
    var base = treinoSparring();
    var resultado = {};
    ["id", "nome", "preparar", "exercicio", "descanso", "rondas", "ciclos",
     "descansoCiclo", "relaxe", "avisoProximo"].forEach(function (campo) {
      if (dado && dado[campo] !== undefined) resultado[campo] = dado[campo];
      else resultado[campo] = base[campo];
    });
    resultado.nome = typeof resultado.nome === "string" ? resultado.nome.trim() : base.nome;
    resultado.avisosFim = Array.isArray(dado && dado.avisosFim)
      ? dado.avisosFim.slice(0, 20)
      : base.avisosFim.slice();
    return resultado;
  }

  function migrar(dado) {
    if (!dado || typeof dado !== "object") return { version: 1, treinoAtual: "sparring", treinos: [treinoSparring()] };
    var lista = Array.isArray(dado.treinos) ? dado.treinos : [];
    lista = lista.map(function (treino, indice) {
      var normalizado = normalizar(treino);
      if (!normalizado.id) normalizado.id = idNovo();
      if (indice === 0 && normalizado.nome === "") normalizado.nome = "Treino " + (indice + 1);
      return normalizado;
    });
    if (!lista.length) lista = [treinoSparring()];
    if (!lista.some(function (treino) { return treino.id === dado.treinoAtual; })) {
      dado.treinoAtual = lista[0].id;
    }
    return { version: 1, treinoAtual: dado.treinoAtual, treinos: lista };
  }

  function ler() {
    if (memoria) return memoria;
    try {
      var texto = root.localStorage.getItem(CHAVE);
      if (!texto) memoria = { version: 1, treinoAtual: "sparring", treinos: [treinoSparring()] };
      else memoria = migrar(JSON.parse(texto));
    } catch (erro) {
      memoria = { version: 1, treinoAtual: "sparring", treinos: [treinoSparring()] };
    }
    return memoria;
  }

  function salvar(dados) {
    memoria = migrar(dados);
    try {
      root.localStorage.setItem(CHAVE, JSON.stringify(memoria));
    } catch (erro) {}
    return memoria;
  }

  function validarImportacao(texto) {
    try {
      var dado = typeof texto === "string" ? JSON.parse(texto) : texto;
      if (!dado || !Array.isArray(dado.treinos) || !dado.treinos.length)
        return { valido: false, erro: "O JSON deve conter uma lista de treinos não vazia." };
      var ids = {};
      var lista = dado.treinos.map(function (treino) {
        var camposObrigatorios = ["id", "nome", "preparar", "exercicio", "descanso", "rondas",
          "ciclos", "descansoCiclo", "relaxe", "avisosFim", "avisoProximo"];
        if (!treino || camposObrigatorios.some(function (campo) {
          return !Object.prototype.hasOwnProperty.call(treino, campo);
        })) throw new Error("O treino não contém todos os campos obrigatórios.");
        var item = normalizar(treino);
        if (!item.id) item.id = idNovo();
        var erro = validarTreino(item, []);
        if (erro) throw new Error(erro);
        if (ids[item.id]) throw new Error("IDs duplicados na importação.");
        ids[item.id] = true;
        return item;
      });
      return { valido: true, dado: { version: 1, treinoAtual: dado.treinoAtual || lista[0].id, treinos: lista } };
    } catch (erro) {
      return { valido: false, erro: erro.message || "JSON inválido." };
    }
  }

  function garantirNaoVazio(treinos, removido) {
    if (Array.isArray(treinos) && treinos.length) return treinos;
    return [normalizar(removido && removido.id ? removido : treinoSparring())];
  }

  root.OssStorage = {
    CHAVE: CHAVE,
    treinoSparring: treinoSparring,
    validarTreino: validarTreino,
    normalizar: normalizar,
    migrar: migrar,
    ler: ler,
    salvar: salvar,
    validarImportacao: validarImportacao,
    garantirNaoVazio: garantirNaoVazio
  };
}((typeof globalThis !== "undefined" ? globalThis : this)));
