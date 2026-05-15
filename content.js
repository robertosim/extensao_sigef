/**
 * Injeta um comportamento de rolagem sutil e suave de forma randômica, 
 * ajudando a simular o comportamento de leitura de um usuário humano na página do SIGEF.
 */
function humanizePage() {
    if (window.location.href.includes("sigef.incra.gov.br")) {
        // Gera um valor de rolagem aleatório entre 100 e 400 pixels
        const scrollAmount = Math.floor(Math.random() * 300) + 100;
        window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    }
}

// Executa a rolagem simulada 2 segundos após a injeção do arquivo
setTimeout(humanizePage, 2000);