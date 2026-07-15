# Changelog

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
