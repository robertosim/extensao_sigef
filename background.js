const delay = (ms) => new Promise(res => setTimeout(res, ms));

const PARCELAS_URL = "https://sigef.incra.gov.br/consultar/parcelas";

const MAX_LOGS = 500;

async function appendLog(type, msg) {
    const timestamp = new Date().toLocaleString('pt-BR');
    const entry = { timestamp, type, msg };
    const { logs = [] } = await chrome.storage.local.get(["logs"]);
    logs.push(entry);
    if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
    await chrome.storage.local.set({ logs });
}

function log(msg) {
    console.log(`[SIGEF Downloader] ${msg}`);
    appendLog('info', msg);
}

function logError(msg, err) {
    const detail = err ? (err.message || String(err)) : '';
    console.error(`[SIGEF Downloader] ${msg}`, err);
    appendLog('error', `${msg}${detail ? ' - ' + detail : ''}`);
}

function logSuccess(msg) {
    console.log(`[SIGEF Downloader] ${msg}`);
    appendLog('success', msg);
}

function logWarn(msg) {
    console.warn(`[SIGEF Downloader] ${msg}`);
    appendLog('warn', msg);
}

async function safeDownload(options) {
    return new Promise((resolve, reject) => {
        chrome.downloads.download(options, (downloadId) => {
            if (chrome.runtime.lastError) {
                logError(`Download erro: ${chrome.runtime.lastError.message}`, options);
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                log(`Download iniciado ID: ${downloadId} -> ${options.filename}`);
                resolve(downloadId);
            }
        });
    });
}

const PREPOSICOES = new Set([
    'de', 'da', 'do', 'das', 'dos', 'a', 'o', 'as', 'os',
    'em', 'por', 'para', 'com', 'sem', 'ao', 'aos', 'à', 'às'
]);

function sanitize(text) {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .split(/\s+/)
        .filter(w => w.length > 0)
        .map((word, i) => {
            const lower = word.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!lower) return '';
            if (i > 0 && PREPOSICOES.has(lower)) return lower;
            return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .filter(w => w.length > 0)
        .join('_');
}

function formatCodigo(value) {
    const digits = value.replace(/\D/g, '');
    return digits.padStart(13, '0');
}

function formatCpf(value) {
    const digits = value.replace(/\D/g, '');
    return digits.padStart(11, '0');
}

function formatCnpj(value) {
    const digits = value.replace(/\D/g, '');
    return digits.padStart(14, '0');
}

function formatValue(value, dataType) {
    switch (dataType) {
        case 'codigo': return formatCodigo(value);
        case 'cpf': return formatCpf(value);
        case 'cnpj': return formatCnpj(value);
        default: return value;
    }
}

function parseParcelaUuidFromLine(line) {
    const parts = line.split(';');
    if (parts.length < 2) return null;
    const raw = parts[1].trim().replace(/['"]+/g, '');
    const fromPath = raw.match(/detalhe\/([a-f0-9\-]{36})/i)?.[1];
    if (fromPath) return fromPath;
    const plain = raw.match(/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i)?.[1];
    return plain || null;
}

function getParcelaNomeFromLine(line) {
    const parts = line.split(';');
    return parts[0].trim();
}

function waitTabComplete(tabId, timeoutMs = 45000) {
    return new Promise((resolve) => {
        let finished = false;
        const cleanup = () => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            try { chrome.tabs.onUpdated.removeListener(listener); } catch (_) {}
        };
        const done = () => { cleanup(); resolve(); };
        const timer = setTimeout(() => done(), timeoutMs);
        const listener = (updatedTabId, info) => {
            if (updatedTabId === tabId && info.status === "complete") done();
        };
        chrome.tabs.onUpdated.addListener(listener);
        chrome.tabs.get(tabId).then((tab) => {
            if (tab.status === "complete") done();
        }).catch(() => done());
    });
}

function isNoTabError(err) {
    const m = err?.message || String(err);
    return m.includes("No tab with id") || m.includes("Tab not found");
}

function randomDelayMs(minMs, maxMs) {
    return Math.floor(minMs + Math.random() * (maxMs - minMs + 1));
}

/* ===========================
   INJECAO NA PAGINA DE BUSCA
   =========================== */

function injectSearchInPage(dataType, formattedValue) {
    const rnd = (a, b) => a + Math.random() * (b - a);
    const sleep = (min, max) => new Promise(r => setTimeout(r, max != null ? rnd(min, max) : min));

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
            await sleep(45, 160);
        }
        el.dispatchEvent(new Event("change", { bubbles: true }));
        await sleep(120, 350);
    }

    const fieldId = (dataType === 'cpf' || dataType === 'cnpj') ? 'id_cpf_cnpj' : 'id_sncr';
    const input = document.getElementById(fieldId);
    const btn = document.querySelector("#pesquisaForm button[type=\"submit\"]")
        || document.querySelector("button[value=\"Pesquisar\"]");

    if (input && btn) {
        humanType(input, formattedValue).then(() => {
            dispatchMouseChain(btn);
        });
    }
}

