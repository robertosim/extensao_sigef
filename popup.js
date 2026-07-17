document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
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
    const processSec = document.getElementById('process-section');

    if (data.isProcessing || data.isPaused) {
        tabsEl.style.display = 'none';
        tabExtract.classList.remove('active');
        tabDownload.classList.remove('active');
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
        } else {
            document.querySelector('.tab[data-tab="extract"]').classList.add('active');
            document.getElementById('tab-extract').classList.add('active');
        }
    }
}

chrome.storage.onChanged.addListener(() => updateUI());

async function checkLogin() {
    return new Promise((resolve) => {
        chrome.tabs.create({ url: 'https://sigef.incra.gov.br/usuario/home/', active: false }, (tab) => {
            const timeout = setTimeout(() => {
                try { chrome.tabs.remove(tab.id); } catch (_) {}
                resolve(false);
            }, 15000);

            const listener = (tabId, info) => {
                if (tabId !== tab.id || info.status !== 'complete') return;
                clearTimeout(timeout);
                chrome.tabs.onUpdated.removeListener(listener);
                setTimeout(() => {
                    chrome.tabs.get(tab.id, (updatedTab) => {
                        const url = updatedTab?.url || '';
                        const logged = url.includes('sigef.incra.gov.br/usuario/home');
                        try { chrome.tabs.remove(tab.id); } catch (_) {}
                        resolve(logged);
                    });
                }, 1500);
            };
            chrome.tabs.onUpdated.addListener(listener);
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

document.getElementById('extractBtn').addEventListener('click', startExtract);
document.getElementById('downloadBtn').addEventListener('click', startDownload);

document.getElementById('pauseBtn').addEventListener('click', async () => {
    const data = await chrome.storage.local.get('isPaused');
    chrome.runtime.sendMessage({ action: data.isPaused ? 'resume_processing' : 'pause_processing' });
});

document.getElementById('stopBtn').addEventListener('click', () => {
    if (confirm('Parar e limpar a fila atual?')) {
        chrome.runtime.sendMessage({ action: 'stop_processing' });
    }
});

updateUI();
