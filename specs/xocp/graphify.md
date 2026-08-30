# Graphify (CLI local XOCP)

## Mecanismo

O Graphify (`graphifyy` no PyPI) é uma **ferramenta CLI local**, não um serviço HTTP.
O XOCP invoca:

```bash
uv tool run --from graphifyy==<GRAPHIFY_PINNED_VERSION> graphify update <diretório>
```

- Versão travada em `packages/core/src/graphify/version.ts` (`GRAPHIFY_PINNED_VERSION`).
- `uv tool run --from X==versão` nunca usa um `graphify` global do PATH do usuário.
- Orquestração via `AppProcess.Service` + `BackgroundJob` (`type: "graphify.map"`).
- Timeout padrão: 10 minutos por job.

## Por que `update` e não `extract`

`graphify update` funciona em projeto nunca mapeado, sem chave de API, sem LLM,
e já calcula comunidades (`community`, `community_name` em cada nó).

`graphify extract` implica passo semântico com LLM — fora do MVP.

## Por que sem `--label`

`--label` custaria tokens de LLM sem necessidade; os rótulos padrão por hub
já vêm em `community_name`.

## Feature flag

`experimental.graphify` (booleano, default `false`) controla telemetria **e** a
feature de mapa. Quando desligada, `Graphify.available()` retorna `false` e
`startMap` falha com `Graphify.GraphifyDisabled` antes de criar qualquer job.

## Pré-requisito: `uv`

Se `which("uv")` retorna `null`, `available()` é `false` e `startMap` falha com
`Graphify.UvNotFound`. O XOCP **não** instala o `uv` automaticamente.

## Saída

Artefatos em `<diretório>/graphify-out/`:

- `graph.json` — grafo com nós contendo `source_file`, `community`, `community_name`
- `GRAPH_REPORT.md`
- `graph.html`

## Leitura de comunidades

`readCommunities(directory)` lê `graphify-out/graph.json` e devolve entradas
deduplicadas por `source_file`. Não gera `work-map.json` (item 5 do roadmap).

## Testar uma versão nova

1. Alterar `GRAPHIFY_PINNED_VERSION` em `version.ts`
2. Rodar `bun test test/graphify/` em `packages/core`
3. Rodar manualmente `uv tool run --from graphifyy==<versão> graphify update .`
4. Commitar somente após validação

## API HTTP (consumidores)

Três endpoints em `packages/protocol/src/groups/graphify.ts`:

- `GET .../graphify-suggestion` — campo `available` (não `sidecarConfigured`)
- `POST .../graphify-map` — erros `graphify_disabled`, `graphify_uv_not_found`
- `GET .../graphify-map/:jobID` — status do `BackgroundJob`

## Referências

- Implementação: `packages/core/src/graphify/`
- Arquitetura: `specs/xocp/architecture.md`
- Telemetria: `specs/xocp/telemetry.md`
