#!/usr/bin/env python3
"""Ensure Noto Sans SC fonts exist as TTF for maximum extractor compatibility.

Strategy:
1. Search known dirs for NotoSansSC-{Regular,Bold}.ttf, then .otf.
2. Download OTF from mirrors if neither exists.
3. If only OTF exists, subset it (GB2312 + ASCII + common punctuation)
   and convert CFF outlines to TrueType quadratic outlines via cu2qu,
   producing a .ttf that fpdf2 embeds as CIDFontType2.
"""
import os
import sys
from pathlib import Path

FONT_DIR = Path(os.path.expanduser("~/.cache/resume-skill-fonts"))
SKILL_FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"

FONT_MIRRORS = [
    "https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-{weight}.otf",
    "https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-{weight}.otf",
]

SEARCH_DIRS = [
    os.environ.get("RESUME_FONT_DIR", ""),
    str(FONT_DIR),
    str(SKILL_FONT_DIR),
]


def build_charset():
    chars = set()
    for cp in range(0x20, 0x7F):
        chars.add(chr(cp))
    for cp in range(0xA0, 0x100):
        chars.add(chr(cp))
    for start, end in [
        (0x2000, 0x2028),
        (0x2028, 0x2070),
        (0x2460, 0x2500),
        (0x3000, 0x3040),
        (0xFF00, 0xFFEF),
    ]:
        for cp in range(start, end):
            chars.add(chr(cp))
    for b1 in range(0xA1, 0xF8):
        for b2 in range(0xA1, 0xFF):
            try:
                chars.add(bytes([b1, b2]).decode("gb2312"))
            except Exception:
                pass
    return {c for c in chars if c.isprintable()}


def find_existing(weight):
    for ext in (".ttf", ".otf"):
        for font_dir in SEARCH_DIRS:
            if font_dir:
                candidate = Path(font_dir) / f"NotoSansSC-{weight}{ext}"
                if candidate.is_file() and candidate.stat().st_size > 1_000_000:
                    return candidate
    return None


def download_otf(weight):
    import urllib.request

    FONT_DIR.mkdir(parents=True, exist_ok=True)
    target = FONT_DIR / f"NotoSansSC-{weight}.otf"
    for mirror in FONT_MIRRORS:
        url = mirror.format(weight=weight)
        try:
            print(f"[INFO] 下载字体: {url}", file=sys.stderr)
            urllib.request.urlretrieve(url, target)
            if target.stat().st_size > 1_000_000:
                return target
        except Exception as exc:
            print(f"[WARN] 下载失败: {exc}", file=sys.stderr)
    return None


def otf_to_ttf_subset(src, dst):
    from fontTools import subset
    from fontTools.pens.cu2quPen import Cu2QuPen
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    from fontTools.ttLib import TTFont, newTable

    options = subset.Options()
    options.notdef_outline = True
    options.name_IDs = [1, 2, 3, 4, 6]
    options.recalc_bounds = True
    options.drop_tables += ["GSUB", "GPOS", "GDEF"]
    font = subset.load_font(str(src), options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=[ord(c) for c in build_charset()])
    subsetter.subset(font)

    glyph_order = font.getGlyphOrder()
    font["loca"] = newTable("loca")
    font["glyf"] = glyf = newTable("glyf")
    glyf.glyphOrder = glyph_order

    glyph_set = font.getGlyphSet()
    quad_glyphs = {}
    for i, name in enumerate(glyph_order):
        tt_pen = TTGlyphPen(glyph_set)
        cu2qu_pen = Cu2QuPen(tt_pen, 1.0, reverse_direction=True)
        glyph_set[name].draw(cu2qu_pen)
        quad_glyphs[name] = tt_pen.glyph()
        if i % 2000 == 0:
            print(f"[INFO] cu2qu 进度 {i}/{len(glyph_order)}", file=sys.stderr)
    glyf.glyphs = quad_glyphs

    del font["CFF "]
    if "VORG" in font:
        del font["VORG"]
    glyf.compile(font)

    hmtx = font["hmtx"]
    for name, glyph in glyf.glyphs.items():
        if hasattr(glyph, "xMin"):
            hmtx[name] = (hmtx[name][0], glyph.xMin)

    maxp = newTable("maxp")
    maxp.tableVersion = 0x00010000
    maxp.maxZones = 1
    maxp.maxTwilightPoints = 0
    maxp.maxStorage = 0
    maxp.maxFunctionDefs = 0
    maxp.maxInstructionDefs = 0
    maxp.maxStackElements = 0
    maxp.maxSizeOfInstructions = 0
    maxp.maxComponentElements = max(
        (len(g.components) if hasattr(g, "components") else 0)
        for g in glyf.glyphs.values()
    )
    maxp.numGlyphs = len(glyph_order)
    font["maxp"] = maxp

    post = font["post"]
    post.formatType = 2.0
    post.extraNames = []
    post.mapping = {}
    post.glyphOrder = glyph_order

    font.sfntVersion = "\000\001\000\000"
    font.save(str(dst))
    print(f"[OK] 已转换 TTF: {dst}", file=sys.stderr)


def ensure_font(weight):
    """Return a .ttf path if possible, else the best available font path."""
    existing = find_existing(weight)
    if existing and existing.suffix == ".ttf":
        return existing
    if not existing:
        existing = download_otf(weight)
    if not existing:
        raise FileNotFoundError(
            "未找到 Noto Sans SC 字体且下载失败；"
            f"请手动放置 NotoSansSC-{weight}.otf/.ttf 到 {FONT_DIR} 或设置 RESUME_FONT_DIR"
        )
    if existing.suffix == ".ttf":
        return existing
    dst = existing.with_suffix(".ttf")
    if dst.is_file() and dst.stat().st_size > 100_000:
        return dst
    try:
        otf_to_ttf_subset(existing, dst)
        return dst
    except Exception as exc:
        print(f"[WARN] OTF→TTF 转换失败（将退回 OTF 嵌入）: {exc}", file=sys.stderr)
        return existing


if __name__ == "__main__":
    for weight in ("Regular", "Bold"):
        path = ensure_font(weight)
        print(f"[DONE] {weight}: {path}")
