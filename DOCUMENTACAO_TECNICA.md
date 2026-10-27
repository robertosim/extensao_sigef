# Documentação Técnica - SIGEF Extractor & Downloader

## 1. Visão Geral da Arquitetura

### 1.1 Stack Tecnológica
- **Manifest Version**: 3 (Service Worker)
- **Linguagem**: JavaScript (ES2020+)
- **APIs Chrome Extension**: `chrome.downloads`, `chrome.tabs`, `chrome.scripting`, `chrome.storage`
- **Bibliotecas**: Leaflet.js 1.9.4 empacotada localmente em `lib/` e embutida no HTML do mapa gerado (nenhum código é carregado de servidores externos, conforme políticas do Manifest V3)
- **Compatibilidade**: Google Chrome 88+, Edge 88+

### 1.2 Estrutura de Arquivos
```
Downloader/
├── manifest.json          # Configuração da extensão (permissões, ícones, metadados)
├── popup.html             # Interface do usuário (4 abas)
├── popup.js               # Lógica do popup, gerenciamento de estado, geração de mapas
├── background.js          # Service Worker - motor de automação e downloads
├── content.js             # Script injetado para simulação comportamental
├── icons/                 # Ícones da extensão
│   ├── icon16.png         # Ícone 16x16
│   ├── icon32.png         # Ícone 32x32
│   ├── icon48.png         # Ícone 48x48
│   └── icon128.png        # Ícone 128x128
├── lib/                   # Bibliotecas locais (sem CDN)
│   ├── leaflet.js         # Leaflet 1.9.4 (embutido no HTML gerado)
│   └── leaflet.css        # Estilos do Leaflet (embutidos no HTML gerado)
├── assets/                # Imagens do README (telas e diagramas)
├── scripts/               # Scripts de automação
│   └── pack.ps1           # Gera o ZIP da Chrome Web Store em dist/
├── dist/                  # ZIPs de publicação (gerado pelo pack.ps1, não versionado)
├── .gitattributes         # Marca PNGs como binários (evita corrupção por CRLF)
├── .gitignore             # Arquivos ignorados pelo Git (dist/, editores, SO)
├── README.md              # Documentação de usuário
├── DOCUMENTACAO_TECNICA.md # Esta documentação
└── LICENSE                # Licença do projeto
```

### 1.3 Empacotamento e Distribuição
- Script: `scripts/pack.ps1` — lê a versão do `manifest.json` e gera
  `dist/sigef-extractor-v{versão}.zip`
- O pacote contém apenas: `manifest.json`, `background.js`, `popup.html`, `popup.js`,
  `content.js`, `LICENSE`, `icons/` e `lib/` (nenhum arquivo de documentação ou imagem de README)
- Uso: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\pack.ps1`
- `dist/` está no `.gitignore` (os ZIPs não são versionados)

---

## 2. Ciclo de Vida do Software

### 2.1 Inicialização
1. **Carregamento da Extensão**: Chrome carrega `manifest.json`
2. **Service Worker Iniciado**: `background.js` registra listeners:
   - `chrome.runtime.onMessage` - Comandos do popup
   - `chrome.storage.onChanged` - Monitora pausa/parada
3. **Popup Carregado**: `popup.html` + `popup.js` inicializam UI
   - `checkServiceWorkerVersion()` (`popup.js:78`) compara a versão do popup com a do Service
     Worker (ação `sw_version`); se divergir (código antigo em execução) ou o SW não responder,
     exibe banner vermelho pedindo recarga em `chrome://extensions`
4. **Estado Restaurado**: `chrome.storage.local.get()` recupera fila, índice, modo

### 2.2 Fluxo Principal (Process Queue)
```
┌─────────────────────┐
│  Usuário clica      │
│  EXTRAIR/BAIXAR     │
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│  Validação de       │
│  Entrada            │
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│  Salva em Storage:  │
│  queue, index=0,    │
│  isProcessing=true, │
│  mode, dataType     │
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│  Envia msg:         │
│  start_processing   │
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│  background.js      │
│  processQueue()     │
└─────────┬───────────┘
          ▼
    ┌─────┴─────┐
    ▼           ▼
EXTRACT      DOWNLOAD
    │           │
    ▼           ▼
executeExtractorLogic  executeDownloadLogic
    │           │
    └─────┬─────┘
          ▼
┌─────────────────────┐
│  Loop while         │
│  (currentIndex <    │
│   queue.length)     │
└─────────┬───────────┘
          ▼
    ┌─────┴─────┐
    ▼           ▼
  Pausado?   Processa item
    │           │
    ▼           ▼
  Aguarda    Atualiza UI
  resume     (progress, logs)
    │           │
    └─────┬─────┘
          ▼
┌─────────────────────┐
│  Fim da fila?       │
│  Sim → Finaliza     │
│  Não → Próximo      │
└─────────────────────┘
```

