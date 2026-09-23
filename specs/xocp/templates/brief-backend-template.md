# Brief Template: Backend

## Camada 1: Contrato Global

### Objetivo
Desenvolver APIs robustas, seguras e performáticas que atendam aos requisitos de negócio com qualidade enterprise.

### Critérios de Aceitação (ID Obrigatório)
- [ ] **C001**: API segue padrão REST/GraphQL especificado
- [ ] **C002**: Validação de entrada implementada para todos os endpoints
- [ ] **C003**: Tratamento de erros padronizado com códigos HTTP apropriados
- [ ] **C004**: Autenticação e autorização implementadas conforme security policy
- [ ] **C005**: Logs estruturados para auditoria e debugging
- [ ] **C006**: Testes unitários com cobertura mínima de 80%
- [ ] **C007**: Documentação OpenAPI/Swagger atualizada

### Restrições Globais
- Não introduzir breaking changes sem versionamento
- Manter compatibilidade com versões anteriores quando aplicável
- Seguir princípios SOLID e Clean Architecture

### Definição de Pronto (DoD)
- Todos os critérios C001-C007 atendidos
- Tests passando (`bun test`)
- Lint passando (`bun lint`)
- Code review aprovado
- Deploy em staging validado

---

## Camada 2: Contrato do Cluster Backend

### Especificações Técnicas
- **Framework**: [Especificar framework]
- **Banco de Dados**: [Especificar DB e versão]
- **Migrações**: Usar sistema de migração aprovado
- **Cache**: Estratégia de cache definida (Redis/Memcached)
- **Filas**: Sistema de mensageria se aplicável

### Padrões de Código
- Nomenclatura: snake_case para DB, camelCase para código
- Estrutura de pastas seguindo domain-driven design
- Injeção de dependência para testabilidade

### Performance
- Tempo de resposta p95 < 200ms para endpoints críticos
- Query optimization com índices apropriados
- Connection pooling configurado

---

## Camada 3: Especificidades do Sistema

### Contexto Atual
- **Feature**: [Descrição da feature sendo desenvolvida]
- **Impacto**: [Quais sistemas/serviços são afetados]
- **Dependencies**: [Serviços externos ou internos dependentes]

### Considerações Específicas
- [Listar considerações específicas deste desenvolvimento]
- [Mencionar integrações com outros serviços]
- [Detalhar requisitos não-funcionais específicos]

### Hipóteses e Riscos
- **Hipóteses**: [Listar hipóteses assumidas]
- **Riscos Identificados**: [Listar riscos e mitigação]

---

## Metadados
- **Cluster**: backend
- **Prioridade**: [high|medium|low]
- **Complexidade**: [L1|L2|L3]
- **Criado em**: YYYY-MM-DD
- **Autor**: [nome]
- **Reviewers**: [nomes]
