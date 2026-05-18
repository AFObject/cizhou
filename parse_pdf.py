# parse_pdf.py
# 用法：python parse_pdf.py pdf.pdf output.json
# 依赖：pip install pdfplumber

import pdfplumber
import re
import json
import sys
from pathlib import Path

# ============== 正则定义 ==============

# 词条开头：如 "1.阿：" "28.辩/辨" "158．拱" （支持全/半角点）
RE_ENTRY = re.compile(r'^\s*(\d{1,3})\s*[\.．。]\s*([^\s：:①-⑳]+?)\s*[：:]?\s*$')

# 子词条：如 "（1）辩" "(1)辨"
RE_SUBENTRY = re.compile(r'^\s*[（(]\s*(\d+)\s*[)）]\s*([^\s：:]+)\s*[：:]?\s*$')

# 义项标号 ①②...⑳
CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'
RE_SENSE_START = re.compile(rf'^\s*([{CIRCLED}])\s*(.*)$')

# 页码行 "11 / 69"
RE_PAGENO = re.compile(r'^\s*\d+\s*/\s*\d+\s*$')

# 来源：（《xxx》）  允许尾部无右括号、括号全/半角
RE_SOURCE = re.compile(r'[（(]\s*《([^》]+)》\s*[)）]?\s*$')

# 方括号词组 【xxx】
RE_PHRASES = re.compile(r'【([^】]+)】')

# 整行就是"碎碎念"（无义项编号，但又不是例句续行的判别交给上下文）
# 这里只列一些明显的导语关键字
NOISE_HINTS = ['搭配解释', '说明', '注：', '注:']


def clean_line(s: str) -> str:
    """清洗单行：去除常见尾部噪声"""
    s = s.replace('\u3000', ' ').strip()
    # 去除尾部 //  \\
    s = re.sub(r'[\\/]+\s*$', '', s).strip()
    return s


def parse_sense_body(body: str):
    """
    解析一个义项的正文，返回 dict:
      meaning, example, source, phraseKeys, isNote
    body 形如：
      "辩论，申辩：予岂好辩哉？ （《滕文公下》）"
      "【垂拱】【拱手】：垂衣拱手，形容毫不费力：文武并用，垂拱而治。 （《谏太宗十思疏》）"
      "其余根据语境解释。"
      "刚正不阿。"
    """
    result = {
        "meaning": "",
        "example": "",
        "source": "",
        "phraseKeys": [],
        "isNote": False,
    }

    # 1. 提取方括号词组
    phrases = RE_PHRASES.findall(body)
    if phrases:
        result["phraseKeys"] = phrases
        # 去掉所有【...】，剩余部分继续处理
        body = RE_PHRASES.sub('', body).strip()
        # 可能开头还残留 "："
        body = re.sub(r'^\s*[：:]\s*', '', body)

    # 2. 提取尾部来源
    m = RE_SOURCE.search(body)
    if m:
        result["source"] = m.group(1).strip()
        body = body[:m.start()].rstrip(' 　()（）')

    # 3. 用"第一个冒号"切分 meaning / example
    #    但要注意：有的解释里也可能有冒号，所以只切第一个
    m = re.search(r'[：:]', body)
    if m:
        meaning = body[:m.start()].strip()
        example = body[m.end():].strip()
        # example 末尾可能有 "。"或空白
        example = example.strip(' 　')
        result["meaning"] = meaning
        result["example"] = example
    else:
        # 没有冒号：可能是 "刚正不阿。" 这种自带释义短语
        # 也可能是 "其余根据语境解释。" 这种说明
        text = body.strip()
        # 启发式：若不含《》、无引文意味、且像一句话注释 → isNote
        if (not result["phraseKeys"]
            and not result["source"]
            and ('解释' in text or '语境' in text or '其余' in text or '说明' in text)):
            result["isNote"] = True
            result["meaning"] = text
        else:
            # 当作只有 meaning（如 "刚正不阿。"），无例句
            result["meaning"] = text

    # 收尾清洗
    result["meaning"] = result["meaning"].strip(' ，。、:：')
    result["example"] = result["example"].strip()

    return result


def extract_text(pdf_path: str) -> str:
    """从 PDF 提取全文，按行返回（保留顺序）"""
    lines = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            txt = page.extract_text() or ""
            for ln in txt.split('\n'):
                lines.append(ln)
    return lines


