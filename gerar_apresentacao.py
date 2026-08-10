#!/usr/bin/env python3
"""
Gerador de Apresentação PPT - SIGEF Extractor & Downloader
Apresentação para Diretoria

Execute: python gerar_apresentacao.py
"""

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
import os

# =============================================================================
# CONFIGURAÇÕES DE CORES
# =============================================================================
CORES = {
    "azul_escuro": RGBColor(0x1B, 0x3A, 0x5C),
    "azul_medio": RGBColor(0x00, 0x7B, 0xFF),
    "azul_claro": RGBColor(0x4A, 0x90, 0xD9),
    "verde": RGBColor(0x28, 0xA7, 0x45),
    "vermelho": RGBColor(0xDC, 0x35, 0x45),
    "amarelo": RGBColor(0xFF, 0xC1, 0x07),
    "cinza_escuro": RGBColor(0x33, 0x33, 0x33),
    "cinza_medio": RGBColor(0x6C, 0x75, 0x7D),
    "cinza_claro": RGBColor(0xF4, 0xF4, 0xF9),
    "branco": RGBColor(0xFF, 0xFF, 0xFF),
    "preto": RGBColor(0x00, 0x00, 0x00),
    "verde_escuro": RGBColor(0x1E, 0x5C, 0x3A),
    "azul_fundo": RGBColor(0xE8, 0xF0, 0xFE),
}

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)


# =============================================================================
# FUNÇÕES AUXILIARES
# =============================================================================
def adicionar_fundo(slide, cor):
    """Adiciona fundo colorido ao slide."""
    background = slide.background
    fill = background.fill
    fill.solid()
    fill.fore_color.rgb = cor


def adicionar_retangulo(slide, left, top, width, height, cor, alpha=None):
    """Adiciona um retângulo colorido."""
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = cor
    shape.line.fill.background()
    return shape


def adicionar_texto(slide, left, top, width, height, texto, tamanho=18, cor=None,
                    negrito=False, alinhamento=PP_ALIGN.LEFT, fonte="Segoe UI"):
    """Adiciona um bloco de texto."""
    if cor is None:
        cor = CORES["cinza_escuro"]
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = texto
    p.font.size = Pt(tamanho)
    p.font.color.rgb = cor
    p.font.bold = negrito
    p.font.name = fonte
    p.alignment = alinhamento
    return txBox


def adicionar_titulo_slide(slide, titulo, subtitulo=None):
    """Adiciona barra de título azul no topo do slide."""
    barra = adicionar_retangulo(slide, Inches(0), Inches(0),
                                 Inches(13.333), Inches(1.2), CORES["azul_escuro"])
    adicionar_texto(slide, Inches(0.6), Inches(0.15), Inches(12), Inches(0.7),
                    titulo, tamanho=32, cor=CORES["branco"], negrito=True)
    if subtitulo:
        adicionar_texto(slide, Inches(0.6), Inches(0.75), Inches(12), Inches(0.4),
                        subtitulo, tamanho=16, cor=CORES["azul_claro"])


def adicionar_rodape(slide):
    """Adiciona rodapé com informações de copyright."""
    adicionar_retangulo(slide, Inches(0), Inches(7.0), Inches(13.333), Inches(0.5),
                        CORES["cinza_escuro"])
    adicionar_texto(slide, Inches(0.6), Inches(7.05), Inches(12), Inches(0.4),
                    "SIGEF Extractor & Downloader v2.1  |  Roberto Simoes  |  2026",
                    tamanho=10, cor=CORES["branco"], alinhamento=PP_ALIGN.CENTER)


def adicionar_icone_texto(slide, left, top, icone, titulo, descricao, cor_icone=None):
    """Adiciona um 'card' com icone (emoji/texto), titulo e descricao."""
    if cor_icone is None:
        cor_icone = CORES["azul_medio"]
    # Fundo do card
    card = adicionar_retangulo(slide, left, top, Inches(3.5), Inches(1.8),
                                CORES["branco"])
    # Barra lateral colorida
    adicionar_retangulo(slide, left, top, Inches(0.12), Inches(1.8), cor_icone)
    # Texto
    adicionar_texto(slide, left + Inches(0.3), top + Inches(0.15), Inches(3.0),
                    Inches(0.5), titulo, tamanho=16, cor=CORES["cinza_escuro"],
                    negrito=True)
    adicionar_texto(slide, left + Inches(0.3), top + Inches(0.65), Inches(3.0),
                    Inches(1.0), descricao, tamanho=12, cor=CORES["cinza_medio"])


def adicionar_bullet_list(slide, left, top, width, height, itens, tamanho=14,
                          cor=None, espacamento=Pt(8)):
    """Adiciona uma lista com bullets."""
    if cor is None:
        cor = CORES["cinza_escuro"]
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    for i, item in enumerate(itens):
        if i == 0:
            p = tf.paragraphs[0]
        else:
            p = tf.add_paragraph()
        p.text = f"• {item}"
        p.font.size = Pt(tamanho)
        p.font.color.rgb = cor
        p.font.name = "Segoe UI"
        p.space_after = espacamento


def adicionar_imagem_placeholder(slide, left, top, width, height, label="IMAGEM"):
    """Adiciona um retangulo tracejado como placeholder para imagem."""
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = RGBColor(0xF0, 0xF0, 0xF0)
    shape.line.color.rgb = CORES["cinza_medio"]
    shape.line.dash_style = 2  # dash
    shape.line.width = Pt(2)

    # Texto centralizado
    tf = shape.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = f"[ {label} ]"
    p.font.size = Pt(14)
    p.font.color.rgb = CORES["cinza_medio"]
    p.font.name = "Segoe UI"
    p.alignment = PP_ALIGN.CENTER
    tf.paragraphs[0].space_before = Pt(height.inches * 72 / 3)


