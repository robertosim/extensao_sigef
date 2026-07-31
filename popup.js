document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
        if (tab.dataset.tab === 'logs') loadLogs();
    });
});

async function updateUI() {
    const data = await chrome.storage.local.get([
        'queue', 'currentIndex', 'isProcessing', 'isPaused',
        'currentParcelaNome', 'statusDetail', 'mode'
    ]);

    const tabsEl = document.querySelector('.tabs');
    const tabExtract = document.getElementById('tab-extract');
    const tabDownload = document.getElementById('tab-download');
    const tabGenerateMap = document.getElementById('tab-generatemap');
    const processSec = document.getElementById('process-section');

    if (data.isProcessing || data.isPaused) {
        tabsEl.style.display = 'none';
        tabExtract.classList.remove('active');
        tabDownload.classList.remove('active');
        tabGenerateMap.classList.remove('active');
        processSec.style.display = 'block';

        const total = data.queue ? data.queue.length : 0;
        const index = data.currentIndex || 0;
        const perc = total > 0 ? Math.round((index / total) * 100) : 0;

        document.getElementById('pb').style.width = `${perc}%`;
        document.getElementById('status-count').textContent = `${index} de ${total} (${perc}%)`;
        document.getElementById('current-item').textContent = data.currentParcelaNome || '...';
        document.getElementById('status-detail').textContent = data.statusDetail || '';
        document.getElementById('pauseBtn').textContent = data.isPaused ? 'Retomar' : 'Pausar';
    } else {
        tabsEl.style.display = 'flex';
        processSec.style.display = 'none';

        const lastMode = data.mode || 'extract';
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        if (lastMode === 'download') {
            document.querySelector('.tab[data-tab="download"]').classList.add('active');
            document.getElementById('tab-download').classList.add('active');
        } else if (lastMode === 'generatemap') {
            document.querySelector('.tab[data-tab="generatemap"]').classList.add('active');
            document.getElementById('tab-generatemap').classList.add('active');
        } else {
            document.querySelector('.tab[data-tab="extract"]').classList.add('active');
            document.getElementById('tab-extract').classList.add('active');
        }
    }
}

chrome.storage.onChanged.addListener(() => {
    updateUI();
    if (document.querySelector('.tab[data-tab="logs"]').classList.contains('active')) {
        loadLogs();
    }
});

async function checkLogin() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'check_login' }, (response) => {
            resolve(response?.logged === true);
        });
    });
}

async function startExtract() {
    const textarea = document.getElementById('dataInput');
    const lines = textarea.value.split(/\r?\n/).filter(l => l.trim().length > 0);

    if (lines.length === 0) {
        return alert('Digite pelo menos um codigo, CPF ou CNPJ na caixa de texto.');
    }

    const radio = document.querySelector('input[name="dataType"]:checked');
    if (!radio) {
        return alert('Selecione o tipo de dado: Codigo, CPF ou CNPJ.');
    }

    const logged = await checkLogin();
    if (!logged) {
        alert('Voce nao esta logado no SIGEF.\n\nFaca login e tente novamente.');
        chrome.tabs.create({ url: 'https://sigef.incra.gov.br/usuario/home/' });
        return;
    }

    await chrome.storage.local.set({
        queue: lines,
        currentIndex: 0,
        isProcessing: true,
        isPaused: false,
        mode: 'extract',
        dataType: radio.value,
        currentParcelaNome: 'Iniciando...',
        statusDetail: ''
    });

    chrome.runtime.sendMessage({ action: 'start_processing' });
}

