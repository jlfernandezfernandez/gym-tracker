from importlib import import_module


def test_app_package_is_importable() -> None:
    assert import_module("app").__name__ == "app"
