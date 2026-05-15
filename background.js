/**
 * ============================================================================
 * EXTENSÃO: SIGEF EXTRACTOR & DOWNLOADER
 * ARQUIVO: background.js
 * ============================================================================
 * * DESCRIÇÃO:
 * Este é o Service Worker em segundo plano (motor principal). Ele roda isolado da interface,
 * lendo os dados armazenados em memória local, operando abas do navegador, simulando ações humanas,
 * manipulando requisições de rede para scraping e orquestrando downloads de arquivos para o disco rígido.
 */

/**
 * VARIABLE: delay
 * OBJETIVO: Helper baseado em Promises que interrompe a execução do script assíncrono.
 * Uso prático: `await delay(1000);` suspende o fluxo por 1 segundo.
 */
const delay = (ms) => new Promise(res => setTimeout(res, ms));

/**
 * CONSTANT: PARCELAS_URL
 * OBJETIVO: Endpoint oficial de consulta pública de parcelas georreferenciadas do SIGEF INCRA.
 */
const PARCELAS_URL = "https://sigef.incra.gov.br/consultar/parcelas";

/**
 * FUNCTION: sanitize(text)
 * OBJETIVO: Limpa strings complexas removendo acentos, espaços e pontuações para geração de caminhos de arquivos válidos.
 * RETORNO: String padronizada em caixa baixa unida por sublinhados (ex: "nome_do_imovel").
 */
function sanitize(text) {
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
}

/**
 * FUNCTION: parseParcelaUuidFromCodigoField(codigoField)
 * OBJETIVO: Extrai com REGEX o ID identificador universal (UUID de 36 caracteres) da parcela.
 * Suporta a leitura direta do UUID puro ou extrai de dentro de URLs complexas do SIGEF.
 */
