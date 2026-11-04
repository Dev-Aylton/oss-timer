import json
import os
import re
import struct
import xml.etree.ElementTree as ET

with open("manifest.json", encoding="utf-8") as arquivo:
    manifest = json.load(arquivo)
print("manifest JSON valido: SIM")
print("manifest icones:",
      [(icone["src"], os.path.isfile(icone["src"])) for icone in manifest["icons"]])

with open("sw.js", encoding="utf-8") as arquivo:
    sw = arquivo.read()
cache_name = re.search(r'const CACHE_NAME = "([^"]+)"', sw)
app_version = re.search(r'var APP_VERSION = "([^"]+)"', open("app.js", encoding="utf-8").read())
if not cache_name or not app_version or cache_name.group(1) != "oss-timer-v" + app_version.group(1):
    raise SystemExit("CACHE_NAME nao corresponde a APP_VERSION")
print("versao PWA: OK", app_version.group(1), cache_name.group(1))
bloco = sw.split("const PRECACHE = [", 1)[1].split("];", 1)[0]
precache = re.findall(r'"([^"]+)"', bloco)
print("PRECACHE ausentes:", [item for item in precache if not os.path.isfile(item)])

linhas_precache = sw.split("const PRECACHE = [", 1)[1].split("];", 1)[0].splitlines()
entradas_precache = [linha.strip() for linha in linhas_precache if re.match(r'^"', linha.strip())]
virgulas_ok = all(
    linha.endswith((",")) if indice < len(entradas_precache) - 1 else not linha.endswith(",")
    for indice, linha in enumerate(entradas_precache)
)
print("PRECACHE sintaxe virgulas: SIM" if virgulas_ok else "PRECACHE sintaxe virgulas: NAO")

with open("index.html", encoding="utf-8") as arquivo:
    html = arquivo.read()
tabata = html.split('id="tabata-view"', 1)[1].split("</main>", 1)[0]
acoes_sparring = ['id="reset-timer"', 'id="configurar-sparring"']
acoes_ausentes = [acao for acao in acoes_sparring if acao not in tabata]
if acoes_ausentes:
    raise SystemExit("Ações do Sparring ausentes no cabeçalho: " + ", ".join(acoes_ausentes))
if 'class="progress-ring-value"' not in tabata or "OssView.progressoFase(estado)" not in open("app.js", encoding="utf-8").read():
    raise SystemExit("Anel de progresso do timer sem renderização do progresso da fase")
print("Ações de reiniciar e configurar Sparring: OK")

mais = html.split('id="mais-view"', 1)[1].split("</main>", 1)[0]
if 'data-panel="historico"' in mais or 'data-panel="backup"' in mais:
    raise SystemExit("Mais ainda mostra Histórico ou Backup")
if 'id="more-version"' not in mais:
    raise SystemExit("Tela Mais sem cartão de versão")
print("Menu Mais e cartão de versão: OK")

politica = html.split('id="politica-panel"', 1)[1].split("</section>", 1)[0]
secoes_politica = ["Dados que ficam no seu aparelho", "Dados que não coletamos",
                   "Áudio e voz", "Funcionamento offline e serviços externos",
                   "Controle e exclusão"]
secoes_ausentes = [secao for secao in secoes_politica if secao not in politica]
if secoes_ausentes:
    raise SystemExit("Seções da política de privacidade ausentes: " + ", ".join(secoes_ausentes))
print("Política de privacidade atualizada: OK")

sobre = html.split('id="sobre-panel"', 1)[1].split('id="politica-panel"', 1)[0]
if sobre.index('class="about-photo"') > sobre.index('class="about-emblem"'):
    raise SystemExit("Símbolo OSS deve aparecer após a foto e os créditos na tela Sobre")
if "Aylton Alberto" not in sobre:
    raise SystemExit("Crédito de desenvolvimento incompleto na tela Sobre")
print("Créditos e símbolo da tela Sobre: OK")

metas_ios = [
    'name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"',
    'name="apple-mobile-web-app-capable" content="yes"',
    'name="apple-mobile-web-app-title" content="Oss Timer"',
    'name="apple-mobile-web-app-status-bar-style" content="black"',
    'rel="apple-touch-icon" sizes="180x180" href="icons/apple-touch-icon.png"',
]
metas_ios_ausentes = [meta for meta in metas_ios if meta not in html]
if metas_ios_ausentes:
    raise SystemExit("Metadados de instalação iOS ausentes: " + ", ".join(metas_ios_ausentes))
print("Metadados para instalação no iOS: OK")
if not any("maskable" in icone.get("purpose", "").split() for icone in manifest["icons"]):
    raise SystemExit("Manifesto sem ícone compatível com máscaras")
print("Ícone PWA maskable: OK")
if 'id="ajustes-panel"' not in html or 'id="ajustes-version"' not in html:
    raise SystemExit("painel Ajustes sem elemento de versao")