### 2.3 Estados da Aplicação
| Estado | Variáveis Storage | Descrição |
|--------|-------------------|-----------|
| **Idle** | `isProcessing=false`, `queue=[]` | Aguardando comando |
| **Processing** | `isProcessing=true`, `isPaused=false` | Processando itens |
| **Paused** | `isPaused=true` | Usuário clicou Pausar |
| **Completed** | `isProcessing=false`, `currentIndex=queue.length` | Fila finalizada |
| **Stopped** | `isProcessing=false`, `queue=[]` | Usuário clicou Parar |

---

## 3. Preparação e Formato dos Arquivos

### 3.1 Entrada - Aba Extração
**Formato**: Texto plano (um por linha)
```
8070100031237
84617284915
25372342000163
```

**Campo adicional**: `Pasta de saida (criada em Downloads)` — nome da pasta que receberá os CSVs
extraídos e os documentos baixados (ver seção 3.4.0). Obrigatório para iniciar.

**Tipos Suportados**:
| Tipo | Formatação Aplicada | Exemplo Entrada | Exemplo Formatado |
|------|---------------------|-----------------|-------------------|
| Código | 13 dígitos, zero à esquerda | `8070100031237` | `8070100031237` |
| CPF | 11 dígitos, zero à esquerda | `84617284915` | `84617284915` |
| CNPJ | 14 dígitos, zero à esquerda | `25372342000163` | `25372342000163` |

**Função**: `formatValue(value, dataType)` em `background.js:103`

### 3.2 Entrada - Aba Download
**Arquivo(s)**: um ou mais CSVs com separador `;` (seleção múltipla, `input[multiple]`)
```
7010920297421.csv          7010920297425.csv
Nome;UUID;...              Nome;UUID;...
Fazenda Santa Maria;...    Sitio Boa Vista;...
```

**Validação**:
- Ignora linha de cabeçalho (`nome;`) e linhas vazias
- Extrai UUID da coluna 2 (index 1)
- Suporta UUID completo ou path `detalhe/{uuid}`

**Estrutura da fila (modo download)**:
```javascript
// Cada item carrega a origem, para saber em qual pasta salvar
queue = [
  { line: "Fazenda Santa Maria;a1b2...;", codigoImovel: "7010920297421" },
  { line: "Sitio Boa Vista;b2c3...;",     codigoImovel: "7010920297421" },
  { line: "Outra Fazenda;c3d4...;",       codigoImovel: "7010920297425" }
]
```
- Todos os CSVs são lidos (`file.text()`) e **empilhados em uma única fila**
- Processamento: **um item por vez**, na ordem dos arquivos selecionados
- `codigoImovel` = nome do arquivo CSV sem `.csv` → vira a pasta raiz do download

**Funções**: `startDownload()` em `popup.js:179`, desempacotamento em `processQueue()` em `background.js:733`
**Função**: `parseParcelaUuidFromLine()` em `background.js:112`

**Intervalo entre downloads**: mínimo **fixo em 3 segundos** (`MIN_DOWNLOAD_INTERVAL = 3`, campo
`readonly` — o usuário só edita o máximo, que deve ser `≥ 3`). A espera é um valor aleatório entre o
mínimo e o máximo, **para evitar sobrecarga do servidor ou bloqueio**
(`getRandomDownloadDelayMs()` em `background.js:157`).

### 3.3 Entrada - Aba Map
**Entrada**: Pasta (webkitdirectory) com arquivos `.csv` recursivos

**Pasta de saída exibida**: a aba mostra o `outputFolder` gravado na extração
(ex.: `Pasta de saida: AMANDA SOUZA RODRIGUES - selecione essa pasta (em Downloads) ao gerar o mapa.`),
para orientar o usuário a selecionar a mesma pasta no seletor de diretórios.