/* ===========================
   EXTRACAO DE TABELA
   =========================== */

function extractParcelasFromPage() {
    const rows = Array.from(document.querySelectorAll(
        "table.table-hover tbody tr, table.table-striped tbody tr, table.table tbody tr"
    ));
    const data = [];
    let foundHistorico = false;

    for (const row of rows) {
        const tds = row.querySelectorAll("td");
        if (tds.length < 5) continue;

        const firstCellText = tds[0].innerText.trim();
        const lastCell = tds[tds.length - 1];
        const lastCellText = lastCell.innerText.toLowerCase();
        const hasStrong = !!lastCell.querySelector("strong");
        const hasHistorico = lastCellText.includes("histórico");

        if (hasStrong && hasHistorico) {
            console.log('[SIGEF Downloader] "Parcela encontrada no histórico" detectada - parando paginação');
            const link = tds[0].querySelector("a")?.href || "";
            const uuid = link.match(/detalhe\/([a-f0-9\-]+)/i)?.[1] || "";
            const areaTd = tds[1];
            let area = areaTd.textContent.replace(/\s+/g, "").trim().replace(/[^0-9,\.]/g, "");
            data.push({
                nome: firstCellText,
                codigo: uuid,
                area: area,
                detentor: tds[2].innerText.trim(),
                cns: tds[3].innerText.trim(),
                matricula: tds[4].innerText.trim()
            });
            foundHistorico = true;
            break;
        }

        const link = tds[0].querySelector("a")?.href || "";
        const uuid = link.match(/detalhe\/([a-f0-9\-]+)/i)?.[1] || "";

        const areaTd = tds[1];
        let area = "";
        const areaLinks = areaTd.querySelectorAll("a");
        if (areaLinks.length > 0) {
            const parts = [];
            areaLinks.forEach(a => {
                const raw = a.textContent;
                const t = raw.replace(/\s+/g, "").trim();
                if (t) parts.push(t);
            });
            area = parts.join(",");
        }
        if (!area) {
            area = areaTd.textContent.replace(/\s+/g, "").trim();
        }
        area = area.replace(/[^0-9,\.]/g, "");

        data.push({
            nome: firstCellText,
            codigo: uuid,
            area: area,
            detentor: tds[2].innerText.trim(),
            cns: tds[3].innerText.trim(),
            matricula: tds[4].innerText.trim()
        });
    }

    if (foundHistorico) {
        return { data, next: false, nextHref: null, foundHistorico: true };
    }

    let nextHref = null;

    const nextLi = document.querySelector(".pagination li.next");
    if (nextLi && !nextLi.classList.contains("disabled")) {
        const nextA = nextLi.querySelector("a[href]");
        if (nextA && nextA.href) {
            nextHref = nextA.href;
        }
    }

    if (!nextHref) {
        const activePage = document.querySelector(".pagination li.active");
        if (activePage) {
            const activeLink = activePage.querySelector("a");
            const currentPageNum = activeLink ? parseInt(activeLink.textContent.trim(), 10) : 0;
            const allLinks = document.querySelectorAll(".pagination ul li a[href*=\"page=\"]");
            for (const a of allLinks) {
                const pageNum = parseInt(a.textContent.trim(), 10);
                if (pageNum === currentPageNum + 1) {
                    nextHref = a.href;
                    break;
                }
            }
        }
    }

    if (!nextHref) {
        const allLinks = document.querySelectorAll(".pagination a[href*=\"page=\"]");
        let maxPage = 0;
        for (const a of allLinks) {
            const match = a.href.match(/page=(\d+)/);
            if (match) {
                const p = parseInt(match[1], 10);
                if (p > maxPage) maxPage = p;
            }
        }
        if (maxPage > 0) {
            const currentUrl = new URL(window.location.href);
            const currentPage = parseInt(currentUrl.searchParams.get("page") || "1", 10);
            if (maxPage > currentPage) {
                currentUrl.searchParams.set("page", maxPage.toString());
                nextHref = currentUrl.toString();
            }
        }
    }

    if (!nextHref) {
        const nextLink = document.querySelector(".pagination li.next a");
        if (nextLink && nextLink.getAttribute("href")) {
            nextHref = nextLink.href;
        }
    }

    return { data, next: !!nextHref, nextHref };
}

