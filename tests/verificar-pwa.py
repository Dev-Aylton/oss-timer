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
bloco = sw.split("const PRECACHE = [", 1)[1].split("];", 1)[0]
precache = re.findall(r'"([^"]+)"', bloco)
print("PRECACHE ausentes:", [item for item in precache if not os.path.isfile(item)])

with open("index.html", encoding="utf-8") as arquivo:
    html = arquivo.read()
with open("style.css", encoding="utf-8") as arquivo:
    css = arquivo.read()
carregados = re.findall(r'(?:href|src)="([^"]+)"', html)
carregados += re.findall(r'url\("([^"]+)"\)', css)
carregados = [item for item in carregados if not re.match(r'^(?:https?:|mailto:|tel:)', item)]
print("carregados ausentes do precache:",
      [item for item in carregados if item not in precache])

for caminho in ["icons/icon-192.png", "icons/icon-512.png",
                "icons/apple-touch-icon.png"]:
    dados = open(caminho, "rb").read()
    assinatura = dados[:8] == b"\x89PNG\r\n\x1a\n"
    largura, altura = struct.unpack(">II", dados[16:24])
    print(f"{caminho}: OK {len(dados)} bytes; assinatura PNG: {assinatura}; dimensoes IHDR: {largura}x{altura}")
