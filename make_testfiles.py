# -*- coding: utf-8 -*-
# 生成导入测试文件：txt / docx / pdf
import zipfile, os

base = os.path.dirname(os.path.abspath(__file__))
td = os.path.join(base, 'testdata')
os.makedirs(td, exist_ok=True)

# 1. txt
with open(os.path.join(td, 'test-note.txt'), 'w', encoding='utf-8') as f:
    f.write('TXT 导入测试：JavaScript 事件循环包括宏任务与微任务。')

# 2. docx（最小 OOXML 结构）
ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Word 导入测试：React Hooks 包括 useState、useEffect 等面试高频考点。</w:t></w:r></w:p></w:body></w:document>'
with zipfile.ZipFile(os.path.join(td, 'test-note.docx'), 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', ct)
    z.writestr('_rels/.rels', rels)
    z.writestr('word/document.xml', doc)

# 3. pdf（带正确 xref 的最小单页 PDF）
stream = b"BT /F1 18 Tf 72 720 Td (PDF import test: closure prototype event-loop) Tj ET"
objs = [
    b"<< /Type /Catalog /Pages 2 0 R >>",
    b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
    b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
]
out = bytearray(b"%PDF-1.4\n")
offsets = []
for i, body in enumerate(objs, start=1):
    offsets.append(len(out))
    out += str(i).encode() + b" 0 obj\n" + body + b"\nendobj\n"
xref_pos = len(out)
out += b"xref\n0 " + str(len(objs) + 1).encode() + b"\n"
out += b"0000000000 65535 f \n"
for off in offsets:
    out += ("%010d 00000 n \n" % off).encode()
out += b"trailer\n<< /Size " + str(len(objs) + 1).encode() + b" /Root 1 0 R >>\nstartxref\n" + str(xref_pos).encode() + b"\n%%EOF\n"
with open(os.path.join(td, 'test-note.pdf'), 'wb') as f:
    f.write(bytes(out))

print('generated:', os.listdir(td))
