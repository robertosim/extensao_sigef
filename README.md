# Sigef Extractor & Downloader 🚀

Uma extensão profissional para o Google Chrome (Manifest V3) desenvolvida para automatizar a busca, raspagem de dados cadastrais e download em lote de documentos georreferenciados diretamente da consulta pública de parcelas do **SIGEF (INCRA)**.

## 🌟 Funcionalidades Principais

- **Extração Automatizada (Scraper)**: Carregue uma lista de códigos de imóveis via arquivo `.csv` e a extensão irá realizar as pesquisas sequenciais, navegar por todas as páginas de resultados e compilar um novo relatório consolidado em formato CSV limpo.
- **Downloads em Lote Completos**: A partir do arquivo gerado na extração, realiza automaticamente o download organizado em subpastas de:
  - 📄 Planta do imóvel (PDF)
  - 📄 Memorial Descritivo (PDF)
  - 📦 Pacotes Shapefile completos (`.zip` de parcela, vértice e limite)
- **Interface Intuitiva**: Painel contendo barra de progresso em tempo real, indicação em texto do item atual e controles dinâmicos de **Pausar/Continuar** e **Cancelar**.
- **Simulação Comportamental Humana**: Algoritmos internos introduzem tempos de resposta dinâmicos e digitação pausada na interface do INCRA para contornar bloqueios sistêmicos e garantir estabilidade.

## 📂 Estrutura do Projeto

```text
├── manifest.json       # Definições de permissões e metadados da extensão (MV3)
├── popup.html          # Estrutura HTML do painel de controle
├── popup.css           # Estilização visual moderna e isolada do painel
├── popup.js            # Manipulação do DOM do painel e tratamento de arquivos carregados
├── background.js       # Service worker em segundo plano; motor de automação e downloads
└── content.js          # Script nativo injetado para simulação de rolagens humanas suaves