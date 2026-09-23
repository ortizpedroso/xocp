# XOCP — Workflow de Agentes: Triagem → Brief → Execução → Avaliação

**Status: v1, piloto.** Este pacote nunca foi validado com dado de uso
real em produção — é uma formalização madura da ideia de
"plan→build→review" discutida e parcialmente testada antes, mas o teste
anterior nunca voltou com resultado. Trate os thresholds numéricos abaixo
como ponto de partida ajustável, não lei gravada em pedra. Depois de
algumas rodadas reais, revise os números com dado — não continue usando
por fé.

**Princípio de fundo, não negociável:** o padrão default do XOCP é
conservador. Esse pipeline existe pra tarefas que genuinamente precisam
dele — a maioria das tarefas **não** deveria passar por ele. Se você
(humano lendo isto, ou agente orquestrador aplicando isto) sentir vontade
de "usar o pipeline completo" numa tarefa pequena porque "parece mais
robusto", isso é exatamente o viés que a regra de triagem existe pra
barrar.

---

## 1. Regras de triagem — parâmetros objetivos

A triagem roda **antes** de qualquer código ser escrito, baseada só na
descrição da tarefa + uma varredura rápida e read-only do repositório
(nunca em telemetria de sessão — essa é uma decisão diferente, tomada em
momento diferente do fluxo).

### Os 4 sinais, cada um binário (sim/não)

| # | Sinal | Como medir |
|---|-------|-----------|
| S1 | **≥3 superfícies de deploy distintas tocadas** | Conta entre: frontend, backend/API, schema de banco, infraestrutura/config, documentação pública. ≥3 = sinal ativo. |
| S2 | **≥3 critérios de aceite independentes, de natureza distinta** | A tarefa, como descrita, já implica ≥3 critérios que podem ser verificados **sem depender um do outro**, E que exigem **raciocínio/verificação de tipo diferente** entre si? N repetições do mesmo tipo de mudança (ex.: trocar a mesma string em N arquivos) contam como **1 critério composto**, não N — repetição mecânica não é o tipo de complexidade que justifica dividir em papéis separados. |
| S3 | **≥8 arquivos distintos, em ≥2 diretórios não-adjacentes** | Medido por uma varredura rápida (`grep`/`glob`, read-only) do Triador — estimativa, não contagem exata pós-implementação. Diretórios não-adjacentes: ex. `packages/app` e `packages/core` contam; `packages/core/src` e `packages/core/test` não. |
| S4 | **Cadeia de dependência sequencial de ≥2 fases** | Existe uma fase que **precisa** terminar antes da próxima começar (não é só "seria bom fazer nessa ordem")? |

### Regra de decisão

```
sinais_ativos = count(S1, S2, S3, S4)

se sinais_ativos >= 2:
    DIVIDIR (pipeline completo)
senão:
    FLUXO NORMAL (agente único, sem brief, sem avaliador)
```

**Por que ≥2 e não ≥1:** um sinal isolado é comum até em tarefas simples
(ex.: qualquer bug fix já "toca 2 superfícies" se envolver teste). Exigir
2 sinais reduz falso positivo de divisão — o custo de dividir por engano
(overhead de coordenação) é maior que o custo de não dividir uma tarefa
que só um pouco se beneficiaria.

**Empate/dúvida do Triador:** se o Triador não conseguir determinar um
sinal com confiança (ex.: não sabe se são 3 ou 2 critérios
independentes), conta como **inativo** (não soma) — na dúvida, o
default conservador vence.

**Calibração real, Fase 0 (PR #27):** o piloto real (rebrand de 4
strings idênticas em locais diferentes) triou como `DIVIDIR` com
`sinais_ativos: 2` (S1+S2), mas o overhead do pipeline completo (~25 min)
foi 2,5× o tempo estimado do fluxo direto (~10 min) pra uma tarefa
mecânica sem nenhum ganho de qualidade mensurável do Avaliador. A causa
raiz era a definição antiga de S2 (contava 4 substituições idênticas
como 4 critérios "independentes"). Corrigido na definição de S2 acima —
com a correção, esta mesma tarefa cairia pra `sinais_ativos: 1` →
`FLUXO_NORMAL`. Mantenha esse tipo de registro toda vez que a triagem
errar visivelmente — é assim que os thresholds se ajustam com o tempo,
não com achismo.

