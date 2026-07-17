# Sigef Extractor & Downloader 🚀

Uma extensão para o Google Chrome (**Manifest V3**) desenvolvida para automatizar a extração de dados cadastrais e download em lote de documentos georreferenciados diretamente da consulta pública de parcelas do **SIGEF (INCRA)**.

---

## 🌟 Funcionalidades Principais

### 🔍 Extração Automatizada (Scraper)
- Textarea para digitar códigos de imóvel, CPF ou CNPJ (um por linha)
- Seleção do tipo de dado por radio buttons: **Código**, **CPF** ou **CNPJ**
- Formatação automática dos dados:
  - Código de imóvel: 13 dígitos numéricos com zeros à esquerda → `807.010.003.123-7`
  - CPF: 11 dígitos numéricos com zeros à esquerda → `846.172.849-15`
  - CNPJ: 14 dígitos numéricos com zeros à esquerda → `25.372.342/0001-63`
- Injeção de busca no SIGEF com campo correto (`#id_sncr` para código, `#id_cpf_cnpj` para CPF/CNPJ)
- Extração da tabela de resultados com paginação automática
- Geração de CSV consolidado com: Nome, Código, Área, Detentor, CNS, Matrícula

### 📦 Downloads em Lote
A partir de um arquivo CSV de parcelas, realiza downloads **diretos** (sem abrir abas) de:
- 📄 **PDF** - Planta do imóvel e Memorial Descritivo
- 📄 **CSV** - Exportação de dados da parcela
- 📦 **SHP** - Shapefile completo (`.zip`)

Seleção por checkboxes: pode combinar PDF + CSV + SHP no mesmo processamento.

### 📂 Organização dos Arquivos
```
Downloads/{código_ou_cpf_ou_cnpj}/
  └── {Nome_Parcela}/
        ├── {Nome_Parcela}_{uuid}_planta.pdf
        ├── {Nome_Parcela}_{uuid}_memorial.pdf
        ├── {Nome_Parcela}_{uuid}.csv
        └── {Nome_Parcela}_{uuid}.zip
```

### 🔐 Verificação de Login
- Antes de cada operação (Extrair ou Download), verifica se o usuário está logado no SIGEF
- Se não estiver logado, exibe alerta e abre automaticamente a página de login
- Só inicia o processamento após confirmação de login

### 🎯 Interface com Abas
- **Aba Extração** - Textarea + radio buttons + botão "EXTRAIR DADOS"
- **Aba Download** - Arquivo CSV + checkboxes (PDF/CSV/SHP) + botão "INICIAR DOWNLOAD"
- **Barra de Progresso** - Aparece durante o processamento com controles Pausar/Parar

### 🤖 Simulação Comportamental Humana
- Digitação pausada com delays aleatórios
- Movimentos de mouse e scroll simulados
- Tempos de resposta dinâmicos para contornar bloqueios sistêmicos

---

## 📂 Estrutura do Projeto

```text
├── manifest.json       # Definições de permissões e metadados da extensão (MV3 v2.1)
├── popup.html          # Estrutura HTML com abas (Extração/Download)
├── popup.js            # Lógica do popup, abas, verificação de login
├── background.js       # Service worker: motor de automação e downloads diretos
├── content.js          # Script injetado para simulação de rolagens humanas
└── README.md           # Documentação do projeto
```

---

## 🛠️ Como Instalar no Modo Desenvolvedor

1. Faça o download ou clone este repositório no seu computador.
2. Abra o Google Chrome e acesse o endereço: `chrome://extensions/`.
3. No canto superior direito, ative a chave **"Modo do desenvolvedor"**.
4. No canto superior esquerdo, clique em **"Carregar sem compactação"**.
5. Selecione a pasta raiz que contém os arquivos deste projeto.
6. Pronto! O ícone da extensão estará disponível na sua barra de ferramentas de extensões.

---

## 📖 Instruções de Uso

### 🔹 Passo 1: Extração de Dados

1. Clique no ícone da extensão para abrir o popup.
2. Na aba **Extração**, digite os códigos, CPFs ou CNPJs na caixa de texto (um por linha).
3. Selecione o tipo de dado: **Código**, **CPF** ou **CNPJ**.
4. Clique em **EXTRAIR DADOS**.
5. A extensão verifica se você está logado no SIGEF (se não estiver, abre a página de login).
6. O sistema realizará as buscas sequenciais, navegará por todas as páginas de resultados e gerará um CSV consolidado.

### 🔹 Passo 2: Download de Arquivos

1. Na aba **Download**, carregue o arquivo CSV gerado na extração (ou qualquer CSV no formato `Nome;UUID;...`).
2. Marque os tipos de arquivo que deseja baixar: **PDF**, **CSV** e/ou **SHP**.
3. Clique em **INICIAR DOWNLOAD**.
4. Os arquivos serão baixados diretos (sem abrir abas) e organizados em pastas por parcela no seu diretório de downloads.

---

## ⚙️ Permissões Utilizadas

| Permissão | Finalidade |
| :--- | :--- |
| `downloads` | Para salvar os relatórios extraídos e documentos em pastas locais |
| `tabs` | Para criar, fechar e atualizar páginas de navegação e verificar login |
| `scripting` | Para injetar as rotinas de busca diretamente no DOM do SIGEF |
| `activeTab` | Para acessar a aba ativa na verificação de login |
| `storage` | Para persistir as filas e o estado de progresso mesmo se o popup fechar |
| `webNavigation` | Para rastrear e sincronizar o carregamento das páginas |

---

## 📞 Suporte e Contato

Desenvolvido por **Roberto Simões**. Caso precise de suporte personalizado, melhorias no sistema ou queira relatar algum comportamento indesejado, entre em contato pelos canais oficiais dispostos na interface:

✉️ E-mail: robsimoes@gmail.com

💬 WhatsApp: +55 (48) 99679-3828

💼 LinkedIn: linkedin.com/in/robertosim
