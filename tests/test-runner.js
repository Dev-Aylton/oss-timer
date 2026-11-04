(function () {
  "use strict";

  var filtroAtual = "todos";
  var ultimaExecucao = [];

  function atualizarLista() {
    var consulta = document.getElementById("busca").value.trim().toLocaleLowerCase("pt-BR");
    var itens = document.querySelectorAll("#resultados li");
    var visiveis = 0;

    itens.forEach(function (item) {
      var filtroOk = filtroAtual === "todos" ||
        (filtroAtual === "aprovados" && item.dataset.passou === "true") ||
        (filtroAtual === "reprovados" && item.dataset.passou === "false");
      var buscaOk = !consulta || item.textContent.toLocaleLowerCase("pt-BR").indexOf(consulta) !== -1;
      item.hidden = !filtroOk || !buscaOk;
      if (!item.hidden) visiveis += 1;
    });

    document.getElementById("estado-filtro").hidden = !ultimaExecucao.length || visiveis > 0;
  }

  function criarResultado(resultado) {
    var item = document.createElement("li");
    var icone = document.createElement("span");
    var conteudo = document.createElement("div");
    var nome = document.createElement("strong");

    item.className = resultado.passou ? "result-item passed" : "result-item failed";
    item.dataset.passou = resultado.passou ? "true" : "false";
    icone.className = "result-icon";
    icone.setAttribute("aria-hidden", "true");
    icone.textContent = resultado.passou ? "✓" : "!";
    nome.className = "result-name";
    nome.textContent = resultado.nome;
    conteudo.appendChild(nome);

    if (!resultado.passou) {
      var erro = document.createElement("p");
      erro.className = "result-error";
      erro.textContent = resultado.erro || "Falha sem mensagem de erro.";
      conteudo.appendChild(erro);
    }

    var estado = document.createElement("span");
    estado.className = "result-state";
    estado.textContent = resultado.passou ? "Aprovado" : "Reprovado";
    item.appendChild(icone);
    item.appendChild(conteudo);
    item.appendChild(estado);
    return item;
  }

  function executar() {
    var inicio = performance.now();
    ultimaExecucao = OssTests.executar();

    var total = ultimaExecucao.length;
    var aprovados = ultimaExecucao.filter(function (resultado) {
      return resultado.passou;
    }).length;
    var reprovados = total - aprovados;
    var percentual = total ? Math.round(aprovados / total * 100) : 0;

    document.getElementById("numTotal").textContent = total;
    document.getElementById("numPass").textContent = aprovados;
    document.getElementById("numFail").textContent = reprovados;
    document.getElementById("filtro-total").textContent = total;
    document.getElementById("filtro-aprovados").textContent = aprovados;
    document.getElementById("filtro-reprovados").textContent = reprovados;
    document.getElementById("duracao").textContent =
      Math.max(0, performance.now() - inicio).toFixed(1) + " ms";
    document.querySelector(".progress-track").setAttribute("aria-valuenow", percentual);
    document.getElementById("barra-progresso").style.width = percentual + "%";
    document.getElementById("status-execucao").textContent = reprovados
      ? reprovados + " teste" + (reprovados === 1 ? "" : "s") + " com falha"
      : total + " testes aprovados";

    var lista = document.getElementById("resultados");
    lista.textContent = "";
    ultimaExecucao.forEach(function (resultado) {
      lista.appendChild(criarResultado(resultado));
    });
    atualizarLista();
  }

  document.getElementById("executar").addEventListener("click", executar);
  document.getElementById("busca").addEventListener("input", atualizarLista);
  document.querySelectorAll("[data-filtro]").forEach(function (botao) {
    botao.addEventListener("click", function () {
      filtroAtual = botao.dataset.filtro;
      document.querySelectorAll("[data-filtro]").forEach(function (item) {
        var ativo = item === botao;
        item.classList.toggle("active", ativo);
        item.setAttribute("aria-pressed", ativo ? "true" : "false");
      });
      atualizarLista();
    });
  });

  executar();
}());
