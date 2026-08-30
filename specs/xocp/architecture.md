# XOCP — Documento de Arquitetura de Software

**Status:** vivo — atualizar a cada item de roadmap concluído.
**Última revisão:** 29/08/2026.
**Dono do documento:** Pedroso (produto/arquitetura) + agente de revisão (Claude) + agente de implementação (Cursor).

Este documento existe pra uma pessoa nova na equipe — humana ou agente — entender o que o XOCP é, como está construído, e o que pode ou não mexer, sem precisar reconstruir esse conhecimento a partir do histórico de conversas ou de PRs.

---

## 1. O que é o XOCP

XOCP (**eXtensible Open Code Platform**) é um fork independente do [OpenCode](https://github.com/anomalyco/opencode) — um agente de codificação com IA (CLI, TUI, app web e desktop). "Independente" quer dizer: não é um fork GitHub tradicional, é um repositório próprio (`github.com/ortizpedroso/xocp`) que sincroniza manualmente com o upstream quando faz sentido.

A tese do XOCP é: manter 100% do que já funciona no OpenCode (sessões, agentes, ferramentas, provedores de LLM, UI) intocado, e adicionar uma camada própria por cima — observação de sessão, mapeamento estrutural de código, handoff de contexto entre agentes, e (futuro) roteamento por domínio de código.

**Regra fundamental do projeto, não negociável:** nenhuma mudança em código que já funciona do OpenCode. Toda a camada XOCP é aditiva — arquivos novos, tabelas novas, serviços novos — nunca reescrita do que já existe.

---

## 2. O que é herdado do OpenCode (não mexemos)

### 2.1 SessionV2 — o núcleo de execução
Fluxo: `prompt → session_input (durável) → SessionRunner → LLM → tools → resultado`.

- Admissão de prompt e execução do modelo são etapas separadas e duráveis — um prompt é gravado antes de qualquer chamada de modelo acontecer, então nada se perde num crash no meio do caminho.
- `SessionExecution` é o serviço que decide onde/como uma sessão roda; hoje isso é implementado por `SessionExecutionLocal` (processo único, roteamento em memória via `SessionRunCoordinator`). O próprio código já deixa marcado onde entraria "posicionamento remoto" no futuro — mas isso **não existe hoje** e é um problema genuinamente não resolvido nem pelo time original do OpenCode (ver seção 8, "Clustered Session Execution").
- `SessionRunner` executa um turno por vez, sempre recarrega o histórico projetado, nunca delega orquestração pra um loop de ferramentas em memória separado.

### 2.2 Agentes
Agentes são configuráveis (`build`, `plan`, `explore`, `general`, e subagentes customizados), com `mode: "subagent" | "primary" | "all"`. Isso já existe e é usado por outras ferramentas do ecossistema (inclusive o próprio Graphify, via um agente disparado com `/graphify`).

### 2.3 Ferramentas locais
`bash`, `read`, `write`, `edit`, `apply-patch`, `grep`, `glob`, `webfetch`, `websearch`, `skill`, `todowrite`, `question` — tudo já implementado e estável.

### 2.4 Sistema de plugins
OpenCode já carrega plugins JavaScript de `.opencode/plugins/*.js` por projeto, com hooks como `tool.execute.before`. Isso é infraestrutura genérica, não específica do XOCP — e é exatamente o mecanismo que o Graphify usa pra se integrar (ver seção 5.3).

### 2.5 Cliente MCP
OpenCode já tem um cliente MCP funcional e maduro (`config/mcp.ts`, rota HTTP própria em `packages/opencode/src/server/routes/instance/httpapi/handlers/mcp.ts`). Qualquer integração futura via MCP deve reusar isso, nunca reescrever.

### 2.6 UI
App compartilhado (`packages/app`, SolidJS) rodando em três superfícies: web, desktop, e um TUI separado (`packages/tui`). Todas consomem a mesma API HTTP.

---

## 3. Stack tecnológica

| Camada | Tecnologia | Observação |
|---|---|---|
| Runtime | Bun `1.3.14` (fixado em `packageManager`) | Nunca `node`/`npm` direto |
| Linguagem | TypeScript | Sem `any`, sem type assertion (`as unknown as`) pra contornar erro real do compilador |
| Framework de efeitos | Effect `4.0.0-beta.83` | Todo serviço do `core` é `Context.Service` + `Layer.effect`; ver seção 4 |
| Banco de dados | SQLite via Drizzle ORM `1.0.0-rc.2` | Migrações versionadas e geradas (`drizzle-kit`), nunca escritas à mão fora do padrão |
| UI web/desktop | SolidJS `1.9.10` | `packages/app`, compartilhado entre web e desktop |
| API pública | Effect `HttpApi` | Contrato em `packages/protocol`, implementação em `packages/server`, SDK gerado em `packages/client` |
| Monorepo | Turborepo (`turbo.json`) | Build/test orquestrado por pacote |
| Build reprodutível | Nix (`flake.nix`) | Ambiente de desenvolvimento e empacotamento |
| Infraestrutura/deploy | SST (`sst.config.ts`, `infra/*.ts`) | Console, lake, monitoring, stats como stacks separadas |

---

## 4. Padrão arquitetural central: composição de serviços via Effect

Todo serviço do `core` segue o mesmo molde:

```ts
export interface Interface { /* métodos do serviço */ }
export class Service extends Context.Service<Service, Interface>()("@opencode/NomeDoServico") {}
const layer = Layer.effect(Service, make)
export const node = makeGlobalNode({ service: Service, layer, deps: [...] })
// ou
export const node = makeLocationNode({ service: Service, layer, deps: [...] })
```

Duas escopos de vida possíveis:

- **Global** (`makeGlobalNode`): um único processo, uma instância. Ex.: `BackgroundJob` (registro de jobs em memória, não durável — perde estado num restart do processo).
- **Location-scoped** (`makeLocationNode`): uma instância por `Location.Ref` (diretório + workspace), composta dinamicamente por `LocationServiceMap` com TTL de 60 minutos de ociosidade. Ex.: `Config`, `SessionRunner`, `Telemetry`, `Graphify`, `Handoff`.

**Regra:** um serviço location-scoped só pode depender de outros nodes location-scoped ou globais — nunca o contrário. Isso é verificado pelo próprio sistema de tipos (`LayerNode`), e um `as unknown as` pra contornar um erro aqui é sempre sintoma de uma dependência real não satisfeita, nunca só "tipo estreito demais" (já corrigimos um caso real disso — ver histórico do PR #7/#8).

`deps: [...]` deve refletir exatamente os serviços que o corpo do `make` realmente usa via `yield*` — uma dependência declarada e não usada é dívida técnica (já corrigimos isso duas vezes nesta implementação).

---

## 5. A camada XOCP (o que adicionamos)

### 5.1 Telemetria de sessão
`packages/core/src/telemetry/`. Observa cada sessão (turnos, ferramentas usadas, duração) e calcula um **score** numérico de complexidade. Gatilhada por hooks fire-and-forget dentro de `session.ts`/`session/runner/llm.ts` — nunca pode bloquear ou falhar um turno. Gated pela flag `experimental.graphify` (desligada por padrão). Tabela própria (`session_telemetry_event`), sem tocar em nenhuma tabela existente.

**Status:** implementado, testado, em PR aberto (#5), ainda não mergeado em `dev`.

### 5.2 Handoff durável
`packages/core/src/handoff/`. Um registro por sessão (`write`/`latest`), limite de 2000 caracteres com rejeição tipada (nunca truncamento silencioso). Sem flag experimental — é uma primitiva de persistência sempre disponível, simplesmente ninguém ainda chama automaticamente. **Diferente** do cache de rascunho de UI já existente em `packages/app/src/pages/session/handoff.ts` (LRU em memória, 40 entradas, outro problema).

**Status:** núcleo implementado e testado (PR #8). `Handoff.node` registrado em `location-services.ts` nesta rodada (Fase 0, item 0.1).

### 5.3 Graphify — status real (corrigido nesta revisão)

O Graphify (`graphifyy` no PyPI) não é um serviço HTTP — é uma **ferramenta CLI local** que:

- Roda `graphify update <diretório>` como subprocesso, sem servidor, sem custo de LLM (confirmado: funciona em projeto nunca mapeado, sem chave de API).
- Já tem integração nativa pronta com OpenCode: `graphify install --platform opencode` escreve um plugin (`.opencode/plugins/graphify.js`) usando o sistema de plugin descrito na seção 2.4 — zero código nosso necessário pra isso funcionar (isso é um mecanismo complementar, opcional, não o que o botão "Mapear" da UI usa).
- Produz três arquivos (`graph.json`, `GRAPH_REPORT.md`, `graph.html`); cada nó de `graph.json` já carrega `community` (inteiro) e `community_name` (rótulo padrão por hub, sem LLM).
- Versão travada em código (`GRAPHIFY_PINNED_VERSION`), invocada via `uv tool run --from graphifyy==<versão> graphify update <dir>` — isolado de qualquer instalação global do usuário, nunca atualiza sozinho.

**Status:** corrigido — implementado como invocação de CLI local via `uv tool run --from graphifyy==<versão travada>`, orquestrado por `AppProcess.Service` + `BackgroundJob`, sem HTTP, sem servidor Python. Ver `specs/xocp/graphify.md`.

### 5.4 Clusters (roteamento por domínio de código)
Não iniciado. Com a correção da seção 5.3, o design fica mais simples do que se imaginava: usar o campo `community` que o Graphify já calcula pra popular um `work-map.json`, e rotear trabalho pros subagentes que o OpenCode já suporta (seção 2.2) — **sem** tocar em `SessionExecution`/`SessionRunCoordinator`. Ver seção 8 pra a ambiguidade que isso resolve. A leitura de `community`/`community_name` do `graph.json` já existe (`graphify/graph-file.ts`); o roteamento em si ainda não foi implementado.

### 5.5 Prefetch de mapa
Não iniciado. Bloqueado por telemetria estar em produção por tempo suficiente pra validar o threshold — decisão de produto, não técnica.

---

## 6. Fluxo de trabalho de desenvolvimento

Este processo é tão parte da arquitetura quanto o código:

1. **Claude (este agente) escreve o prompt de implementação** — escopo travado, decisões de arquitetura já tomadas (nunca "decida você" pro Cursor), lista explícita do que não fazer, Definition of Done, e exigência de checklist final.
2. **Cursor Agent executa** em uma branch própria (`cursor/<nome>-9521`), abre PR pra `dev`, nunca mergeia sozinho.
3. **Claude audita o diff real** (não o relatório do Cursor) antes de aprovar — já encontramos defeitos reais que relatórios "tudo verde" não mencionaram (cast de tipo escondendo erro real, lógica duplicada reaparecendo, dependência declarada e não usada, e uma arquitetura inteira — o "sidecar" HTTP do Graphify — baseada em contrato inventado).
4. Se a auditoria encontra dívida técnica, o próximo prompt começa com uma **Fase 0 obrigatória** corrigindo isso antes de qualquer feature nova — dívida nunca fica "pra depois" acumulando.
5. Nenhum item do roadmap avança pro próximo sem essa aprovação.

---

## 7. Fora de escopo — decisões explícitas, não esquecimento

- Vendorizar o Graphify (ou qualquer código Python) dentro do monorepo — depender da versão publicada (`graphifyy` travada) é diferente de vendorizar código-fonte.
- Auto-ativar qualquer feature experimental sem clique explícito do usuário.
- Tocar em `SessionRunner`, `SessionExecution`, `SessionRunCoordinator`, ou no algoritmo de Context Epoch descrito no `AGENTS.md`, sem uma spec dedicada aprovada primeiro.
- Migrar `packages/app` do tarball vendorizado do client pra o workspace live (decisão de infraestrutura separada).
- Distributed/clustered session execution real (múltiplos processos disputando ownership de sessão) — ver seção 8.
- Construir um servidor HTTP/FastAPI próprio em volta do Graphify — o `uv tool run` já resolve orquestração, e `graphify.serve`/MCP já resolve consulta persistente, se algum dia for necessário.
- Auto-bootstrap do `uv` em si — é pré-requisito documentado, não instalado por nós.

---

## 8. Ambiguidade resolvida: "Clusters" não é uma coisa só

A spec upstream do OpenCode (`specs/v2/session.md`, `specs/v2/todo.md`) usa "clustered Session execution" pra descrever um problema de sistemas distribuídos — múltiplos processos, ownership fencing, recovery pós-crash — **ainda não resolvido nem pelo time que criou o `SessionV2`**. O roadmap XOCP usa "Clusters" pra descrever roteamento de trabalho por domínio (FE/BE/Core). São conceitos diferentes que só compartilham o nome. O XOCP **nunca** deve tentar resolver o primeiro — isso é fora de escopo, permanentemente, a menos que vire um projeto de design dedicado e explícito.

---

## 9. Glossário mínimo

- **Location** — diretório de projeto + workspace; unidade de escopo pra serviços "location-scoped".
- **Node / LayerNode** — unidade de composição de um serviço Effect, com dependências declaradas.
- **BackgroundJob** — registro de trabalho assíncrono em memória, por processo, não durável.
- **Durable event** — evento persistido no banco, sobrevive a restart (diferente de eventos "live-only").
- **Versão travada (pinned)** — dependência externa (ex.: `graphifyy`) fixada em um número de versão exato no código do XOCP; só muda quando o time decide e testa, nunca sozinha.
