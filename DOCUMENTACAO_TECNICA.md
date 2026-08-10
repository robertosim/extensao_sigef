# Documentação Técnica - SIGEF Extractor & Downloader

## 1. Visão Geral da Arquitetura

### 1.1 Stack Tecnológica
- **Manifest Version**: 3 (Service Worker)
- **Linguagem**: JavaScript (ES2020+)
- **APIs Chrome Extension**: `chrome.downloads`, `chrome.tabs`, `chrome.scripting`, `chrome.storage`, `chrome.webNavigation`
- **Bibliotecas Externas**: Leaflet.js (CDN) para geração de mapas
- **Compatibilidade**: Google Chrome 88+, Edge 88+

### 1.2 Estrutura de Arquivos
```
Downloader/
├── manifest.json          # Configuração da extensão (permissões, metadados)
├── popup.html             # Interface do usuário (4 abas)
├── popup.js               # Lógica do popup, gerenciamento de estado, geração de mapas
├── background.js          # Service Worker - motor de automação e downloads
├── content.js             # Script injetado para simulação comportamental
├── README.md              # Documentação de usuário
├── DOCUMENTACAO_TECNICA.md # Esta documentação
└── LICENSE                # Licença do projeto
```

---

## 2. Ciclo de Vida do Software

### 2.1 Inicialização
1. **Carregamento da Extensão**: Chrome carrega `manifest.json`
2. **Service Worker Iniciado**: `background.js` registra listeners:
   - `chrome.runtime.onMessage` - Comandos do popup
   - `chrome.storage.onChanged` - Monitora pausa/parada
3. **Popup Carregado**: `popup.html` + `popup.js` inicializam UI
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

**Tipos Suportados**:
| Tipo | Formatação Aplicada | Exemplo Entrada | Exemplo Formatado |
|------|---------------------|-----------------|-------------------|
| Código | 13 dígitos, zero à esquerda | `8070100031237` | `8070100031237` |
| CPF | 11 dígitos, zero à esquerda | `84617284915` | `84617284915` |
| CNPJ | 14 dígitos, zero à esquerda | `25372342000163` | `25372342000163` |

**Função**: `formatValue(value, dataType)` em `background.js:85-92`

### 3.2 Entrada - Aba Download
**Arquivo**: CSV com separador `;`
```
Nome;UUID;...
Fazenda Santa Maria;a1b2c3d4-e5f6-7890-abcd-ef1234567890;...
Sitio Boa Vista;b2c3d4e5-f6a7-8901-bcde-f23456789012;...
```

**Validação**:
- Ignora linha de cabeçalho (`nome;`)
- Extrai UUID da coluna 2 (index 1)
- Suporta UUID completo ou path `detalhe/{uuid}`

**Função**: `parseParcelaUuidFromLine()` em `background.js:94-102`

### 3.3 Entrada - Aba Gerar Mapa
**Entrada**: Pasta (webkitdirectory) com arquivos `.csv` recursivos

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

**Função**: `parseCsvFile()` em `popup.js:278-317`

### 3.4 Saída - Arquivos Gerados

#### 3.4.1 CSV de Extração
```
"Nome";"Codigo";"Area";"Detentor";"CNS";"Matricula"
"Fazenda Santa Maria";"a1b2c3d4-e5f6-7890-abcd-ef1234567890";"123,45";"João Silva";"123456";"7890"
```

**Função**: `downloadExtractCsvBlob()` em `background.js:364-375`

#### 3.4.2 Downloads de Documentos
**Estrutura de Pastas**:
```
Downloads/
└── {CODIGO_IMOVEL_UPPER}/
    └── {NOME_PARCELA_SANITIZED}/
          ├── {NOME_PARCELA}_{UUID}_planta.pdf
          ├── {NOME_PARCELA}_{UUID}_memorial.pdf
          ├── {NOME_PARCELA}_{UUID}.csv
          └── {NOME_PARCELA}_{UUID}.zip
```

**URLs SIGEF**:
| Tipo | URL |
|------|-----|
| Planta | `https://sigef.incra.gov.br/geo/parcela/planta/{uuid}/10930/` |
| Memorial | `https://sigef.incra.gov.br/geo/parcela/memorial/{uuid}/` |
| CSV | `https://sigef.incra.gov.br/geo/exportar/parcela/csv/{uuid}/` |
| SHP | `https://sigef.incra.gov.br/geo/exportar/parcela/shp/{uuid}/` |

**Sanitização**: `sanitize()` em `background.js:56-68`
- Remove acentos (NFD)
- Capitaliza palavras (exceto preposições)
- Junta com underscore

#### 3.4.3 Mapa HTML
**Arquivo**: `{pasta_nome}.html` salvo em Downloads

**Recursos**:
- Leaflet.js v1.9.4 (CDN)
- 3 camadas Google: Híbrido, Satellite, Terreno
- Polígonos coloridos (matiz dourado para distribuição)
- Popup com: Imóvel, Link SIGEF, Área (ha)
- Legenda lateral com área total
- Cálculo de área: Shoelace + correção latitudinal