# =============================================================================
# SLIDE 1 - CAPA
# =============================================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])  # Blank
adicionar_fundo(slide, CORES["azul_escuro"])

# Titulo principal
adicionar_texto(slide, Inches(1), Inches(1.5), Inches(11), Inches(1.2),
                "SIGEF Extractor & Downloader",
                tamanho=44, cor=CORES["branco"], negrito=True,
                alinhamento=PP_ALIGN.CENTER)

# Subtitulo
adicionar_texto(slide, Inches(1), Inches(2.8), Inches(11), Inches(0.8),
                "Automacao de Extracao e Download de Dados Georreferenciados",
                tamanho=22, cor=CORES["azul_claro"],
                alinhamento=PP_ALIGN.CENTER)

# Linha decorativa
adicionar_retangulo(slide, Inches(5.5), Inches(3.8), Inches(2.3), Inches(0.06),
                    CORES["azul_medio"])

# Versao e data
adicionar_texto(slide, Inches(1), Inches(4.2), Inches(11), Inches(0.5),
                "Versao 2.1  |  Manifest V3  |  Google Chrome",
                tamanho=16, cor=CORES["branco"], alinhamento=PP_ALIGN.CENTER)

# Informacoes autor
adicionar_texto(slide, Inches(1), Inches(5.5), Inches(11), Inches(0.4),
                "Desenvolvido por Roberto Simoes",
                tamanho=18, cor=CORES["azul_claro"], alinhamento=PP_ALIGN.CENTER)
adicionar_texto(slide, Inches(1), Inches(5.95), Inches(11), Inches(0.4),
                "robsimoes@gmail.com  |  +55 (48) 99679-3828",
                tamanho=13, cor=CORES["cinza_medio"], alinhamento=PP_ALIGN.CENTER)

# Rodape
adicionar_retangulo(slide, Inches(0), Inches(7.0), Inches(13.333), Inches(0.5),
                    CORES["preto"])
adicionar_texto(slide, Inches(0), Inches(7.05), Inches(13.333), Inches(0.4),
                "Apresentacao para Diretoria  |  Julho 2026",
                tamanho=11, cor=CORES["cinza_medio"], alinhamento=PP_ALIGN.CENTER)


# =============================================================================
# SLIDE 2 - OBJETIVO DO SISTEMA
# =============================================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
adicionar_fundo(slide, CORES["branco"])
adicionar_titulo_slide(slide, "Objetivo do Sistema",
                       "Por que este software foi desenvolvido?")
adicionar_rodape(slide)

# Bloco principal
adicionar_texto(slide, Inches(0.8), Inches(1.5), Inches(11.5), Inches(1.0),
                "O SIGEF Extractor & Downloader automatiza tarefas manuais repetitivas "
                "na consulta publica de parcelas do SIGEF (INCRA), reduzindo tempo de "
                "processamento de horas para minutos e eliminando erros de digitacao.",
                tamanho=18, cor=CORES["cinza_escuro"])

# Cards de beneficios
adicionar_icone_texto(slide, Inches(0.8), Inches(2.8), "TEMPO",
                      "Reducao de Tempo",
                      "Processamento que levava horas "
                      "agora e feito em minutos com "
                      "automacao completa.",
                      CORES["verde"])

adicionar_icone_texto(slide, Inches(4.9), Inches(2.8), "ERROS",
                      "Eliminacao de Erros",
                      "Dados extraidos automaticamente "
                      "sem digitacao manual, garantindo "
                      "consistencia e confiabilidade.",
                      CORES["azul_medio"])

adicionar_icone_texto(slide, Inches(9.0), Inches(2.8), "LOTE",
                      "Processamento em Lote",
                      "Multiplas parcelas processadas "
                      "sequencialmente com controle "
                      "de pausa e retomada.",
                      CORES["verde_escuro"])

# Placeholder para imagem
adicionar_imagem_placeholder(slide, Inches(1.5), Inches(5.0), Inches(10.3), Inches(1.7),
                              "INSERIR: Captura de tela do SIGEF ou fluxo manual vs automatizado")


# =============================================================================
# SLIDE 3 - FUNCIONALIDADES PRINCIPAIS
# =============================================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
adicionar_fundo(slide, CORES["branco"])
adicionar_titulo_slide(slide, "Funcionalidades Principais",
                       "3 modulos de operacao integrados")
adicionar_rodape(slide)

# Modulo 1
adicionar_retangulo(slide, Inches(0.5), Inches(1.5), Inches(3.8), Inches(4.8),
                    CORES["azul_fundo"])
adicionar_retangulo(slide, Inches(0.5), Inches(1.5), Inches(3.8), Inches(0.08),
                    CORES["azul_medio"])
adicionar_texto(slide, Inches(0.7), Inches(1.7), Inches(3.4), Inches(0.5),
                "1. EXTRACAO DE DADOS", tamanho=16, cor=CORES["azul_medio"],
                negrito=True)
adicionar_texto(slide, Inches(0.7), Inches(2.2), Inches(3.4), Inches(0.8),
                "Scraper automatizado que busca parcelas por Codigo, CPF ou CNPJ",
                tamanho=13, cor=CORES["cinza_escuro"])
