#!/usr/bin/env python3
"""
generate_muscle_glb.py
======================
Downloads real anatomical muscle meshes from BodyParts3D (RIKEN / Anatomography)
and converts them into a single named GLB ready for the muscle-atlas app.

License of source data: CC BY SA 2.1 JP
  https://creativecommons.org/licenses/by-sa/2.1/jp/
  Original: http://lifesciencedb.jp/bp3d/

USAGE
-----
1. Install dependencies (once):
      pip install trimesh numpy

2. Run from your project root:
      python generate_muscle_glb.py

   The script will:
     a) Download individual STL files from GitHub (~140 files, ~40 MB total)
     b) Merge multi-head muscles into whole muscles
     c) Decimate to ~5 000 triangles per muscle (web-optimised)
     d) Export  public/models/human-muscular-system.glb  (~8 MB)

3. Start your dev server:
      npm run dev

SWAPPING IN COMMERCIAL ASSETS
------------------------------
To replace BodyParts3D meshes with higher-quality commercial meshes (Zygote,
TurboSquid, BioDigital, etc.):

  1. Convert each asset to STL in the same coordinate space
     (Z-up, millimetres, right-hand — same as BodyParts3D).
  2. Place the STLs in .stl_cache/ named exactly as the keys in MUSCLE_MAP,
     e.g.  .stl_cache/Biceps_Brachii_R.stl
  3. Change download_stl() to look for a local file first (already done —
     any file in .stl_cache/ is used as-is without downloading).
  4. Re-run this script.
  5. The mesh name inside the GLB will still match structures.json, so the
     entire selection / details / hide pipeline continues working unchanged.
"""

import os
import sys
import subprocess
import urllib.request
import urllib.error

# ── dependency check / auto-install ──────────────────────────────────────────

def ensure(pkg, import_name=None):
    import_name = import_name or pkg
    try:
        __import__(import_name)
    except ImportError:
        print(f"Installing {pkg}…")
        subprocess.check_call([sys.executable, "-m", "pip", "install", pkg])

ensure("trimesh")
ensure("numpy")
ensure("fast-simplification", "fast_simplification")

import numpy as np
import trimesh

# ── paths ─────────────────────────────────────────────────────────────────────

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR  = os.path.join(SCRIPT_DIR, ".stl_cache")
OUT_DIR    = os.path.join(SCRIPT_DIR, "public", "models")
OUT_GLB    = os.path.join(OUT_DIR, "human-muscular-system.glb")

RAW_BASE = (
    "https://raw.githubusercontent.com/"
    "Kevin-Mattheus-Moerman/BodyParts3D/main/"
    "assets/BodyParts3D_data/stl/"
)

os.makedirs(CACHE_DIR, exist_ok=True)
os.makedirs(OUT_DIR,   exist_ok=True)

# ── FMA ID → muscle mapping ───────────────────────────────────────────────────
#
# Format:  "MeshName": ["FMAid1", "FMAid2", …]
# Multiple IDs are merged (heads / portions) into one named mesh.
# Mesh names MUST match meshNames[] in src/data/structures.json.
# Any FMA id that returns HTTP 404 is silently skipped.

