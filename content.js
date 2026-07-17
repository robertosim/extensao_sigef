/**
 * humanizePage()
 * Simula movimentos de mouse e scroll para evitar detecção de bot.
 */
function humanizePage() {
    // Scroll aleatório
    const scrollAmount = Math.floor(Math.random() * 300) + 100;
    window.scrollBy({ top: scrollAmount, behavior: 'smooth' });

    // Movimento de mouse simulado
    document.dispatchEvent(new MouseEvent('mousemove', {
        clientX: Math.random() * window.innerWidth,
        clientY: Math.random() * window.innerHeight
    }));
}

// Executa a simulação 2 segundos após a aba abrir
if (window.location.href.includes("sigef.incra.gov.br/geo/parcela/detalhe/")) {
    setTimeout(humanizePage, 2000);
}