adicionar_bullet_list(slide, Inches(0.7), Inches(2.9), Inches(3.4), Inches(3.0), [
    "Entrada: Codigo, CPF ou CNPJ",
    "Formato automatico dos dados",
    "Paginacao automatica",
    "Saida: CSV consolidado",
    "Campos: Nome, Codigo, Area, Detentor, CNS, Matricula"
], tamanho=11)

# Modulo 2
adicionar_retangulo(slide, Inches(4.8), Inches(1.5), Inches(3.8), Inches(4.8),
                    CORES["azul_fundo"])
adicionar_retangulo(slide, Inches(4.8), Inches(1.5), Inches(3.8), Inches(0.08),
                    CORES["verde"])
adicionar_texto(slide, Inches(5.0), Inches(1.7), Inches(3.4), Inches(0.5),
                "2. DOWNLOAD EM LOTE", tamanho=16, cor=CORES["verde"],
                negrito=True)
adicionar_texto(slide, Inches(5.0), Inches(2.2), Inches(3.4), Inches(0.8),
                "Download direto de documentos oficiais do SIGEF",
                tamanho=13, cor=CORES["cinza_escuro"])
adicionar_bullet_list(slide, Inches(5.0), Inches(2.9), Inches(3.4), Inches(3.0), [
    "PDF: Planta + Memorial",
    "CSV: Exportacao de dados",
    "SHP: Shapefile (.zip)",
    "Organizacao por pastas",
    "Controle de conflito (overwrite)"
], tamanho=11)

# Modulo 3
adicionar_retangulo(slide, Inches(9.1), Inches(1.5), Inches(3.8), Inches(4.8),
                    CORES["azul_fundo"])
adicionar_retangulo(slide, Inches(9.1), Inches(1.5), Inches(3.8), Inches(0.08),
                    CORES["azul_escuro"])
adicionar_texto(slide, Inches(9.3), Inches(1.7), Inches(3.4), Inches(0.5),
                "3. MAPA INTERATIVO", tamanho=16, cor=CORES["azul_escuro"],
                negrito=True)
adicionar_texto(slide, Inches(9.3), Inches(2.2), Inches(3.4), Inches(0.8),
                "Geracao de mapa HTML com poligonos WKT",
                tamanho=13, cor=CORES["cinza_escuro"])
adicionar_bullet_list(slide, Inches(9.3), Inches(2.9), Inches(3.4), Inches(3.0), [
    "Parse de CSV com WKT",
    "POLYGON e MULTIPOLYGON",
    "Leaflet.js + Google Maps",
    "Legenda com area (ha)",
    "Links diretos para SIGEF"
], tamanho=11)


# =============================================================================
# SLIDE 4 - CICLO DO SOFTWARE
# =============================================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
adicionar_fundo(slide, CORES["branco"])
adicionar_titulo_slide(slide, "Ciclo do Software",
                       "Fluxo completo de operacao")
adicionar_rodape(slide)

# Diagrama de ciclo - usando retangulos e setas
etapas = [
    ("1. INSTALACAO", "Carregar extensao\nno Chrome", CORES["azul_escuro"], 0.5),
    ("2. EXTRACAO", "Buscar parcelas\ne gerar CSV", CORES["azul_medio"], 3.5),
    ("3. DOWNLOAD", "Baixar PDFs,\nCSVs e SHPs", CORES["verde"], 6.5),
    ("4. MAPA", "Gerar mapa\nHTML interativo", CORES["verde_escuro"], 9.5),
]

for titulo, desc, cor, left in etapas:
    # Caixa da etapa
    shape = adicionar_retangulo(slide, Inches(left), Inches(2.2),
                                 Inches(2.8), Inches(2.0), cor)
    # Titulo
    adicionar_texto(slide, Inches(left + 0.1), Inches(2.3), Inches(2.6),
                    Inches(0.5), titulo, tamanho=14, cor=CORES["branco"],
                    negrito=True, alinhamento=PP_ALIGN.CENTER)
    # Descricao
    adicionar_texto(slide, Inches(left + 0.1), Inches(2.8), Inches(2.6),
                    Inches(1.2), desc, tamanho=13, cor=CORES["branco"],
                    alinhamento=PP_ALIGN.CENTER)

# Seta entre etapas 1-2
adicionar_texto(slide, Inches(3.35), Inches(2.8), Inches(0.4), Inches(0.5),
                ">>>", tamanho=20, cor=CORES["cinza_medio"],
                alinhamento=PP_ALIGN.CENTER)
# Seta entre etapas 2-3
adicionar_texto(slide, Inches(6.35), Inches(2.8), Inches(0.4), Inches(0.5),
                ">>>", tamanho=20, cor=CORES["cinza_medio"],
                alinhamento=PP_ALIGN.CENTER)
# Seta entre etapas 3-4
adicionar_texto(slide, Inches(9.35), Inches(2.8), Inches(0.4), Inches(0.5),
                ">>>", tamanho=20, cor=CORES["cinza_medio"],
                alinhamento=PP_ALIGN.CENTER)

# Setas de retorno
adicionar_texto(slide, Inches(4.5), Inches(4.5), Inches(4.3), Inches(0.5),
                "<-- Controle de Pausa/Retomada/Parada em qualquer etapa -->",
                tamanho=11, cor=CORES["cinza_medio"], alinhamento=PP_ALIGN.CENTER)

# Placeholder
adicionar_imagem_placeholder(slide, Inches(1.0), Inches(5.2), Inches(11.3), Inches(1.5),
                              "INSERIR: Fluxograma detalhado do ciclo do software")


