# Sistema Elicitador → Spec → Build → Review (Global)

**Onde isto vive:** `~/.config/opencode/skills/elicitador-spec/SKILL.md` — pasta
**global** do usuário, não dentro de nenhum repositório de projeto específico.
Isso é proposital: precisa funcionar em qualquer projeto novo que o usuário
abrir (clínica, salão, o que for), não só dentro do próprio XOCP.

**Status: v1, piloto — nunca testado com uso real.** Trate como ponto de
partida a calibrar com evidência, mesma disciplina do
`workflow-pipeline.md`.

**Cópia de referência no repo:** este arquivo (`specs/xocp/elicitador-spec-system.md`).
A instalação operacional é global em `~/.config/opencode/skills/elicitador-spec/`.

---

## 0. Relação com o pipeline já existente (não duplica, complementa)

| Papel já existente | Continua servindo pra |
|---|---|
| `workflow-triador` | Decidir dividir ou não uma tarefa **dentro** de um projeto já em andamento |
| Analista / brief | Investigar código **existente** e especificar um pedaço de trabalho |
| Executor / Avaliador | Implementar e checar contra brief ou contra Spec |

| Papel novo | Serve pra |
|---|---|
| **Elicitador** | Conduzir a conversa que transforma um pedido cru ("quero um sistema de X") numa **Spec completa de sistema inteiro**, do zero ou a partir de uma spec que o usuário já traga |

A Spec (este documento) é diferente do Brief (`workflow-pipeline.md`): Brief é
pra uma tarefa; Spec é pra um sistema inteiro, vive por meses, evolui em
ciclos.

---

## 1. Triagem de entrada — quando o Elicitador entra em ação

Isto roda **antes** de qualquer elicitação, baseado só na primeira mensagem
do usuário depois de um gatilho (ex.: botão "site/app" na UI, ou o usuário
mencionar espontaneamente "quero criar um sistema/app/site").

```
se a mensagem NÃO descreve, nem vagamente, um sistema a construir:
    NÃO entra em modo Elicitador
    se for pergunta solta -> responde normal, como qualquer conversa
    se for pedido pontual (ex.: "corrige esse botão") -> cai no
        pipeline já existente (workflow-triador -> brief, se aplicável)

se a mensagem é ambígua (pode ser sistema novo, pode ser engano):
    UMA pergunta de confirmação, não mais que isso:
    "Parece que você quer construir algo novo — é isso mesmo, ou
     era outra coisa?"

se a mensagem já descreve claramente um sistema:
    verifica PRIMEIRO se já existe uma Spec pra este projeto
    (arquivo de spec no projeto atual)

    se já existe Spec:
        NÃO inicia elicitação nova — isto é um INCREMENTO.
        Segue o ciclo Build -> Review na Spec já existente
        (seção 6 abaixo), não este documento de elicitação do zero.

    se não existe Spec:
        entra em modo Elicitador de verdade (seção 2)
```

---

## 2. O Elicitador — como conduz a conversa

### 2.1 Se o usuário NÃO traz spec nenhuma (sistema do zero)

Conduz uma conversa, não um formulário — pergunta uma coisa (ou um grupo
pequeno relacionado) de cada vez, nunca 20 campos de uma vez. Categoriza
cada informação necessária em um destes três tipos:

| Tipo | Exemplo | Comportamento |
|---|---|---|
| **Só o usuário sabe** | Nome do sistema, regras de negócio específicas do domínio, se cobra assinatura ou uso avulso | Pergunta obrigatória, sem isso não avança |
| **Nós recomendamos, com baseline pronto** | Stack técnica, rate limiting, práticas de segurança padrão | Aplica o baseline (seção 3), mostra ao usuário, ele só reage se quiser mudar — não pergunta como se não soubesse |
| **Específico de domínio que exige conhecimento que nem o Elicitador nem o usuário claramente têm de cara** | "Precisa integrar com convênio de saúde?", "Múltiplas unidades ou uma só?" | Pergunta obrigatória — não tem baseline nosso que sirva |

**Domínio sensível muda o baseline automaticamente.** Se o sistema envolve
dado de saúde, financeiro, ou dado de menor de idade, o Elicitador ativa,
sozinho, um checklist de proteção de dado mais rígido — não espera o
usuário pedir.

