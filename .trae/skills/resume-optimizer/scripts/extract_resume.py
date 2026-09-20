#!/usr/bin/env python3
import argparse
import sys

LOW_TEXT_THRESHOLD = 200


def extract_with_pdfplumber(path):
    import pdfplumber
    pages = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            pages.append(page.extract_text() or "")
    return "\n\n".join(pages), "pdfplumber"


def extract_with_pypdf(path):
    from pypdf import PdfReader
    reader = PdfReader(path)
    if reader.is_encrypted:
        try:
            reader.decrypt("")
        except Exception:
            raise PermissionError("PDF is encrypted and cannot be opened with an empty password")
    pages = [(page.extract_text() or "") for page in reader.pages]
    return "\n\n".join(pages), "pypdf"


def main():
    parser = argparse.ArgumentParser(description="Extract text from a PDF resume for optimization")
    parser.add_argument("pdf", help="Path to the PDF file")
    parser.add_argument("-o", "--output", help="Write extracted text to this file instead of stdout")
    args = parser.parse_args()

    text, backend = "", None
    errors = []
    for extractor in (extract_with_pdfplumber, extract_with_pypdf):
        try:
            text, backend = extractor(args.pdf)
            break
        except PermissionError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            sys.exit(2)
        except Exception as exc:
            errors.append(f"{extractor.__name__}: {exc}")

    if backend is None:
        print("ERROR: 提取失败，所有后端均不可用：", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        print("提示：可尝试 pip install pypdf 后重试", file=sys.stderr)
        sys.exit(1)

    text = text.strip()
    if args.output:
        with open(args.output, "w", encoding="utf-8") as fh:
            fh.write(text)
        print(f"[OK] backend={backend} chars={len(text)} -> {args.output}", file=sys.stderr)
    else:
        print(text)

    if len(text) < LOW_TEXT_THRESHOLD:
        print(
            f"[WARN] 提取文本仅 {len(text)} 字符（<{LOW_TEXT_THRESHOLD}），"
            "该 PDF 可能是扫描件/图片型，无法用文本提取；请让用户直接粘贴简历文本",
            file=sys.stderr,
        )
        sys.exit(3)


if __name__ == "__main__":
    main()