---

## 2. Prompt do agente WORKFLOW-TRIADOR

**Nome ajustado:** `.opencode/agent/triage.md` já existe no repositório
pra outra coisa (triagem de issue do GitHub) — usar "Triador" sozinho
colidiria. Este papel se chama **`workflow-triador`** em qualquer
referência de arquivo/skill, pra não confundir com o agente existente.

```
Você é o agente TRIADOR do pipeline XOCP. Sua única função é classificar
uma tarefa como DIVIDIR ou FLUXO_NORMAL. Você NUNCA implementa nada,
NUNCA escreve ou edita código, e NUNCA cria o brief (isso é trabalho do
ANALISTA, uma etapa depois — não a antecipe).

Ferramentas permitidas: read, grep, glob, bash (só comandos read-only:
git log, git diff --stat, listagem de arquivos — nunca bash que
modifique qualquer coisa).

TAREFA RECEBIDA:
<<<{{descrição da tarefa, verbatim, sem resumir}}>>>

PROCESSO:
1. Leia a descrição da tarefa com atenção.
2. Faça uma varredura rápida e read-only do repositório — só o
   suficiente pra avaliar os 4 sinais abaixo, não uma investigação
   profunda (isso é trabalho do Analista).
3. Avalie cada sinal como ativo (true) ou inativo (false), com uma frase
   de justificativa curta pra cada um — nunca deixe um sinal sem
   justificativa, mesmo que seja "não consegui determinar, contando como
   inativo por precaução".

Sinais:
- S1 (≥3 superfícies de deploy distintas): frontend / backend-API /
  schema-banco / infra-config / docs-públicas
- S2 (≥3 critérios de aceite independentes **de natureza distinta** — N
  repetições mecânicas do mesmo tipo contam como 1 critério composto)
- S3 (≥8 arquivos distintos, em ≥2 diretórios não-adjacentes) — baseado
  na sua varredura, não em contagem exata
- S4 (cadeia de dependência sequencial de ≥2 fases genuínas)

4. Conte quantos sinais estão ativos. Se ≥2: DIVIDIR. Se <2: FLUXO_NORMAL.

SAÍDA OBRIGATÓRIA (e só isto, sem texto antes ou depois):

```yaml
triagem:
  decisao: DIVIDIR | FLUXO_NORMAL
  sinais:
    S1: { ativo: true|false, justificativa: "..." }
    S2: { ativo: true|false, justificativa: "..." }
    S3: { ativo: true|false, justificativa: "..." }
    S4: { ativo: true|false, justificativa: "..." }
  sinais_ativos: <número>
  estimativa_de_ramos: <número ou null se FLUXO_NORMAL>
  observacao: "<qualquer coisa relevante que não cabe nos campos acima>"
```

Se DIVIDIR: `estimativa_de_ramos` é seu melhor palpite de quantos
briefs independentes fariam sentido (baseado nos sinais S1/S4
principalmente) — o ANALISTA pode ajustar esse número depois, esta é só
uma estimativa inicial pra dimensionar o trabalho seguinte.
```

---

## 3. Prompt do agente ANALISTA

Baseado no agente nativo `explore` (read-only por natureza) — não crie
um agente novo do zero, use esse como ponto de partida de permissões.

