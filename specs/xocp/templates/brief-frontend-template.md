# Brief Template: Frontend

## Camada 1: Contrato Global

### Objetivo
Desenvolver interfaces de usuário responsivas, acessíveis e performáticas que proporcionem excelente experiência ao usuário.

### Critérios de Aceitação (ID Obrigatório)
- [ ] **C001**: UI implementada conforme design system aprovado
- [ ] **C002**: Acessibilidade WCAG 2.1 nível AA atendida
- [ ] **C003**: Responsividade testada em breakpoints definidos
- [ ] **C004**: Performance Core Web Vitals dentro dos limites
- [ ] **C005**: Tratamento de estados (loading, error, empty) implementado
- [ ] **C006**: Testes unitários e de componente com cobertura mínima de 80%
- [ ] **C007**: Testes E2E para fluxos críticos

### Restrições Globais
- Não introduzir dependências sem aprovação prévia
- Manter compatibilidade com navegadores suportados
- Seguir princípios de componentização e reutilização

### Definição de Pronto (DoD)
- Todos os critérios C001-C007 atendidos
- Tests passando (`bun test`)
- Lint passando (`bun lint`)
- Build sem warnings (`bun build`)
- Code review aprovado
- QA em staging validado

---

## Camada 2: Contrato do Cluster Frontend

### Especificações Técnicas
- **Framework**: [React/Vue/Angular/etc]
- **Gerenciamento de Estado**: [Redux/Zustand/Context/etc]
- **Estilização**: [Tailwind/CSS-in-JS/SASS/etc]
- **Build Tool**: [Vite/Webpack/etc]
- **Testing**: [Jest/Vitest/Playwright/etc]

### Padrões de Código
- Nomenclatura: PascalCase para componentes, camelCase para funções
- Estrutura de pastas por feature/domain
- Componentes puros quando possível
- Custom hooks para lógica reutilizável

### Design Tokens
- Cores: Usar variáveis do design system
- Tipografia: Seguir escala tipográfica definida
- Espaçamento: Usar sistema de grid consistente
- Breakpoints: mobile-first conforme especificado

### Performance
- First Contentful Paint < 1.5s
- Time to Interactive < 3.5s
- Bundle size otimizado com code splitting
- Imagens otimizadas (WebP, lazy loading)

---

## Camada 3: Especificidades do Sistema

### Contexto Atual
- **Feature**: [Descrição da feature sendo desenvolvida]
- **Páginas Afetadas**: [Listar páginas/componentes]
- **Integrações**: [APIs externas ou internas consumidas]

### Considerações Específicas
- [Listar considerações específicas deste desenvolvimento]
- [Mencionar integrações com analytics, tracking, etc]
- [Detalhar requisitos de internacionalização se aplicável]

### Hipóteses e Riscos
- **Hipóteses**: [Listar hipóteses assumidas]
- **Riscos Identificados**: [Listar riscos e mitigação]

---

## Metadados
- **Cluster**: frontend
- **Prioridade**: [high|medium|low]
- **Complexidade**: [L1|L2|L3]
- **Criado em**: YYYY-MM-DD
- **Autor**: [nome]
- **Reviewers**: [nomes]
