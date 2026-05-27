# Backward-compat shim — logic moved to engines/
from .engines.base import EngineNotReady
from .engines.seed_vc import SeedVCEngine as VCEngine
from .engines.manager import manager

engine = manager  # legacy alias