# =============================================================================
# SLIDE 5 - COMO OS ARQUIVOS SAO PREPARADOS
# =============================================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
adicionar_fundo(slide, CORES["branco"])
adicionar_titulo_slide(slide, "Como os Arquivos Sao Preparados",
                       "Formatos de entrada e saida")
adicionar_rodape(slide)

# Entrada
adicionar_texto(slide, Inches(0.6), Inches(1.5), Inches(6), Inches(0.5),
                "ENTRADA", tamanho=18, cor=CORES["azul_medio"], negrito=True)

adicionar_retangulo(slide, Inches(0.6), Inches(2.0), Inches(5.8), Inches(2.2),
                    CORES["cinza_claro"])
adicionar_texto(slide, Inches(0.8), Inches(2.1), Inches(5.4), Inches(0.4),
                "Formatos aceitos:", tamanho=13, cor=CORES["cinza_escuro"], negrito=True)
adicionar_bullet_list(slide, Inches(0.8), Inches(2.5), Inches(5.4), Inches(1.5), [
    "Texto plano: Codigo, CPF ou CNPJ (um por linha)",
    "CSV com separador (;): Nome;UUID;...",
    "Pasta com CSVs: poligonos WKT"
], tamanho=12)

# Saida
adicionar_texto(slide, Inches(7.0), Inches(1.5), Inches(6), Inches(0.5),
                "SAIDA", tamanho=18, cor=CORES["verde"], negrito=True)

adicionar_retangulo(slide, Inches(7.0), Inches(2.0), Inches(5.8), Inches(2.2),
                    CORES["cinza_claro"])
adicionar_texto(slide, Inches(7.2), Inches(2.1), Inches(5.4), Inches(0.4),
                "Arquivos gerados:", tamanho=13, cor=CORES["cinza_escuro"], negrito=True)
adicionar_bullet_list(slide, Inches(7.2), Inches(2.5), Inches(5.4), Inches(1.5), [
    "CSV consolidado com todos os dados",
    "PDF: Planta + Memorial descritivo",
    "SHP: Shapefile compactado (.zip)",
    "HTML: Mapa interativo com Leaflet"
], tamanho=12)

# Estrutura de pastas
adicionar_texto(slide, Inches(0.6), Inches(4.5), Inches(12), Inches(0.5),
                "ESTRUTURA DE PASTAS GERADA:", tamanho=16, cor=CORES["cinza_escuro"],
                negrito=True)

adicionar_retangulo(slide, Inches(0.6), Inches(5.0), Inches(12.1), Inches(1.7),
                    CORES["cinza_claro"])

# Simular estrutura de arvore
estrutura = (
    "Downloads/\n"
    "  └── CODIGO_IMOVEL/\n"
    "        └── Nome_Parcela/\n"
    "              ├── Nome_Parcela_UUID_planta.pdf\n"
    "              ├── Nome_Parcela_UUID_memorial.pdf\n"
    "              ├── Nome_Parcela_UUID.csv\n"
    "              └── Nome_Parcela_UUID.zip"
)

adicionar_texto(slide, Inches(1.0), Inches(5.1), Inches(11), Inches(1.5),
                estrutura, tamanho=12, cor=CORES["cinza_escuro"], fonte="Consolas")


# =============================================================================
# SLIDE 6 - INTERFACE DO USUARIO
# =============================================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
adicionar_fundo(slide, CORES["branco"])
adicionar_titulo_slide(slide, "Interface do Usuario",
                       "Popup com 4 abas de operacao")
adicionar_rodape(slide)

# Abas
abas_info = [
    ("ABA 1: EXTRACAO", "Textarea para entrada de dados\nRadio buttons: Codigo/CPF/CNPJ\nBotao: EXTRAIR DADOS",
     CORES["azul_medio"]),
    ("ABA 2: DOWNLOAD", "Upload de CSV\nCheckboxes: PDF/CSV/SHP\nBotao: INICIAR DOWNLOAD",
     CORES["verde"]),
    ("ABA 3: GERAR MAPA", "Selecao de pasta\nBusca recursiva de CSVs\nBotao: GERAR MAPA",
     CORES["verde_escuro"]),
    ("ABA 4: LOGS", "Registro de operacoes\nCores por nivel\nCopiar/Limpar logs",
     CORES["cinza_medio"]),
]

for i, (titulo, desc, cor) in enumerate(abas_info):
    left = Inches(0.5 + i * 3.2)
    adicionar_retangulo(slide, left, Inches(1.6), Inches(2.9), Inches(2.8),
                        CORES["cinza_claro"])
    adicionar_retangulo(slide, left, Inches(1.6), Inches(2.9), Inches(0.08), cor)
    adicionar_texto(slide, left + Inches(0.15), Inches(1.75), Inches(2.6),
                    Inches(0.5), titulo, tamanho=13, cor=cor, negrito=True)
    adicionar_texto(slide, left + Inches(0.15), Inches(2.2), Inches(2.6),
                    Inches(2.0), desc, tamanho=11, cor=CORES["cinza_escuro"])

# Placeholder
adicionar_imagem_placeholder(slide, Inches(1.5), Inches(4.7), Inches(10.3), Inches(2.0),
                              "INSERIR: Capturas de tela das 4 abas do popup")