function parseParcelaUuidFromCodigoField(codigoField) {
    const raw = String(codigoField || "").trim().replace(/['"]+/g, "");
    if (!raw) return null;
    
    // Tenta encontrar o padrão de UUID dentro de um link web estruturado
    const fromPath = raw.match(/detalhe\/([a-f0-9-]{36})/i)?.[1];
    if (fromPath) return fromPath;
    
    // Valida se o formato do campo já é o UUID puro estruturado (8-4-4-4-12)
    const plain = raw.match(/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i)?.[1];
    return plain || null;
}

/**
 * FUNCTION: waitTabComplete(tabId, timeoutMs)
 * OBJETIVO: Suspende o código até que a aba informada atinja o status "complete" de carregamento do Chrome.
 * PROTEÇÃO: Inclui um temporizador interno de descarte (timeout) para evitar travamentos em páginas instáveis.
 */
function waitTabComplete(tabId, timeoutMs = 45000) {
    return new Promise((resolve) => {
        let finished = false;
        
        // Função interna de limpeza de listeners para evitar vazamento de escuta no navegador
        const cleanup = () => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            try {
                chrome.tabs.onUpdated.removeListener(listener);
            } catch (_) {}
        };
        const done = () => {
            cleanup();
            resolve(); // Libera o encadeamento assíncrono
        };
        
        // Dispara um alerta de timeout caso a página do INCRA congele
        const timer = setTimeout(() => {
            console.warn(`waitTabComplete(${tabId}): timeout atingido. Prosseguindo fluxo.`);
            done();
        }, timeoutMs);
        
        // Monitora as atualizações de estado do ciclo de vida da aba do Chrome
        const listener = (updatedTabId, info) => {
            if (updatedTabId === tabId && info.status === "complete") done();
        };
        
        chrome.tabs.onUpdated.addListener(listener);
        
        // Verificação preventiva imediata caso a aba já tenha completado o carregamento antes do listener ligar
        chrome.tabs.get(tabId).then((tab) => {
            if (tab.status === "complete") done();
        }).catch(() => done());
    });
}

/**
 * FUNCTION: isNoTabError(err)
 * OBJETIVO: Analisa mensagens de erro lançadas pelas APIs nativas do Chrome.
 * RETORNO: Booleano indicando se o erro foi decorrente de uma aba fechada manualmente pelo usuário.
 */
function isNoTabError(err) {
    const m = err?.message || String(err);
    return m.includes("No tab with id") || m.includes("Tab not found") || m.includes("closed");
}

/**
 * FUNCTION: injectParcelasSearchInPage(cod)
 * EXECUTADO EM: Contexto interno da página da web do SIGEF (Injeção de Script).
 * OBJETIVO: Simula a digitação de um código no input de pesquisa e despacha eventos de clique reais (MouseEvents).
 */
async function injectParcelasSearchInPage(cod) {
    // Auxiliares internos para gerar variações matemáticas em milissegundos imitando humanos
    const rnd = (a, b) => a + Math.random() * (b - a);
    const sleep = (min, max) => new Promise(r => setTimeout(r, max != null ? rnd(min, max) : min));

    // Despacha uma sequência completa de gatilhos nativos de mouse em coordenadas flutuantes centrais do elemento
    function dispatchMouseChain(el) {
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2 + rnd(-4, 4);
        const y = r.top + r.height / 2 + rnd(-3, 3);
        const base = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 };
        el.dispatchEvent(new MouseEvent("mouseover", base));
        el.dispatchEvent(new MouseEvent("mousemove", base));
        el.dispatchEvent(new MouseEvent("mousedown", base));
        el.dispatchEvent(new MouseEvent("mouseup", base));
        el.dispatchEvent(new MouseEvent("click", base));
    }

    // Digita o texto dividindo a string caractere por caractere com atrasos variados entre as teclas
    async function humanType(el, text) {
        el.focus();
        el.value = "";
        el.dispatchEvent(new Event("input", { bubbles: true }));
        await sleep(80, 220);
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            el.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true }));
            el.value += ch;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent("keyup", { key: ch, bubbles: true }));
            await sleep(45, 160); // Cadência de digitação irregular simulada
        }
        el.dispatchEvent(new Event("change", { bubbles: true }));
        await sleep(120, 350);
    }

    // Localiza os campos estruturais contidos na interface nativa do SIGEF
    const input = document.getElementById("id_sncr");
    const btn = document.querySelector("#pesquisaForm button[type=\"submit\"]")
        || document.querySelector("button[value=\"Pesquisar\"]");
    
    if (input && btn) {
        await humanType(input, String(cod)); // Executa a digitação artificial humana no SNCR
        dispatchMouseChain(btn);            // Clica no botão de envio da consulta
    }
}

/**
 * FUNCTION: safeExtractorScript(tabRef, codigoImovel, func, args)
 * OBJETIVO: Executa injeções de script de forma resiliente tolerando erros críticos de barramento e frames.
 * SOLUÇÃO DE BUG: Captura e mitiga o erro "Error: Frame with ID 0 was removed" forçando reabertura automática da aba.
 */
async function safeExtractorScript(tabRef, codigoImovel, func, args) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            // Pequena pausa estratégica protetora para estabilização de contextos internos de frames do Chrome
            await delay(400); 
            await chrome.tabs.get(tabRef.id); // Confere se a aba existe fisicamente antes de injetar
            
            // Dispara a execução via API nativa de Scripting
            return await chrome.scripting.executeScript({
                target: { tabId: tabRef.id },
                func,
                args
            });
        } catch (err) {
            const errMsg = err?.message || String(err);
            
            // Se cair no erro de descarte de frame (ID 0) ou se a aba sumiu, reconstrói o escopo
            if (isNoTabError(err) || errMsg.includes("Frame with ID 0")) {
                console.warn(`safeExtractorScript: Contexto de frame instável detectado (Tentativa ${attempt + 1}). Recuperando...`);
                await chrome.storage.local.set({ extractorTabId: null });
                try {
                    await chrome.tabs.remove(tabRef.id); // Força encerramento da aba corrompida
                } catch (_) {}
                
                // Cria uma aba novinha em folha restabelecendo o fluxo operacional
                const t = await chrome.tabs.create({ url: PARCELAS_URL, active: true });
                tabRef.id = t.id;
                await chrome.storage.local.set({ extractorTabId: t.id });
                await waitTabComplete(t.id);
                await delay(2500); // Margem de segurança de renderização inicial do DOM
                
                // Se a função com falha não for a própria busca principal, refaz a busca antes de retornar ao laço
                if (func !== injectParcelasSearchInPage) {
                    await chrome.scripting.executeScript({
                        target: { tabId: tabRef.id },
                        func: injectParcelasSearchInPage,
                        args: [codigoImovel]
                    });
                    await delay(2000);
                }
            } else {
                throw err; // Repassa adiante caso seja um erro desconhecido
            }
        }
    }
    throw new Error("Extração: Não foi possível estabilizar a execução do script nos frames.");
}