**Formato CSV Esperado**:
```csv
Nome;WKT;QRCODE;...
Fazenda A;"POLYGON((-48.1 -15.2, -48.1 -15.3, ...))";qrcode123;...
Fazenda B;"MULTIPOLYGON(((...)))";qrcode456;...
```

**Colunas Detectadas Automaticamente**:
- WKT: `WKT`, `GEOMETRIA`, `GEOMETRY`
- QRCODE: `QRCODE`, `QR_CODE`
- NOME: `NOME`, `NAME`

**Função**: `parseCsvFile()` em `popup.js:390`

### 3.4 Saída - Arquivos Gerados

#### 3.4.0 Pasta de Saída (`outputFolder`)
Antes de extrair ou baixar, o usuário informa o **nome da pasta de saída** em um campo do popup
(aba **Extração** e aba **Download**; o valor é o mesmo nos dois campos, salvo em
`chrome.storage.local.outputFolder` e sanitizado por `sanitizeFolderName()` em `background.js:81`).
A pasta é criada dentro de `Downloads/` (criação automática pelo `chrome.downloads` no primeiro
arquivo salvo) e todos os arquivos da extração e dos downloads ficam sob ela.
Caracteres inválidos para nomes de pasta (`\ / : * ? " < > |`) são removidos; espaços são colapsados.

#### 3.4.1 CSV de Extração
```
"Nome";"Codigo";"Area";"Detentor";"CNS";"Matricula"
"Fazenda Santa Maria";"a1b2c3d4-e5f6-7890-abcd-ef1234567890";"123,45";"João Silva";"123456";"7890"
```

**Caminho**: `Downloads/{PASTA_SAIDA}/{CODIGO}.csv`

**Função**: `downloadExtractCsvBlob()` em `background.js:661`

**Zero resultados**: se a busca retornar `Resultados: 0`, **nenhum CSV é baixado** para esse código
(log `Busca sem resultados (0) - CSV de {codigo} NAO sera baixado`). O download só ocorre com resultados > 0.

#### 3.4.2 Downloads de Documentos
**Estrutura de Pastas** (um CSV = uma pasta; tudo sob a pasta de saída):
```
Downloads/
└── {PASTA_SAIDA}/                       ← nome informado pelo usuário (ex.: Fazenda São João)
    ├── {CODIGO_IMOVEL_1_UPPER}/         ← de 7010920297421.csv
    │   └── {NOME_PARCELA_SANITIZED}/
    │         ├── {NOME_PARCELA}_{UUID}_planta.pdf
    │         ├── {NOME_PARCELA}_{UUID}_memorial.pdf
    │         ├── {NOME_PARCELA}_{UUID}.csv
    │         └── {NOME_PARCELA}_{UUID}.zip
    └── {CODIGO_IMOVEL_2_UPPER}/         ← de 7010920297425.csv
        └── {NOME_PARCELA_SANITIZED}/
              └── ...
```

**URLs SIGEF**:
| Tipo | URL |
|------|-----|
| Planta | `https://sigef.incra.gov.br/geo/parcela/planta/{uuid}/10930/` |
| Memorial | `https://sigef.incra.gov.br/geo/parcela/memorial/{uuid}/` |
| CSV | `https://sigef.incra.gov.br/geo/exportar/parcela/csv/{uuid}/` |
| SHP | `https://sigef.incra.gov.br/geo/exportar/parcela/shp/{uuid}/` |

**Sanitização**: `sanitize()` em `background.js:67`
- Remove acentos (NFD)
- Capitaliza palavras (exceto preposições)
- Junta com underscore

#### 3.4.3 Mapa HTML
**Arquivo**: `{pasta_nome}.html` salvo em Downloads

**Recursos**:
- Leaflet.js v1.9.4 (empacotada em `lib/`, embutida no HTML — sem CDN)
- 3 camadas Google: Híbrido, Satellite, Terreno
- Polígonos coloridos por grupo CCIR (matiz dourado para distribuição; parcelas do mesmo CCIR têm a mesma cor; sem CCIR, cor própria por polígono)
- Popup com: Imóvel, Link SIGEF, Código CCIR (quando disponível), Área (ha)
- Legenda lateral com os mesmos dados do popup e área total
- Cálculo de área: Shoelace + correção latitudinal

