#!/usr/bin/env python3
"""Собирает сценарий новеллы из story/*.md в js/story-data.js.

Формат исходников описан в story/00-bible.md («Правила текста»).
Запуск: python3 tools/build_story.py
"""
import glob
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sorted(f for f in glob.glob(os.path.join(ROOT, "story", "0*.md")) if not f.endswith("00-bible.md"))
OUT = os.path.join(ROOT, "js", "story-data.js")

LETTERS = "АБВГ"
AFF_NAMES = {"Юки": "belaya", "Искра": "iskra", "Кайра": "kayra", "Лина": "lina", "Эдрик": "edrik",
             "Марта": "marta", "Котелок": "kotelok", "Тисса": "tissa", "Ноэль": "noel",
             "напарница": "partner"}

# Кто говорит → ключ спрайта
SPEAKERS = [
    ("Святой Эдрик", "edrik"), ("Эдрик", "edrik"), ("Молодой Валериан", "valerian"), ("Валериан", "valerian"),
    ("Ильвенн", "belaya"), ("Юки", "belaya"), ("Искра", "iskra"), ("Лиса", "fox"), ("Марта", "marta"),
    ("Пип", "pip"), ("Кайра", "kayra"), ("Лина", "lina"), ("Котелок", "kotelok"), ("Гоблин-вожак", "kotelok"),
    ("Ганс", "gans"), ("Морвена", "morvena"), ("Считалка", "schitalka"), ("Бумажная девочка", "schitalka"),
    ("Тисса", "tissa"), ("Ноэль", "noel"), ("Торн", "torn"), ("Ясень", "yasen"), ("Мама", "mama"),
    ("Дракон", "dragon"),
]

# [фон: …] → ключ картинки фона (первое совпадение)
BGS = [
    ("чёрный", "black"), ("больничная", "hospital"), ("кухня", "kitchen"), ("размытый, сон", "kitchen"),
    ("белая пустота", "void"), ("над облаками", "sky"), ("горячие источники", "spring"), ("долина", "spring"),
    ("край долины", "spring"), ("колодец", "well"), ("круглый зал", "well"), ("храм в горах", "temple"),
    ("разрушенный храм", "temple"), ("целый, светлый", "temple"), ("горный перевал", "pass"),
    ("бесконечный золотой зал", "throne"), ("золотой зал", "throne"), ("зал тускнеет", "throne"),
    ("ступени собора", "steps"), ("центр зала", "throne"), ("зал, свет", "throne"),
    ("библиотек", "library"), ("внутри Мглы", "village"), ("серый лес", "mist"), ("край Мглы", "mist"),
    ("граница Мглы", "mist"), ("выход из Мглы", "spring"), ("сгоревшая мельница", "burned"),
    ("Площадь Чистоты", "square"), ("Сольгард, вид", "capital"), ("Сольгард, собор", "court"),
    ("улица Сольгарда", "street"), ("Сольгард, улицы", "street"), ("площадь перед собором", "snowcity"),
    ("арена", "arena"), ("пиршественный", "feast"), ("аптекарский", "garden"), ("Соборный сад", "garden"),
    ("лазарет", "garden"), ("коридор дворца", "chamber"), ("задний двор собора", "court"),
    ("зал суда", "court"), ("покои собора", "chamber"), ("внутренние покои", "chamber"),
    ("дорога домой", "pass"), ("маленькая пещера", "spring"), ("дальний источник", "spring"),
    ("крыша аптекарского", "garden"), ("маленькая комната, свеча", "room"), ("аптекарский сад", "garden"),
    ("лесная поляна", "forest"), ("поляна", "forest"), ("задворки", "street"), ("ворота Брода", "gate"),
    ("ворота города", "gate"), ("площадь, таверна", "square"), ("площадь, хаос", "square"),
    ("таверна", "tavern"), ("комната", "room"), ("крыша мельницы", "mill"), ("Старая мельница", "mill"),
    ("заброшенная мельница", "mill"), ("мельниц", "mill"), ("доска объявлений", "guild"), ("фургон", "guild"),
    ("площадь вечером", "festival"), ("площадь, утро, обломки", "square"), ("площадь", "square"),
    ("дуб", "oak"), ("лес, раннее", "oak"), ("лес", "forest"), ("Старый тракт", "fort"), ("двор форта", "fort"),
    ("тракт", "fort"), ("старый каменный мост", "forest"), ("топкий берег", "swamp"), ("болото", "swamp"),
    ("черепаха", "turtle"), ("избушка", "hut"), ("небо", "sky"),
]

