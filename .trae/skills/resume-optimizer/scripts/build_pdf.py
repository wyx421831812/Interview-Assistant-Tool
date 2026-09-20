#!/usr/bin/env python3
import argparse
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prepare_fonts import ensure_font

COLOR_TEXT = (40, 40, 45)
COLOR_HEAD = (23, 42, 88)
COLOR_SUBHEAD = (33, 33, 38)
COLOR_MUTED = (115, 120, 130)
COLOR_ACCENT = (31, 78, 180)

EMOJI_PATTERN = re.compile("[\U0001F000-\U0001FAFF\u2600-\u27BF\uFE0F\u2B00-\u2BFF]")

PLACEHOLDER_PATTERN = re.compile(r"(【补充：[^】]*】)")


def inline(text):
    text = EMOJI_PATTERN.sub("", text)
    text = PLACEHOLDER_PATTERN.sub(r"**\1**", text)
    return text.strip()


def strip_inline(text):
    return inline(text).replace("**", "")


class ResumePDF:
    def __init__(self):
        from fpdf import FPDF

        class _PDF(FPDF):
            def footer(self):
                self.set_y(-12)
                self.set_font("noto", "", 8)
                self.set_text_color(*COLOR_MUTED)
                self.cell(0, 8, str(self.page_no()), align="C")

        regular = ensure_font("Regular")
        bold = ensure_font("Bold")

        self.pdf = _PDF(format="A4")
        self.pdf.add_font("noto", "", str(regular))
        self.pdf.add_font("noto", "B", str(bold))
        self.pdf.set_margins(16, 14, 16)
        self.pdf.set_auto_page_break(True, margin=16)
        self.first_block_done = False

    def build(self, markdown_path, output_path, meta_title):
        pdf = self.pdf
        pdf.set_title(meta_title)
        pdf.add_page()

        for raw in Path(markdown_path).read_text(encoding="utf-8").splitlines():
            line = raw.rstrip()
            stripped = line.strip()
            if not stripped:
                self._gap(1.2)
                continue
            if line.startswith("### "):
                self._subsection(line[4:])
            elif line.startswith("## "):
                self._section(line[3:])
            elif line.startswith("# "):
                self._title(line[2:])
            elif line.startswith("> "):
                self._tagline(line[2:])
            elif re.match(r"^[-*]\s+", stripped):
                self._bullet(re.sub(r"^[-*]\s+", "", stripped))
            elif re.match(r"^\d+\.\s+", stripped):
                self._numbered(stripped)
            else:
                self._body(stripped)
        pdf.output(str(output_path))

    def _gap(self, height):
        self.pdf.ln(height)

    def _title(self, text):
        pdf = self.pdf
        pdf.set_font("noto", "B", 21)
        pdf.set_text_color(*COLOR_HEAD)
        pdf.multi_cell(0, 10, strip_inline(text), align="L", new_x="LMARGIN", new_y="NEXT")
        pdf.set_draw_color(*COLOR_ACCENT)
        pdf.set_line_width(0.6)
        pdf.line(pdf.l_margin, pdf.get_y() + 1, pdf.w - pdf.r_margin, pdf.get_y() + 1)
        self._gap(4)

    def _tagline(self, text):
        pdf = self.pdf
        pdf.set_font("noto", "", 9.5)
        pdf.set_text_color(*COLOR_MUTED)
        pdf.multi_cell(0, 5.4, inline(text), markdown=True, align="L", new_x="LMARGIN", new_y="NEXT")
        self._gap(1.5)

    def _section(self, text):
        pdf = self.pdf
        if self.first_block_done:
            self._gap(4)
        self.first_block_done = True
        pdf.set_font("noto", "B", 12.5)
        pdf.set_text_color(*COLOR_HEAD)
        pdf.multi_cell(0, 7, strip_inline(text), align="L", new_x="LMARGIN", new_y="NEXT")
        pdf.set_draw_color(*COLOR_ACCENT)
        pdf.set_line_width(0.45)
        pdf.line(pdf.l_margin, pdf.get_y() + 0.8, pdf.w - pdf.r_margin, pdf.get_y() + 0.8)
        self._gap(2)

    def _subsection(self, text):
        pdf = self.pdf
        if self.first_block_done:
            self._gap(1.5)
        self.first_block_done = True
        pdf.set_font("noto", "B", 11)
        pdf.set_text_color(*COLOR_SUBHEAD)
        pdf.multi_cell(0, 6.2, inline(text), markdown=True, align="L", new_x="LMARGIN", new_y="NEXT")
        self._gap(0.8)

    def _bullet(self, text):
        pdf = self.pdf
        left = pdf.l_margin
        pdf.set_font("noto", "", 10)
        pdf.set_text_color(*COLOR_TEXT)
        pdf.set_left_margin(left + 4)
        pdf.multi_cell(
            0, 5.4, "• " + inline(text), markdown=True, align="L",
            new_x="LMARGIN", new_y="NEXT",
        )
        pdf.set_left_margin(left)
        self._gap(0.6)

    def _numbered(self, text):
        pdf = self.pdf
        left = pdf.l_margin
        pdf.set_font("noto", "", 10)
        pdf.set_text_color(*COLOR_TEXT)
        pdf.set_left_margin(left + 4)
        pdf.multi_cell(
            0, 5.4, inline(text), markdown=True, align="L",
            new_x="LMARGIN", new_y="NEXT",
        )
        pdf.set_left_margin(left)
        self._gap(0.6)

    def _body(self, text):
        pdf = self.pdf
        pdf.set_font("noto", "", 10)
        pdf.set_text_color(*COLOR_TEXT)
        pdf.multi_cell(0, 5.4, inline(text), markdown=True, align="L", new_x="LMARGIN", new_y="NEXT")
        self._gap(0.6)


def main():
    parser = argparse.ArgumentParser(description="Build a styled PDF resume from a constrained Markdown file")
    parser.add_argument("markdown", help="Path to the resume markdown file (constrained format)")
    parser.add_argument("-o", "--output", help="Output PDF path (default: same name as input with .pdf)")
    parser.add_argument("--title", default="Resume", help="PDF metadata title")
    args = parser.parse_args()

    output = args.output or str(Path(args.markdown).with_suffix(".pdf"))
    builder = ResumePDF()
    builder.build(args.markdown, output, args.title)
    size_kb = Path(output).stat().st_size / 1024
    print(f"[OK] PDF 已生成: {output} ({size_kb:.0f} KB)", file=sys.stderr)


if __name__ == "__main__":
    main()