# =============================================================================
# SLIDE 7 - FLUXO DE EXTRACAO DETALHADO
# =============================================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
adicionar_fundo(slide, CORES["branco"])
adicionar_titulo_slide(slide, "Fluxo de Extracao - Detalhado",
                       "Passo a passo do scraper automatizado")
adicionar_rodape(slide)

# Fluxo vertical
passos = [
    ("1", "Usuario entra com dados", "Digita Codigo, CPF ou CNPJ na aba Extracao"),
    ("2", "Formatacao automatica", "Codigo: 13 digitos | CPF: 11 digitos | CNPJ: 14 digitos"),
    ("3", "Verificacao de login", "Extensao verifica se usuario esta logado no SIGEF"),
    ("4", "Injecao de busca", "Script preenche campo correto e clica em Pesquisar"),
    ("5", "Extracao da tabela", "Leitura de todas as linhas da tabela de resultados"),
    ("6", "Paginacao automatica", "Navega por todas as paginas de resultados"),
    ("7", "Geracao do CSV", "Exporta dados consolidados: Nome, Codigo, Area, etc."),
]

for i, (num, titulo, desc) in enumerate(passos):
    top = Inches(1.5 + i * 0.75)
    # Numero
    shape = adicionar_retangulo(slide, Inches(0.8), top, Inches(0.5), Inches(0.5),
                                 CORES["azul_medio"])
    tf = shape.text_frame
    p = tf.paragraphs[0]
    p.text = num
    p.font.size = Pt(14)
    p.font.color.rgb = CORES["branco"]
    p.font.bold = True
    p.alignment = PP_ALIGN.CENTER

    # Titulo
    adicionar_texto(slide, Inches(1.5), top, Inches(3.5), Inches(0.35),
                    titulo, tamanho=14, cor=CORES["cinza_escuro"], negrito=True)
    # Descricao
    adicionar_texto(slide, Inches(1.5), top + Inches(0.3), Inches(7), Inches(0.35),
                    desc, tamanho=11, cor=CORES["cinza_medio"])

    # Linha conectando
    if i < len(passos) - 1:
        adicionar_texto(slide, Inches(0.95), top + Inches(0.5), Inches(0.2),
                        Inches(0.3), "|", tamanho=14, cor=CORES["azul_claro"])

# Placeholder
adicionar_imagem_placeholder(slide, Inches(9.0), Inches(1.5), Inches(3.8), Inches(5.2),
                              "INSERIR: Fluxograma da extracao")


# =============================================================================
# SLIDE 8 - FLUXO DE DOWNLOAD DETALHADO
# =============================================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
adicionar_fundo(slide, CORES["branco"])
adicionar_titulo_slide(slide, "Fluxo de Download - Detalhado",
                       "Processamento em lote de documentos")
adicionar_rodape(slide)

# Fluxo
passos_dl = [
    ("1", "Carregar CSV", "Usuario seleciona arquivo CSV com Nome;UUID"),
    ("2", "Selecionar tipos", "Checkboxes: PDF, CSV, SHP"),
    ("3", "Parse da fila", "Leitura e validacao de cada linha do CSV"),
    ("4", "Para cada parcela:", "Extracao do UUID e sanitizacao do nome"),
    ("5", "Download PDF", "Planta + Memorial (URLs diretas do SIGEF)"),
    ("6", "Download CSV", "Exportacao de dados da parcela"),
    ("7", "Download SHP", "Shapefile compactado (.zip)"),
    ("8", "Organizacao", "Arquivos salvos em pastas por parcela"),
]

for i, (num, titulo, desc) in enumerate(passos_dl):
    top = Inches(1.5 + i * 0.68)
    # Numero
    shape = adicionar_retangulo(slide, Inches(0.8), top, Inches(0.5), Inches(0.45),
                                 CORES["verde"])
    tf = shape.text_frame
    p = tf.paragraphs[0]
    p.text = num
    p.font.size = Pt(13)
    p.font.color.rgb = CORES["branco"]
    p.font.bold = True
    p.alignment = PP_ALIGN.CENTER

    adicionar_texto(slide, Inches(1.5), top, Inches(3.5), Inches(0.3),
                    titulo, tamanho=13, cor=CORES["cinza_escuro"], negrito=True)
    adicionar_texto(slide, Inches(1.5), top + Inches(0.25), Inches(7), Inches(0.3),
                    desc, tamanho=10, cor=CORES["cinza_medio"])

# Placeholder
adicionar_imagem_placeholder(slide, Inches(9.0), Inches(1.5), Inches(3.8), Inches(5.2),
                              "INSERIR: Fluxograma do download")


# =============================================================================
# SLIDE 9 - COMO O MAPA E GERADO
# =============================================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
adicionar_fundo(slide, CORES["branco"])
adicionar_titulo_slide(slide, "Geracao do Mapa Interativo",
                       "De CSV com WKT para mapa visual")
adicionar_rodape(slide)

# Pipeline
adicionar_texto(slide, Inches(0.6), Inches(1.5), Inches(12), Inches(0.5),
                "PIPELINE DE PROCESSAMENTO:", tamanho=16, cor=CORES["cinza_escuro"],
                negrito=True)

pipeline = [
    ("CSVs da pasta", "Leitura recursiva\nde todos os .csv"),
    ("Parse WKT", "Deteccao de colunas\nWKT/GEOMETRIA"),
    ("Extracao", "Conversao de\ncoordenadas"),
    ("Geracao HTML", "Template Leaflet\n+ poligonos"),
    ("Download", "Salvar mapa\nHTML interativo"),
]

