# Oss Timer

Timer de treino de jiu-jitsu em PWA, versão 0.9.0. Possui as abas Tabata, Rondas, Cronômetro e Mais, editor de treinos, histórico limitado a 200 treinos concluídos, backup JSON, Ajustes, voz em português, bipes, tela sempre ligada, logos locais e Política de Privacidade.

Funciona com HTML, CSS e JavaScript puros e pode ser usado offline pelo service worker.

## Testes

Abra `tests/test-runner.html` no navegador. A contagem atual é de 54 testes executados em JavaScript puro.

A medição visual simples está em `tests/dom-smoke.html`.

## Política

A [Política de Privacidade](https://github.com/Dev-Aylton/oss-timer/blob/main/README.md) descreve apenas os dados locais usados pelo app. O texto exibido no próprio app está disponível na tela Política de Privacidade.

## Redeseno

- [x] Barra inferior com quatro abas
- [x] Tabata com fases, rondas, ciclos e controles
- [x] Editor de treinos
- [x] Aba Rondas
- [x] Cronometro reutilizando a logica do cronometro
- [x] Ajustes, Sobre e foto local
- [x] Politica de Privacidade
- [x] Icones e service worker