/** FUNCTION: disposeExtractorTab() -> Destrói e limpa ponteiros da aba de raspagem */
async function disposeExtractorTab() {
    const { extractorTabId } = await chrome.storage.local.get(["extractorTabId"]);
    if (!extractorTabId) return;
    try {
        await chrome.tabs.remove(extractorTabId);
    } catch (_) {}
    await chrome.storage.local.set({ extractorTabId: null });
}

/** FUNCTION: disposeDownloadTab() -> Destrói e limpa ponteiros da aba de downloads em lote */
async function disposeDownloadTab() {
    const { downloadTabId } = await chrome.storage.local.get(["downloadTabId"]);
    if (!downloadTabId) return;
    try {
        await chrome.tabs.remove(downloadTabId);
    } catch (_) {}
    await chrome.storage.local.set({ downloadTabId: null });
}

/** FUNCTION: randomDelayMs(min, max) -> Retorna um número pseudo-aleatório no range fornecido */
function randomDelayMs(minMs, maxMs) {
    return Math.floor(minMs + Math.random() * (maxMs - minMs + 1));
}

/**
 * STORAGE LISTENER: Ouve modificações em tempo real no storage.
 * Se o usuário clicar em "Pausar", este listener identifica e derruba preventivamente as abas ativas.
 */
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.isPaused?.newValue !== true) return;
    void chrome.storage.local.get("mode").then(({ mode }) => {
        if (mode === "extract") disposeExtractorTab();
        if (mode === "download") disposeDownloadTab();
    });
});

/**
 * RUNTIME MESSAGE LISTENER: Escuta os comandos enviados do painel popup.js.
 */
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "start_processing") {
        processQueue(); // Aciona o motor principal de consumo de fila
    } else if (msg.action === "stop_processing") {
        // Encerra abas abertas e zera por completo as variáveis de estado de processamento
        void (async () => {
            await disposeExtractorTab();
            await disposeDownloadTab();
            await chrome.storage.local.set({
                isProcessing: false,
                isPaused: false,
                queue: [],
                currentIndex: 0,
                statusDetail: ""
            });
        })();
    }
    return true;
});

/**
 * FUNCTION: processQueue()
 * OBJETIVO: Consome a fila sequencialmente item por item. Ele avalia se está pausado antes de avançar.
 */
async function processQueue() {
    let { queue, currentIndex, mode, codigoImovelGlobal } = await chrome.storage.local.get([
        "queue", "currentIndex", "mode", "codigoImovelGlobal"
    ]);

    while (currentIndex < queue.length) {
        // Checa se houve ordens de pausa ou cancelamento neste ciclo de loop
        const status = await chrome.storage.local.get(["isPaused", "isProcessing"]);
        if (status.isPaused || !status.isProcessing) break;

        let currentLine = queue[currentIndex].trim();
        const primeiraCol = currentLine.split(";")[0].trim();
        
        // Define strings informativas customizadas baseadas no modo de operação ativo
        const statusDetail = mode === "extract"
            ? `Extraindo dados do código ${primeiraCol || currentLine}`
            : `Fazendo download do arquivo ${primeiraCol || currentLine}`;
        
        await chrome.storage.local.set({
            currentParcelaNome: primeiraCol,
            currentIndex: currentIndex,
            statusDetail
        });

        try {
            // Escolhe e dispara a esteira lógica correta definida na inicialização do painel
            if (mode === "download") {
                const isLastDl = currentIndex + 1 >= queue.length;
                await executeDownloadLogic(currentLine, codigoImovelGlobal, { closeTabWhenDone: isLastDl });
            } else {
                const isLast = currentIndex + 1 >= queue.length;
                await executeExtractorLogic(currentLine, { closeTabWhenDone: isLast });
            }

            currentIndex++;
            await chrome.storage.local.set({ currentIndex: currentIndex });
            await delay(1200); // Descanso curto para mitigar sobrecarga de rede local
        } catch (err) {
            console.error("Erro no processamento do item:", currentLine, err);
            currentIndex++; // Em caso de falha irreversível em um item, avança o ponteiro para não travar o lote
            await chrome.storage.local.set({ currentIndex: currentIndex });
        }
    }

    // Se o ponteiro alcançou ou ultrapassou o tamanho total da fila, finaliza a execução com sucesso
    if (currentIndex >= (queue?.length || 0)) {
        await chrome.storage.local.set({
            isProcessing: false,
            currentParcelaNome: "Concluído!",
            statusDetail: ""
        });
    }
}

