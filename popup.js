/**
 * ============================================================================
 * EXTENSÃO: SIGEF EXTRACTOR & DOWNLOADER
 * ARQUIVO: popup.js
 * ============================================================================
 * DESCRIÇÃO:
 * Este arquivo gerencia os elementos de interface (DOM) do painel popup da extensão.
 * Ele lida com o upload do arquivo CSV, processamento inicial do texto, controle de
 * estados da fila e comunicação direta de mensagens com o Service Worker.
 */

// VARIABLES (DOM Elements)
// Armazenam referências aos elementos HTML para manipulação de visibilidade e texto.
const setupView = document.getElementById('setupView');       // Container da tela inicial (Upload)
const processView = document.getElementById('processView');   // Container da tela de progresso ativo
const csvInput = document.getElementById('csvFile');           // Campo de entrada de arquivos (.csv)
const setupButtons = document.getElementById('setupButtons');   // Agrupador dos botões de ação (Extrair/Download)

/**
 * FUNCTION: updateUI()
 * OBJETIVO: Sincroniza a interface visual do popup com o estado atual salvo no storage da extensão.
 * EXECUÇÃO: É disparada em loop contínuo (intervalo) para garantir atualização em tempo real.
 */
async function updateUI() {
    // Busca as variáveis de controle persistidas no armazenamento local do Chrome
    const d = await chrome.storage.local.get([
        'isProcessing',       // Booleano: indica se o robô está com uma fila ativa
        'isPaused',           // Booleano: indica se a execução está pausada
        'queue',              // Array: lista de linhas carregadas do CSV
        'currentIndex',       // Inteiro: índice do item que está sendo processado
        'currentParcelaNome', // String: nome amigável da parcela atual
        'statusDetail'        // String: descrição detalhada da sub-tarefa (ex: baixando PDF)
    ]);

    // Verifica se há um processamento em andamento
    if (d.isProcessing) {
        // Altera a exibição das telas (oculta upload e exibe progresso)
        setupView.style.display = 'none';
        processView.style.display = 'block';

        // Determina os totais e índices da fila para cálculo matemático
        const total = d.queue?.length || 0;
        const cur = d.currentIndex || 0;
        
        // Regra de três para extrair a porcentagem exata de conclusão do lote
        const pctNum = total > 0 ? Math.min(100, Math.round(((cur + 1) / total) * 100)) : 0;
        const barPct = total > 0 ? Math.min(100, Math.round(((cur + 1) / total) * 100)) : 0;

        // Atualiza dinamicamente os elementos visuais na árvore HTML
        document.getElementById('bar').style.width = barPct + '%'; // Ajusta a largura da barra verde
        document.getElementById('percentage').innerText = pctNum + '%'; // Atualiza texto da porcentagem
        document.getElementById('status').innerText = `Processando: ${cur + 1} / ${total}`; // Texto de contagem
        
        // Define o texto descritivo priorizando o status de download, nome da parcela ou fallback
        document.getElementById('current').innerText =
            (d.statusDetail && d.statusDetail.trim()) || d.currentParcelaNome || 'Aguardando...';
        
        // Alterna o texto do botão de pausa conforme o estado booleano
        document.getElementById('pauseBtn').innerText = d.isPaused ? "Continuar" : "Pausar";
    } else {
        // Se o robô estiver ocioso, força a exibição da tela inicial de upload
        setupView.style.display = 'block';
        processView.style.display = 'none';
    }
}

/**
 * EVENT LISTENER: csvInput.onchange
 * OBJETIVO: Monitora a seleção do arquivo. Se houver um arquivo válido anexado,
 * exibe instantaneamente os botões de ação "Extrair Dados" e "Download PDF".
 */
csvInput.onchange = () => {
    setupButtons.style.display = csvInput.files[0] ? 'flex' : 'none';
};

/**
 * FUNCTION: start(mode)
 * OBJETIVO: Lê o arquivo CSV inserido, limpa cabeçalhos e inicializa as variáveis de ambiente.
 * PARAMETROS: 
 * - mode (String): Define o fluxo operacional do robô ('extract' ou 'download').
 */