function checkPageLoaded() {
    if (document.readyState === "loading") return false;
    const tableRows = document.querySelectorAll(
        "table.table-hover tbody tr, table.table-striped tbody tr, table.table tbody tr"
    );
    const h4 = document.querySelector("h4")?.innerText || "";
    const h3 = document.querySelector("h3")?.innerText || "";
    const noResults = /\bTotal:\s*0\b/i.test(h4)
        || /\bResultados:\s*0\b/i.test(h3)
        || /\bTotal:\s*0\b/i.test(h3);
    const hasPagination = !!document.querySelector(".pagination");
    return tableRows.length > 0 || noResults || hasPagination;
}

/* ===========================
   GERENCIAMENTO DE ABAS
   =========================== */

async function safeExtractorScript(tabRef, dataType, formattedValue, func, args) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            await chrome.tabs.get(tabRef.id);
            return await chrome.scripting.executeScript({
                target: { tabId: tabRef.id },
                func,
                args
            });
        } catch (err) {
            if (!isNoTabError(err)) throw err;
            logWarn(`Tentativa ${attempt + 1}: Aba invalida, recriando...`);
            try { await chrome.tabs.remove(tabRef.id); } catch (_) {}
            const t = await chrome.tabs.create({ url: PARCELAS_URL, active: true });
            tabRef.id = t.id;
            await chrome.storage.local.set({ extractorTabId: t.id });
            await waitTabComplete(t.id);
            await delay(2000);
            await chrome.scripting.executeScript({
                target: { tabId: tabRef.id },
                func: injectSearchInPage,
                args: [dataType, formattedValue]
            });
            await delay(1500);
        }
    }
    throw new Error("Nao foi possivel usar a aba apos recriar.");
}

async function downloadExtractCsvBlob(folderName, csvContent) {
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
    log(`Baixando CSV extraido: ${folderName}.csv`);
    await safeDownload({ url: base64, filename: `${folderName}.csv` });
    await delay(500);
}

async function disposeExtractorTab() {
    const { extractorTabId } = await chrome.storage.local.get(["extractorTabId"]);
    if (!extractorTabId) return;
    log('Fechando aba de extracao');
    try { await chrome.tabs.remove(extractorTabId); } catch (_) {}
    await chrome.storage.local.set({ extractorTabId: null });
}

/* ===========================
   LISTENERS
   =========================== */

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.isPaused?.newValue !== true) return;
    void chrome.storage.local.get("mode").then(({ mode }) => {
        if (mode === "extract") disposeExtractorTab();
    });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "start_processing" || msg.action === "resume_processing") {
        log(`Acao recebida: ${msg.action}`);
        chrome.storage.local.set({ isPaused: false, isProcessing: true });
        processQueue();
    } else if (msg.action === "pause_processing") {
        log('Processo pausado pelo usuario');
        chrome.storage.local.set({ isPaused: true });
    } else if (msg.action === "stop_processing") {
        log('Processo parado pelo usuario');
        void (async () => {
            await disposeExtractorTab();
            await chrome.storage.local.set({
                isProcessing: false, isPaused: false,
                queue: [], currentIndex: 0, statusDetail: ""
            });
        })();
    } else if (msg.action === "get_logs") {
        chrome.storage.local.get(["logs"]).then(({ logs }) => {
            sendResponse({ logs: logs || [] });
        });
        return true;
    } else if (msg.action === "clear_logs") {
        chrome.storage.local.set({ logs: [] }).then(() => {
            sendResponse({ ok: true });
        });
        return true;
    }
    return true;
});

/* ===========================
   LOOP PRINCIPAL
   =========================== */

