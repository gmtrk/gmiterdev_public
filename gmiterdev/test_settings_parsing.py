"""Unit tests for the env-parsing helper in gmiterdev.settings."""
from gmiterdev.settings import _split_csv


def test_split_csv_parses_comma_separated_values():
    assert _split_csv("gmiter.fly.dev,localhost") == ["gmiter.fly.dev", "localhost"]


def test_split_csv_strips_whitespace_and_drops_blanks():
    assert _split_csv("  a , , b ,") == ["a", "b"]


def test_split_csv_handles_none_and_empty():
    assert _split_csv(None) == []
    assert _split_csv("") == []
