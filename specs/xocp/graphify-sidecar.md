# Graphify sidecar (cliente XOCP)

## Objetivo

Orquestrar chamadas HTTP a um **sidecar Graphify externo** (Python/FastAPI +
`graphifyy`, fora deste monorepo) para mapear a estrutura de um projeto.
Este item cobre apenas o **cliente TypeScript** e o agendamento via
`BackgroundJob` — sem UI, sem rota HTTP pública, sem auto-disparo por
telemetria.

## Decisão de escopo: onde fica a API

O roadmap menciona "API no OpenCode para disparar/consultar mapa". Neste item
adotamos a **opção (b)**: funções de serviço Effect em `packages/core`, sem
rota em `packages/server`/`HttpApi` e sem regenerar `packages/client`.

A exposição via HttpApi, tool de agente ou CLI fica para o item 3 (UI) ou uma
spec de API dedicada, quando o consumidor real estiver definido.

## Config

Campo em `experimental.graphify_sidecar` (não confundir com
`experimental.graphify` da telemetria):

| Campo | Tipo | Default | Descrição |
|-------|------|---------|-----------|
| `url` | string? | — | Base URL do sidecar (sem barra final) |
| `enabled` | boolean? | `false` | Deve ser `true` para usar o cliente |
| `timeout_ms` | positive int? | `30000` | Timeout HTTP por requisição |

**Não configurado** quando `enabled !== true` ou `url` ausente/vazio. Nesse
caso o cliente retorna `Graphify.NotConfigured` sem tentar rede.

Exemplo:

```json
{
  "experimental": {
    "graphify_sidecar": {
      "enabled": true,
      "url": "http://127.0.0.1:8765",
      "timeout_ms": 60000
    }
  }
}
```

## Contrato HTTP assumido (lado cliente)

> **Suposição** até existir o sidecar real. O cliente XOCP implementa este
> contrato; o repositório Graphify deve alinhá-lo ou publicar uma spec
> revisada.

### `GET {base}/health`

Resposta `200`:

```json
{ "status": "ok" }
```

### `POST {base}/map`

Request:

```json
{ "directory": "/absolute/path/to/project" }
```

Resposta `200`:

```json
{
  "status": "completed",
  "directory": "/absolute/path/to/project",
  "map_path": "/optional/path/to/artifact.json"
}
```

`status` pode ser `"accepted"` ou `"completed"`. `map_path` é opcional.

Erros HTTP (`4xx`/`5xx`) viram `Graphify.RemoteError` com `status` e corpo.

## Erros tipados

| Tag | Quando |
|-----|--------|
| `Graphify.NotConfigured` | Flag/url ausentes ou `enabled !== true` |
| `Graphify.Unreachable` | Rede, timeout, falha de transporte |
| `Graphify.InvalidResponse` | `2xx` mas corpo não decodifica no schema |
| `Graphify.RemoteError` | Resposta HTTP de erro do sidecar |

## Orquestração (`BackgroundJob`)

- `startMapJob({ sessionID?, directory })` — `type: "graphify.map"`, retorna
  `BackgroundJob.Info` imediatamente (`status: "running"`).
- `getMapJob(id)` — consulta estado do job.
- `checkSidecarHealth()` — serviço location-scoped; não é chamado
  automaticamente neste item.

### Limitação de durabilidade

`BackgroundJob` é **process-local e não durável** (ver comentário em
`background-job.ts`). Restart do processo perde jobs em andamento. Jobs de
mapeamento herdam essa limitação; recovery durável é trabalho futuro.

### Composição global vs location

O serviço Graphify é **location-scoped** (URL por projeto, como MCP).
`BackgroundJob` é **global**; jobs de mapa são iniciados no processo local
atual e não sobrevivem a restart.

## O que este item não faz

- Não lê `SessionTelemetry.score()` nem dispara mapa por threshold.
- Não altera fluxo SessionV2.
- Não inclui UI, HttpApi, nem vendorização do Graphify.

## Referências

- Cliente: `packages/core/src/graphify/client.ts`
- Jobs: `packages/core/src/graphify/job.ts`
- Serviço: `packages/core/src/graphify/index.ts`
- Telemetria (item 1): `specs/xocp/telemetry.md`