**Código CCIR**: extraído do caminho relativo do CSV (`webkitRelativePath`). Se o CSV estiver em `{raiz}/{CODIGO_CCIR}/{PARCELA}/{arquivo}.csv`, onde `{CODIGO_CCIR}` é uma pasta composta apenas por dígitos (ex.: `8010620674820`), o código é exibido no popup e na legenda de cada polígono daquela parcela. Estruturas de pasta sem esse padrão funcionam normalmente, apenas sem o campo CCIR.

**Funções**: `generateMapHtml()` em `popup.js:493`, `calculateAreaHa()` em `popup.js:624`

---

## 4. Funcionamento Detalhado por Módulo

### 4.1 background.js - Service Worker (Motor Principal)

#### 4.1.1 Sistema de Logs
```javascript
// Níveis: info, success, warn, error
// Armazenamento: chrome.storage.local (max 2000 entradas)
// Escrita SERIALIZADA: appendLog() encadeia promessas (fila logChain),
//   evitando a condição de corrida get→push→set que perdia mensagens
// Persistência: Sobrevive ao fechamento do popup
// Depuração: linhas "DEBUG[...]" espelham o passo a passo da busca na página
```

#### 4.1.2 Gerenciamento de Aba Extratora
- **Reutilização**: Mantém `extractorTabId` no storage
- **Recuperação**: Se aba fechada, recria automaticamente (abortada se `isProcessing=false`)
- **Navegação**: `chrome.tabs.update()` para troca de URL
- **Timeout**: 45s para carregamento completo
- **Encerramento**: Aba é fechada ao concluir a fila ou ao pausar/parar no modo extração

#### 4.1.3 Injeção Comportamental (`injectSearchInPage` - `background.js:177`)

Fluxo completo (com **fases** registradas em `window.__searchPhase` e log por passo em `window.__searchLog`):

```
1. Digitação humana      → foco + keydown/input/keyup por caractere (45-160ms)
2. Espera do VALUE       → até ~5s até input.value corresponder ao valor esperado
                           (comparação tolerante a máscara: igualdade direta OU
                            igualdade de dígitos); se não, força preenchimento
3. Espera do NAME        → até ~4s pelo atributo name do input
                           ⚠ apenas informativo: NÃO bloqueia o clique
4. Delay anti-bot        → aleatório de 3000 a 5000ms antes de clicar
5. Clique (cadeia mouse) → mouseover → mousemove → mousedown → mouseup → click
6. Verificação de reação → compara URL antes/depois + alerta de erro + tabela/h3
7. Fallback (se necessário) → form.requestSubmit(btn) ou btn.click()
8. Detecção de erro      → "Nenhum dos termos..." → limpa, redigita, 2ª tentativa
9. Resultado             → window.__searchResult = {success, reason}
```

**Motivo da espera do DOM**: o clique dispara navegação; o contexto injetado morre e
`window.__searchResult` não é escrito. Nesse caso `getSearchResult()` detecta documento
novo (sem `window.__searchUrl`) e retorna `{success:true, reason:'navigated'}`.

**Cadeia de eventos do clique**:
```javascript
mouseover → mousemove → mousedown → mouseup → click
// Fallback: form.requestSubmit() / btn.click() quando não há reação
```

#### 4.1.4 Aguardamento de Resultados (pós-busca)

Após o clique, o fundo **nunca** lê a página cedo demais:

```
injetar → poll de getSearchResult() (1s, até 45s)
             ├─ success            → seguir
             ├─ navigated          → waitTabComplete(45s) → seguir
             └─ motivo de falha     → dump DEBUG → nova tentativa (reload, 3x)
                    │
                    ▼
        delay fixo de 3s (respiro)
                    │
                    ▼
   checkPageLoaded() só responde true se document.readyState === "complete"
   (tabela, paginação, "Resultados: N" ou "Total: N")
                    │
                    ▼
   extractParcelasFromPage() → dados | zeroResults | próxima página
```

**Funções**: `getSearchResult()`/`getSearchDebug()` em `background.js:569`,
`checkPageLoaded()` em `background.js:544`, `dumpSearchDebug()` em `background.js:634`

