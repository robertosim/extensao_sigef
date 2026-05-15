# Sigef Extractor & Downloader 🚀

Uma extensão para o Google Chrome (**Manifest V3**) desenvolvida para automatizar a busca, raspagem de dados cadastrais e download em lote de documentos georreferenciados diretamente da consulta pública de parcelas do **SIGEF (INCRA)**.

---

## 🌟 Funcionalidades Principais

* **Extração Automatizada (Scraper):** Carregue uma lista de códigos de imóveis via arquivo `.csv` e a extensão irá realizar as pesquisas sequenciais, navegar por todas as páginas de resultados e compilar um novo relatório consolidado em formato CSV limpo.
* **Downloads em Lote Completos:** A partir do arquivo gerado na extração, realiza automaticamente o download organizado em subpastas de:
    * 📄 Planta do imóvel (PDF)
    * 📄 Memorial Descritivo (PDF)
    * 📦 Pacotes Shapefile completos (`.zip` de parcela, vértice e limite)
* **Interface Intuitiva:** Painel contendo barra de progresso em tempo real, indicação em texto do item atual e controles dinâmicos de *Pausar/Continuar* e *Cancelar*.
* **Simulação Comportamental Humana:** Algoritmos internos introduzem tempos de resposta dinâmicos e digitação pausada na interface do INCRA para contornar bloqueios sistêmicos e garantir estabilidade.

---

## 📂 Estrutura do Projeto
```text
├── manifest.json       # Definições de permissões e metadados da extensão (MV3)
├── popup.html          # Estrutura HTML do painel de controle
├── popup.css           # Estilização visual moderna e isolada do painel
├── popup.js            # Manipulação do DOM do painel e tratamento de arquivos carregados
├── background.js       # Service worker em segundo plano; motor de automação e downloads
└── content.js          # Script nativo injetado para simulação de rolagens humanas suaves
```
---
## 🛠️ Como Instalar no Modo Desenvolvedor
Faça o download ou clone este repositório no seu computador.

Abra o Google Chrome e acesse o endereço: chrome://extensions/.

No canto superior direito, ative a chave "Modo do desenvolvedor".

No canto superior esquerdo, clique em "Carregar sem compactação".

Selecione a pasta raiz que contém os arquivos deste projeto.

Pronto! O ícone da extensão estará disponível na sua barra de ferramentas de extensões.
---
## 📖 Instruções de Uso
🔹 Passo 1: Extração de Dados
Clique no ícone da extensão para abrir o popup.

Faça o upload de um arquivo .csv contendo os códigos dos imóveis que deseja pesquisar.

Clique em EXTRAIR DADOS. O sistema abrirá uma aba controlada para raspar as tabelas do SIGEF e gerará um arquivo de saída pronto para a etapa seguinte.

🔹 Passo 2: Download de Arquivos
Abra a extensão novamente e carregue o relatório gerado na etapa anterior.

Clique em DOWNLOAD PDF. O robô fará o download de todas as plantas, memoriais e shapefiles organizados automaticamente por pastas no seu diretório padrão do sistema.

---
## ⚙️ Permissões Utilizadas
| Permissão | Finalidade |
| :--- | :--- |
| `downloads` | Para salvar os relatórios extraídos e documentos em pastas locais. |
| `tabs` | Para criar, fechar e atualizar as páginas de navegação de forma autônoma. |
| `scripting` | Para injetar as rotinas de busca diretamente no DOM do SIGEF. |
| `storage` | Para persistir as filas e o estado de progresso mesmo se o popup fechar. |
| `webNavigation` | Para rastrear e sincronizar o momento exato em que as páginas concluem o carregamento. |
---
## 📞 Suporte e Contato
Desenvolvido por Roberto Simões. Caso precise de suporte personalizado, melhorias no sistema ou queira relatar algum comportamento indesejado, entre em contato pelos canais oficiais dispostos na interface:

✉️ E-mail: robsimoes@gmail.com

💬 WhatsApp: +55 (48) 99679-3828

💼 LinkedIn: linkedin.com/in/robertosim



 
