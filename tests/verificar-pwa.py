import json
import os
import re
import struct

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
ajustes = html.split('id="ajustes-panel"', 1)[1].split("</section>", 1)[0]
if 'id="ajustes-version"' not in ajustes:
    raise SystemExit("painel Ajustes sem elemento de versao")
print("Ajustes versao: SIM")
with open("style.css", encoding="utf-8") as arquivo:
    css = arquivo.read()
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
    print(f"{caminho}: OK {len(dados)} bytes; assinatura PNG: {assinatura}; dimensoes IHDR: {largura}x{altura}")