async function startDownload() {
    const fileInput = document.getElementById('csvFile');
    if (!fileInput.files[0]) {
        return alert('Selecione o arquivo CSV das parcelas.');
    }

    const chkPdf = document.getElementById('chkPdf').checked;
    const chkCsv = document.getElementById('chkCsv').checked;
    const chkShp = document.getElementById('chkShp').checked;

    if (!chkPdf && !chkCsv && !chkShp) {
        return alert('Selecione pelo menos um tipo de arquivo: PDF, CSV ou SHP.');
    }

    const downloadTypes = [];
    if (chkPdf) downloadTypes.push('pdf');
    if (chkCsv) downloadTypes.push('csv');
    if (chkShp) downloadTypes.push('shp');

    const logged = await checkLogin();
    if (!logged) {
        alert('Voce nao esta logado no SIGEF.\n\nFaca login e tente novamente.');
        chrome.tabs.create({ url: 'https://sigef.incra.gov.br/usuario/home/' });
        return;
    }

    const file = fileInput.files[0];
    const codigoImovel = file.name.replace(/\.csv$/i, '').trim();

    const reader = new FileReader();
    reader.onload = async (e) => {
        const lines = e.target.result.split(/\r?\n/)
            .filter(l => {
                if (l.trim().length === 0) return false;
                const lower = l.toLowerCase().trim();
                if (lower.startsWith('nome;')) return false;
                return true;
            });

        if (lines.length === 0) {
            return alert('O arquivo CSV esta vazio ou nao contem dados validos.');
        }

        await chrome.storage.local.set({
            queue: lines,
            currentIndex: 0,
            isProcessing: true,
            isPaused: false,
            mode: 'download',
            downloadTypes: downloadTypes,
            codigoImovel: codigoImovel,
            dataType: 'csv_file',
            currentParcelaNome: 'Iniciando...',
            statusDetail: ''
        });

        chrome.runtime.sendMessage({ action: 'start_processing' });
    };
    reader.readAsText(file);
}

async function loadLogs() {
    const container = document.getElementById('log-container');
    chrome.runtime.sendMessage({ action: 'get_logs' }, (response) => {
        const logs = response?.logs || [];
        container.innerHTML = '';
        if (logs.length === 0) {
            container.innerHTML = '<div class="log-entry log-info">Nenhum log registrado.</div>';
            return;
        }
        logs.forEach(entry => {
            const div = document.createElement('div');
            div.className = `log-entry log-${entry.type}`;
            div.innerHTML = `<span class="log-timestamp">[${entry.timestamp}]</span>${entry.msg}`;
            container.appendChild(div);
        });
        container.scrollTop = container.scrollHeight;
    });
}

async function clearLogs() {
    if (confirm('Tem certeza que deseja limpar todos os logs?')) {
        chrome.runtime.sendMessage({ action: 'clear_logs' }, () => {
            loadLogs();
        });
    }
}

async function copyLogs() {
    chrome.runtime.sendMessage({ action: 'get_logs' }, (response) => {
        const logs = response?.logs || [];
        if (logs.length === 0) {
            return alert('Nenhum log para copiar.');
        }
        const text = logs.map(e => `[${e.timestamp}] [${e.type.toUpperCase()}] ${e.msg}`).join('\n');
        navigator.clipboard.writeText(text).then(() => {
            alert('Logs copiados para a area de transferencia!');
        }).catch(() => {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            alert('Logs copiados para a area de transferencia!');
        });
    });
}

document.getElementById('extractBtn').addEventListener('click', startExtract);
document.getElementById('downloadBtn').addEventListener('click', startDownload);
document.getElementById('generateMapBtn').addEventListener('click', startGenerateMap);
document.getElementById('clearLogsBtn').addEventListener('click', clearLogs);
document.getElementById('copyLogsBtn').addEventListener('click', copyLogs);

document.getElementById('pauseBtn').addEventListener('click', async () => {
    const data = await chrome.storage.local.get('isPaused');
    chrome.runtime.sendMessage({ action: data.isPaused ? 'resume_processing' : 'pause_processing' });
});

document.getElementById('stopBtn').addEventListener('click', () => {
    if (confirm('Parar e limpar a fila atual?')) {
        chrome.runtime.sendMessage({ action: 'stop_processing' });
    }
});

/* ===========================
   MODO: GERAR MAPA
   =========================== */