async function processQueue() {
    let { queue, currentIndex, mode, dataType, codigoImovel, downloadTypes } = await chrome.storage.local.get([
        "queue", "currentIndex", "mode", "dataType", "codigoImovel", "downloadTypes"
    ]);

    log(`Iniciando processQueue: mode=${mode}, dataType=${dataType}, types=${downloadTypes}, total=${queue.length}, start=${currentIndex}`);

    while (currentIndex < queue.length) {
        const status = await chrome.storage.local.get(["isPaused", "isProcessing"]);
        if (status.isPaused || !status.isProcessing) {
            log(`Processo pausado ou parado no index ${currentIndex}`);
            break;
        }

        const currentLine = queue[currentIndex].trim();
        const formatted = formatValue(currentLine, dataType);
        const nomeParcela = currentLine.split(';')[0] || currentLine;

        const statusLabel = mode === 'extract'
            ? `Extraindo: ${currentLine}`
            : `Baixando: ${nomeParcela}`;
        await chrome.storage.local.set({
            currentParcelaNome: nomeParcela,
            currentIndex: currentIndex,
            statusDetail: statusLabel
        });

        log(`[${currentIndex + 1}/${queue.length}] Processando: ${nomeParcela}`);

        try {
            if (mode === 'extract') {
                await executeExtractorLogic(currentLine, formatted, currentLine.trim(), dataType);
            } else if (mode === 'download') {
                await executeDownloadLogic(currentLine, codigoImovel, downloadTypes);
            }

            logSuccess(`[${currentIndex + 1}/${queue.length}] Concluido: ${nomeParcela}`);
            currentIndex++;
            await chrome.storage.local.set({ currentIndex: currentIndex });
            await delay(1000);
        } catch (err) {
            logError(`[${currentIndex + 1}/${queue.length}] Erro no processamento: ${nomeParcela}`, err);
            currentIndex++;
            await chrome.storage.local.set({ currentIndex: currentIndex });
        }
    }

    if (currentIndex >= (queue?.length || 0)) {
        logSuccess('Processamento finalizado!');
        await chrome.storage.local.set({
            isProcessing: false,
            currentParcelaNome: "Concluido!",
            statusDetail: ""
        });
    }
}

/* ===========================
   MODO: EXTRAIR DADOS
   =========================== */