PARTNER_RE = re.compile(r"\{Кайра:\s*(.*?)\s*/\s*\**Лина:\**\s*(.*?)\}", re.S)


def bg_key(desc):
    for kw, key in BGS:
        if kw.lower() in desc.lower():
            return key
    return None


def speaker_key(name):
    for kw, key in SPEAKERS:
        if name.startswith(kw):
            return key
    return None


def clean(t):
    t = t.strip()
    return t


def strip_italic(t):
    t = t.strip()
    if t.startswith("*") and t.endswith("*") and not t.startswith("**"):
        t = t[1:-1]
    return t.strip()


def parse_effects(text):
    eff = {}
    for name, key in AFF_NAMES.items():
        for m in re.finditer(re.escape(name) + r"\s*([+−-])\s*(\d)", text):
            n = int(m.group(2)) * (-1 if m.group(1) in "−-" else 1)
            eff[key] = eff.get(key, 0) + n
    return eff


class Parser:
    def __init__(self, lines, chapter_idx):
        self.L = lines
        self.i = 0
        self.ch = chapter_idx

    def peek_nonblank(self, j=None):
        j = self.i if j is None else j
        while j < len(self.L) and (not self.L[j].strip() or self.L[j].strip() == "---"):
            j += 1
        return j

    # ---- одиночные строки ----
    def line_node(self, raw):
        s = raw.strip()
        if s.startswith("`[") and s.endswith("]`"):
            out = []
            for m in re.finditer(r"\[([^\]]+)\]", s):
                tag = m.group(1)
                if tag.startswith("фон:"):
                    k = bg_key(tag[4:])
                    if k:
                        out.append({"t": "bg", "v": k})
                elif tag.startswith("система:"):
                    out.append({"t": "sys", "x": tag[8:].strip()})
                elif tag.startswith("интерфейс: выбор пути"):
                    out.append({"t": "path"})
                elif tag.startswith("интерфейс: ввод имени"):
                    out.append({"t": "name"})
                elif tag.startswith("эффект"):
                    fx = tag
                    if "вспышка" in fx or "белое" in fx or "свет" in fx:
                        out.append({"t": "fx", "v": "flash"})
                    elif "потемнение" in fx or "темнот" in fx:
                        out.append({"t": "fx", "v": "dark"})
                    elif "колокол" in fx or "взрыв" in fx:
                        out.append({"t": "fx", "v": "shake"})
                elif tag.startswith("затемнение"):
                    out.append({"t": "fx", "v": "dark"})
            return out
        if s == "**После:**":
            return []
        m = re.match(r"^\*\*\{Кайра:\*\*\s*(.*?)\s*/\s*\*\*Лина:\*\*\s*(.*?)\}\s*$", s)
        if m:
            return [{"t": "pv", "kayra": {"t": "say", "w": "Кайра", "s": "kayra", "x": m.group(1)},
                     "lina": {"t": "say", "w": "Лина", "s": "lina", "x": m.group(2)}}]
        m = re.match(r"^\*\*([^*]+?):\*\*\s*(.*)$", s)
        if m:
            who, text = m.group(1).strip(), m.group(2).strip()
            if who in ("{Напарница}", "{Вторая напарница}"):
                pm = PARTNER_RE.search(text)
                if pm:
                    return [{"t": "pv", "kayra": {"t": "say", "w": "Кайра", "s": "kayra", "x": pm.group(1)},
                             "lina": {"t": "say", "w": "Лина", "s": "lina", "x": pm.group(2)}}]
                return [{"t": "say", "w": "{Напарница}", "s": "partner", "x": text}]
            if who.startswith("{Имя}") or who.startswith("{ИМЯ}"):
                if "про себя" in who:
                    return [{"t": "think", "x": text}]
                return [{"t": "say", "w": "{Имя}", "s": "hero", "x": text}]
            if who.startswith("Кайра/Лина"):
                return [{"t": "say", "w": "{Напарница}", "s": "partner", "x": text}]
            if who.startswith("Если ") or who in ("Вид", "Задача", "Победа", "Проигрыш"):
                return []
            return [{"t": "say", "w": who, "s": speaker_key(who), "x": text}]
        if s.startswith("**") and s.endswith("**"):
            return [{"t": "sub", "x": s.strip("*")}]
        if s.startswith("*(") and s.endswith(")*"):
            inner = s[2:-2]
            if inner.startswith("Улика"):
                return [{"t": "sys", "x": inner}]
            eff = parse_effects(inner)
            return [{"t": "eff", "e": eff}] if eff else []
        if s.startswith("*"):
            return [{"t": "n", "x": strip_italic(s)}]
        if s.startswith("#"):
            return []
        if s.startswith(">"):
            return []
        return [{"t": "n", "x": s}]

    # ---- последовательность ----
    def seq(self, stop):
        nodes = []
        while self.i < len(self.L):
            raw = self.L[self.i]
            s = raw.strip()
            if not s:
                self.i += 1
                continue
            if stop(s):
                break
            if s.startswith("# "):
                nodes.append({"t": "title", "x": s[2:].strip()})
                self.i += 1
            elif s.startswith("## "):
                nodes.append({"t": "scene", "x": s[3:].strip()})
                self.i += 1
            elif s.startswith("### "):
                r = self.route_group()
                if r:
                    nodes.append(r)
                else:
                    nodes.append({"t": "sub", "x": s[4:].strip()})
                    self.i += 1
            elif s.startswith(">"):
                nodes.extend(self.choice())
            elif s.startswith("🎮"):
                nodes.extend(self.interactive())
            elif s == "---":
                self.i += 1
            else:
                nodes.extend(self.line_node(raw))
                self.i += 1
        return nodes

    def interactive(self):
        out = []
        self.i += 1
        while self.i < len(self.L) and self.L[self.i].strip():
            s = self.L[self.i].strip()
            m = re.match(r"^\*\*Если пропустить:\*\*\s*(.*)$", s)
            if m:
                out.append({"t": "n", "x": strip_italic(m.group(1))})
            self.i += 1
        return out

    def route_group(self):
        s = self.L[self.i].strip()
        h = s[4:]
        kind = None
        if "Меча" in h or "Магии" in h:
            kind = "path"
        elif h.startswith("Путь ") or h.startswith("Никто"):
            kind = "romance"
        if not kind:
            return None
        variants = {}
        while self.i < len(self.L):
            s = self.L[self.i].strip()
            if not s or s == "---":
                self.i += 1
                continue
            if not s.startswith("### "):
                break
            h = s[4:]
            if kind == "path":
                key = "sword" if "Меча" in h else "magic" if "Магии" in h else None
            else:
                key = ("kayra" if "Кайр" in h else "lina" if "Лин" in h else
                       "ilvenn" if "Ильвенн" in h else "none")
            if key is None:
                break
            self.i += 1
            variants[key] = self.seq(lambda x: x.startswith("### ") or x.startswith("## ") or x.startswith("# "))
        return {"t": "route", "by": kind, "v": variants}

    def choice(self):
        block = []
        while self.i < len(self.L) and self.L[self.i].strip().startswith(">"):
            block.append(self.L[self.i].strip()[1:].strip())
            self.i += 1
        header = block[0] if block else ""
        is_word = "СЛОВО ИНЕЯ" in header
        is_final = "ФИНАЛЬНЫЙ" in header
        is_path = "Путь" in header and "РАЗВИЛКА" in header
        opts = []
        for b in block[1:]:
            m = re.match(r"^\*\*(.+?)\*\*\s*(.*)$", b)
            if not m:
                continue
            key_raw, rest = m.group(1).strip(), m.group(2).strip()
            key = key_raw.rstrip(".").strip()
            if is_final:
                km = re.search(r"«(.+?)»", key_raw)
                key = km.group(1) if km else key
            elif is_path:
                key = "Меч" if "Меч" in key_raw else "Магия"
            elif key and key[0] in LETTERS:
                key = key[0]
            else:
                key = re.sub(r"[^\wА-Яа-яЁё]", "", key) or key
            label, _, tail = rest.partition(" — ")
            label = label.strip()
            if is_final:
                label = "«" + key + "». " + strip_italic(label)
            if label.startswith("*") and label.endswith("*"):
                label = "(" + strip_italic(label).rstrip(".") + ")"
            elif not label and is_path:
                label = key
            opt = {"k": key, "l": label}
            if is_path:
                opt["l"] = key_raw.rstrip(".") + ": " + label
                opt["set"] = {"path": "sword" if key == "Меч" else "magic"}
            eff = parse_effects(tail)
            if eff:
                opt["e"] = eff
            if label.startswith("(Не "):
                pass
            elif is_word and ("Слово" in label or "Выдохнуть" in label or "❄" in key_raw):
                opt["mem"] = 1
            elif "Слово" in rest and "Память" in rest:
                opt["mem"] = 1
            if is_final and "Ильвенн" in tail:
                opt["need"] = {"romance": "ilvenn"}
            opts.append(opt)
        node = {"t": "choice", "o": opts}
        if "Ночь перед Мглой" in header:
            node["romance"] = True
            rk = {"А": "kayra", "Б": "lina", "В": "ilvenn", "Г": "none"}
            for o in opts:
                o["set"] = {"romance": rk.get(o["k"], "none")}
        if "Имя для" in header or "Как назвать" in header:
            node["cosmetic"] = True
        # ветки
        branches = {}
        j = self.peek_nonblank()
        if j < len(self.L) and self.L[j].strip().startswith("### ") and node.get("romance"):
            self.i = j
            while self.i < len(self.L):
                s = self.L[self.i].strip()
                if not s or s == "---":
                    self.i += 1
                    continue
                if not s.startswith("### "):
                    break
                letter = s[4:5]
                self.i += 1
                branches[letter] = self.seq(lambda x: x.startswith("### ") or x.startswith("## ") or x.startswith("# "))
        elif is_final:
            self.i = j
            while self.i < len(self.L):
                s = self.L[self.i].strip()
                if not s or s == "---":
                    self.i += 1
                    continue
                m = re.match(r"^## Концовка «(.+?)»", s)
                if not m:
                    break
                self.i += 1
                branches[m.group(1)] = [{"t": "scene", "x": s[3:]}] + self.seq(lambda x: x.startswith("## ") or x.startswith("# "))
        else:
            # 🎮 между выбором и ветками пропускаем
            while True:
                j = self.peek_nonblank()
                if j < len(self.L) and self.L[j].strip().startswith("🎮"):
                    self.i = j
                    self.interactive()
                    continue
                break
            while True:
                j = self.peek_nonblank(self.i)
                # не перепрыгиваем через «---»: оно завершает развилку
                k = self.i
                while k < len(self.L) and not self.L[k].strip():
                    k += 1
                if k < len(self.L) and self.L[k].strip() == "---":
                    break
                if j >= len(self.L):
                    break
                s = self.L[j].strip()
                m = re.match(r"^\*\*Если (.+?):\*\*\s*(.*)$", s)
                if not m or m.group(1).startswith("пропустить") or m.group(1).startswith("ошибиться"):
                    break
                keys_raw = m.group(1)
                keys = []
                for part in re.split(r",| или ", keys_raw):
                    part = part.strip()
                    if part in ("Меч", "Магия"):
                        keys.append(part)
                    elif part and part[0] in LETTERS:
                        keys.append(part[0])
                self.i = j + 1
                body = []
                if m.group(2):
                    body.extend(self.line_node(m.group(2)))
                body.extend(self.seq(lambda x: x.startswith("**Если ") and not x.startswith("**Если пропустить")
                                     or x == "---" or x.startswith("#") or x.startswith(">")))
                for k2 in keys:
                    branches[k2] = body
        for o in opts:
            if o["k"] in branches:
                o["b"] = branches[o["k"]]
        return [node]


def build():
    chapters = []
    for idx, path in enumerate(SRC):
        lines = open(path, encoding="utf-8").read().split("\n")
        p = Parser(lines, idx)
        nodes = p.seq(lambda s: False)
        # делим файл на главы по заголовкам «# »
        cur = None
        for n in nodes:
            if n["t"] == "title":
                cur = {"title": n["x"], "nodes": []}
                chapters.append(cur)
            elif cur is not None:
                cur["nodes"].append(n)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// Сгенерировано tools/build_story.py из story/*.md. Не редактировать вручную.\n")
        f.write("window.STORY_DATA = ")
        json.dump({"chapters": chapters}, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    total = 0
    for c in chapters:
        def count(ns):
            k = 0
            for n in ns:
                k += 1
                for o in n.get("o", []):
                    k += count(o.get("b", []))
                for v in n.get("v", {}).values() if isinstance(n.get("v"), dict) else []:
                    k += count(v)
            return k
        c_n = count(c["nodes"])
        total += c_n
        print(f"{c['title'][:40]:40} {c_n}")
    print("total nodes", total)


if __name__ == "__main__":
    build()