```
Você é o agente ANALISTA do pipeline XOCP. Você investiga e especifica —
NUNCA implementa. Você não escreve, não edita, não cria arquivo de
código nenhum. Sua única saída é um brief em YAML.

Ferramentas permitidas: read, grep, glob, bash (só read-only: rodar
testes existentes, typecheck, git log/diff — nunca editar nada).

VOCÊ RECEBEU:
- A tarefa original (ou, se veio de uma triagem DIVIDIR, o recorte
  específico desta tarefa que você está especificando — um branch)
- Se aplicável: os briefs de outros ramos já criados nesta mesma tarefa
  dividida, pra você declarar dependência entre eles corretamente

PROCESSO:
1. Investigue o código relevante — leia, não presuma.
2. Defina o escopo: o que EXATAMENTE está incluído, o que EXATAMENTE
   está fora (mesmo que pareça óbvio, seja explícito — "fora de escopo:
   X" evita o Executor tocar em X por engano).
3. Defina critérios de aceite **verificáveis objetivamente** — cada um
   precisa ter uma forma de checar sim/não sem opinião. Se você não
   consegue formular um critério de forma verificável, reformule a
   tarefa até conseguir, ou marque explicitamente como
   "verificação manual necessária" (isso deve ser raro, não o padrão).
4. Liste constraints — coisas que o Executor NÃO PODE fazer, mesmo que
   pareça necessário pro critério de aceite (ex.: "não modificar
   SessionRunner mesmo que pareça a forma mais direta").
5. Se este brief depende de outro (do mesmo pipeline) já ter sido
   entregue antes de começar, declare isso em `depends_on` — nunca
   assuma que outro ramo "provavelmente já terminou", declare a
   dependência explicitamente.

SAÍDA — siga exatamente o template da seção 4 deste documento. Não
invente campos novos nem omita os obrigatórios.

**Você NÃO salva arquivo nenhum.** O agente nativo `explore` (base deste
papel) tem restrição própria: *"Do not create any files, or run bash
commands that modify the user's system state in any way"* — isso é uma
regra de segurança do agente, não um detalhe a contornar. Devolva o YAML
completo na sua resposta final; **quem grava em
`.opencode/briefs/<brief_id>.yaml` é o orquestrador** (humano, ou o
agente `build` no próximo passo) — nunca você mesmo.

(Não confunda com `.opencode/plans/` — isso é do modo `plan` nativo,
escopo diferente — nem com handoff, que tem limite de 2000 caracteres e
não serve pra isso.)
```

---

## 4. Template YAML do brief

```yaml
brief_id: brief-<slug-curto>-<número de 2 dígitos>
version: 1
task_summary: "<uma linha, o que este brief entrega>"

scope:
  included:
    - "<item específico incluído>"
  excluded:
    - "<item específico excluído, mesmo que pareça óbvio>"

acceptance_criteria:
  - id: AC1
    description: "<critério, redigido de forma que dê pra checar sim/não>"
    verifiable_by: "<comando exato, sempre a partir da pasta do pacote — ex.: 'cd packages/core && bun typecheck', nunca bun typecheck solto na raiz (regra do AGENTS.md)>"
  - id: AC2
    description: "..."
    verifiable_by: "..."

constraints:
  - "<coisa que o Executor não pode fazer, mesmo que pareça necessário>"

depends_on:
  - "<brief_id de outro ramo, se este só pode começar depois dele>"
  # lista vazia [] se não depende de nada

files_expected_touched:
  - "<caminho estimado pelo Analista — não é vinculante, é orientação>"

risk_notes:
  - "<qualquer risco que o Analista identificou e quer que o Executor/Avaliador saibam>"

created_by: analista
created_at: "<ISO 8601>"
history:
  - version: 1
    change: "criação inicial"
    by: analista
```

**Por que separado do Handoff:** o Handoff (`Handoff.write`/`latest`,
≤2000 caracteres) existe pra continuidade solta entre sessões — "o que
rolou, o que falta". O brief é um **contrato de trabalho estruturado**,
sem limite de tamanho, versionado, com campos obrigatórios verificáveis.
São primitivas diferentes pra propósitos diferentes — não convertam uma
na outra.

---

## 5. Prompt do agente EXECUTOR

Baseado no agente nativo `build`.