def parse(pdf_path: str):
    raw_lines = extract_text(pdf_path)

    entries = []           # 最终结果
    current_entry = None   # 当前主词条 {id, char, subEntries: [...], senses: [...]}
    current_sub = None     # 当前子词条（如 28 下的 "辩"/"辨"），可能为 None
    current_sense = None   # 当前正在拼接的义项 raw body
    current_sense_label = None  # ① 等

    debug_log = []         # 记录被丢弃/可疑的行，便于核对

    def flush_sense():
        """把 current_sense 落盘到当前 entry/sub_entry"""
        nonlocal current_sense, current_sense_label
        if current_sense is None or current_entry is None:
            current_sense = None
            current_sense_label = None
            return
        parsed = parse_sense_body(current_sense.strip())
        parsed["label"] = current_sense_label
        target = current_sub if current_sub is not None else current_entry
        target["senses"].append(parsed)
        current_sense = None
        current_sense_label = None

    for raw in raw_lines:
        line = clean_line(raw)
        if not line:
            continue

        # ---- 页码行：丢弃
        if RE_PAGENO.match(line):
            debug_log.append(("PAGENO", line))
            continue

        # ---- 主词条
        m = RE_ENTRY.match(line)
        # 注意：要避免把 "①xxx" 之类误匹配。RE_ENTRY 已要求开头是数字+点。
        if m and not any(c in line[:6] for c in CIRCLED):
            # 先结算上一义项
            flush_sense()
            # 收尾上一个主词条
            if current_entry is not None:
                entries.append(current_entry)
            wid = int(m.group(1))
            char = m.group(2).strip()
            current_entry = {
                "id": wid,
                "char": char,           # 可能含"/"，如 "辩/辨"
                "hasSub": '/' in char,
                "senses": [],
                "subEntries": [],
            }
            current_sub = None
            continue

        # ---- 子词条 （1）辩
        m = RE_SUBENTRY.match(line)
        if m and current_entry is not None:
            flush_sense()
            sub = {
                "subId": int(m.group(1)),
                "char": m.group(2).strip(),
                "senses": [],
            }
            current_entry["subEntries"].append(sub)
            current_sub = sub
            continue

        # ---- 新义项开头 ①②...
        m = RE_SENSE_START.match(line)
        if m and current_entry is not None:
            flush_sense()
            current_sense_label = m.group(1)
            current_sense = m.group(2).strip()
            continue

        # ---- 续行：若当前正在累积一个义项，则拼接到例句尾
        if current_sense is not None:
            # 但要先排除一些明显的"噪声导语行"
            if any(h in line for h in NOISE_HINTS):
                debug_log.append(("NOISE", line))
                continue
            current_sense += ' ' + line
            continue

        # ---- 其他：可能是词条之间的导语/标题等
        debug_log.append(("ORPHAN", line))

    # 收尾
    flush_sense()
    if current_entry is not None:
        entries.append(current_entry)

    # 生成稳定的 sense id (sid)
    for ent in entries:
        # 顶层 senses
        for idx, s in enumerate(ent["senses"], 1):
            s["sid"] = f"{ent['id']}-{idx}"
        # 子词条 senses
        for sub in ent["subEntries"]:
            for idx, s in enumerate(sub["senses"], 1):
                s["sid"] = f"{ent['id']}({sub['subId']})-{idx}"

    return entries, debug_log


def main():
    if len(sys.argv) < 3:
        print("用法: python parse_pdf.py input.pdf output.json")
        sys.exit(1)
    pdf_path = sys.argv[1]
    out_path = sys.argv[2]

    entries, debug_log = parse(pdf_path)

    data = {
        "version": 1,
        "totalEntries": len(entries),
        "words": entries,
    }
    Path(out_path).write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding='utf-8',
    )
    # 同时输出 debug 日志
    log_path = Path(out_path).with_suffix('.debug.txt')
    with open(log_path, 'w', encoding='utf-8') as f:
        for tag, line in debug_log:
            f.write(f"[{tag}] {line}\n")

    # 简单统计
    total_senses = 0
    note_count = 0
    no_example = 0
    no_source = 0
    for ent in entries:
        all_senses = list(ent["senses"])
        for sub in ent["subEntries"]:
            all_senses.extend(sub["senses"])
        total_senses += len(all_senses)
        for s in all_senses:
            if s.get("isNote"):
                note_count += 1
            if not s.get("example"):
                no_example += 1
            if not s.get("source"):
                no_source += 1

    print(f"✅ 解析完成")
    print(f"   词条数: {len(entries)} (期望 616)")
    print(f"   义项总数: {total_senses}")
    print(f"   说明性条目(isNote): {note_count}")
    print(f"   无例句: {no_example}")
    print(f"   无来源: {no_source}")
    print(f"   输出: {out_path}")
    print(f"   调试日志: {log_path}")


if __name__ == '__main__':
    main()