**Depuração**: `dumpSearchDebug()` despeja fase, URL, `readyState` e as últimas
linhas de `window.__searchLog` na aba Logs com prefixo `DEBUG[...]`
(aos 5s/10s/15s de espera e ao fim de cada tentativa).

#### 4.1.5 Extração de Tabela (`extractParcelasFromPage`)
**Seletores CSS**:
```css
table.table-hover tbody tr,
table.table-striped tbody tr,
table.table tbody tr
```

**Detecção de "Parcela no Histórico"**:
- Célula final contém `<strong>` + texto "histórico"
- Para paginação imediatamente

**Paginação**: Múltiplas estratégias (fallback):
1. `.pagination li.next a[href]`
2. Página ativa + próxima numérica
3. Máxima página encontrada
4. `.pagination li.next a` genérico

#### 4.1.6 Download Direto (`safeDownload`)
- Usa `chrome.downloads.download()` (sem abrir aba)
- Conflito: `overwrite`
- Delay aleatório entre downloads: 500-2500ms

### 4.2 popup.js - Interface e Lógica de Mapas

#### 4.2.1 Gerenciamento de Abas (UI)
- 4 abas: Extração, Download, Map, Logs
- Estado sincronizado com `chrome.storage.onChanged`
- Auto-restaura última aba usada
- **Detector de SW desatualizado**: `checkServiceWorkerVersion()` (`popup.js:78`) — se o
  Service Worker em execução tem versão diferente da popup (ou não responde à ação `sw_version`
  em 1,5s), um banner vermelho instrui a recarregar a extensão em `chrome://extensions`

#### 4.2.2 Geração de Mapa (Client-side)
**Pipeline**:
1. `FileReader` lê CSVs selecionados
2. `parseCsvFile()` → detecta colunas → parseia WKT → extrai código CCIR do `webkitRelativePath` (pasta numérica na posição 1)
3. `parseWkt()` → POLYGON / MULTIPOLYGON → arrays `[lat, lon]`
4. `generateColors()` → matiz dourado (phi) + variação S/V, uma cor por grupo CCIR (polígonos sem CCIR recebem cor própria)
5. `generateMapHtml()` → template Leaflet + polygons JS
6. `blobToDataUrl()` → `chrome.downloads.download()`

**Cálculo de Área** (`calculateAreaHa`):
```javascript
// Fórmula Shoelace (coordenadas geográficas)
area = 0.5 * |Σ(xi*yi+1 - xi+1*yi)|
// Correção latitudinal:
kmPerDegLat = 111.32
kmPerDegLon = 111.32 * cos(latMid * π/180)
area_ha = area_km2 * 100
```

### 4.3 content.js - Simulação Comportamental
```javascript
// Executado em: https://sigef.incra.gov.br/geo/parcela/detalhe/*
// Após 2s: scroll aleatório (100-400px) + mousemove simulado
// Objetivo: Evitar detecção de bot/automação
```

### 4.4 popup.html - Estrutura da Interface
- **CSS Embedded**: Estilos completos (sem dependências externas)
- **Tabs**: CSS-only com `data-tab` attributes
- **Progress Bar**: Atualizada via storage
- **Log Container**: Scrollável, colorido por nível

---

## 5. Segurança e Boas Práticas

### 5.1 Permissões (Princípio Menor Privilégio)
| Permissão | Justificativa |
|-----------|---------------|
| `downloads` | Salvar arquivos gerados |
| `tabs` | Criar/fechar/navegar abas de busca |
| `scripting` | Injetar automação no DOM SIGEF |
| `storage` | Persistir fila, logs, estado |
| `host_permissions: sigef.incra.gov.br` | Acesso restrito ao domínio alvo |

Todas as permissões acima são utilizadas ativamente. Removidas na v2.3 (não utilizadas): `webNavigation` e `activeTab`.
O pacote não contém código hospedado remotamente: todos os scripts são locais (`background.js`, `popup.js`, `content.js`) e o Leaflet é embutido a partir de `lib/` no momento da geração do mapa.