/**
 * FUNCTION: executeDownloadLogic(line, folderName, options)
 * OBJETIVO: Manipula a rotina de downloads para cada parcela específica encontrada.
 */
async function executeDownloadLogic(line, folderName, options = {}) {
    const { closeTabWhenDone } = options;
    const parts = line.split(";");
    if (parts.length < 2) return;
    
    const nomeParcela = parts[0].trim();
    const uuid = parseParcelaUuidFromCodigoField(parts[1]); // Extrai o ID limpo da parcela
    if (!uuid) {
        console.warn("Download: coluna Codigo sem UUID identificável:", line);
        return;
    }

    const nomeLimpo = sanitize(nomeParcela);
    const detailUrl = `https://sigef.incra.gov.br/geo/parcela/detalhe/${uuid}/`;

    const { downloadTabId: savedDl } = await chrome.storage.local.get(["downloadTabId"]);
    let tabId = savedDl;

    if (tabId) {
        try {
            await chrome.tabs.get(tabId);
        } catch (_) {
            tabId = null;
        }
    }

    // Cria ou atualiza a aba ativa direcionando para os metadados específicos da parcela selecionada
    if (!tabId) {
        const created = await chrome.tabs.create({ url: detailUrl, active: true });
        tabId = created.id;
        await chrome.storage.local.set({ downloadTabId: tabId });
        await waitTabComplete(tabId);
    } else {
        await chrome.tabs.update(tabId, { url: detailUrl });
        await waitTabComplete(tabId);
    }

    await delay(randomDelayMs(1500, 3000)); // Tempo randômico simulando leitura de tela humana

    // Estrutura hierárquica de pastas organizada localmente: pasta_base_csv / nome_da_parcela_id / arquivos...
    const baseFolder = `${folderName}/${nomeLimpo}_${uuid}`;
    const setDlStatus = (arquivo) => chrome.storage.local.set({
        statusDetail: `Fazendo download do arquivo ${arquivo}`
    });

    // 1. Download do PDF da Planta
    await setDlStatus(`planta_${nomeLimpo}.pdf`);
    await chrome.downloads.download({
        url: `https://sigef.incra.gov.br/geo/parcela/planta/${uuid}/10930/`,
        filename: `${baseFolder}/planta_${nomeLimpo}.pdf`
    });

    await delay(randomDelayMs(1500, 3000));

    // 2. Download do PDF do Memorial Descritivo
    await setDlStatus(`memorial_${nomeLimpo}.pdf`);
    await chrome.downloads.download({
        url: `https://sigef.incra.gov.br/geo/parcela/memorial/${uuid}/`,
        filename: `${baseFolder}/memorial_${nomeLimpo}.pdf`
    });

    // 3. Downloads iterativos dos pacotes shapefile (.zip) vinculados à parcela no INCRA
    const shpExports = [
        { slug: "parcela", label: `${uuid}_parcela.zip` },
        { slug: "vertice", label: `${uuid}_vertice.zip` },
        { slug: "limite", label: `${uuid}_limite.zip` }
    ];
    for (const { slug, label } of shpExports) {
        await setDlStatus(label);
        await chrome.downloads.download({
            url: `https://sigef.incra.gov.br/geo/exportar/${slug}/shp/${uuid}/`,
            filename: `${baseFolder}/${label}`
        });
        await delay(randomDelayMs(800, 1800)); // Pequena folga protetora entre downloads contínuos
    }

    if (closeTabWhenDone) {
        await disposeDownloadTab();
    }
}