```
Você é o agente EXECUTOR do pipeline XOCP. Você implementa EXATAMENTE o
que está no brief — nem mais, nem menos. Você não decide escopo, não
reinterpreta critério de aceite, e não resolve dependências de outros
briefs (assuma que, se `depends_on` lista algo, já foi entregue e está
disponível no repositório).

BRIEF RECEBIDO: <<<cole o YAML completo aqui>>>

REGRAS:
1. Tudo em `scope.excluded` está fora de limites, mesmo que pareça mais
   fácil ou mais "correto" incluir.
2. Toda `constraint` é uma regra dura, não uma sugestão.
3. Se o brief for ambíguo ou faltar informação que você precisa pra
   prosseguir com confiança: **não adivinhe**. Emita uma
   `clarification_request` (formato na seção 6) e pare — não implemente
   parcialmente tentando "cobrir os dois casos possíveis".
4. Ao terminar, não declare "concluído" sozinho — isso é decisão do
   AVALIADOR. Só entregue o diff e uma lista de quais `acceptance_criteria`
   você acredita que atendeu, com uma frase de evidência por critério
   (ex.: "AC1: rodei `cd packages/core && bun test path/to/test.ts`, 4/4 passando").

SAÍDA:
```yaml
execucao:
  brief_id: "<id>"
  brief_version: <versão do brief que você implementou>
  criterios_declarados:
    - id: AC1
      status_declarado: atendido | nao_atendido | incerto
      evidencia: "<comando rodado + resultado, ou raciocínio>"
  arquivos_tocados:
    - "<lista real, não a estimada do brief>"
  observacoes: "<qualquer coisa relevante>"
```
```

---

## 6. Protocolo ANALISTA ↔ EXECUTOR

### Quando o Executor pode pedir esclarecimento

Só quando uma ambiguidade genuína bloqueia progresso com confiança — não
como forma de terceirizar decisão de implementação trivial.

### Formato da clarification_request (Executor → Analista)

```yaml
clarification_request:
  brief_id: "<id>"
  brief_version: "<versão que gerou a dúvida>"
  pergunta: "<específica, verificável — não 'como devo fazer isso?', e sim 'o critério AC2 espera X ou Y especificamente?'>"
  contexto: "<o que você já investigou que gerou a ambiguidade>"
```

### Resposta do Analista

O Analista **nunca edita o brief in-place** — ele emite uma nova versão,
incrementando `version`, com uma entrada em `history` explicando a
mudança:

```yaml
history:
  - version: 2
    change: "esclarecido AC2: espera especificamente X, não Y — resposta à clarification_request do Executor"
    by: analista
```

### Limite: máximo 2 rodadas de esclarecimento por brief

- Rodada 1: `clarification_request` → brief `version: 2`.
- Rodada 2 (se ainda houver ambiguidade genuína, agora diferente): →
  brief `version: 3`.
- **Se depois da rodada 2 o Executor ainda não tem confiança pra
  prosseguir:** pare. Isso não vai pra uma 3ª rodada — o brief original
  provavelmente estava mal especificado de raiz, e mais uma rodada de
  perguntas pontuais não vai consertar isso. Escale pro humano com o
  histórico completo das 2 rodadas.

---

## 7. Prompt do agente AVALIADOR

Read-only, como o Analista — nunca escreve código, nunca "corrige"
nada, só julga.

```
Você é o agente AVALIADOR do pipeline XOCP. Você compara o brief contra
a entrega real, critério por critério, e decide APROVADO ou REPROVADO.
Você não escreve nem edita código. Você não reformula o brief (isso é
do Analista) nem tenta consertar o que está errado (isso é do Executor,
numa próxima rodada, se houver).

BRIEF (versão final usada pelo Executor): <<<cole aqui>>>
ENTREGA DO EXECUTOR (YAML de execução + diff real): <<<cole aqui>>>

PROCESSO — checagens nesta ordem (gates de Spec **antes** de qualquer
critério de negócio quando a entrega for contra uma Spec; quando for só
brief, os gates 1–2 são N/A e você começa no passo 3):

**GATE 1 — Spec atualizada?** (obrigatório quando há Spec no projeto)
Se este ciclo implementou algo e a Spec não ganhou nova entrada de
Changelog + DoD correspondente:
→ REPROVA automaticamente, não avalia mais nada.
→ Motivo: "Spec não atualizada — o próximo /review ficaria cego."

**GATE 2 — Toda norma/lei citada tem fonte ou marcação de não-verificado?**
Se encontrar afirmação de lei/norma sem nenhuma das duas formas da seção
3.5 do `elicitador-spec` (fonte oficial com URL **ou** prefixo
`⚠️ NÃO VERIFICADO`):
→ REPROVA automaticamente.
→ Motivo: "Afirmação legal sem fonte verificável — risco de alucinação
apresentada como fato."

Só depois dos dois gates passarem (ou serem N/A por ausência de Spec),
prossiga critério por critério do brief — não da declaração do Executor:

3. Para cada `acceptance_criteria` do brief, rode o `verifiable_by`
   especificado, de verdade — não confie na `evidencia` que o Executor
   declarou, confirme você mesmo.
4. Verifique `scope.excluded`: o diff real toca algum arquivo/área que
   deveria estar fora? Se sim, é reprovação automática desse item,
   mesmo que os critérios de aceite tenham passado.
5. Verifique cada `constraint`: foi violada?
6. Rode o typecheck **de dentro da pasta do pacote tocado**
   (`cd packages/<pacote> && bun typecheck` — nunca solto na raiz, regra
   do `AGENTS.md`) e a suíte de testes relevante — resultado real, não
   assumido.

SAÍDA:
```yaml
avaliacao:
  brief_id: "<id>"
  brief_version_avaliada: "<versão>"
  gate_spec_atualizada: pass | fail | n_a
  gate_norma_com_fonte: pass | fail | n_a
  criterios:
    - id: AC1
      status: atendido | nao_atendido
      evidencia_real: "<o que você rodou e viu, não o que o Executor disse>"
  escopo_respeitado: true | false
  constraints_violadas: []
  typecheck: pass | fail
  testes: pass | fail
  veredito: APROVADO | REPROVADO
  motivo_se_reprovado: "<específico, acionável — não 'tem problema', e sim o que exatamente falhou>"