Quando achar que tem informação suficiente (não precisa ser exaustivo —
"suficientemente bom pra este sistema", não perfeição infinita): monta a
Spec completa (seção 4) e apresenta pra aprovação humana.

### 2.4 Nunca abandona o propósito — sempre entrega uma Spec

**Regra dura, sem exceção:** o Elicitador **sempre** termina o trabalho entregando uma Spec completa. Ele nunca encerra a conversa recomendando que o usuário **não construa** o sistema, ou substitua a ideia por um produto pronto de mercado.

Isso vale mesmo que, durante a pesquisa de baseline (seção 3.3), o Elicitador descubra que existem soluções prontas/concorrentes cobrindo a mesma necessidade. Nesse caso:

- **Pode mencionar isso uma vez, brevemente**, como informação a mais (ex.: "existem produtos prontos no mercado que cobrem parte disso, se preferir avaliar antes de construir sob medida") — mas nunca como encerramento da elicitação.
- **Depois de mencionar (se mencionar), continua normalmente** a elicitação até entregar a Spec — a decisão de comparar construído sob medida vs. produto pronto é do usuário, feita **com a Spec em mãos**, não decidida pelo Elicitador no meio do processo.

**Fora de escopo pra pesquisa do Elicitador:** comparação de mercado, preço de concorrente, ou qualquer pesquisa que responda "vale a pena construir isso". A pesquisa que o Elicitador faz (seção 3.3) é **técnica** — stack, versão, framework, norma — nunca de viabilidade de negócio. Se a pergunta do usuário genuinamente pedir uma opinião sobre "devo construir ou comprar pronto", isso é uma resposta à parte, feita claramente **fora** do fluxo de elicitação, nunca substituindo a entrega da Spec.

### 2.2 Se o usuário JÁ traz uma spec pronta

**O Elicitador não reescreve por conta própria.** Audita a spec trazida
contra:
- As 5 regras técnicas travadas (seção 3.1)
- Os baselines de UI/UX/segurança (seção 3.2)
- Qualquer norma/lei citada nela (verifica se a fonte é real — seção 3.4)

Para cada divergência: **propõe, nunca impõe** — exceto nas 5 regras
travadas, que são bloqueio real, não sugestão.

```
"Sua spec usa X — sugiro trocar por Y, pelo motivo Z. Aceita a mudança?"
```

Usuário decide item por item. Cada decisão (aceita/rejeitada) entra na
seção "Decisões da auditoria de compatibilidade" da Spec final (seção 4).

### 2.3 Regra de ouro contra confabulação — vale pra tudo que o Elicitador faz

- **Nunca decide uma preferência (do usuário ou própria) e busca
  justificativa técnica/legal depois pra validar** — pesquisa, se
  precisar, acontece **antes** de formar posição, nunca depois.
- **Nunca cita norma, lei, ou "melhor prática" sem fonte real e
  verificável.** Se não achar fonte confiável: marca explicitamente como
  "não verificado — recomenda-se validação antes de produção", nunca
  apresenta como fato.

---

## 3. Baseline interno — o que o Elicitador já sabe, sem precisar perguntar ou pesquisar toda vez

### 3.1 As 6 regras técnicas travadas — nunca negociáveis, em nenhuma spec

Baseado em padrão comprovado em produção (não teoria):

1. Hash de senha correto (bcrypt ou equivalente) — nunca texto puro.
2. Rate limiting em login/autenticação.
3. RBAC por perfil, mesmo que simples (2-3 papéis já conta).
4. Migration sempre incremental — nunca editar uma já aplicada, sempre
   criar a próxima.
5. Validação de entrada sempre no servidor — nunca confiar só no que o
   cliente envia (preço, quantidade, qualquer valor sensível).
6. Erros nunca vazam detalhe interno (stack trace, mensagem de banco)
   pro usuário final.

Se a spec trazida pelo usuário violar qualquer uma: corrige
automaticamente, documenta a correção, não é opcional.

### 3.2 Baseline de stack/UI/UX/segurança — ponto de partida, não pesquisa do zero

Fonte: os projetos reais já validados em produção (referência inicial:
sistema de agendamento com Supabase/RLS/React, sistema de agendamento com
PHP/MySQL, sistema FastAPI/PostgreSQL/Next.js — cada um serve de exemplo
pra uma combinação de necessidade diferente, não uma escolha única fixa).

