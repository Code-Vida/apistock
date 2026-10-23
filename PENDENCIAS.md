# Pendências — branch `fix/security-and-bugs`

Pacote de atualização ainda **não está em produção**. Este arquivo lista o que falta antes de fazer merge na `main` e o deploy.
O app Flutter (repo `appstock`) tem uma branch com o mesmo nome e um `PENDENCIAS.md` próprio.

## Antes do merge / deploy

- [ ] **Ordem do deploy:** API primeiro, app depois. O sync do app depende do upsert de `createCustomer` e `createSupplier`.
- [ ] **`JWT_SECRET` no Railway:** agora é obrigatório; sem ele a API não sobe.
- [ ] **Variáveis opcionais:** `CORS_ORIGINS` (lista separada por vírgula; sem ela, qualquer origem é aceita) e `RATE_LIMIT_MAX` (padrão 300 req/min por IP).
- [ ] **Caixas abertos duplicados:** verificar se existe mais de um caixa `OPEN` por loja no banco. Se existir, o índice `one_open_cash_per_store` não é criado (a API sobe e só loga um aviso).
- [ ] **Breaking changes no schema:** `redeemLoyaltyPoints` e `hello` foram removidos; `Pagination.total` virou `Int!`; operações de usuário/loja agora exigem `@auth`. O app atual não usa essas operações, mas qualquer outro cliente sim.
- [ ] **Testar com o app** em ambiente de homologação (venda, devolução, caixa, cliente, fornecedor, sync offline).

## O que foi feito nesta branch

- Credenciais do Mongo removidas do código e do histórico do git; URI não aparece mais no log.
- `getAll` restrito à loja; `JWT_SECRET` obrigatório.
- `createSale`: estoque não fica negativo (cor + numeração na mesma variante), totais recalculados no servidor, grava `costAtTimeOfSale`, pontos de fidelidade dentro da transação, reenvio idempotente pelo `_id`, venda ligada à sessão de caixa.
- Caixa: fechamento soma por sessão; índice único impede dois caixas abertos.
- `createCustomer` e `createSupplier` com upsert por `_id`; resolvers de `updateCustomer`, `getCustomerById` e `getCustomerLoyaltyHistory`.
- Corrigidos `acknowledgeLowStock`, filtro de estoque baixo, `createStoreCredit`, `updateStoreCredit`, `updateProduct`, `Total.*`.
- Regex de busca escapada; `@auth` em operações sem proteção; `createUser` valida perfil (ADMIN, VENDEDOR); PIN bloqueia 15 min após 5 erros; rate limit por IP; CORS configurável.
- NFC-e: endpoint de consulta corrigido; consultas pendentes retomadas ao reiniciar.
- Código morto removido.

Verificado com 22 testes de integração contra Mongo em memória (replica set). Os testes não estão no repositório.

## Pendências técnicas (não feitas)

- [ ] **NFC-e real:** payload em `app/services/FiscalService.js` ainda é fixo de homologação; precisa mapear venda/loja com as regras fiscais (regime, CFOP, CSOSN).
- [ ] **Apollo Server 3 → 4** (v3 sem suporte desde out/2024) e **Mongo 5** fora de suporte.
- [ ] **Limite de profundidade/complexidade** das queries GraphQL; desligar introspecção em produção explicitamente.
- [ ] **Coleções e mutations legadas** (`products`, `salesReport`, `sales`, `devolution`, `stockReport`): remover depois de confirmar que nenhuma versão do app usa.
- [ ] **Auth:** papel vem do token sem revalidar no banco; não há refresh token nem revogação.
- [ ] **Rate limit e bloqueio de PIN em memória:** zeram ao reiniciar e não funcionam com mais de uma instância.
- [ ] **Testes automatizados no repositório** (ex.: `mongodb-memory-server` + CI).
- [ ] **Validação de entrada** e índices declarados nas demais coleções.