async function startGenerateMap() {
    const fileInput = document.getElementById('folderInput');
    if (!fileInput.files[0]) {
        return alert('Selecione uma pasta com arquivos CSV.');
    }

    const files = Array.from(fileInput.files).filter(f =>
        f.name.toLowerCase().endsWith('.csv')
    );

    if (files.length === 0) {
        return alert('Nenhum arquivo .csv encontrado na pasta selecionada.');
    }

    const folderPath = files[0].webkitRelativePath;
    const folderName = folderPath.split('/')[0];

    const allPolygons = [];
    const logs = [];

    for (const file of files) {
        try {
            const text = await file.text();
            const polygons = parseCsvFile(text, file.name);
            if (polygons.length > 0) {
                allPolygons.push(...polygons);
                logs.push(`${file.name}: ${polygons.length} poligono(s)`);
            } else {
                logs.push(`${file.name}: nenhum poligono WKT encontrado`);
            }
        } catch (e) {
            logs.push(`${file.name}: ERRO - ${e.message}`);
        }
    }

    if (allPolygons.length === 0) {
        return alert('Nenhum poligono WKT encontrado nos arquivos CSV.\n\n' + logs.join('\n'));
    }

    const html = generateMapHtml(allPolygons, folderName);

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const dataUrl = await blobToDataUrl(blob);

    chrome.downloads.download({
        url: dataUrl,
        filename: `${folderName}/${folderName}.html`,
        conflictAction: 'overwrite'
    }, (downloadId) => {
        if (chrome.runtime.lastError) {
            alert('Erro ao salvar: ' + chrome.runtime.lastError.message);
        } else {
            alert(`Mapa gerado com sucesso!\n\n` +
                `Pasta: ${folderName}\n` +
                `Arquivos CSV: ${files.length}\n` +
                `Poligonos: ${allPolygons.length}\n` +
                `Salvo como: ${folderName}.html`);
        }
    });
}