MUSCLE_MAP = {

    # ══════════════════════════════════════════════════════════════════════════
    #  HEAD & FACE  (fills the blank head region)
    # ══════════════════════════════════════════════════════════════════════════

    # Jaw / mastication
    "Masseter_R":              ["FMA49001"],
    "Masseter_L":              ["FMA49002"],
    "Temporalis_R":            ["FMA49007"],
    "Temporalis_L":            ["FMA49008"],
    "Medial_Pterygoid_R":      ["FMA49004"],
    "Medial_Pterygoid_L":      ["FMA49005"],

    # Neck
    "Sternocleidomastoid_R":   ["FMA13408"],
    "Sternocleidomastoid_L":   ["FMA13409"],
    "Platysma_R":              ["FMA13388"],
    "Platysma_L":              ["FMA13389"],

    # Facial expression
    "Frontalis_R":             ["FMA46959"],
    "Frontalis_L":             ["FMA46960"],
    "Orbicularis_Oculi_R":     ["FMA46760"],
    "Orbicularis_Oculi_L":     ["FMA46761"],
    "Zygomaticus_Major_R":     ["FMA46815"],
    "Zygomaticus_Major_L":     ["FMA46816"],
    "Zygomaticus_Minor_R":     ["FMA46817"],
    "Zygomaticus_Minor_L":     ["FMA46818"],
    "Orbicularis_Oris":        ["FMA46790"],
    "Buccinator_R":            ["FMA46810"],
    "Buccinator_L":            ["FMA46811"],
    "Mentalis":                ["FMA46828"],
    "Corrugator_Supercilii_R": ["FMA46956"],
    "Corrugator_Supercilii_L": ["FMA46957"],
    "Levator_Labii_Superioris_R": ["FMA46803"],
    "Levator_Labii_Superioris_L": ["FMA46804"],
    "Depressor_Anguli_Oris_R": ["FMA46820"],
    "Depressor_Anguli_Oris_L": ["FMA46821"],
    "Procerus":                ["FMA46948"],
    "Nasalis_R":               ["FMA46742"],
    "Nasalis_L":               ["FMA46743"],

    # ══════════════════════════════════════════════════════════════════════════
    #  UPPER LIMB RIGHT
    # ══════════════════════════════════════════════════════════════════════════

    # Shoulder
    "Deltoid_R":               ["FMA34682", "FMA34680", "FMA34684"],
    "Infraspinatus_R":         ["FMA32547"],
    "Supraspinatus_R":         ["FMA32546"],
    "Subscapularis_R":         ["FMA13366"],
    "Teres_Minor_R":           ["FMA32549"],
    "Teres_Major_R":           ["FMA13364"],

    # Upper arm
    "Biceps_Brachii_R":        ["FMA37686", "FMA37684"],
    "Triceps_Brachii_R":       ["FMA37699", "FMA37697", "FMA37695"],
    "Brachialis_R":            ["FMA37668"],
    "Coracobrachialis_R":      ["FMA37665"],

    # Forearm anterior (fills wrist/forearm gap)
    "Brachioradialis_R":       ["FMA38486"],
    "Pronator_Teres_R":        ["FMA38464"],
    "Flexor_Carpi_Radialis_R": ["FMA38489"],
    "Palmaris_Longus_R":       ["FMA38494"],
    "Flexor_Carpi_Ulnaris_R":  ["FMA38499"],
    "Flexor_Digitorum_Superficialis_R": ["FMA38503"],
    "Flexor_Digitorum_Profundus_R":     ["FMA38510"],
    "Pronator_Quadratus_R":    ["FMA38473"],

    # Forearm posterior (fills dorsal forearm gap)
    "Extensor_Carpi_Radialis_Longus_R":  ["FMA38518"],
    "Extensor_Carpi_Radialis_Brevis_R":  ["FMA38521"],
    "Extensor_Digitorum_R":              ["FMA38526"],
    "Extensor_Carpi_Ulnaris_R":          ["FMA38535"],
    "Extensor_Digiti_Minimi_R":          ["FMA38531"],
    "Supinator_R":                       ["FMA38483"],
    "Abductor_Pollicis_Longus_R":        ["FMA38540"],
    "Extensor_Pollicis_Brevis_R":        ["FMA38543"],
    "Extensor_Pollicis_Longus_R":        ["FMA38546"],

    # ══════════════════════════════════════════════════════════════════════════
    #  UPPER LIMB LEFT
    # ══════════════════════════════════════════════════════════════════════════

    "Deltoid_L":               ["FMA34683", "FMA34681", "FMA34685"],
    "Infraspinatus_L":         ["FMA32548"],
    "Supraspinatus_L":         ["FMA32547"],   # fallback same if no separate L
    "Subscapularis_L":         ["FMA13367"],
    "Teres_Minor_L":           ["FMA32550"],
    "Teres_Major_L":           ["FMA13365"],

    "Biceps_Brachii_L":        ["FMA37687", "FMA37685"],
    "Triceps_Brachii_L":       ["FMA37700", "FMA37698", "FMA37696"],
    "Brachialis_L":            ["FMA37669"],
    "Coracobrachialis_L":      ["FMA37666"],

    "Brachioradialis_L":       ["FMA38487"],
    "Pronator_Teres_L":        ["FMA38465"],
    "Flexor_Carpi_Radialis_L": ["FMA38490"],
    "Palmaris_Longus_L":       ["FMA38495"],
    "Flexor_Carpi_Ulnaris_L":  ["FMA38500"],
    "Flexor_Digitorum_Superficialis_L": ["FMA38504"],
    "Flexor_Digitorum_Profundus_L":     ["FMA38511"],
    "Pronator_Quadratus_L":    ["FMA38474"],

    "Extensor_Carpi_Radialis_Longus_L":  ["FMA38519"],
    "Extensor_Carpi_Radialis_Brevis_L":  ["FMA38522"],
    "Extensor_Digitorum_L":              ["FMA38527"],
    "Extensor_Carpi_Ulnaris_L":          ["FMA38536"],
    "Extensor_Digiti_Minimi_L":          ["FMA38532"],
    "Supinator_L":                       ["FMA38484"],
    "Abductor_Pollicis_Longus_L":        ["FMA38541"],
    "Extensor_Pollicis_Brevis_L":        ["FMA38544"],
    "Extensor_Pollicis_Longus_L":        ["FMA38547"],

    # ══════════════════════════════════════════════════════════════════════════
    #  TRUNK — ANTERIOR
    # ══════════════════════════════════════════════════════════════════════════

    "Pectoralis_Major_R":      ["FMA34690", "FMA79979", "FMA45874"],
    "Pectoralis_Major_L":      ["FMA34691", "FMA79980", "FMA45875"],
    "Pectoralis_Minor_R":      ["FMA13105"],
    "Pectoralis_Minor_L":      ["FMA13106"],
    "Rectus_Abdominis":        ["FMA13377", "FMA13378"],
    "External_Oblique_R":      ["FMA13336"],
    "External_Oblique_L":      ["FMA13337"],
    "Internal_Oblique_R":      ["FMA13338"],
    "Internal_Oblique_L":      ["FMA13339"],
    "Serratus_Anterior_R":     ["FMA13398"],
    "Serratus_Anterior_L":     ["FMA13399"],

    # ══════════════════════════════════════════════════════════════════════════
    #  TRUNK — POSTERIOR
    # ══════════════════════════════════════════════════════════════════════════

    "Trapezius": [
        "FMA33586", "FMA33584", "FMA33581",
        "FMA33587", "FMA33585", "FMA33583",
    ],
    "Latissimus_Dorsi_R":      ["FMA13358"],
    "Latissimus_Dorsi_L":      ["FMA13359"],
    "Rhomboid_Major_R":        ["FMA13379"],
    "Rhomboid_Major_L":        ["FMA13380"],
    "Rhomboid_Minor_R":        ["FMA13381"],
    "Rhomboid_Minor_L":        ["FMA13382"],
    "Erector_Spinae_R":        ["FMA22740", "FMA22751", "FMA22779"],
    "Erector_Spinae_L":        ["FMA22741", "FMA22753", "FMA22780"],

    # ══════════════════════════════════════════════════════════════════════════
    #  LOWER LIMB RIGHT
    # ══════════════════════════════════════════════════════════════════════════

    # Gluteal
    "Gluteus_Maximus_R":       ["FMA22328"],
    "Gluteus_Medius_R":        ["FMA22330"],
    "Gluteus_Minimus_R":       ["FMA22332"],
    "Tensor_Fasciae_Latae_R":  ["FMA22352"],
    "Piriformis_R":            ["FMA19206"],

    # Thigh anterior
    "Rectus_Femoris_R":        ["FMA38928"],
    "Vastus_Lateralis_R":      ["FMA38930"],
    "Vastus_Medialis_R":       ["FMA38932"],
    "Vastus_Intermedius_R":    ["FMA38934"],
    "Sartorius_R":             ["FMA22354"],

    # Thigh medial
    "Gracilis_R":              ["FMA22360"],
    "Adductor_Magnus_R":       ["FMA22449"],
    "Adductor_Longus_R":       ["FMA22444"],
    "Adductor_Brevis_R":       ["FMA22442"],
    "Pectineus_R":             ["FMA22436"],

    # Thigh posterior (hamstrings)
    "Biceps_Femoris_R":        ["FMA45888", "FMA45891"],
    "Semitendinosus_R":        ["FMA22344"],
    "Semimembranosus_R":       ["FMA22342"],

    # Lower leg anterior
    "Tibialis_Anterior_R":     ["FMA22544"],
    "Extensor_Hallucis_Longus_R": ["FMA22547"],
    "Extensor_Digitorum_Longus_R": ["FMA22550"],

    # Lower leg lateral (fills outer lower-leg gap)
    "Fibularis_Longus_R":      ["FMA22539"],
    "Fibularis_Brevis_R":      ["FMA22541"],

    # Lower leg posterior
    "Gastrocnemius_R":         ["FMA45957", "FMA45960"],
    "Soleus_R":                ["FMA22558"],
    "Tibialis_Posterior_R":    ["FMA22563"],
    "Flexor_Hallucis_Longus_R": ["FMA22569"],
    "Flexor_Digitorum_Longus_R": ["FMA22566"],
    "Popliteus_R":             ["FMA22564"],

    # Foot (fills ankle / toe gap)
    "Flexor_Digitorum_Brevis_R":   ["FMA22535"],
    "Abductor_Hallucis_R":         ["FMA22522"],
    "Abductor_Digiti_Minimi_Foot_R": ["FMA22528"],
    "Extensor_Digitorum_Brevis_R": ["FMA37450"],

    # ══════════════════════════════════════════════════════════════════════════
    #  LOWER LIMB LEFT
    # ══════════════════════════════════════════════════════════════════════════

    "Gluteus_Maximus_L":       ["FMA22329"],
    "Gluteus_Medius_L":        ["FMA22331"],
    "Gluteus_Minimus_L":       ["FMA22333"],
    "Tensor_Fasciae_Latae_L":  ["FMA22353"],
    "Piriformis_L":            ["FMA19207"],

    "Rectus_Femoris_L":        ["FMA38929"],
    "Vastus_Lateralis_L":      ["FMA38931"],
    "Vastus_Medialis_L":       ["FMA38933"],
    "Vastus_Intermedius_L":    ["FMA38935"],
    "Sartorius_L":             ["FMA22355"],

    "Gracilis_L":              ["FMA22361"],
    "Adductor_Magnus_L":       ["FMA22450"],
    "Adductor_Longus_L":       ["FMA22445"],
    "Adductor_Brevis_L":       ["FMA22443"],
    "Pectineus_L":             ["FMA22437"],

    "Biceps_Femoris_L":        ["FMA45889", "FMA45892"],
    "Semitendinosus_L":        ["FMA22345"],
    "Semimembranosus_L":       ["FMA22343"],

    "Tibialis_Anterior_L":     ["FMA22545"],
    "Extensor_Hallucis_Longus_L": ["FMA22548"],
    "Extensor_Digitorum_Longus_L": ["FMA22551"],

    "Fibularis_Longus_L":      ["FMA22540"],
    "Fibularis_Brevis_L":      ["FMA22542"],

    "Gastrocnemius_L":         ["FMA45958", "FMA45961"],
    "Soleus_L":                ["FMA22559"],
    "Tibialis_Posterior_L":    ["FMA22564"],
    "Flexor_Hallucis_Longus_L": ["FMA22570"],
    "Flexor_Digitorum_Longus_L": ["FMA22567"],
    "Popliteus_L":             ["FMA22565"],

    "Flexor_Digitorum_Brevis_L":   ["FMA22536"],
    "Abductor_Hallucis_L":         ["FMA22523"],
    "Abductor_Digiti_Minimi_Foot_L": ["FMA22529"],
    "Extensor_Digitorum_Brevis_L": ["FMA37451"],
}


