# Changelog

## [2.5.1](https://github.com/jlfernandezfernandez/gym-tracker/compare/v2.5.0...v2.5.1) (2026-07-22)


### Bug Fixes

* align Mini App information hierarchy ([705b7fa](https://github.com/jlfernandezfernandez/gym-tracker/commit/705b7fa1506b94fe9951f7d6fd8e0f7534c22a75))

## [2.5.0](https://github.com/jlfernandezfernandez/gym-tracker/compare/v2.4.1...v2.5.0) (2026-07-22)


### Features

* redesign exercise workout workspace ([a381b81](https://github.com/jlfernandezfernandez/gym-tracker/commit/a381b81ad55c507a54ba34a70dc8c1c8375f8a14))

## [2.4.1](https://github.com/jlfernandezfernandez/gym-tracker/compare/v2.4.0...v2.4.1) (2026-07-22)


### Bug Fixes

* import set target formatter in exercise detail ([492b9f2](https://github.com/jlfernandezfernandez/gym-tracker/commit/492b9f22f2384c4963251c0485a411a0a641c62b))

## [2.4.0](https://github.com/jlfernandezfernandez/gym-tracker/compare/v2.3.0...v2.4.0) (2026-07-22)


### Features

* show planned sets with weights on Exercise detail screen ([6c5c6b4](https://github.com/jlfernandezfernandez/gym-tracker/commit/6c5c6b4fc035ed33a2d63f6ab8e9382282883594))


### Bug Fixes

* align NextExercisePicker list padding with title and footer ([b99a18d](https://github.com/jlfernandezfernandez/gym-tracker/commit/b99a18d668f80b7f10048dd56dd5d86298006be7))
* close exercise picker before navigation ([ec80d9c](https://github.com/jlfernandezfernandez/gym-tracker/commit/ec80d9cf0fc1508888b3551c308ce4c0493b2723))
* keep per-set planning in exercise detail only ([2696400](https://github.com/jlfernandezfernandez/gym-tracker/commit/2696400bf420d9c49b78508f1b0b12ac26130aa2))
* prefer only in-progress exercise on Home ([ab3df9a](https://github.com/jlfernandezfernandez/gym-tracker/commit/ab3df9a68abc2f9957c2c951022d96b9aaff8e7d))
* redesign next exercise picker layout ([05f47e3](https://github.com/jlfernandezfernandez/gym-tracker/commit/05f47e30251fb474c1314b050a66798ea704699d))
* show every proposed set on exercise detail ([ab8f412](https://github.com/jlfernandezfernandez/gym-tracker/commit/ab8f412d11c053c2ecdd08b74292bd7cc634a9cc))
* show next pending exercise on Home, close picker dialog on selection ([18e190e](https://github.com/jlfernandezfernandez/gym-tracker/commit/18e190ef00e1f3c11a4600c4b38780c98acbda9c))

## [2.3.0](https://github.com/jlfernandezfernandez/gym-tracker/compare/v2.2.1...v2.3.0) (2026-07-18)


### Features

* **demo:** add public read-only product tour ([#65](https://github.com/jlfernandezfernandez/gym-tracker/issues/65)) ([82aeba5](https://github.com/jlfernandezfernandez/gym-tracker/commit/82aeba5f087b7dcf580d4c75bdcb002d2a29f199))


### Bug Fixes

* **demo:** support browsers without structuredClone ([#67](https://github.com/jlfernandezfernandez/gym-tracker/issues/67)) ([ad05dcd](https://github.com/jlfernandezfernandez/gym-tracker/commit/ad05dcd1fd0d8bf3fc0a2d4e37d510f0a4c66d6d))

## [2.2.1](https://github.com/jlfernandezfernandez/gym-tracker/compare/v2.2.0...v2.2.1) (2026-07-17)


### Bug Fixes

* **miniapp:** hide set deletion in completed sessions ([#63](https://github.com/jlfernandezfernandez/gym-tracker/issues/63)) ([5630687](https://github.com/jlfernandezfernandez/gym-tracker/commit/56306877366c53f05c34f9fb073b99859aa1e12c))

## [2.2.0](https://github.com/jlfernandezfernandez/gym-tracker/compare/v2.1.1...v2.2.0) (2026-07-17)


### Features

* **miniapp:** simplify exercise actions ([#61](https://github.com/jlfernandezfernandez/gym-tracker/issues/61)) ([2a1ee61](https://github.com/jlfernandezfernandez/gym-tracker/commit/2a1ee61c446ebf628c665ca57f529c7de6da716f))

## [2.1.1](https://github.com/jlfernandezfernandez/gym-tracker/compare/v2.1.0...v2.1.1) (2026-07-17)


### Bug Fixes

* **api:** make weight column nullable before writing NULLs ([9f16e35](https://github.com/jlfernandezfernandez/gym-tracker/commit/9f16e359d3566dab337f0201107a6bc41555e6f7))
* **api:** weight migration crashed on scalar-null set_targets ([e93af69](https://github.com/jlfernandezfernandez/gym-tracker/commit/e93af69b37300b7314fb57e4e772a7452c6890d7))

## [2.1.0](https://github.com/jlfernandezfernandez/gym-tracker/compare/v2.0.0...v2.1.0) (2026-07-17)


### Features

* **miniapp:** show app version in profile, linked to releases ([e6174ad](https://github.com/jlfernandezfernandez/gym-tracker/commit/e6174aded69b5e1b31e69c7dbb15ca1695764be0))

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