### 5.2 Tratamento de Erros
- **Try/Catch** em todas as operações assíncronas (inclusive na cadeia injetada → `reason: chain_error`)
- **Retry Logic**: 3 tentativas de busca (com reload) e 3 tentativas por página (extração)
- **Polling resiliente**: verificações de página engolem erros transitórios de navegação
- **Tab Recovery**: Recriação automática de aba perdida (abortada se `isProcessing=false`)
- **Parada limpa**: `stop_processing` aborta busca, paginação e impede recriação de aba
- **Graceful Degradation**: Continua fila mesmo com erro individual

### 5.3 Anti-Detecção
- Delays aleatórios (human-like), incluindo **3000–5000ms entre o preenchimento e o clique**
- Digitação caractere a caractere
- Cadeia completa de eventos de mouse (+ fallback de clique nativo)
- Espera dos atributos `name`/`value` do input antes de submeter
- Scroll e mousemove em páginas de detalhe
- User-Agent nativo do Chrome (não modificado)

---

## 6. APIs e Integração SIGEF

### 6.1 Endpoints Utilizados
| Operação | Método | Endpoint |
|----------|--------|----------|
| Busca Parcelas | GET/POST | `https://sigef.incra.gov.br/consultar/parcelas` |
| Detalhe Parcela | GET | `https://sigef.incra.gov.br/geo/parcela/detalhe/{uuid}` |
| Planta PDF | GET | `https://sigef.incra.gov.br/geo/parcela/planta/{uuid}/10930/` |
| Memorial PDF | GET | `https://sigef.incra.gov.br/geo/parcela/memorial/{uuid}/` |
| Exportar CSV | GET | `https://sigef.incra.gov.br/geo/exportar/parcela/csv/{uuid}/` |
| Exportar SHP | GET | `https://sigef.incra.gov.br/geo/exportar/parcela/shp/{uuid}/` |

### 6.2 Formulário de Busca
- **Código Imóvel**: `#id_sncr` (input)
- **CPF/CNPJ**: `#id_cpf_cnpj` (input)
- **Botão Submit**: `#pesquisaForm button[type="submit"]` ou `button[value="Pesquisar"]`

### 6.3 Estrutura de Resposta (Tabela)
```html
<table class="table-hover">
  <tbody>
    <tr>
      <td><a href="/geo/parcela/detalhe/{uuid}">Nome Parcela</a></td>
      <td>Área (com links)</td>
      <td>Detentor</td>
      <td>CNS</td>
      <td>Matrícula</td>
      <td><strong>Histórico</strong></td>  <!-- Indica fim -->
    </tr>
  </tbody>
</table>
```

---

## 7. Testes e Validação

### 7.1 Cenários de Teste

#### Extração
- [ ] Código válido (13 dígitos)
- [ ] CPF válido (11 dígitos)
- [ ] CNPJ válido (14 dígitos)
- [ ] Múltiplos itens na fila
- [ ] Input com `name` ausente (clique não deve ser bloqueado)
- [ ] Input com máscara (valor comparado por dígitos)
- [ ] Clique observado nos logs `DEBUG[...]` (fase `clicking`)
- [ ] Paginação múltipla (>1 página)
- [ ] "Parcela no histórico" detectada
- [ ] Zero resultados (nenhum CSV é baixado)
- [ ] Pausar/Retomar durante extração
- [ ] Parar e limpar fila (sem recriar aba)

#### Download
- [ ] CSV único (comportamento legado)
- [ ] **Múltiplos CSVs** → fila única, cada um na sua pasta
- [ ] Pastas geradas com o nome dos arquivos CSV
- [ ] CSV válido com UUIDs
- [ ] Apenas PDF
- [ ] Apenas CSV
- [ ] Apenas SHP
- [ ] Combinação PDF+CSV+SHP
- [ ] Arquivo sem cabeçalho
- [ ] Linha inválida (sem ;)
- [ ] UUID não encontrado na linha

#### Map (gerar mapa)
- [ ] Pasta com CSVs válidos (WKT)
- [ ] POLYGON simples
- [ ] MULTIPOLYGON
- [ ] Subpastas recursivas
- [ ] CSV sem coluna WKT (ignorado)
- [ ] Coordenadas inválidas (filtradas)