async function executeExtractorLogic(rawValue, formattedValue, folderName, dataType) {
    log(`Iniciando extracao para: ${rawValue} (formatado: ${formattedValue})`);
    const { extractorTabId: savedId } = await chrome.storage.local.get(["extractorTabId"]);
    const tabRef = { id: savedId || null };

    if (tabRef.id) {
        try { await chrome.tabs.get(tabRef.id); } catch (_) { tabRef.id = null; }
    }

    if (!tabRef.id) {
        log('Criando aba de extracao...');
        const t = await chrome.tabs.create({ url: PARCELAS_URL, active: true });
        tabRef.id = t.id;
        await chrome.storage.local.set({ extractorTabId: tabRef.id });
        await waitTabComplete(tabRef.id);
    } else {
        log('Reutilizando aba de extracao existente');
        try {
            await chrome.tabs.update(tabRef.id, { url: PARCELAS_URL });
            await waitTabComplete(tabRef.id);
        } catch (err) {
            if (!isNoTabError(err)) throw err;
            log('Aba anterior invalida, criando nova aba...');
            const t = await chrome.tabs.create({ url: PARCELAS_URL, active: true });
            tabRef.id = t.id;
            await chrome.storage.local.set({ extractorTabId: tabRef.id });
            await waitTabComplete(tabRef.id);
        }
    }

    await delay(2000);
    log('Injetando script de busca na pagina...');
    await safeExtractorScript(tabRef, dataType, formattedValue, injectSearchInPage, [dataType, formattedValue]);

    let allData = [];
    let hasNext = true;
    let searchHadZeroResults = false;
    let pageNum = 1;
    let lastPageUrl = null;
    const MAX_RETRIES_PER_PAGE = 3;

    await chrome.storage.local.set({ statusDetail: `Extraindo: ${rawValue} - Paginando...` });
    log('Aguardando resultados da busca...');

    while (hasNext) {
        log(`Processando página ${pageNum}...`);
        await chrome.storage.local.set({ statusDetail: `Extraindo: ${rawValue} - Página ${pageNum} (${allData.length} parcelas)` });

        let loaded = false;
        for (let i = 0; i < 30; i++) {
            const check = await safeExtractorScript(tabRef, dataType, formattedValue, checkPageLoaded, []);
            if (check[0]?.result) { loaded = true; break; }
            await delay(1000);
        }
        if (!loaded) {
            logWarn(`Página ${pageNum} não carregou em 30s, recarregando...`);
            try { await chrome.tabs.reload(tabRef.id); } catch (_) {}
            await waitTabComplete(tabRef.id, 30000);
            await delay(2000);
            const check2 = await safeExtractorScript(tabRef, dataType, formattedValue, checkPageLoaded, []);
            if (!check2[0]?.result) {
                logWarn(`Página ${pageNum} não carregou após reload, parando paginação`);
                break;
            }
        }

        await delay(1000);

        let res = null;
        let extractionOk = false;

        for (let retry = 0; retry < MAX_RETRIES_PER_PAGE; retry++) {
            const result = await safeExtractorScript(tabRef, dataType, formattedValue, extractParcelasFromPage, []);
            if (result && result[0] && result[0].result !== undefined && result[0].result !== null) {
                res = result[0].result;
                extractionOk = true;
                break;
            }
            logWarn(`Tentativa ${retry + 1}/${MAX_RETRIES_PER_PAGE}: extração falhou na página ${pageNum}, recarregando...`);
            await chrome.storage.local.set({ statusDetail: `Extraindo: ${rawValue} - Recarregando página ${pageNum} (tentativa ${retry + 1})...` });
            try { await chrome.tabs.reload(tabRef.id); } catch (_) {}
            await waitTabComplete(tabRef.id, 30000);
            await delay(3000);
        }

        if (!extractionOk || !res) {
            logWarn(`Extração falhou após ${MAX_RETRIES_PER_PAGE} tentativas na página ${pageNum}, parando`);
            break;
        }

        if (res?.data?.length > 0) {
            allData = allData.concat(res.data);
            log(`Encontradas ${res.data.length} parcelas na pagina ${pageNum} (total acumulado: ${allData.length})`);
            await chrome.storage.local.set({ statusDetail: `Extraindo: ${rawValue} - Página ${pageNum} - ${allData.length} parcelas encontradas` });
        } else {
            log(`Nenhuma parcela encontrada na página ${pageNum}`);
        }

        if (res.foundHistorico) {
            log(`"Parcela encontrada no histórico" detectada na página ${pageNum}, parando paginação`);
            break;
        }

        hasNext = res?.next;
        if (res?.zeroResults) searchHadZeroResults = true;

        if (hasNext && res.nextHref) {
            const currentUrl = await safeExtractorScript(tabRef, dataType, formattedValue, () => window.location.href, []);
            lastPageUrl = currentUrl[0]?.result || null;
            
            log(`Navegando para proxima pagina: ${res.nextHref}`);
            await chrome.storage.local.set({ statusDetail: `Extraindo: ${rawValue} - Navegando para página ${pageNum + 1}...` });
            try {
                await chrome.tabs.update(tabRef.id, { url: res.nextHref });
            } catch (err) {
                if (!isNoTabError(err)) throw err;
                logWarn('Aba invalida ao navegar, criando nova aba...');
                const t = await chrome.tabs.create({ url: res.nextHref, active: true });
                tabRef.id = t.id;
                await chrome.storage.local.set({ extractorTabId: tabRef.id });
            }
            await waitTabComplete(tabRef.id, 30000);
            await delay(randomDelayMs(1000, 2500));
            pageNum++;

            let navigated = false;
            for (let attempt = 0; attempt < 3; attempt++) {
                const verifyUrl = await safeExtractorScript(tabRef, dataType, formattedValue, () => window.location.href, []);
                const newUrl = verifyUrl[0]?.result || '';
                if (newUrl !== lastPageUrl) {
                    navigated = true;
                    break;
                }
                logWarn(`URL não mudou (tentativa ${attempt + 1}), recarregando página ${pageNum}...`);
                try {
                    const urlObj = new URL(res.nextHref);
                    await chrome.tabs.update(tabRef.id, { url: urlObj.toString() });
                } catch (_) {
                    try { await chrome.tabs.reload(tabRef.id); } catch (_) {}
                }
                await waitTabComplete(tabRef.id, 30000);
                await delay(2000);
            }
            if (!navigated) {
                logWarn('Não foi possível navegar para próxima página após 3 tentativas, parando');
                hasNext = false;
            }
        } else if (hasNext && !res.nextHref) {
            logWarn('Próxima página indicada mas link não encontrado, parando paginação');
            hasNext = false;
        }
    }
    log(`Paginação finalizada: ${pageNum} página(s), ${allData.length} parcelas`);
    await chrome.storage.local.set({ statusDetail: `Extraindo: ${rawValue} - ${allData.length} parcelas em ${pageNum} página(s)` });

    if (allData.length > 0) {
        const seen = new Set();
        const deduped = [];
        for (const d of allData) {
            const k = (d.codigo || "").trim() || `${d.nome}|${d.cns}|${d.matricula}`;
            if (seen.has(k)) continue;
            seen.add(k);
            deduped.push(d);
        }

        log(`Total de parcelas unicas: ${deduped.length}`);
        const csvHeader = "\ufeff\"Nome\";\"Codigo\";\"Area\";\"Detentor\";\"CNS\";\"Matricula\"\n";
        const csvContent = csvHeader +
            deduped.map(d => `"${d.nome}";"${d.codigo}";"${d.area}";"${d.detentor}";"${d.cns}";"${d.matricula}"`).join("\n");

        log(`Gerando CSV para: ${folderName}.csv`);
        await downloadExtractCsvBlob(folderName, csvContent);
        logSuccess(`CSV baixado: ${folderName}.csv`);
    } else if (searchHadZeroResults) {
        logWarn('Nenhuma parcela encontrada, gerando CSV vazio');
        const csvHeader = "\ufeffNome;Codigo;Area;Detentor;CNS;Matricula\n";
        await downloadExtractCsvBlob(folderName, csvHeader);
    }

    const { extractorTabId } = await chrome.storage.local.get(["extractorTabId"]);
    const { currentIndex, queue } = await chrome.storage.local.get(["currentIndex", "queue"]);
    if (currentIndex + 1 >= (queue?.length || 0)) {
        await disposeExtractorTab();
    }
}