function parseCsvFile(text, fileName) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];

    const header = lines[0].split(';').map(h => h.trim().replace(/"/g, ''));

    let wktColIdx = -1;
    let qrcodeColIdx = -1;
    let nomeColIdx = -1;

    for (let i = 0; i < header.length; i++) {
        const h = header[i].toUpperCase();
        if (h.includes('WKT') || h.includes('GEOMETRIA') || h.includes('GEOMETRY')) {
            wktColIdx = i;
        }
        if (h.includes('QRCODE')) qrcodeColIdx = i;
        if (h.includes('NOME') || h.includes('NAME')) nomeColIdx = i;
    }

    if (wktColIdx === -1) return [];

    const polygons = [];
    const label = fileName.replace(/\.csv$/i, '').replace(/_/g, ' ');

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(';').map(c => c.trim().replace(/"/g, ''));
        const wkt = cols[wktColIdx];
        if (!wkt) continue;

        const coords = parseWkt(wkt);
        if (!coords) continue;

        const qrcode = qrcodeColIdx >= 0 ? cols[qrcodeColIdx] : '';
        const nome = nomeColIdx >= 0 ? cols[nomeColIdx] : label;

        polygons.push({ name: label, coords, qrcode, nome });
    }

    return polygons;
}

function parseWkt(wkt) {
    if (!wkt) return null;
    wkt = wkt.trim();

    const polyMatch = wkt.match(/^POLYGON\s*\(\s*\((.+)\)\s*\)$/is);
    if (polyMatch) {
        const ring = parseCoordRing(polyMatch[1]);
        return ring.length >= 3 ? [ring] : null;
    }

    const multiMatch = wkt.match(/^MULTIPOLYGON\s*\(\s*(.+)\s*\)$/is);
    if (multiMatch) {
        const rings = [];
        const ringRegex = /\(\s*\(([^)]+)\)\s*\)/g;
        let m;
        while ((m = ringRegex.exec(multiMatch[1])) !== null) {
            const ring = parseCoordRing(m[1]);
            if (ring.length >= 3) rings.push(ring);
        }
        return rings.length > 0 ? rings : null;
    }

    return null;
}

function parseCoordRing(ringStr) {
    return ringStr.split(',').map(pair => {
        const parts = pair.trim().split(/\s+/);
        const lon = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        return [lat, lon];
    }).filter(c => !isNaN(c[0]) && !isNaN(c[1]));
}

function generateMapHtml(polygons, folderName) {
    let allLats = [], allLons = [];
    for (const p of polygons) {
        for (const ring of p.coords) {
            for (const [lat, lon] of ring) {
                allLats.push(lat);
                allLons.push(lon);
            }
        }
    }
    const centerLat = allLats.reduce((a, b) => a + b, 0) / allLats.length;
    const centerLon = allLons.reduce((a, b) => a + b, 0) / allLons.length;

    const colors = generateColors(polygons.length);

    let polygonsJs = '';
    let legendItems = '';
    let totalArea = 0;

    polygons.forEach((p, i) => {
        const color = colors[i];
        const ringsJs = p.coords.map(ring =>
            `[${ring.map(([lat, lon]) => `[${lat},${lon}]`).join(',')}]`
        ).join(',');

        const area = calculateAreaHa(p.coords[0]);
        totalArea += area;
        const areaFmt = formatArea(area);

        const nomeSafe = p.nome.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const qrcodeSafe = (p.qrcode || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const sigefLink = p.qrcode
            ? `<a href="https://sigef.incra.gov.br/geo/parcela/detalhe/${qrcodeSafe}" target="_blank">${qrcodeSafe}</a>`
            : qrcodeSafe;

        polygonsJs += `L.polygon([${ringsJs}],{color:'${color}',weight:3,fillColor:'${color}',fillOpacity:0.4}).addTo(map).bindPopup('<b>Imovel:</b> ${nomeSafe}<br><b>SIGEF:</b> ${sigefLink}<br><b>Area:</b> ${areaFmt}');\n`;

        const sigefUrl = p.qrcode
            ? `<a href="https://sigef.incra.gov.br/geo/parcela/detalhe/${qrcodeSafe}" target="_blank">${qrcodeSafe}</a>`
            : '';

        legendItems += `<li style="margin-bottom:6px;"><span style="background:${color};width:12px;height:12px;display:inline-block;margin-right:5px;border:1px solid black;vertical-align:middle;"></span><b>Imovel:</b> ${nomeSafe}<br>&nbsp;&nbsp;&nbsp;&nbsp;<b>SIGEF:</b> ${sigefUrl}<br>&nbsp;&nbsp;&nbsp;&nbsp;<b>Area:</b> ${areaFmt}</li>`;
    });

    const totalFmt = formatArea(totalArea);

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${folderName}</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>
body{margin:0;padding:0;}
#map{width:100%;height:100vh;}
.legend{background:white;padding:10px;border:2px solid gray;border-radius:5px;max-height:400px;overflow-y:auto;font-size:12px;}
</style>
</head>
<body>
<div id="map"></div>
<script>
var map=L.map('map').setView([${centerLat},${centerLon}],14);
L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',{attribution:'Google Maps',maxZoom:22}).addTo(map);
${polygonsJs}
var legend=L.control({position:'bottomright'});
legend.onAdd=function(){var div=L.DomUtil.create('div','legend');div.innerHTML='<b>Legenda</b><ul style="list-style:none;padding-left:5px;">${legendItems}<li style="border-top:1px solid gray;margin-top:8px;padding-top:8px;"><b>Area Total: ${totalFmt}</b></li></ul>';return div;};
legend.addTo(map);
L.control.layers(null,{'Google hibrido':L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'),'Google Satellite':L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'),'Google Terreno':L.tileLayer('https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}')}).addTo(map);
<\/script>
</body>
</html>`;
}

function generateColors(n) {
    const colors = [];
    const golden = 0.618033988749895;
    let h = 0.0;
    for (let i = 0; i < n; i++) {
        h = (h + golden) % 1.0;
        const s = 0.6 + (hashCode(String(i)) % 30) / 100.0;
        const v = 0.85 + (hashCode(String(i * 7)) % 15) / 100.0;
        const rgb = hsvToRgb(h, s, v);
        colors.push(rgbToHex(rgb[0], rgb[1], rgb[2]));
    }
    return colors;
}

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

function calculateAreaHa(coords) {
    let area = 0;
    const n = coords.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += coords[i][1] * coords[j][0];
        area -= coords[j][1] * coords[i][0];
    }
    area = Math.abs(area) / 2;
    const latMid = coords.reduce((s, c) => s + c[0], 0) / n;
    const kmPerDegLat = 111.32;
    const kmPerDegLon = 111.32 * Math.cos(latMid * Math.PI / 180);
    const areaKm2 = area * kmPerDegLat * kmPerDegLon;
    return areaKm2 * 100;
}

function formatArea(areaHa) {
    return areaHa.toLocaleString('pt-BR', {
        minimumFractionDigits: 4,
        maximumFractionDigits: 4
    }) + ' ha';
}

function blobToDataUrl(blob) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
}

updateUI();
