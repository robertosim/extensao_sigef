const delay = (ms) => new Promise(res => setTimeout(res, ms));

const PARCELAS_URL = "https://sigef.incra.gov.br/consultar/parcelas";

function log(msg) {
    console.log(`[SIGEF Downloader] ${msg}`);
}

function logError(msg, err) {
    console.error(`[SIGEF Downloader] ${msg}`, err);
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
    for (const row of rows) {
        const tds = row.querySelectorAll("td");
        if (tds.length < 5) continue;
        if (tds[tds.length - 1].innerText.toLowerCase().includes("histórico")) break;
        const link = tds[0].querySelector("a")?.href || "";
        const uuid = link.match(/detalhe\/([a-f0-9\-]+)/i)?.[1] || "";
        data.push({
            nome: tds[0].innerText.trim(),
            codigo: uuid,
            area: tds[1].innerText.trim(),
            detentor: tds[2].innerText.trim(),
            cns: tds[3].innerText.trim(),
            matricula: tds[4].innerText.trim()
        });
    }
    const nextLi = document.querySelector(".pagination li.next");
    const nextA = nextLi && !nextLi.classList.contains("disabled")
        ? nextLi.querySelector("a[href*=\"page=\"]") : null;
    return { data, next: !!(nextA), nextHref: nextA?.href || null };
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
    return tableRows.length > 0 || noResults;
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

async function disposeExtractorTab() {
    const { extractorTabId } = await chrome.storage.local.get(["extractorTabId"]);
    if (!extractorTabId) return;
    try { await chrome.tabs.remove(extractorTabId); } catch (_) {}
    await chrome.storage.local.set({ extractorTabId: null });
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

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "start_processing" || msg.action === "resume_processing") {
        chrome.storage.local.set({ isPaused: false, isProcessing: true });
        processQueue();
    } else if (msg.action === "pause_processing") {
        chrome.storage.local.set({ isPaused: true });
    } else if (msg.action === "stop_processing") {
        void (async () => {
            await disposeExtractorTab();
            await chrome.storage.local.set({
                isProcessing: false, isPaused: false,
                queue: [], currentIndex: 0, statusDetail: ""
            });
        })();
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

        try {
            if (mode === 'extract') {
                await executeExtractorLogic(currentLine, formatted, currentLine.trim(), dataType);
            } else if (mode === 'download') {
                await executeDownloadLogic(currentLine, codigoImovel, downloadTypes);
            }

            currentIndex++;
            await chrome.storage.local.set({ currentIndex: currentIndex });
            await delay(1000);
        } catch (err) {
            console.error("Erro no processamento:", currentLine, err);
            currentIndex++;
            await chrome.storage.local.set({ currentIndex: currentIndex });
        }
    }

    if (currentIndex >= (queue?.length || 0)) {
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
    const { extractorTabId: savedId } = await chrome.storage.local.get(["extractorTabId"]);
    const tabRef = { id: savedId || null };

    if (tabRef.id) {
        try { await chrome.tabs.get(tabRef.id); } catch (_) { tabRef.id = null; }
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
            const t = await chrome.tabs.create({ url: PARCELAS_URL, active: true });
            tabRef.id = t.id;
            await chrome.storage.local.set({ extractorTabId: tabRef.id });
            await waitTabComplete(tabRef.id);
        }
    }

    await delay(2000);
    await safeExtractorScript(tabRef, dataType, formattedValue, injectSearchInPage, [dataType, formattedValue]);

    let allData = [];
    let hasNext = true;
    let searchHadZeroResults = false;

    while (hasNext) {
        let loaded = false;
        for (let i = 0; i < 45; i++) {
            const check = await safeExtractorScript(tabRef, dataType, formattedValue, checkPageLoaded, []);
            if (check[0]?.result) { loaded = true; break; }
            await delay(1000);
        }
        if (!loaded) break;

        const result = await safeExtractorScript(tabRef, dataType, formattedValue, extractParcelasFromPage, []);
        const res = result[0].result;
        if (res?.zeroResults) searchHadZeroResults = true;
        if (res?.data?.length > 0) allData = allData.concat(res.data);
        hasNext = res?.next;

        if (hasNext && res.nextHref) {
            try {
                await chrome.tabs.update(tabRef.id, { url: res.nextHref });
            } catch (err) {
                if (!isNoTabError(err)) throw err;
                const t = await chrome.tabs.create({ url: res.nextHref, active: true });
                tabRef.id = t.id;
                await chrome.storage.local.set({ extractorTabId: tabRef.id });
            }
            await waitTabComplete(tabRef.id, 40000);
            await delay(randomDelayMs(500, 1400));
        }
    }

    if (allData.length > 0) {
        const seen = new Set();
        const deduped = [];
        for (const d of allData) {
            const k = (d.codigo || "").trim() || `${d.nome}|${d.cns}|${d.matricula}`;
            if (seen.has(k)) continue;
            seen.add(k);
            deduped.push(d);
        }

        const csvHeader = "\ufeffNome;Codigo;Area;Detentor;CNS;Matricula\n";
        const csvContent = csvHeader +
            deduped.map(d => `${d.nome};${d.codigo};${d.area};${d.detentor};${d.cns};${d.matricula}`).join("\n");

        await downloadExtractCsvBlob(folderName, csvContent);
    } else if (searchHadZeroResults) {
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
        log(`Linha invalida (sem ;): ${line}`);
        return;
    }

    const nomeParcela = parts[0].trim();
    const uuid = parseParcelaUuidFromLine(line);
    if (!uuid) {
        log(`UUID nao encontrado na linha: ${line}`);
        return;
    }

    const nomeLimpo = sanitize(nomeParcela);
    log(`Processando: ${nomeParcela} (UUID: ${uuid}) | Tipos: ${downloadTypes.join(', ')}`);

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
        } catch (err) {
            logError(`Erro ao baixar SHP de ${nomeParcela}`, err);
        }
    }

    await delay(randomDelayMs(500, 1000));
}