**Funções**: `generateMapHtml()` em `popup.js:353-426`, `calculateAreaHa()` em `popup.js:473-487`

---

## 4. Funcionamento Detalhado por Módulo

### 4.1 background.js - Service Worker (Motor Principal)

#### 4.1.1 Sistema de Logs
```javascript
// Níveis: info, success, warn, error
// Armazenamento: chrome.storage.local (max 500 entradas)
// Persistência: Sobrevive ao fechamento do popup
```

#### 4.1.2 Gerenciamento de Aba Extratora
- **Reutilização**: Mantém `extractorTabId` no storage
- **Recuperação**: Se aba fechada, recria automaticamente
- **Navegação**: `chrome.tabs.update()` para troca de URL
- **Timeout**: 45s para carregamento completo

#### 4.1.3 Injeção Comportamental (`injectSearchInPage`)
```javascript
// Simula comportamento humano:
// 1. Foco no campo
// 2. Digitação caractere a caractere (45-160ms/char)
// 3. Eventos: keydown, input, keyup, change
// 4. Clique no botão com cadeia de mouse events
//    mouseover → mousemove → mousedown → mouseup → click
```

#### 4.1.4 Extração de Tabela (`extractParcelasFromPage`)
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

#### 4.1.5 Download Direto (`safeDownload`)
- Usa `chrome.downloads.download()` (sem abrir aba)
- Conflito: `overwrite`
- Delay aleatório entre downloads: 500-2500ms

### 4.2 popup.js - Interface e Lógica de Mapas

#### 4.2.1 Gerenciamento de Abas (UI)
- 4 abas: Extração, Download, Gerar Mapa, Logs
- Estado sincronizado com `chrome.storage.onChanged`
- Auto-restaura última aba usada

#### 4.2.2 Geração de Mapa (Client-side)
**Pipeline**:
1. `FileReader` lê CSVs selecionados
2. `parseCsvFile()` → detecta colunas → parseia WKT
3. `parseWkt()` → POLYGON / MULTIPOLYGON → arrays `[lat, lon]`
4. `generateColors()` → matiz dourado (phi) + variação S/V
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
| `activeTab` | Verificar login na aba ativa |
| `storage` | Persistir fila, logs, estado |
| `webNavigation` | Rastrear carregamento de páginas |
| `host_permissions: sigef.incra.gov.br` | Acesso restrito ao domínio alvo |

### 5.2 Tratamento de Erros
- **Try/Catch** em todas as operações assíncronas
- **Retry Logic**: 3 tentativas por página (extração)
- **Tab Recovery**: Recriação automática de aba perdida
- **Graceful Degradation**: Continua fila mesmo com erro individual

### 5.3 Anti-Detecção
- Delays aleatórios (human-like)
- Digitação caractere a caractere
- Cadeia completa de eventos de mouse
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
- [ ] Paginação múltipla (>1 página)
- [ ] "Parcela no histórico" detectada
- [ ] Zero resultados (CSV vazio gerado)
- [ ] Pausar/Retomar durante extração
- [ ] Parar e limpar fila

#### Download
- [ ] CSV válido com UUIDs
- [ ] Apenas PDF
- [ ] Apenas CSV
- [ ] Apenas SHP
- [ ] Combinação PDF+CSV+SHP
- [ ] Arquivo sem cabeçalho
- [ ] Linha inválida (sem ;)
- [ ] UUID não encontrado na linha

#### Gerar Mapa
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

// Logs persistidos:
// chrome.storage.local.get("logs")
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
| Manifest/Permissões | manifest.json | 1 |
| UI/Abas | popup.html | 1 |
| Lógica Popup | popup.js | 1 |
| Inicialização UI | popup.js | 11 |
| Iniciar Extração | popup.js | 67 |
| Iniciar Download | popup.js | 94 |
| Gerar Mapa | popup.js | 217 |
| Parse CSV/Mapa | popup.js | 278 |
| Parse WKT | popup.js | 319 |
| Gerar HTML Mapa | popup.js | 353 |
| Cálculo Área | popup.js | 473 |
| Service Worker | background.js | 1 |
| Sistema Logs | background.js | 7 |
| Download Seguro | background.js | 37 |
| Sanitização | background.js | 56 |
| Formatação Entrada | background.js | 70 |
| Parse UUID Linha | background.js | 94 |
| Espera Aba Carregar | background.js | 109 |
| Injeção Busca | background.js | 143 |
| Extração Tabela | background.js | 192 |
| Verifica Página | background.js | 317 |
| Gerencia Aba Extratora | background.js | 335 |
| Listeners Runtime | background.js | 389 |
| Loop Principal | background.js | 432 |
| Lógica Extração | background.js | 493 |
| Lógica Download | background.js | 683 |
| Content Script | content.js | 1 |

---

*Documentação gerada automaticamente baseada no código-fonte v2.1*
*Última atualização: 2026*