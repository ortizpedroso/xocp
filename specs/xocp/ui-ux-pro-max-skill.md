# UI/UX Pro Max skill (global vendoring)

**Onde isto vive:** `~/.config/opencode/skills/ui-ux-pro-max/SKILL.md` — pasta global do
usuário, não dentro de nenhum repositório de projeto específico. Funciona em qualquer
projeto aberto no XOCP/OpenCode.

**Upstream:** [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)

**Commit travado:** `f3ac195224eac1eb0dfe1a3059c2a6add78ffbe3`  
Mensagem: `docs: remove unimplemented openclaw install command (#483)`

Mesmo espírito do `GRAPHIFY_PINNED_VERSION`: não seguimos `main` automaticamente.
Trocar de versão é decisão consciente — editar `UI_UX_PRO_MAX_PINNED_COMMIT` em
`scripts/install-ui-ux-pro-max-skill.sh` e reinstalar.

## Instalação

```bash
./scripts/install-ui-ux-pro-max-skill.sh
```

O script:

1. Faz shallow-fetch do commit pinado.
2. Copia `.claude/skills/ui-ux-pro-max/` para `~/.config/opencode/skills/ui-ux-pro-max/`.
3. Corrige `SKILL.md`: substitui `${CLAUDE_PLUGIN_ROOT}/.../search.py` pelo caminho
   absoluto `~/.config/opencode/skills/ui-ux-pro-max/scripts/search.py` (variável
   exclusiva do Claude Code, instável no XOCP).
4. Grava `PINNED_UPSTREAM.txt` na pasta instalada com repo + commit.

## Uso esperado

Quando o agente precisar de paleta, tipografia, UX guidelines, etc., ele deve executar
o script local (não só ler o `SKILL.md`):

```bash
python3 ~/.config/opencode/skills/ui-ux-pro-max/scripts/search.py "financial dashboard" --domain color
```

## O que não fazemos

- Não reescrevemos o banco de dados de padrões upstream (`data/`, `references/`).
- Não configuramos atualização automática.