### 7.2 Debugging
```javascript
// Console do Service Worker:
// chrome://extensions/ → "Service worker" link

// Console do Popup:
// Inspecionar popup → Console

// Logs persistidos (aba Logs da extensão):
// chrome.storage.local.get("logs")

// Linhas DEBUG[...] = passo a passo da busca na página do SIGEF:
//   DEBUG[tentativa 1 fim]: phase=clicking | hasResult=false | readyState=complete | url=...
//   DEBUG[tentativa 1 fim] #8: [09:55:41] Atributo name="id_sncr" (presente=true) ...
//   DEBUG[tentativa 1 fim] #12: [09:55:44] CLICANDO em Pesquisar agora...
// Fases possíveis: start, typing, waiting_value, waiting_name,
//   waiting_before_click, clicking, done, value_not_ok, chain_error

// Log da página (apenas enquanto a aba não navega):
// chrome.scripting.executeScript → window.__searchLog / window.__searchPhase
```

---

## 8. Limitações Conhecidas

1. **Dependência de Layout SIGEF**: Seletores CSS podem quebrar com redesign
2. **Rate Limiting**: Delays aleatórios mitigam, mas não eliminam risco
3. **Login Manual**: Extensão não automatiza login (segurança)
4. **Tamanho de Fila**: Limitado por `chrome.storage.local` (5MB)
5. **Downloads Paralelos**: Sequencial (um por vez) para evitar bloqueio
6. **WKT Parsing**: Suporta apenas POLYGON/MULTIPOLYGON simples
7. **Cálculo de Área**: Aproximado (esfera), não elipsoide oficial

---

## 9. Roadmap / Melhorias Futuras

- [ ] Suporte a Manifest V3 `offscreen documents` para downloads maiores
- [ ] Cache de busca (evitar re-busca de mesmo CPF/CNPJ)
- [ ] Exportação GeoJSON/GPX além de HTML
- [ ] Agendamento de execuções recorrentes
- [ ] Dashboard web para monitoramento remoto
- [ ] Testes automatizados (Puppeteer/Playwright)
- [ ] Internacionalização (i18n)
- [ ] Assinatura digital dos PDFs baixados

---

## 10. Referências de Código

| Funcionalidade | Arquivo | Linha Inicial |
|----------------|---------|---------------|
| Manifest/Permissões/Ícones | manifest.json | 1 |
| UI/Abas | popup.html | 1 |
| Lógica Popup | popup.js | 1 |
| Inicialização UI | popup.js | 11 |
| Configuração Intervalo | popup.js | 61 |
| Helpers Pasta de Saída | popup.js | 104 |
| Detector SW Desatualizado | popup.js | 78 |
| Iniciar Extração | popup.js | 145 |
| Iniciar Download (multi-CSV) | popup.js | 179 |
| Gerar Mapa (aba Map) | popup.js | 329 |
| Parse CSV/Mapa | popup.js | 390 |
| Parse WKT | popup.js | 439 |
| Leaflet Local (embutir) | popup.js | 475 |
| Gerar HTML Mapa | popup.js | 493 |
| Cálculo Área | popup.js | 624 |
| Service Worker | background.js | 1 |
| Sistema Logs (serializado) | background.js | 13 |
| Download Seguro | background.js | 48 |
| Intervalo Aleatório (min 3s) | background.js | 157 |
| Sanitização | background.js | 67 |
| Sanitização Nome da Pasta | background.js | 81 |
| Formatação Entrada | background.js | 103 |
| Parse UUID Linha | background.js | 112 |
| Espera Aba Carregar | background.js | 127 |
| Injeção Busca (+fases/log) | background.js | 177 |
| Extração Tabela | background.js | 411 |
| Verifica Página (DOM completo) | background.js | 544 |
| Resultado/Debug da Busca | background.js | 569 |
| Script Seguro da Aba | background.js | 601 |
| Dump DEBUG para logs | background.js | 634 |
| CSV Extração (com pasta) | background.js | 661 |
| Listeners Storage (pausa/para) | background.js | 688 |
| Listeners Runtime | background.js | 696 |
| Loop Principal (fila multi-CSV) | background.js | 733 |
| Lógica Extração | background.js | 807 |
| Lógica Download | background.js | 1140 |
| Resposta `sw_version` | background.js | 723 |
| Content Script | content.js | 1 |

---

*Documentação atualizada para a versão 2.7*
*Última atualização: outubro de 2026*