async function start(mode) {
    const file = csvInput.files[0]; // Captura o primeiro arquivo do ponteiro de entrada
    if (!file) return;

    // Isola o nome do arquivo limpo de extensões para usá-lo como nome padrão de pasta de destino
    const fileName = file.name.replace(/\.[^/.]+$/, "");
    const reader = new FileReader(); // Instancia a API nativa de leitura de arquivos
    
    // Define a rotina assíncrona executada assim que a leitura do arquivo terminar
    reader.onload = async (e) => {
        // Converte o resultado em array separando por quebras de linha e aplicando filtros de segurança
        const lines = e.target.result.split(/\r?\n/).filter((l) => {
            const t = l.trim();
            if (!t) return false; // Ignora linhas em branco
            
            const low = t.toLowerCase();
            // Ignora cabeçalhos padrões gerados por exportações prévias do SIGEF
            if (low.startsWith("nome;") && low.includes("url")) return false;
            
            const firstCol = t.split(";")[0].trim().toLowerCase();
            if (firstCol === "nome") return false; // Filtra linhas que contenham títulos de coluna
            return true;
        });

        // Recupera registros de abas antigas abertas pela extensão para evitar vazamento de memória
        const prev = await chrome.storage.local.get(['extractorTabId', 'downloadTabId']);
        for (const key of ['extractorTabId', 'downloadTabId']) {
            const id = prev[key];
            if (id) {
                try {
                    await chrome.tabs.remove(id); // Fecha as abas remanescentes de execuções anteriores
                } catch (_) {}
            }
        }

        // Armazena a estrutura inicial do estado no storage interno da extensão
        await chrome.storage.local.set({
            queue: lines,                  // Armazena a lista pura tratada do CSV
            currentIndex: 0,               // Reinicia o ponteiro da fila no primeiro item
            isProcessing: true,            // Sinaliza que a execução do robô começou
            isPaused: false,               // Garante que o robô comece despausado
            mode: mode,                    // Salva se o fluxo é extração de tabelas ou downloads
            codigoImovelGlobal: fileName,  // Define o nome de pasta raiz baseado no nome do CSV
            extractorTabId: null,          // Inicializa sem ID de aba de extração
            downloadTabId: null,           // Inicializa sem ID de aba de download
            statusDetail: ''               // Limpa os detalhes internos
        });
        
        // Envia uma mensagem em canal aberto de runtime notificando o background.js para iniciar o loop
        chrome.runtime.sendMessage({ action: "start_processing" });
        updateUI(); // Força a atualização da tela
    };
    
    // Executa a leitura do arquivo de texto carregado como UTF-8 puro
    reader.readAsText(file);
}

// CLICK EVENT ASSIGNMENTS
// Mapeia as ações do usuário ao clicar nos respectivos botões da interface.
document.getElementById('extractBtn').onclick = () => start('extract'); // Ativa o modo Raspagem de Tabelas
document.getElementById('downloadBtn').onclick = () => start('download'); // Ativa o modo Baixar PDFs/Shapefiles

/**
 * EVENT LISTENER: Cancelar (stopBtn)
 * OBJETIVO: Para imediatamente a automação e reinicia o popup para o estado virgem de upload.
 */
document.getElementById('stopBtn').onclick = () => {
    chrome.runtime.sendMessage({ action: "stop_processing" }); // Envia sinal de interrupção imediata
    setTimeout(() => location.reload(), 100); // Força um recarregamento da mini janela após 100ms
};

/**
 * EVENT LISTENER: Pausar/Continuar (pauseBtn)
 * OBJETIVO: Altera o estado booleano de pausa, instruindo o loop do background a congelar ou retomar.
 */
document.getElementById('pauseBtn').onclick = async () => {
    const d = await chrome.storage.local.get(['isPaused', 'isProcessing', 'queue', 'currentIndex']);
    const newState = !d.isPaused; // Inverte o estado booleano atual
    await chrome.storage.local.set({ isPaused: newState });
    
    // Se o usuário estiver tirando do estado de pausa e a fila ainda possuir itens válidos
    if (!newState && d.isProcessing) {
        const total = d.queue?.length ?? 0;
        const cur = d.currentIndex ?? 0;
        if (total > 0 && cur < total) {
            // Dispara mensagem ordenando a retomada imediata do ciclo de consumo da fila
            chrome.runtime.sendMessage({ action: 'start_processing' });
        }
    }
    updateUI(); // Atualiza os botões visualmente
};

// Configura o batimento cardíaco da interface (atualiza elementos a cada 400ms)
setInterval(updateUI, 400);
updateUI(); // Execução imediata na abertura do popup