controles_ajustes = ['settings-content', 'id="ajuste-voz"',
                     'id="ajuste-bipes"', 'id="ajuste-wake"',
                     'id="voz-selecao"', 'id="testar-voz"']
controles_ausentes = [controle for controle in controles_ajustes if controle not in html]
if controles_ausentes:
    raise SystemExit("Controles do painel Ajustes ausentes: " + ", ".join(controles_ausentes))
print("Ajustes versao: SIM")
campos_editor = ['id="editor-titulo"', 'id="editor-total"', 'id="editor-rounds-summary"',
                 'id="editor-cycles-summary"', 'id="editor-intervalos"',
                 'id="editor-library"', 'id="concluir-editor"',
                 'id="editor-fast-setup"', 'id="editor-fast-duration"', 'id="editor-fast-rounds"',
                 'data-quick-value="300"', 'data-quick-value="10"']
campos_editor_ausentes = [campo for campo in campos_editor if campo not in html]
if campos_editor_ausentes:
    raise SystemExit("Editor de treino incompleto: " + ", ".join(campos_editor_ausentes))
editor = html.split('id="editor-panel"', 1)[1].split('id="sobre-panel"', 1)[0]
if "<details" in editor or 'id="editor-advanced"' not in editor:
    raise SystemExit("Ajustes do editor devem permanecer visíveis, sem seções recolhidas")
if 'id="salvar-treino"' in editor or 'class="editor-footer"' in editor:
    raise SystemExit("O editor deve ter somente o botão Concluído para salvar e fechar")
with open("app.js", encoding="utf-8") as arquivo:
    app = arquivo.read()
if 'getElementById("concluir-editor").addEventListener' not in app:
    raise SystemExit("Botão Concluído sem ação para salvar e fechar o editor")
if "desconectarEventosRondas = conectarEventosTimer(rondasTimer);" not in app:
    raise SystemExit("Timer de Rondas sem avisos de áudio e voz")
if 'if (chave === "wake") sincronizarWakeLock();' not in app:
    raise SystemExit("Ajuste de tela sempre ligada não é aplicado durante o treino")
print("Avisos de Rondas e ajuste de tela ativa: OK")
print("Editor de treino: OK")
with open("style.css", encoding="utf-8") as arquivo:
    css = arquivo.read()
regras_paisagem = [
    '"phase next"',
    '"phase controls"',
    'grid-area: nav;',
    'grid-area: controls;',
    'max-width: none;',
]
regras_ausentes = [regra for regra in regras_paisagem if regra not in css]
if regras_ausentes:
    raise SystemExit("Layout horizontal dedicado ausente: " + ", ".join(regras_ausentes))
alvos_toque = [
    "#editor-panel .interval-control button {\n  width: 44px;\n  min-height: 44px;",
    "#editor-panel .editor-presets button {\n  min-width: 0;\n  min-height: 44px;",
]
alvos_toque_ausentes = [regra for regra in alvos_toque if regra not in css]
if alvos_toque_ausentes:
    raise SystemExit("Controles do editor abaixo do tamanho de toque recomendado")
areas_seguras = [
    "env(safe-area-inset-top)",
    "env(safe-area-inset-right)",
    "env(safe-area-inset-bottom)",
    "env(safe-area-inset-left)",
    "100dvh",
    "--timer-header-height: calc(72px + env(safe-area-inset-top));",
]
areas_seguras_ausentes = [area for area in areas_seguras if area not in css]
if areas_seguras_ausentes:
    raise SystemExit("Regras responsivas/áreas seguras ausentes: " + ", ".join(areas_seguras_ausentes))
print("Layout com viewport dinâmico e áreas seguras: OK")
carregados = re.findall(r'(?:href|src)="([^"]+)"', html)
carregados += re.findall(r'url\("([^"]+)"\)', css)
carregados = [item for item in carregados if not re.match(r'^(?:https?:|mailto:|tel:)', item)]
print("carregados ausentes do precache:",
      [item for item in carregados if item not in precache and not item.startswith("photos/")])

for caminho in ["icons/icon-192.png", "icons/icon-512.png",
                "icons/apple-touch-icon.png"]:
    dados = open(caminho, "rb").read()
    assinatura = dados[:8] == b"\x89PNG\r\n\x1a\n"
    largura, altura = struct.unpack(">II", dados[16:24])
    esperado = {"icons/icon-192.png": 192, "icons/icon-512.png": 512,
                "icons/apple-touch-icon.png": 180}[caminho]
    if not assinatura or (largura, altura) != (esperado, esperado):
        raise SystemExit(f"Ícone inválido ou com dimensão incorreta: {caminho}")
    print(f"{caminho}: OK {len(dados)} bytes; dimensões: {largura}x{altura}")

ET.parse("icons/oss-timer-app-icon.svg")
print("Arte vetorial do ícone: OK")
