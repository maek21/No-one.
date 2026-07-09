"""Metadata Pipeline — progressive metadata enrichment for tracks and albums"""

from .pipeline import MetadataPipeline, PipelineStep, TrackContext, AlbumContext
from .steps import FolderInferenceStep, FilenameParseStep, LocalArtworkStep
from .steps_musicbrainz import MusicBrainzLookupStep, CoverArtArchiveStep
from .steps_enrich import DiscogsLookupStep, LastfmEnrichStep, ArtworkUpscaleStep
from .steps_writeback import TagWritebackStep

pipeline = MetadataPipeline()
pipeline.register(FolderInferenceStep())
pipeline.register(FilenameParseStep())
pipeline.register(LocalArtworkStep())
pipeline.register(MusicBrainzLookupStep())
pipeline.register(CoverArtArchiveStep())
pipeline.register(DiscogsLookupStep())
pipeline.register(LastfmEnrichStep())
pipeline.register(ArtworkUpscaleStep())
pipeline.register(TagWritebackStep())

__all__ = ["MetadataPipeline", "PipelineStep", "pipeline"]
