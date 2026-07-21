from pathlib import Path


def test_pipeline_directories_are_reserved_for_independent_workflows() -> None:
    pipelines_root = Path(__file__).parents[2]

    assert (pipelines_root / "historical-data").is_dir()
    assert (pipelines_root / "expert-imports").is_dir()
    assert (pipelines_root / "projections").is_dir()
    assert (pipelines_root / "news").is_dir()