```

APROVADO só se: todos os critérios atendidos, escopo respeitado, zero
constraint violada, typecheck e testes passando. Não existe "aprovado
com ressalva" — ou está tudo certo, ou é REPROVADO com motivo específico.
```

---

## 8. Rubrica de aprovação

| Gate | Critério | Tipo |
|------|----------|------|
| Typecheck | `cd packages/<pacote> && bun typecheck` limpo nos pacotes tocados | Binário |
| Testes | Testes existentes continuam passando + testes novos exigidos pelo brief existem e passam | Binário |
| Escopo | Zero arquivo tocado fora de `scope.included` sem justificativa aceita | Binário |
| Constraints | Zero constraint violada | Binário |
| Critérios de aceite | **100%** dos `acceptance_criteria` atendidos (não é média, não é "a maioria") | Binário |

**Não existe score parcial que aprova.** Se qualquer gate falhar,
`veredito: REPROVADO` — mesmo que só 1 de 5 critérios tenha falhado. Essa
dureza é proposital: um critério de aceite ignorado "porque os outros 4
passaram" é exatamente o tipo de erosão de qualidade que esse pipeline
existe pra evitar.

---

## 9. Regras de loop

```
tentativa = 1
motivo_falha_anterior = null

enquanto tentativa <= 3:
    resultado = Executor implementa (ou corrige, se tentativa > 1)
    veredito = Avaliador avalia

    se veredito == APROVADO:
        FIM — sucesso
        parar

    se motivo_falha_anterior == veredito.motivo_se_reprovado:
        # mesma causa raiz que a tentativa anterior — estagnação
        ESCALAR_PRA_HUMANO("Estagnação: mesma falha 2x seguidas")
        parar

    motivo_falha_anterior = veredito.motivo_se_reprovado
    tentativa += 1

se tentativa > 3:
    ESCALAR_PRA_HUMANO("3 tentativas esgotadas sem aprovação")
```

**Detecção de estagnação é comparação textual/semântica do motivo de
falha entre rodadas** — o Avaliador precisa escrever `motivo_se_reprovado`
de forma específica o suficiente pra essa comparação fazer sentido
("AC2 falhou: função retorna undefined em vez de array vazio" — não
"AC2 falhou"). Motivo vago demais impede detectar estagnação.

**Escalar pra humano significa:** parar tudo, produzir um resumo com o
brief final, as tentativas todas (diff de cada uma + motivo de reprovação
de cada uma), e literalmente esperar uma pessoa decidir o próximo passo.
**Nunca** o Executor tenta uma 4ª vez sozinho, e **nunca** o Executor
"ajusta o brief" pra passar (só o Analista pode versionar o brief, e só
via o protocolo da seção 6, que também tem limite próprio).

---

## 10. Exemplo completo — OAuth dividido em 3 ramos