# ── download helpers ──────────────────────────────────────────────────────────

def download_stl(fma_id: str) -> str | None:
    """
    Download an STL from GitHub and cache locally.
    Returns local path or None on failure (404 etc.).

    NOTE FOR COMMERCIAL ASSET SWAP:
    If you place a file named  {fma_id}.stl  in .stl_cache/ before running,
    it will be used directly without any download.
    """
    local = os.path.join(CACHE_DIR, f"{fma_id}.stl")
    if os.path.exists(local) and os.path.getsize(local) > 0:
        return local

    url = RAW_BASE + f"{fma_id}.stl"
    try:
        print(f"  ↓ {fma_id}.stl", end="", flush=True)
        urllib.request.urlretrieve(url, local)
        size = os.path.getsize(local) // 1024
        print(f" ({size} KB)")
        return local
    except urllib.error.HTTPError as e:
        print(f" [HTTP {e.code} — skipped]")
        if os.path.exists(local):
            os.remove(local)
        return None
    except Exception as e:
        print(f" [ERROR: {e}]")
        return None


def load_stl(fma_id: str) -> trimesh.Trimesh | None:
    path = download_stl(fma_id)
    if not path:
        return None
    try:
        mesh = trimesh.load(path, force="mesh")
        if mesh is None or len(mesh.faces) == 0:
            return None
        return mesh
    except Exception as e:
        print(f"  [load error {fma_id}: {e}]")
        return None


