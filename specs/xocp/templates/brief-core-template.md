# Brief Template: Core

## Camada 1: Contrato Global

### Objetivo
Desenvolver primitivas, contratos e invariantes fundamentais que garantam a integridade e consistência do sistema.

### Critérios de Aceitação (ID Obrigatório)
- [ ] **C001**: Contratos de tipo bem definidos e tipados
- [ ] **C002**: Invariantes de domínio validadas em runtime
- [ ] **C003**: Imutabilidade garantida onde aplicável
- [ ] **C004**: Tratamento de erros com tipos específicos
- [ ] **C005**: Documentação de API pública completa
- [ ] **C006**: Testes unitários com cobertura mínima de 90%
- [ ] **C007**: Zero dependências externas não aprovadas

### Restrições Globais
- Não introduzir side effects em funções puras
- Manter backward compatibility para APIs públicas
- Seguir princípios de functional programming quando aplicável

### Definição de Pronto (DoD)
- Todos os critérios C001-C007 atendidos
- Tests passando (`bun test`)
- Typecheck passando (`bun typecheck`)
- Lint passando (`bun lint`)
- Code review aprovado
- Benchmarks de performance validados

---

## Camada 2: Contrato do Cluster Core

### Especificações Técnicas
- **Linguagem**: TypeScript/JavaScript com strict mode
- **Tipagem**: TypeScript com strict: true
- **Build**: Compilação para ES2020+ com tree-shaking
- **Package Management**: [npm/yarn/pnpm/bun]

### Padrões de Código
- Nomenclatura: camelCase para funções/variáveis, PascalCase para tipos
- Estrutura: Separar interfaces, implementações e utilities
- Funções puras preferidas sobre classes com estado
- Composition over inheritance

### Contratos e Tipos
- Interfaces explícitas para todos os tipos públicos
- Generics usados apropriadamente para reutilização
- Utility types para derivação de tipos
- Branding types para tipos primitivos semânticos

### Performance
- Complexidade algorítmica documentada para funções críticas
- Memory leaks prevenidos com proper cleanup
- Lazy loading para módulos pesados

---

## Camada 3: Especificidades do Sistema

### Contexto Atual
- **Módulo**: [Descrição do módulo/core sendo desenvolvido]
- **Dependências Internas**: [Quais partes do sistema usam este módulo]
- **API Pública**: [O que será exposto externamente]

### Considerações Específicas
- [Listar considerações específicas deste desenvolvimento]
- [Mencionar constraints de performance críticos]
- [Detalhar requisitos de thread-safety se aplicável]

### Hipóteses e Riscos
- **Hipóteses**: [Listar hipóteses assumidas]
- **Riscos Identificados**: [Listar riscos e mitigação]

---

## Metadados
- **Cluster**: core
- **Prioridade**: [high|medium|low]
- **Complexidade**: [L1|L2|L3]
- **Criado em**: YYYY-MM-DD
- **Autor**: [nome]
- **Reviewers**: [nomes]
