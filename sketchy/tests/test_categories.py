from sketchy.categories import CATEGORIES


def test_categories_are_unique():
    assert len(CATEGORIES) == len(set(CATEGORIES))


def test_categories_count_in_range():
    # ~120 target; allow a little slack for build-time pruning.
    assert 110 <= len(CATEGORIES) <= 130


def test_categories_lowercase_nonblank():
    for c in CATEGORIES:
        assert c == c.lower()
        assert c.strip() == c and c != ""