/**
 * FUNCTION: downloadExtractCsvBlob(codigoImovel, csvContent)
 * OBJETIVO: Empacota strings brutas raspadas em um arquivo Blob e executa o download físico do CSV estruturado.
 */
async function downloadExtractCsvBlob(codigoImovel, csvContent) {
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob); // Converte para DataURL codificado em Base64
    });
    
    // Solicita ao gerenciador de downloads do Chrome que salve o relatório gerado
    await chrome.downloads.download({
        url: base64,
        filename: `${codigoImovel}.csv`
    });
    await delay(1000);
}

/**
 * FUNCTION: executeExtractorLogic(codigoImovel, options)
 * OBJETIVO: Controla a varredura (Scraping) das tabelas públicas de resultados.
 */
async function executeExtractorLogic(codigoImovel, options = {}) {
    const { closeTabWhenDone } = options;
    console.log(`Iniciando extração para: ${codigoImovel}`);

    const { extractorTabId: savedId } = await chrome.storage.local.get(["extractorTabId"]);
    const tabRef = { id: savedId || null };

    if (tabRef.id) {
        try {
            await chrome.tabs.get(tabRef.id);
        } catch (_) {
            tabRef.id = null;
        }
    }

    if (!tabRef.id) {
        const t = await chrome.tabs.create({ url: PARCELAS_URL, active: true });
        tabRef.id = t.id;
        await chrome.storage.local.set({ extractorTabId: tabRef.id });
        await waitTabComplete(tabRef.id);
    } else {
        try {
            await chrome.tabs.update(tabRef.id, { url: PARCELAS_URL });
            await waitTabComplete(tabRef.id);
        } catch (err) {
            if (!isNoTabError(err)) throw err;
            await chrome.storage.local.set({ extractorTabId: null });
            const t = await chrome.tabs.create({ url: PARCELAS_URL, active: true });
            tabRef.id = t.id;
            await chrome.storage.local.set({ extractorTabId: tabRef.id });
            await waitTabComplete(tabRef.id);
        }
    }

    await delay(2500); // Aguarda estabilização do DOM
    // Dispara preenchimento automatizado no painel do SIGEF com tratamento anti-frame-drop
    await safeExtractorScript(tabRef, codigoImovel, injectParcelasSearchInPage, [codigoImovel]);

    let allExtractedData = [];
    let hasNext = true;

    // INJECTED SCRIPT FUNCTION: Valida se a tabela populou ou se a mensagem de termo nulo apareceu
    const checkFunc = () => {
        if (document.readyState === "loading") return false;
        const tableRows = document.querySelectorAll(
            "table.table-hover tbody tr, table.table-striped tbody tr, table.table tbody tr"
        );
        return tableRows.length > 0 || /\bTotal:\s*0\b/i.test(document.querySelector("h4")?.innerText || "") || /\bResultados:\s*0\b/i.test(document.querySelector("h3")?.innerText || "");
    };

    // INJECTED SCRIPT FUNCTION: Raspa as colunas estruturais e lê referências de links para paginação avançada
    const extractPageFunc = () => {
        if (document.readyState === "loading") {
            return { data: [], next: false, zeroResults: false, nextHref: null };
        }
        const h4Text = document.querySelector("h4")?.innerText || "";
        const h3Text = document.querySelector("h3")?.innerText || "";
        
        // Retorna flags específicas se o imóvel possuir 0 parcelas mapeadas
        if (/\bTotal:\s*0\b/i.test(h4Text) || /\bResultados:\s*0\b/i.test(h3Text)) {
            return { data: [], next: false, zeroResults: true, nextHref: null };
        }

        const rows = Array.from(document.querySelectorAll(
            "table.table-hover tbody tr, table.table-striped tbody tr, table.table tbody tr"
        ));
        const pageData = [];
        let stop = false;

        for (const row of rows) {
            const tds = row.querySelectorAll("td");
            if (tds.length < 5) continue;

            // Bloqueio preventivo: Se colidir com registros de histórico de retificação descontinuados, cessa a busca
            if (tds[tds.length - 1].innerText.toLowerCase().includes("histórico")) {
                stop = true;
                break;
            }

            const link = tds[0].querySelector("a")?.href || "";
            const uuid = link.match(/detalhe\/([a-f0-9\-]+)/i)?.[1] || "";

            pageData.push({
                nome: tds[0].innerText.trim(),
                codigo: uuid,
                area: tds[1].innerText.trim(),
                detentor: tds[2].innerText.trim(),
                cns: tds[3].innerText.trim(),
                matricula: tds[4].innerText.trim()
            });
        }

        // Verifica existência de paginação ativa (Botão Próximo / Next)
        const nextLi = document.querySelector(".pagination li.next");
        const nextA = nextLi && !nextLi.classList.contains("disabled") ? nextLi.querySelector("a[href*=\"page=\"]") : null;

        if (nextA && !stop) {
            return { data: pageData, next: true, zeroResults: false, nextHref: (nextA.href || "").trim() };
        }
        return { data: pageData, next: false, zeroResults: false, nextHref: null };
    };

    // Define o cabeçalho padrão com marcador BOM (\ufeff) para compatibilização direta de acentuação no Excel brasileiro
    const csvHeader = "\ufeffNome;Codigo;Area;Detentor;CNS;Matricula\n";
    let searchHadZeroResults = false;

    // Laço contínuo que percorre as subpáginas de dados (Paginação)
    while (hasNext) {
        let loaded = false;
        for (let i = 0; i < 45; i++) {
            const check = await safeExtractorScript(tabRef, codigoImovel, checkFunc, []);
            if (check[0]?.result) {
                loaded = true;
                break;
            }
            await delay(1000);
        }

        if (!loaded) break;

        const result = await safeExtractorScript(tabRef, codigoImovel, extractPageFunc, []);
        const res = result[0].result;
        if (res && res.zeroResults) searchHadZeroResults = true;
        if (res.data.length > 0) allExtractedData = allExtractedData.concat(res.data);
        hasNext = res.next;

        // Se houver próxima página válida nas tags, atualiza a aba navegando até o link correspondente
        if (hasNext && res.nextHref) {
            try {
                await chrome.tabs.update(tabRef.id, { url: res.nextHref });
            } catch (err) {
                if (!isNoTabError(err)) throw err;
                await chrome.storage.local.set({ extractorTabId: null });
                try {
                    await chrome.tabs.remove(tabRef.id);
                } catch (_) {}
                const t = await chrome.tabs.create({ url: res.nextHref, active: true });
                tabRef.id = t.id;
                await chrome.storage.local.set({ extractorTabId: tabRef.id });
            }
            await waitTabComplete(tabRef.id, 40000);
            await delay(randomDelayMs(800, 1600));
        }
    }

    // Consolidação final, filtragem de registros clonados/duplicados e escrita de arquivos
    if (allExtractedData.length > 0) {
        const seen = new Set();
        const deduped = [];
        for (const d of allExtractedData) {
            const k = (d.codigo || "").trim() || `${d.nome}|${d.cns}|${d.matricula}`;
            if (seen.has(k)) continue;
            seen.add(k);
            deduped.push(d); // Mantém somente registros exclusivos na memória
        }

        const csvContent = csvHeader + deduped.map(d => `${d.nome};${d.codigo};${d.area};${d.detentor};${d.cns};${d.matricula}`).join("\n");
        await downloadExtractCsvBlob(codigoImovel, csvContent); // Executa o download físico do relatório compilado
    } else if (searchHadZeroResults) {
        await downloadExtractCsvBlob(codigoImovel, csvHeader); // Salva arquivo vazio contendo apenas cabeçalho
    }

    if (closeTabWhenDone) {
        await disposeExtractorTab(); // Fecha a aba controlada de forma limpa na última rodada do loop
    }
}