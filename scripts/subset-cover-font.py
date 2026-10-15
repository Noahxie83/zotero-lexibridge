"""Build the self-hosted Chinese hero font from an upstream LXGW ZhenKai TTF.

Requires fonttools[woff]. Usage: python scripts/subset-cover-font.py FONT.ttf
"""

from html.parser import HTMLParser
from pathlib import Path
import sys

from fontTools import subset
from fontTools.ttLib import TTFont


class HeroText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.text = []

    def handle_starttag(self, tag, attrs):
        if tag in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}:
            return
        classes = set(dict(attrs).get("class", "").split())
        active = bool(self.stack and self.stack[-1][1]) or bool(classes & {"copy", "hero-copy"})
        self.stack.append((tag, active))

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        if self.stack and self.stack[-1][1]:
            self.text.append(data)


def chinese(character):
    value = ord(character)
    return 0x3000 <= value <= 0x303F or 0x3400 <= value <= 0x9FFF or 0xFF00 <= value <= 0xFFEF


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/subset-cover-font.py FONT.ttf")
    root = Path(__file__).resolve().parent.parent
    parser = HeroText()
    for name in ("examples/cover.html", "examples/template.html"):
        parser.feed((root / name).read_text(encoding="utf-8"))
    characters = set(filter(chinese, "".join(parser.text)))
    font = TTFont(sys.argv[1], recalcTimestamp=False)
    missing = characters - set(map(chr, font.getBestCmap()))
    if missing:
        raise SystemExit("Missing characters: " + "".join(sorted(missing)))
    options = subset.Options()
    options.flavor = "woff2"
    options.recalc_timestamp = False
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text="".join(sorted(characters)))
    subsetter.subset(font)
    font.flavor = "woff2"
    output = root / "docs/assets/fonts/lxgw-zhenkai-cover.woff2"
    output.parent.mkdir(parents=True, exist_ok=True)
    font.save(output)
    print(f"{output.name}: {len(characters)} Chinese characters, {output.stat().st_size} bytes")


if __name__ == "__main__":
    main()
