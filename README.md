# Budget Manager App

Aplicacao Angular para gerenciamento financeiro pessoal.

## Stack

- Angular 21 com componentes standalone, strict mode e lazy loading por rota.
- Angular Material com tema Material 3.
- Tailwind CSS 4 para utilitarios de layout e espacamento.
- Angular ESLint para analise estatica.
- Vitest via Angular CLI para testes unitarios.

## Requisitos

Use uma versao LTS do Node suportada pelo Angular instalado. A maquina atual esta com Node `25.9.0`, que a Angular CLI marcou como nao suportado oficialmente.

## Comandos

```bash
npm start
npm run lint
npm run build
npm test
```

## Arquitetura

```text
src/app
  core/      configuracoes, modelos e servicos globais
  features/  funcionalidades de negocio isoladas por dominio
  layout/    shell, navegacao e estrutura persistente
  shared/    componentes e utilitarios reutilizaveis
```

As convencoes de estrutura e evolucao estao em `docs/coding-style.md`.
