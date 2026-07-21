# Automacao de testes do CPT Dashboard

Atualizado em 2026-07-20.

## Quality gate local

Execute a partir de `dash`:

```powershell
npm run check
```

O comando valida UTF-8, procura segredos acidentais, executa smoke checks, testes comportamentais e TypeScript. Ele nao executa `next build`.

Para iteracao mais curta:

```powershell
npm test
npm run typecheck
```

## Cobertura atual

- sanidade de pace por modalidade;
- pace agregado por tempo e distancia;
- prioridade da data local;
- elapsed time em best efforts;
- consistencia com semanas vazias e streak atual;
- matriz de acesso free, pro, admin e master;
- limites e contrato do payload de IA;
- invariantes de autenticacao, cache, webhook, sync e exclusao por smoke tests.

## CI

O workflow `.github/workflows/quality-gate.yml` usa Node 22 e roda em pushes para `main` e pull requests. Ele valida o contrato de ambiente e executa `npm run check`, sem build.

## Proximas camadas recomendadas

1. Testes de contrato das rotas com Firestore e Strava simulados.
2. Fixture de analytics anual cobrindo atividade ativa e ignorada no mesmo dia.
3. Testes de concorrencia do rate limit e locks de sincronizacao.
4. Teste end-to-end do login, filtros, detalhe e exclusao em ambiente de homologacao.

Essas camadas devem ser adicionadas sem substituir os testes numericos de dominio existentes.
