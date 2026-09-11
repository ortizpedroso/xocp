# Baseline Global de Qualidade — XOCP

**Fonte única, fixa.** Toda Spec, todo Brief, com ou sem processo
formal de elicitação, herda estas 11 regras. Nunca reescrever, nunca
reformular com outras palavras dentro de uma Spec/Brief específico —
sempre referenciar por ID.

**Status: sempre `aplicavel`, exceto quando genuinamente não se aplica**
(ex.: G-UX-* não se aplica a um sistema sem nenhuma interface visual,
como uma API pura — declare `not_applicable`, nunca omita em silêncio).

---

## Segurança (não negociável em nenhuma Spec)

| ID | Regra |
|----|-------|
| G-SEC-1 | Hash de senha correto (bcrypt ou equivalente) — nunca texto puro |
| G-SEC-2 | Rate limiting em login/autenticação |
| G-SEC-3 | RBAC por perfil, mesmo que simples (2-3 papéis já conta) |
| G-SEC-4 | Migration sempre incremental — nunca editar uma já aplicada |
| G-SEC-5 | Validação de entrada sempre no servidor — nunca confiar só no cliente |
| G-SEC-6 | Erros nunca vazam detalhe interno (stack trace, mensagem de banco) pro usuário final |

## UI/UX (qualidade objetiva, não escolha de estilo)

| ID | Regra |
|----|-------|
| G-UX-1 | Contraste de cor acessível em texto sobre fundo |
| G-UX-2 | Rótulo acessível em botão de só-ícone (leitor de tela) |
| G-UX-3 | Funciona em tela pequena (responsivo), não só desktop |
| G-UX-4 | Estado de carregamento visível — nunca tela em branco enquanto espera |
| G-UX-5 | Mensagem de erro específica pro usuário final — nunca só código técnico cru |

---

## Como cada regra é verificada — mecânica vs. julgamento

| ID | Verificação |
|----|-------------|
| G-SEC-1 | Mecânica — busca por comparação direta de senha sem hash |
| G-SEC-2 | Mecânica — busca por endpoint de auth sem middleware de rate limit |
| G-SEC-3 | Julgamento — confirma existência de checagem de papel/permissão |
| G-SEC-4 | Mecânica — busca por edição de arquivo de migration já commitado |
| G-SEC-5 | Julgamento — confirma validação server-side presente na rota |
| G-SEC-6 | Mecânica — busca por `stack`/erro de banco devolvido na resposta HTTP |
| G-UX-1  | Mecânica (com ferramenta de cálculo de contraste) |
| G-UX-2  | Mecânica — busca por elemento de ícone sem `aria-label`/equivalente |
| G-UX-3  | Julgamento — inspeção de CSS/layout responsivo |
| G-UX-4  | Julgamento — confirma existência de estado de loading no componente |
| G-UX-5  | Julgamento — lê a mensagem de erro real, confirma que é legível |

Isso não é exaustivo nem subst tui julgamento — é o ponto de partida de
**onde procurar**, pro `baseline-auditor` (workflow-pipeline-v2.md).
