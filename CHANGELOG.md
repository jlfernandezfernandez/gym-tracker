# Changelog

## [2.0.0](https://github.com/jlfernandezfernandez/gym-tracker/compare/v1.2.2...v2.0.0) (2026-07-17)


### ⚠ BREAKING CHANGES

* weight is NULL or > 0 — drop the -1 bodyweight sentinel

### Features

* **api,mcp:** add exercise to existing session ([#56](https://github.com/jlfernandezfernandez/gym-tracker/issues/56)) ([f949dad](https://github.com/jlfernandezfernandez/gym-tracker/commit/f949dad6f9056d23be640e71e32fe8a7f345e03e)), closes [#46](https://github.com/jlfernandezfernandez/gym-tracker/issues/46)
* **api,miniapp,mcp:** support marking and filtering disliked exercises ([004c6d2](https://github.com/jlfernandezfernandez/gym-tracker/commit/004c6d2270ce3d3627cc52d137ef0b6e0076349a))
* **api,miniapp,mcp:** support marking and filtering disliked exercises ([f3b2cc8](https://github.com/jlfernandezfernandez/gym-tracker/commit/f3b2cc82a99f01a6c0b4ab2ddad3fd73659b665e))
* **miniapp:** show exercise picker after completing one ([67d99a8](https://github.com/jlfernandezfernandez/gym-tracker/commit/67d99a812fca0ddf7c6930ec4d252ad75f51f232))
* **miniapp:** show exercise picker after completing one ([83a62c5](https://github.com/jlfernandezfernandez/gym-tracker/commit/83a62c56a4642b76c306110b1d7ef8fe275baf81))
* support optional/nullable weight for unloaded exercises ([9e0bfa4](https://github.com/jlfernandezfernandez/gym-tracker/commit/9e0bfa4b0fbbe20554fc9257e1814ae60356f52a))
* weight is NULL or &gt; 0 — drop the -1 bodyweight sentinel ([4fd2372](https://github.com/jlfernandezfernandez/gym-tracker/commit/4fd2372f45c85ecc10ed41c9ff5766ce4a13fe65))


### Bug Fixes

* **api:** resolve duplicate alembic revision j0e1f2a3b4c5 ([5cabd7c](https://github.com/jlfernandezfernandez/gym-tracker/commit/5cabd7c1ca94e935340f547802fd4b21e7d12d85))
* auto-finish session when all exercises done ([#54](https://github.com/jlfernandezfernandez/gym-tracker/issues/54)) ([6d04c9d](https://github.com/jlfernandezfernandez/gym-tracker/commit/6d04c9d87fdec7f63ca2550d5d675955c092ec9e))
* green CI and harden yesterday's features ([dd13ac9](https://github.com/jlfernandezfernandez/gym-tracker/commit/dd13ac93fadb3114ac1c85d0d4f8d1a3caa71c6d))
* **miniapp:** resolve TypeScript and build errors on main ([c0cea24](https://github.com/jlfernandezfernandez/gym-tracker/commit/c0cea242e12c40c2a707c1d0982f0b968b3d79b5))

## [1.2.2](https://github.com/jlfernandezfernandez/gym-tracker/compare/v1.2.1...v1.2.2) (2026-07-16)


### Bug Fixes

* **mcp:** expose set_targets in update_planned_exercise ([abfdc16](https://github.com/jlfernandezfernandez/gym-tracker/commit/abfdc161ced1620d54fade9c5320b28836894a6c))
* **mcp:** expose set_targets in update_planned_exercise ([b88caba](https://github.com/jlfernandezfernandez/gym-tracker/commit/b88caba172df552d6b5330150fc4459c347997da))

## [1.2.1](https://github.com/jlfernandezfernandez/gym-tracker/compare/v1.2.0...v1.2.1) (2026-07-15)


### Bug Fixes

* add checkout step before triggering release workflow ([#41](https://github.com/jlfernandezfernandez/gym-tracker/issues/41)) ([aff0413](https://github.com/jlfernandezfernandez/gym-tracker/commit/aff04136467dc2ebd0889f49d23e2dac9a70a7d6))
* make MCP session mutations safe ([#48](https://github.com/jlfernandezfernandez/gym-tracker/issues/48)) ([cbbc07e](https://github.com/jlfernandezfernandez/gym-tracker/commit/cbbc07eed49721722b9571298689278c345beac3))

## [1.2.0](https://github.com/jlfernandezfernandez/gym-tracker/compare/v1.1.0...v1.2.0) (2026-07-15)


### Features

* delete planned exercises with no logged sets ([ab71819](https://github.com/jlfernandezfernandez/gym-tracker/commit/ab7181914d2f6c2f95285843bb4ac2df6f986687))
* delete planned exercises with no logged sets ([e4c2564](https://github.com/jlfernandezfernandez/gym-tracker/commit/e4c256401ef932753709a5a0db7bac64e7df0b40))


### Bug Fixes

* always pull production latest images ([5b15f73](https://github.com/jlfernandezfernandez/gym-tracker/commit/5b15f737eb6576a222847b064214fdb0c95fe255))
* restore release validation and image publishing ([ac52fa1](https://github.com/jlfernandezfernandez/gym-tracker/commit/ac52fa1455f061ada073e2a989a2358ad084434b))

## [1.1.0](https://github.com/jlfernandezfernandez/gym-tracker/compare/v1.0.0...v1.1.0) (2026-07-15)


### Features

* per-set targets with independent prefill ([a3e6c58](https://github.com/jlfernandezfernandez/gym-tracker/commit/a3e6c58b2b764cc12eaeee5c179ffaf2c9122576))
* per-set targets with independent prefill ([#27](https://github.com/jlfernandezfernandez/gym-tracker/issues/27)) ([af65450](https://github.com/jlfernandezfernandez/gym-tracker/commit/af65450e4f6add70f8c6ac7d85c420aceaf0a780))


### Bug Fixes

* add issues:write permission to release-please workflow ([#32](https://github.com/jlfernandezfernandez/gym-tracker/issues/32)) ([4425f4c](https://github.com/jlfernandezfernandez/gym-tracker/commit/4425f4c735d0b6c00e3d6ad307747d7a0f7401c5))
* allow secret-free local startup ([19e60c8](https://github.com/jlfernandezfernandez/gym-tracker/commit/19e60c8945751a06e773458ae182e00e3f9312ba))
* avoid postgres hostname collision in compose ([57b5a78](https://github.com/jlfernandezfernandez/gym-tracker/commit/57b5a782f03d34e40f55ae212813d775edbea6ed))
* route compose services through Coolify network ([d19a96e](https://github.com/jlfernandezfernandez/gym-tracker/commit/d19a96ebdc06b63436ce3d6bd6deae8d34cd241d))
* use RELEASE_PLEASE_TOKEN for PR creation ([#33](https://github.com/jlfernandezfernandez/gym-tracker/issues/33)) ([65b7b89](https://github.com/jlfernandezfernandez/gym-tracker/commit/65b7b8953cd5001d7061d26ea19faa63aef3b452))
* validate set_targets coherence and coerce bodyweight weights ([0c98757](https://github.com/jlfernandezfernandez/gym-tracker/commit/0c987576c1aa4b2084c7c535b86f89479bfb871f))