/* ===========================
   MODO: DOWNLOAD UNIFICADO
   =========================== */

async function executeDownloadLogic(line, folderName, downloadTypes) {
    const parts = line.split(';');
    if (parts.length < 2) {
        logWarn(`Linha invalida (sem ;): ${line}`);
        return;
    }

    const nomeParcela = parts[0].trim();
    const uuid = parseParcelaUuidFromLine(line);
    if (!uuid) {
        logWarn(`UUID nao encontrado na linha: ${line}`);
        return;
    }

    const nomeLimpo = sanitize(nomeParcela);
    log(`Processando download: ${nomeParcela} (UUID: ${uuid}) | Tipos: ${downloadTypes.join(', ')}`);

    if (downloadTypes.includes('pdf')) {
        const docs = [
            { type: 'planta', uri: `https://sigef.incra.gov.br/geo/parcela/planta/${uuid}/10930/` },
            { type: 'memorial', uri: `https://sigef.incra.gov.br/geo/parcela/memorial/${uuid}/` }
        ];
        for (const doc of docs) {
            try {
                const filename = `${folderName}/${nomeLimpo}/${nomeLimpo}_${uuid}_${doc.type}.pdf`;
                log(`Baixando ${doc.type}: ${filename}`);
                await safeDownload({ url: doc.uri, filename, conflictAction: "overwrite" });
                logSuccess(`Download concluido: ${doc.type}`);
            } catch (err) {
                logError(`Erro ao baixar ${doc.type} de ${nomeParcela}`, err);
            }
            await delay(randomDelayMs(1000, 2500));
        }
    }

    if (downloadTypes.includes('csv')) {
        try {
            const csvUrl = `https://sigef.incra.gov.br/geo/exportar/parcela/csv/${uuid}/`;
            const filename = `${folderName}/${nomeLimpo}/${nomeLimpo}_${uuid}.csv`;
            log(`Baixando CSV: ${filename}`);
            await safeDownload({ url: csvUrl, filename, conflictAction: "overwrite" });
            logSuccess('Download CSV concluido');
        } catch (err) {
            logError(`Erro ao baixar CSV de ${nomeParcela}`, err);
        }
    }

    if (downloadTypes.includes('shp')) {
        try {
            const shpUrl = `https://sigef.incra.gov.br/geo/exportar/parcela/shp/${uuid}/`;
            const filename = `${folderName}/${nomeLimpo}/${nomeLimpo}_${uuid}.zip`;
            log(`Baixando SHP: ${filename}`);
            await safeDownload({ url: shpUrl, filename, conflictAction: "overwrite" });
            logSuccess('Download SHP concluido');
        } catch (err) {
            logError(`Erro ao baixar SHP de ${nomeParcela}`, err);
        }
    }

    await delay(randomDelayMs(500, 1000));
}
