(function () {
  "use strict";

  function executar() {
    var resultados = OssTests.executar();
    var aprovados = resultados.filter(function (resultado) {
      return resultado.passou;
    }).length;
    document.getElementById("numTotal").textContent = resultados.length;
    document.getElementById("numPass").textContent = aprovados;
    document.getElementById("numFail").textContent = resultados.length - aprovados;

    var lista = document.getElementById("resultados");
    lista.textContent = "";
    resultados.forEach(function (resultado) {
      var item = document.createElement("li");
      item.textContent = resultado.passou
        ? "PASSOU — " + resultado.nome
        : "FALHOU — " + resultado.nome + ": " + resultado.erro;
      if (!resultado.passou) item.className = "falha";
      lista.appendChild(item);
    });
  }

  document.getElementById("executar").addEventListener("click", executar);
  executar();
}());
