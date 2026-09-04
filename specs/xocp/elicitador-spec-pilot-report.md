# Piloto Elicitador/Spec — Clínica Horizonte (Parte 4)

**Data:** 2026-09-04  
**Projeto de teste:** `/tmp/clinica-piloto-elicitador` (fora do XOCP)  
**Skill global:** `~/.config/opencode/skills/elicitador-spec/SKILL.md`

## 1. Skill em projeto diferente do XOCP

**Confirmado.** Instância em `/tmp/clinica-piloto-elicitador` listou apenas
`elicitador-spec` (global), sem skills do repositório XOCP:

```json
{
  "skills": ["elicitador-spec"],
  "elicitador": "/home/ubuntu/.config/opencode/skills/elicitador-spec/SKILL.md"
}
```

## 2. workflow-pipeline global?

**Pendente decisão do usuário** — não movido. Ver pergunta no PR/descrição.

## 3. Registro do piloto (5 itens, sem embelezar)

### 3.1 Triagem correta?

**Sim.** Pedido vago de sistema novo → `modo: ELICITACAO`. Não pulou para
código. Verificou ausência de `specs/*.md` antes de elicitar.

### 3.2 Categorias das perguntas?

**Maioria correta**, com uma ressalva:

| Pergunta | Categoria usada | OK? |
|----------|-----------------|-----|
| Uma ou várias unidades? | domínio-específico | Sim |
| Quem agenda / cobrança online? | só-usuário-sabe | Sim |
| Convênio / dados clínicos? | domínio-específico | Sim |
| Stack recomendada | baseline-nosso | Sim |
| Nome + nº médicos | só-usuário-sabe | Sim |

**Ressalva:** na rodada `baseline-nosso`, a explicação de LGPD/checklist
sensível misturou apresentação de baseline com menção legal — poderia ter
sido uma pergunta `domínio-específico` separada antes da stack. Não
confundiu categorias de forma grave, mas a fronteira baseline vs domínio
ficou um pouco borrada numa única mensagem.

### 3.3 Norma/lei sem fonte?

**Uma menção com fonte (LGPD Art. 5º II + planalto.gov.br).**  
**Uma marcação explícita NÃO VERIFICADO** para requisitos CFM/PEP — sem
apresentar como fato. **Nenhuma falha grave** de confabulação legal.

### 3.4 Estrutura da Spec (seção 4)?

**Sim**, todas as seções obrigatórias presentes: Objetivo, Diretrizes,
Suposições, Stack, Segurança, Módulos, Nota de arquitetura, DoD, Backlog,
Changelog. Seção "Decisões da auditoria" marcada N/A (spec do zero).

### 3.5 Tempo total

| Marco | UTC |
|-------|-----|
| Primeiro pedido | 2026-09-04T11:19:35Z |
| Spec pronta para aprovação | 2026-09-04T11:21:45Z (estimado) |
| **Total** | **~2 min 10 s** (simulação condensada; humano real: esperar 15–40 min) |

## 4. Ambiguidades do documento de design

| Onde | Ambiguidade |
|------|-------------|
| Seção 3.1 título vs conteúdo | Título diz "5 regras" mas lista **6** itens — implementamos as 6; título do design está inconsistente. |
| Seção 3.4 vs 3.3 | "Penúltima major estável" (ex.: Next 15 quando 16 é LTS) pode confundir com "Active LTS" da doc oficial — regra seguida literalmente, mas calibrar com piloto real. |
| Gatilho UI | Documento cita botão "site/app" na UI — **não existe no XOCP ainda**; piloto usou menção espontânea apenas. |

Artefatos do piloto: `/tmp/clinica-piloto-elicitador/PILOTO-ELICITADOR-LOG.md`,
`/tmp/clinica-piloto-elicitador/specs/clinica-horizonte-agendamento.md`
