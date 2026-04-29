# Coding style

Este projeto usa Angular standalone, rotas lazy por feature e componentes focados por responsabilidade.

## Estrutura

- `core`: configuracoes, modelos e servicos singleton globais.
- `layout`: componentes de composicao da aplicacao, como shell, navegacao e areas persistentes.
- `features`: funcionalidades de negocio isoladas por dominio.
- `shared`: componentes, pipes e utilitarios reutilizaveis, sem dependencia de uma feature especifica.

## Convencoes

- Prefira componentes standalone e `loadComponent` nas rotas.
- Use aliases (`@core`, `@features`, `@layout`, `@shared`) em imports entre pastas de alto nivel.
- Mantenha componentes de feature dentro da propria feature.
- Extraia para `shared` apenas quando houver reutilizacao real.
- Mantenha estado global em `core` somente quando o dado for transversal a mais de uma feature.
- Use Angular Material para componentes interativos e Tailwind para espacamento/layout utilitario.