for i, (titulo, desc) in enumerate(pipeline):
    left = Inches(0.5 + i * 2.55)
    adicionar_retangulo(slide, left, Inches(2.1), Inches(2.2), Inches(1.5),
                        CORES["azul_fundo"])
    adicionar_texto(slide, left + Inches(0.1), Inches(2.2), Inches(2.0),
                    Inches(0.4), titulo, tamanho=12, cor=CORES["azul_medio"],
                    negrito=True, alinhamento=PP_ALIGN.CENTER)
    adicionar_texto(slide, left + Inches(0.1), Inches(2.6), Inches(2.0),
                    Inches(0.8), desc, tamanho=10, cor=CORES["cinza_escuro"],
                    alinhamento=PP_ALIGN.CENTER)
    if i < len(pipeline) - 1:
        adicionar_texto(slide, Inches(0.5 + (i + 1) * 2.55 - 0.35), Inches(2.5),
                        Inches(0.4), Inches(0.5), ">>>", tamanho=16,
                        cor=CORES["cinza_medio"], alinhamento=PP_ALIGN.CENTER)

# Detalhes
adicionar_texto(slide, Inches(0.6), Inches(4.0), Inches(6), Inches(0.5),
                "FORMATOS SUPORTADOS:", tamanho=14, cor=CORES["cinza_escuro"],
                negrito=True)
adicionar_bullet_list(slide, Inches(0.6), Inches(4.4), Inches(5.5), Inches(2.0), [
    "POLYGON ((lon lat, lon lat, ...))",
    "MULTIPOLYGON (((lon lat, ...)))",
    "Separador: ponto e virgula (;)",
    "Colunas: WKT, GEOMETRIA, GEOMETRY"
], tamanho=12)

adicionar_texto(slide, Inches(7.0), Inches(4.0), Inches(6), Inches(0.5),
                "CAMADAS DO MAPA:", tamanho=14, cor=CORES["cinza_escuro"],
                negrito=True)
adicionar_bullet_list(slide, Inches(7.0), Inches(4.4), Inches(5.5), Inches(2.0), [
    "Google Hibrido (padrao)",
    "Google Satelite",
    "Google Terreno",
    "Legenda com links para SIGEF"
], tamanho=12)

# Placeholder
adicionar_imagem_placeholder(slide, Inches(1.0), Inches(5.7), Inches(11.3), Inches(1.0),
                              "INSERIR: Exemplo de mapa HTML gerado com poligonos")


# =============================================================================
# SLIDE 10 - ARQUITETURA TECNICA
# =============================================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
adicionar_fundo(slide, CORES["branco"])
adicionar_titulo_slide(slide, "Arquitetura Tecnica",
                       "Componentes e comunicacao interna")
adicionar_rodape(slide)

# Componentes
componentes = [
    ("popup.html\npopup.js", "Interface do\nusuario", CORES["azul_medio"]),
    ("background.js", "Service Worker\nMotor principal", CORES["azul_escuro"]),
    ("content.js", "Script injetado\nAnti-deteccao", CORES["verde_escuro"]),
    ("chrome.storage", "Persistencia\nde estado", CORES["cinza_medio"]),
    ("SIGEF INCRA", "API web\nexterna", CORES["vermelho"]),
]

for i, (nome, desc, cor) in enumerate(componentes):
    left = Inches(0.5 + i * 2.55)
    adicionar_retangulo(slide, left, Inches(1.6), Inches(2.2), Inches(2.2), cor)
    adicionar_texto(slide, left + Inches(0.1), Inches(1.7), Inches(2.0),
                    Inches(0.8), nome, tamanho=12, cor=CORES["branco"],
                    negrito=True, alinhamento=PP_ALIGN.CENTER)
    adicionar_texto(slide, left + Inches(0.1), Inches(2.5), Inches(2.0),
                    Inches(1.0), desc, tamanho=11, cor=CORES["branco"],
                    alinhamento=PP_ALIGN.CENTER)

# Permissoes
adicionar_texto(slide, Inches(0.6), Inches(4.2), Inches(12), Inches(0.5),
                "PERMISSOES DO MANIFEST V3:", tamanho=16, cor=CORES["cinza_escuro"],
                negrito=True)

permissoes = [
    ("downloads", "Salvar arquivos gerados"),
    ("tabs", "Gerenciar abas de navegacao"),
    ("scripting", "Injetar scripts de automacao"),
    ("activeTab", "Verificar login"),
    ("storage", "Persistir fila e estado"),
    ("webNavigation", "Rastrear carregamento"),
]

for i, (perm, func) in enumerate(permissoes):
    col = i % 3
    row = i // 3
    left = Inches(0.6 + col * 4.2)
    top = Inches(4.8 + row * 0.65)
    adicionar_retangulo(slide, left, top, Inches(3.8), Inches(0.5), CORES["azul_fundo"])
    adicionar_texto(slide, left + Inches(0.1), top + Inches(0.05), Inches(1.8),
                    Inches(0.4), perm, tamanho=11, cor=CORES["azul_medio"], negrito=True)
    adicionar_texto(slide, left + Inches(1.9), top + Inches(0.05), Inches(1.8),
                    Inches(0.4), func, tamanho=10, cor=CORES["cinza_escuro"])

# Placeholder
adicionar_imagem_placeholder(slide, Inches(1.0), Inches(6.2), Inches(11.3), Inches(0.6),
                              "INSERIR: Diagrama de componentes")