def merge_stls(fma_ids: list) -> trimesh.Trimesh | None:
    parts = [m for fid in fma_ids if (m := load_stl(fid)) is not None]
    if not parts:
        return None
    if len(parts) == 1:
        return parts[0]
    return trimesh.util.concatenate(parts)


# ── coordinate transform ──────────────────────────────────────────────────────
#
# BodyParts3D coordinate system (mm, Z-up):
#   X = left-right  (+X = right)
#   Y = anterior-posterior  (+Y = anterior)
#   Z = superior-inferior  (+Z = superior)
#
# Three.js coordinate system (m, Y-up):
#   X = left-right  (+X = right)
#   Y = superior-inferior  (+Y = superior)
#   Z = anterior-posterior  (+Z = anterior)
#
# Transform: scale 0.001 (mm→m), then (x, y, z) → (x, z, -y)

def transform_to_threejs(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    v = mesh.vertices.copy() * 0.001            # mm → m
    v = np.column_stack([v[:, 0], v[:, 2], -v[:, 1]])  # Z-up → Y-up
    mesh.vertices = v
    mesh.fix_normals()
    return mesh


# ── mesh decimation ───────────────────────────────────────────────────────────

TARGET_FACES = 5_000   # per muscle — good organic shape at WebGL cost

def decimate(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    n = len(mesh.faces)
    if n <= TARGET_FACES:
        return mesh
    ratio = 1.0 - (TARGET_FACES / n)
    ratio = max(0.01, min(0.99, ratio))
    try:
        m = mesh.simplify_quadric_decimation(percent=ratio)
        m.fix_normals()
        return m
    except Exception:
        return mesh   # keep original if decimation fails


# ── scene builder ─────────────────────────────────────────────────────────────

def build_scene() -> trimesh.Scene:
    scene = trimesh.Scene()
    ok    = 0
    skipped = 0

    for name, fma_ids in MUSCLE_MAP.items():
        print(f"\n[{name}]  ({', '.join(fma_ids)})")
        mesh = merge_stls(fma_ids)
        if mesh is None:
            print("  ✗ no geometry — skipped")
            skipped += 1
            continue

        orig = len(mesh.faces)
        mesh = transform_to_threejs(mesh)
        mesh = decimate(mesh)
        scene.add_geometry(mesh, geom_name=name, node_name=name)
        ok += 1
        print(f"  ✓ {orig:,} → {len(mesh.faces):,} faces")

    print(f"\n{'─'*60}")
    print(f"Built {ok}/{len(MUSCLE_MAP)} muscles  ({skipped} skipped — FMA not in dataset)")
    return scene


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("BodyParts3D → human-muscular-system.glb  (v2 — full body)")
    print("=" * 60)
    print(f"Cache dir  : {CACHE_DIR}")
    print(f"Output     : {OUT_GLB}")
    print(f"Muscles    : {len(MUSCLE_MAP)} defined")
    print()

    scene = build_scene()
    if not scene.geometry:
        print("\nERROR: No geometry produced. Check your internet connection.")
        sys.exit(1)

    print(f"\nExporting GLB…  ", end="", flush=True)
    glb_bytes = scene.export(file_type="glb")
    with open(OUT_GLB, "wb") as f:
        f.write(glb_bytes)

    mb = os.path.getsize(OUT_GLB) / 1024 / 1024
    print(f"done  ({mb:.1f} MB)")
    print(f"\n✅  Saved to: {OUT_GLB}")
    print("\nNext step:  npm run dev")


if __name__ == "__main__":
    main()
