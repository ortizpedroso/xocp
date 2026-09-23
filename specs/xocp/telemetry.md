# Telemetria de sessão XOCP

## Objetivo

Coletar sinais observacionais por sessão para decidir, no futuro, se vale a pena
sugerir mapeamento estrutural do projeto (Graphify). A telemetria **não altera**
o fluxo SessionV2 (prompt → runner → LLM → tools); só registra eventos quando
habilitada.

## Feature flag

- Campo de config: `experimental.graphify` (booleano, default `false`).
- Quando **desligada**: `record` é no-op; `score` retorna `0` (score neutro).
- Quando **ligada**: eventos são gravados e o score é calculado.

## Eventos

| Tipo | Quando é emitido | Payload |
|------|------------------|---------|
| `session.started` | Sessão criada com sucesso (primeira projeção) | `agent?`, `model?` |
| `session.turn` | Fim de um turno de provedor no `SessionRunner` | `turn` (número), `duration_ms?` |
| `session.tool_used` | Ferramenta local executada no turno | `tool` (nome), `turn?` |
| `session.ended` | Dreno da sessão concluído (fila ociosa) | `reason`: `idle` |

Todos os eventos incluem `session_id` e `recorded_at` (ms epoch) na persistência.

## Session score (heurística inicial)

Fórmula (cap em 100):

```
turns = contagem de eventos session.turn
tools = cardinalidade de nomes distintos em session.tool_used
duration_min = max(0, floor((último_evento - session.started) / 60_000))

score = min(100, turns * 5 + tools * 8 + duration_min * 2)
```

Esta fórmula é um **ponto de partida**: prioriza sessões longas, com vários turnos
e diversidade de ferramentas — sinais de que um mapa estrutural poderia ajudar.
Não considera ainda arquivos tocados (dados nem sempre disponíveis no turno).

## Threshold (futuro — item 3 do roadmap)

- **Sugerir mapeamento** quando `score >= 40` (documentado apenas; UI não
  implementada neste item).
- A sugestão continua **opt-in**; nunca ativar Graphify automaticamente.

## Persistência

Tabela `session_telemetry_event` (SQLite, Drizzle snake_case), uma linha por
evento, indexada por `session_id`.

## Referências

- Implementação: `packages/core/src/telemetry/`
- Flag: `packages/core/src/config/experimental.ts`