Este baseline **cresce com o tempo**, curado manualmente (não
automaticamente) por decisão consciente de qualidade — uma stack só entra
no baseline depois de comprovadamente funcionar bem em produção, não só
por ter sido usada uma vez.

### 3.3 Checagem de frescor — antes de usar o baseline, confirma que ainda vale

```
ao recomendar algo do baseline:
    se envolve algo com número de versão explícito
    (framework, linguagem, gateway de pagamento):
        SEMPRE faz uma busca rápida e barata pra confirmar
        se ainda é o recomendado, mesmo que o baseline já tenha isso
    se é decisão estrutural que muda devagar
    (padrão de RBAC, arquitetura geral tipo BFF):
        só pesquisa de novo se a última confirmação registrada
        tiver mais de ~3 meses

    se a busca confirmar que nada mudou:
        usa o baseline, atualiza a data de "última confirmação"
    se a busca mostrar que mudou:
        usa a informação nova, atualiza o baseline (conteúdo + data)
```

### 3.4 Regra de versionamento — qual versão de framework/dependência recomendar

```
1. Se o ecossistema tem conceito OFICIAL de LTS (ex.: Node.js):
   usa o LTS ativo oficial — não aplica a regra de "penúltima major"
   abaixo, o LTS já resolve essa decisão de forma mais confiável.

2. Se o ecossistema NÃO tem LTS oficial (a maioria de frameworks
   frontend, bibliotecas menores):
   a. Nunca pré-lançamento (beta, RC, alpha, canary) — sem exceção
   b. Default: penúltima major estável, não a mais recente
   c. Só vai pra major mais recente SE o sistema genuinamente precisa
      de algo que só existe nela — motivo técnico concreto, registrado
      na Spec como decisão explícita, nunca "é mais novo" como
      justificativa
   d. Minor/patch: sempre a versão mais recente

3. Se, durante o build, a versão escolhida falhar de forma clara:
   downgrade pra última estável conhecida antes dela, documentado na
   Spec (seção Nota de Arquitetura)
```

### 3.5 Fonte de norma/lei — nunca inventar

Toda afirmação de exigência legal/regulatória na Spec carrega uma destas
duas formas:

```
- Afirmação com fonte: "LGPD, Art. 5º, II (fonte: <URL oficial real>)"
- Afirmação sem fonte confiável: "⚠️ NÃO VERIFICADO — <norma citada
  genericamente> não foi confirmada com fonte oficial. Recomenda-se
  validação jurídica/regulatória antes de produção."
```

Nunca existe uma terceira forma ("parece que a lei X exige Y", sem
qualquer marcação) — isso é exatamente o tipo de alucinação com
confiança alta que este sistema existe pra prevenir.

---

## 4. Esqueleto da Spec — estrutura fixa, conteúdo variável

Baseado no padrão real de três sistemas em produção. Toda Spec gerada por
este sistema segue esta estrutura:

```markdown
# Spec: <Nome do Sistema>

**Arquivo:** specs/<slug>.md
**Versão:** 1.0
**Data:** <ISO 8601>
**Comandos:** /build lê e implementa; /review compara a build atual com
este arquivo e valida lacunas.

## Objetivo
<uma ou duas frases, o que o sistema faz e pra quem>

## Diretrizes de Atuação
(seção FIXA, igual em toda Spec gerada por este sistema — não editar
o conteúdo abaixo entre specs diferentes)
- Adesão estrita: implementar apenas o que está descrito nesta spec.
- Sugestão de melhoria: pode ser proposta a qualquer momento, só
  implementada com aceite explícito do usuário.
- Migrations sempre incrementais, nunca editar uma já aplicada.
- Sem refatoração oportunista: correção de lacuna toca só o necessário.
- Toda alteração de rota/regra/banco/integração atualiza esta Spec ao
  final do ciclo — sem exceção (ver seção 6).

## Suposições a confirmar
(preenchida só se houver decisão pendente genuína — nunca inventada
pra parecer completa)
- SUP-01: <suposição feita pra não travar o andamento> — <o que muda
  se estiver errada> — **confirmar com o usuário antes do build.**

## Stack Tecnológica
<tabela camada/tecnologia, com origem: "baseline" ou "pesquisado em
<data>, fonte: <URL>" ou "decisão explícita do usuário, motivo: X">

## Segurança (baseline sempre presente)
- As 6 regras da seção 3.1 deste documento, aplicadas
- <requisitos adicionais específicos do domínio, se houver, cada um
  com fonte ou marcação de não-verificado>

## Módulos / Rotas / Regras de Negócio
<específico do sistema, elicitado>

## Nota de arquitetura (se houver trade-off assumido)
- <trade-off> — <por que foi aceito> — <o que mudaria se o produto
  crescer além do escopo atual>

## Decisões da auditoria de compatibilidade
(só presente se o usuário trouxe uma spec própria)
- Sugerido: X. Decisão: ACEITA/REJEITADA. Motivo: Y.

## Definition of Done (v1.0)
<checklist>

## Backlog (pós-v1)
| # | Item | Prioridade | Status |

## Histórico de Versões (Changelog)
| Versão | Data | Alteração |
| 1.0 | <data> | Criação inicial |
```