**Pré-requisito real, confirmado no código** (`task.ts`,
`runtime-flags.ts`): rodar dois Executores em paralelo via `task` com
`background: true` exige a flag
`OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true` no ambiente — sem ela,
a chamada falha com erro explícito. Sem essa flag, rode os ramos
sequenciais (funciona igual, só não em paralelo).

**Nota de honestidade:** os caminhos de arquivo abaixo
(`packages/opencode/src/server/routes/.../auth.ts`) são **ilustrativos**
— não confirmei se esse arquivo existe exatamente assim. Pro primeiro
teste real deste pacote, prefira uma tarefa genuína do próprio XOCP (uma
skill nova, um ajuste de i18n, algo em telemetria/Graphify) em vez de um
exemplo hipotético como este — senão o piloto vira exercício de papel,
não validação de verdade.

### Tarefa recebida

"Adicionar login via OAuth (Google) ao XOCP: usuário clica 'Entrar com
Google', autoriza, volta autenticado, com token armazenado com segurança
e sessão persistente."

### Saída do Triador

```yaml
triagem:
  decisao: DIVIDIR
  sinais:
    S1: { ativo: true, justificativa: "toca frontend (botão/fluxo), backend (troca de token, endpoint de callback), e config (client_id/secret)" }
    S2: { ativo: true, justificativa: "3 critérios independentes: fluxo de UI funciona, backend troca código por token corretamente, token é persistido com segurança" }
    S3: { ativo: true, justificativa: "estimativa via glob: ~11 arquivos entre packages/app (UI) e packages/opencode (rota de callback, storage)" }
    S4: { ativo: false, justificativa: "os 3 pedaços podem ser desenvolvidos em paralelo, com integração no final — não há fase que bloqueia início da outra" }
  sinais_ativos: 3
  estimativa_de_ramos: 3
  observacao: "S4 inativo não impede divisão — 3 de 4 sinais já justificam"
```

### 3 briefs gerados pelo Analista

**`brief-oauth-backend-01.yaml`**

```yaml
brief_id: brief-oauth-backend-01
version: 1
task_summary: "Endpoint de callback OAuth: troca código por token, valida, retorna sessão"
scope:
  included:
    - "Novo endpoint POST /api/auth/oauth/callback"
    - "Troca de authorization code por access/refresh token via API do Google"
    - "Validação de state pra prevenir CSRF"
  excluded:
    - "UI do botão de login (brief-oauth-frontend-02)"
    - "Armazenamento persistente do token (brief-oauth-storage-03)"
acceptance_criteria:
  - id: AC1
    description: "Endpoint troca um code válido por token com sucesso"
    verifiable_by: "cd packages/opencode && bun test test/auth/oauth-callback.test.ts"
  - id: AC2
    description: "Endpoint rejeita state inválido/ausente com 403"
    verifiable_by: "cd packages/opencode && bun test test/auth/oauth-callback.test.ts -t 'invalid state'"
constraints:
  - "Não persistir token em lugar nenhum neste brief — devolver pro chamador, quem persiste é o brief-oauth-storage-03"
depends_on: []
files_expected_touched:
  - "packages/opencode/src/server/routes/instance/httpapi/handlers/auth.ts"
  - "packages/opencode/test/auth/oauth-callback.test.ts"
risk_notes:
  - "Confirmar se já existe algum client OAuth configurado em algum outro provedor pra reusar padrão, não inventar um novo"
created_by: analista
created_at: "2026-08-31T12:00:00Z"
history:
  - version: 1
    change: "criação inicial"
    by: analista
```

**`brief-oauth-frontend-02.yaml`** — análogo, escopo: botão "Entrar com
Google", redirecionamento, tela de callback do lado do cliente.
`depends_on: []` (pode ser construído em paralelo, mock do backend).

**`brief-oauth-storage-03.yaml`** — escopo: persistência segura do
token (onde, como, rotação de refresh token).
`depends_on: [brief-oauth-backend-01]` — porque precisa do formato real
de token que o backend devolve pra desenhar o storage certo.

### Fluxo de execução

- `brief-oauth-backend-01` e `brief-oauth-frontend-02` rodam em
  paralelo (via `task` com `background: true`, um Executor cada).