# =============================================================================
# SLIDE 11 - ANTI-DETECCAO E SEGURANCA
# =============================================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
adicionar_fundo(slide, CORES["branco"])
adicionar_titulo_slide(slide, "Anti-Deteccao e Seguranca",
                       "Como o software contorna restricoes do SIGEF")
adicionar_rodape(slide)

# Anti-deteccao
adicionar_texto(slide, Inches(0.6), Inches(1.5), Inches(6), Inches(0.5),
                "TECNICAS DE ANTI-DETECCAO:", tamanho=16, cor=CORES["cinza_escuro"],
                negrito=True)

tecnica = [
    "Digitecao caractere a caractere (45-160ms/char)",
    "Cadeia completa de eventos de mouse (5 eventos)",
    "Scroll aleatorio em paginas de detalhe",
    "Mouse move simulado com coordenadas aleatorias",
    "Delays dinamicos entre operacoes (500-2500ms)",
    "User-Agent nativo do Chrome (nao modificado)",
]

adicionar_bullet_list(slide, Inches(0.6), Inches(2.1), Inches(6), Inches(3.0),
                      tecnica, tamanho=13)

# Seguranca
adicionar_texto(slide, Inches(7.0), Inches(1.5), Inches(6), Inches(0.5),
                "SEGURANCA DO SISTEMA:", tamanho=16, cor=CORES["cinza_escuro"],
                negrito=True)

seguranca = [
    "Permissoes minimas (Manifest V3)",
    "Acesso restrito ao dominio SIGEF",
    "Login manual (nao automatizado)",
    "Retry com 3 tentativas por pagina",
    "Recuperacao automatica de abas",
    "Graceful degradation em erros",
]

adicionar_bullet_list(slide, Inches(7.0), Inches(2.1), Inches(6), Inches(3.0),
                      seguranca, tamanho=13)

# Placeholder
adicionar_imagem_placeholder(slide, Inches(1.0), Inches(5.0), Inches(11.3), Inches(1.7),
                              "INSERIR: Captura de tela mostrando delays ou logs de anti-deteccao")


# =============================================================================
# SLIDE 12 - RESULTADOS E IMPACTO
# =============================================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
adicionar_fundo(slide, CORES["branco"])
adicionar_titulo_slide(slide, "Resultados e Impacto",
                       "Ganhos operacionais com a automacao")
adicionar_rodape(slide)

# Metricas
metricas = [
    ("TEMPO", "Reducao de\n90%+", "de horas para minutos", CORES["verde"]),
    ("ERROS", "Eliminacao\nde erros", "manuais de digitacao", CORES["azul_medio"]),
    ("LOTE", "Multiplas\nparcelas", "processadas sequencialmente", CORES["verde_escuro"]),
    ("ARQUIVOS", "Organizacao\nautomatica", "por pasta e parcela", CORES["azul_escuro"]),
]

for i, (label, valor, desc, cor) in enumerate(metricas):
    left = Inches(0.5 + i * 3.2)
    adicionar_retangulo(slide, left, Inches(1.8), Inches(2.9), Inches(2.5), cor)
    adicionar_texto(slide, left + Inches(0.1), Inches(1.9), Inches(2.7),
                    Inches(0.4), label, tamanho=14, cor=CORES["branco"],
                    alinhamento=PP_ALIGN.CENTER)
    adicionar_texto(slide, left + Inches(0.1), Inches(2.3), Inches(2.7),
                    Inches(1.0), valor, tamanho=28, cor=CORES["branco"],
                    negrito=True, alinhamento=PP_ALIGN.CENTER)
    adicionar_texto(slide, left + Inches(0.1), Inches(3.3), Inches(2.7),
                    Inches(0.8), desc, tamanho=12, cor=CORES["branco"],
                    alinhamento=PP_ALIGN.CENTER)

# Placeholder
adicionar_imagem_placeholder(slide, Inches(1.0), Inches(4.7), Inches(11.3), Inches(2.0),
                              "INSERIR: Grafico comparativo tempo manual vs automatizado")


# =============================================================================
# SLIDE 13 - ROADMAP / MELHORIAS FUTURAS
# =============================================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
adicionar_fundo(slide, CORES["branco"])
adicionar_titulo_slide(slide, "Roadmap e Melhorias Futuras",
                       "Proximos passos e evolucao do sistema")
adicionar_rodape(slide)

# Curto prazo
adicionar_texto(slide, Inches(0.6), Inches(1.5), Inches(3.8), Inches(0.5),
                "CURTO PRAZO", tamanho=16, cor=CORES["verde"], negrito=True)
adicionar_retangulo(slide, Inches(0.6), Inches(2.0), Inches(3.8), Inches(3.0),
                    CORES["cinza_claro"])
adicionar_bullet_list(slide, Inches(0.8), Inches(2.1), Inches(3.4), Inches(2.8), [
    "Cache de busca (evitar rebusca)",
    "Testes automatizados",
    "Documentacao de API",
    "Melhoria de logs"
], tamanho=13)

# Medio prazo
adicionar_texto(slide, Inches(4.9), Inches(1.5), Inches(3.8), Inches(0.5),
                "MEDIO PRAZO", tamanho=16, cor=CORES["azul_medio"], negrito=True)
adicionar_retangulo(slide, Inches(4.9), Inches(2.0), Inches(3.8), Inches(3.0),
                    CORES["cinza_claro"])
adicionar_bullet_list(slide, Inches(5.1), Inches(2.1), Inches(3.4), Inches(2.8), [
    "Exportacao GeoJSON/GPX",
    "Dashboard web de monitoramento",
    "Internacionalizacao (i18n)",
    "Suporte a outros browsers"
], tamanho=13)