---

## 5. O que o Executor e o Avaliador fazem diferente aqui (vs. Brief comum)

- **Executor** implementa contra a Spec inteira ou contra um item
  específico do Backlog (Gx) dela — mesmo agente `build`, mesmas regras
  do `workflow-pipeline.md` (não reinventa comportamento).
- **Avaliador** ganha DOIS gates novos, checados **antes** de qualquer
  critério de negócio:

```
GATE 1 — Spec atualizada?
    Se este ciclo implementou algo e a Spec não ganhou nova entrada
    de Changelog + DoD correspondente:
        REPROVA automaticamente, não avalia mais nada.
        Motivo: "Spec não atualizada — o próximo /review ficaria cego."

GATE 2 — Toda norma/lei citada tem fonte ou marcação de não-verificado?
    Se encontrar afirmação de lei/norma sem nenhuma das duas formas
    da seção 3.5:
        REPROVA automaticamente.
        Motivo: "Afirmação legal sem fonte verificável — risco de
        alucinação apresentada como fato."

Só depois dos dois gates passarem, o Avaliador prossegue pra checar os
critérios de aceite normais (mesma rubrica do workflow-pipeline.md).
```

---

## 6. Ciclo de incremento — quando já existe uma Spec

```
usuário pede algo novo num projeto que já tem Spec
        ↓
NÃO é elicitação nova — é incremento
        ↓
vira um item novo no Backlog da Spec (Gx seguinte)
        ↓
Executor implementa
        ↓
Executor ATUALIZA a Spec (novo DoD + linha de Changelog) como parte
obrigatória de terminar a tarefa — não é passo separado opcional
        ↓
Avaliador roda os 2 gates + critérios normais
        ↓
Se aprovado: ciclo fechado, Spec reflete exatamente o que existe
Se reprovado: volta pro Executor, mesmo limite de tentativas do
workflow-pipeline.md (máx. 3, com detecção de estagnação)
```

---

## 7. O que este sistema NÃO garante — limitação conhecida, declarada

- Não garante que múltiplos módulos/incrementos, cada um aprovado
  isoladamente, funcionam bem **juntos** — mesma limitação já conhecida
  do `workflow-pipeline.md` original (exemplo do OAuth em 3 ramos).
- Não substitui validação jurídica real quando a Spec marca algo como
  "não verificado" — isso é uma bandeira levantada pro humano agir, não
  uma resolução automática.
- Não torna os agentes mais confiáveis por si só — a disciplina de
  checkpoint humano por ciclo (já decidida no `workflow-pipeline.md`)
  continua válida aqui, pela mesma razão: agentes atuais confabulam com
  confiança alta quando erram, comprovado várias vezes nesta
  implementação.

---

## 8. Aprendizado — como este documento evolui

Igual ao `workflow-pipeline.md`: toda vez que um piloto real revelar um
erro evitável (regra mal calibrada, baseline desatualizado, categoria de
pergunta faltando), a correção é escrita **neste arquivo**, com uma nota
de "Calibração real" citando o caso — nunca corrigida só na memória de
quem estava presente na conversa. O próximo Elicitador só fica melhor se
ler a versão corrigida deste documento, não porque "aprendeu" sozinho.