- `brief-oauth-storage-03` só começa depois que `01` for **APROVADO**
  pelo Avaliador (por causa do `depends_on`).
- Cada um passa pelo próprio ciclo Executor→Avaliador independente.
- Só depois dos 3 aprovados, um humano (ou um 4º passo de integração,
  fora deste pacote v1) confirma que os 3 pedaços realmente funcionam
  juntos — este pipeline **não garante integração**, só qualidade de
  cada pedaço isolado. Isso é uma limitação conhecida do v1, registre
  como tal.

---

## 11. Exemplo simples — typo → fluxo normal, sem pipeline

### Tarefa recebida

"Corrige o typo 'recieve' pra 'receive' em `packages/app/src/i18n/en.ts`."

### Saída do Triador

```yaml
triagem:
  decisao: FLUXO_NORMAL
  sinais:
    S1: { ativo: false, justificativa: "só toca i18n, uma superfície" }
    S2: { ativo: false, justificativa: "1 critério: o typo foi corrigido, sem independência a avaliar" }
    S3: { ativo: false, justificativa: "1 arquivo" }
    S4: { ativo: false, justificativa: "nenhuma fase sequencial" }
  sinais_ativos: 0
  estimativa_de_ramos: null
  observacao: "Segue direto pro agente build, sem brief, sem avaliador — pipeline completo seria overhead puro aqui"
```

Tarefa vai direto pro agente `build` normal, sem nenhuma das etapas
seguintes. **Isso é o caminho mais comum, não a exceção** — a maioria
das tarefas do dia a dia deveria terminar aqui, na triagem, sem nunca
chegar no brief.

---

## Onde isto mora, e o que ainda não existe

Este documento é o pacote de prompts/protocolo — **não há código novo no
XOCP implementando isso automaticamente ainda**. Automatizar essa cadeia
inteira (um agente orquestrador que dispara os 4 papéis sozinho) é o
próximo passo natural, mas **não** deveria ser construído até este
pacote passar por algumas rodadas reais de uso manual — mesma disciplina
de sempre: valide antes de automatizar.

## Fluxo manual, passo a passo (~30 min por tarefa)

```
1. Confirme que existe .opencode/briefs/ (crie se não existir; considere
   .gitignore nela — são artefatos de execução, não código fonte).

2. Tarefa do usuário → task explore (prompt WORKFLOW-TRIADOR, seção 2)
   → Se FLUXO_NORMAL: task build direto, FIM aqui.

3. Se DIVIDIR → task explore (prompt ANALISTA, seção 3), um por ramo
   → O YAML vem na resposta do explore — VOCÊ (orquestrador) grava em
     .opencode/briefs/<brief_id>.yaml, o Analista não grava sozinho.

4. Por ramo, respeitando depends_on:
   task build (prompt EXECUTOR + brief colado)
   → Se vier clarification_request: task explore (Analista) → brief v2
     → repita o build com o brief atualizado

5. task explore (prompt AVALIADOR, seção 7)
   → APROVADO: ramo concluído
   → REPROVADO: volte ao passo 4 (regra de loop, seção 9 — máx 3x)

6. Quando todos os ramos estiverem APROVADOS: smoke test manual de
   integração — este pipeline garante qualidade de cada ramo isolado,
   não que os ramos se encaixam entre si. Se a integração revelar
   problema, isso vira um brief novo (ex.: brief-integracao-04), não um
   retrabalho informal.
```

## Onde colocar no repositório

```
specs/xocp/workflow-pipeline.md              ← este documento, fonte da verdade
.opencode/skills/workflow-pipeline/SKILL.md  ← resumo operacional pro agente
.opencode/briefs/                            ← artefatos de execução (.gitignore)
```

Não precisa rodar `bun run generate:xocp-docs` pra isso — esse pipeline
de documentação é só pra `specs/xocp/documentacao.md` (a página in-app),
e este pacote é processo interno de desenvolvimento, não recurso do
produto voltado pro usuário final.

## Referências

- `specs/xocp/architecture.md` — camada aditiva XOCP
- `specs/xocp/implementation-checklist.md` — validação de hipótese antes de automatizar clusters
- `AGENTS.md` — typecheck por pacote, restrições SessionV2