# Longo prazo
adicionar_texto(slide, Inches(9.2), Inches(1.5), Inches(3.8), Inches(0.5),
                "LONGO PRAZO", tamanho=16, cor=CORES["azul_escuro"], negrito=True)
adicionar_retangulo(slide, Inches(9.2), Inches(2.0), Inches(3.8), Inches(3.0),
                    CORES["cinza_claro"])
adicionar_bullet_list(slide, Inches(9.4), Inches(2.1), Inches(3.4), Inches(2.8), [
    "Agendamento de execucoes",
    "Integracao com SIGEF API",
    "Assinatura digital de PDFs",
    "Modo offline/parcial"
], tamanho=13)

# Placeholder
adicionar_imagem_placeholder(slide, Inches(1.0), Inches(5.3), Inches(11.3), Inches(1.4),
                              "INSERIR: Roadmap visual ou timeline de evolucao")


# =============================================================================
# SLIDE 14 - PROXIMOS PASSOS
# =============================================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
adicionar_fundo(slide, CORES["branco"])
adicionar_titulo_slide(slide, "Proximos Passos",
                       "Acoes recomendadas para a diretoria")
adicionar_rodape(slide)

passos_recomendados = [
    ("Aprovacao", "Aprovacao para uso em ambiente de producao"),
    ("Treinamento", "Treinamento da equipe de operacoes"),
    ("Piloto", "Execucao piloto com lote controlado"),
    ("Monitoramento", "Acompanhamento de logs e performance"),
    ("Expansao", "Ampliacao para todos os escritorios regionais"),
]

for i, (titulo, desc) in enumerate(passos_recomendados):
    top = Inches(1.7 + i * 0.95)
    # Numero
    shape = adicionar_retangulo(slide, Inches(1.0), top, Inches(0.6), Inches(0.6),
                                 CORES["azul_medio"])
    tf = shape.text_frame
    p = tf.paragraphs[0]
    p.text = str(i + 1)
    p.font.size = Pt(18)
    p.font.color.rgb = CORES["branco"]
    p.font.bold = True
    p.alignment = PP_ALIGN.CENTER

    # Titulo
    adicionar_texto(slide, Inches(1.8), top, Inches(4), Inches(0.35),
                    titulo, tamanho=16, cor=CORES["cinza_escuro"], negrito=True)
    # Descricao
    adicionar_texto(slide, Inches(1.8), top + Inches(0.3), Inches(9), Inches(0.35),
                    desc, tamanho=13, cor=CORES["cinza_medio"])

# Placeholder
adicionar_imagem_placeholder(slide, Inches(7.5), Inches(1.7), Inches(5.0), Inches(4.5),
                              "INSERIR: Cronograma ou timeline de implementacao")


# =============================================================================
# SLIDE 15 - CONTATO E ENCERRAMENTO
# =============================================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
adicionar_fundo(slide, CORES["azul_escuro"])

adicionar_texto(slide, Inches(1), Inches(1.5), Inches(11), Inches(1.0),
                "Obrigado!",
                tamanho=48, cor=CORES["branco"], negrito=True,
                alinhamento=PP_ALIGN.CENTER)

adicionar_texto(slide, Inches(1), Inches(2.8), Inches(11), Inches(0.8),
                "SIGEF Extractor & Downloader v2.1",
                tamanho=24, cor=CORES["azul_claro"], alinhamento=PP_ALIGN.CENTER)

# Linha decorativa
adicionar_retangulo(slide, Inches(5.5), Inches(3.7), Inches(2.3), Inches(0.06),
                    CORES["azul_medio"])

# Contato
adicionar_texto(slide, Inches(1), Inches(4.2), Inches(11), Inches(0.5),
                "Desenvolvido por Roberto Simoes",
                tamanho=20, cor=CORES["branco"], alinhamento=PP_ALIGN.CENTER)

adicionar_texto(slide, Inches(1), Inches(5.0), Inches(11), Inches(0.4),
                "robsimoes@gmail.com", tamanho=16, cor=CORES["azul_claro"],
                alinhamento=PP_ALIGN.CENTER)

adicionar_texto(slide, Inches(1), Inches(5.4), Inches(11), Inches(0.4),
                "+55 (48) 99679-3828", tamanho=16, cor=CORES["azul_claro"],
                alinhamento=PP_ALIGN.CENTER)

adicionar_texto(slide, Inches(1), Inches(5.8), Inches(11), Inches(0.4),
                "linkedin.com/in/robertosim", tamanho=14, cor=CORES["cinza_medio"],
                alinhamento=PP_ALIGN.CENTER)

# Rodape
adicionar_retangulo(slide, Inches(0), Inches(7.0), Inches(13.333), Inches(0.5),
                    CORES["preto"])
adicionar_texto(slide, Inches(0), Inches(7.05), Inches(13.333), Inches(0.4),
                "Apresentacao para Diretoria  |  Julho 2026",
                tamanho=11, cor=CORES["cinza_medio"], alinhamento=PP_ALIGN.CENTER)


# =============================================================================
# SALVAR ARQUIVO
# =============================================================================
output_dir = os.path.dirname(os.path.abspath(__file__))
output_path = os.path.join(output_dir, "Apresentacao_SIGEF_Diretoria.pptx")
prs.save(output_path)
print(f"Apresentacao gerada com sucesso: {output_path}")
print(f"Total de slides: {len(prs.slides)}")
