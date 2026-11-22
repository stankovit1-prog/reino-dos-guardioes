# Poker Arena BR

Poker online independente do Reino dos Guardiões, com Texas Hold'em No-Limit.

## Nesta versão
- Contas com usuário e senha.
- Carteira persistente de fichas gratuitas e premium separadas.
- Bônus gratuito diário.
- Mesas públicas e privadas por código, de 2 a 6 jogadores.
- Blinds automáticos, cartas comunitárias, fold, check, call, raise e all-in.
- Motor de jogo executado no servidor e histórico da mesa.
- Persistência PostgreSQL/Neon.

## Configuração
Variáveis:
- `DATABASE_URL`: conexão PostgreSQL do projeto Neon.
- `PORT`: porta HTTP (Render define automaticamente).
- `PAID_ROOMS_ENABLED=false`: obrigatório na primeira publicação.
- `RAKE_PERCENT=5` e `RAKE_CAP=100`: parâmetros de comissão preparados para modalidade premium futura.

As rotas de compra e de mesas premium permanecem bloqueadas até validação jurídica do modelo de tokens, apostas, pagamentos e resgate, além da integração de um provedor de pagamentos.

## Desenvolvimento
```bash
cd poker/server
npm install
npm test
npm start
```

A aplicação está em `poker/public`.
