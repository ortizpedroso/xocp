# Brief Template: Integration

## Camada 1: Contrato Global

### Objetivo
Desenvolver integrações E2E e cross-boundary que garantam comunicação confiável entre sistemas e serviços.

### Critérios de Aceitação (ID Obrigatório)
- [ ] **C001**: Contratos de integração bem definidos e versionados
- [ ] **C002**: Tratamento de falhas de rede e timeout implementado
- [ ] **C003**: Retry com backoff exponencial configurado
- [ ] **C004**: Circuit breaker para serviços externos
- [ ] **C005**: Logs de integração com correlation IDs
- [ ] **C006**: Testes de integração com mocks e ambientes reais
- [ ] **C007**: Monitoramento e alertas configurados

### Restrições Globais
- Não introduzir acoplamento forte entre sistemas
- Manter compatibilidade com versões anteriores da API
- Seguir princípios de resilient engineering

### Definição de Pronto (DoD)
- Todos os critérios C001-C007 atendidos
- Tests de integração passando
- Chaos testing validado
- Code review aprovado
- Runbook de operações criado

---

## Camada 2: Contrato do Cluster Integration

### Especificações Técnicas
- **Protocolo**: [REST/gRPC/GraphQL/WebSocket/etc]
- **Autenticação**: [OAuth2/JWT/API Key/mTLS]
- **Serialização**: [JSON/Protobuf/MessagePack]
- **Message Broker**: [Kafka/RabbitMQ/SQS/etc se aplicável]

### Padrões de Integração
- API Gateway para roteamento externo
- Adapter pattern para sistemas legados
- Event-driven architecture quando aplicável
- Saga pattern para transações distribuídas

### Resiliência
- Timeout configurado para todas as chamadas externas
- Retry policies com backoff exponencial e jitter
- Circuit breaker com fallbacks definidos
- Dead letter queues para mensagens falhas

### Observabilidade
- Tracing distribuído com OpenTelemetry
- Metrics de latência, erro e throughput
- Logging estruturado com correlation IDs
- Health checks expostos para monitoramento

---

## Camada 3: Especificidades do Sistema

### Contexto Atual
- **Integração**: [Descrição da integração sendo desenvolvida]
- **Sistemas Envolvidos**: [Listar sistemas internos e externos]
- **Fluxo de Dados**: [Direção e volume esperado de dados]

### Considerações Específicas
- [Listar considerações específicas desta integração]
- [Mencionar requisitos de compliance (LGPD, GDPR, etc)]
- [Detalhar SLAs esperados do serviço externo]

### Hipóteses e Riscos
- **Hipóteses**: [Listar hipóteses assumidas sobre o sistema externo]
- **Riscos Identificados**: [Listar riscos e mitigação]

---

## Metadados
- **Cluster**: integration
- **Prioridade**: [high|medium|low]
- **Complexidade**: [L1|L2|L3]
- **Criado em**: YYYY-MM-DD
- **Autor**: [nome]
- **Reviewers**: [nomes]
