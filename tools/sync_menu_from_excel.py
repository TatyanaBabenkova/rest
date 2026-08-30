"""Export the first worksheet of data/menu.xlsx to the frontend JSON files.

The script deliberately uses only Python's standard library, so it also works in
GitHub Actions without installing Excel or third-party packages.
"""

from __future__ import annotations

import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path


NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}
DOC_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def column_index(reference: str) -> int:
    letters = re.match(r"[A-Z]+", reference).group(0)
    value = 0
    for letter in letters:
        value = value * 26 + ord(letter) - 64
    return value - 1


def shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    result = []
    for item in root.findall("m:si", NS):
        result.append("".join(node.text or "" for node in item.findall(".//m:t", NS)))
    return result


def first_sheet_path(archive: zipfile.ZipFile) -> str:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    first = workbook.find("m:sheets/m:sheet", NS)
    relationship_id = first.attrib[f"{{{DOC_REL_NS}}}id"]
    rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    for relationship in rels.findall("r:Relationship", REL_NS):
        if relationship.attrib["Id"] == relationship_id:
            target = relationship.attrib["Target"].lstrip("/")
            return target if target.startswith("xl/") else f"xl/{target}"
    raise ValueError("Не найден первый лист Excel")


def cell_value(cell: ET.Element, strings: list[str]):
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(".//m:t", NS))
    value_node = cell.find("m:v", NS)
    if value_node is None:
        return ""
    raw = value_node.text or ""
    if cell_type == "s":
        return strings[int(raw)]
    if cell_type == "b":
        return raw == "1"
    try:
        number = float(raw)
        return int(number) if number.is_integer() else number
    except ValueError:
        return raw


def read_rows(workbook_path: Path) -> list[list[object]]:
    with zipfile.ZipFile(workbook_path) as archive:
        strings = shared_strings(archive)
        worksheet = ET.fromstring(archive.read(first_sheet_path(archive)))
        rows = []
        for row in worksheet.findall("m:sheetData/m:row", NS):
            cells: dict[int, object] = {}
            for cell in row.findall("m:c", NS):
                cells[column_index(cell.attrib["r"])] = cell_value(cell, strings)
            if cells:
                rows.append([cells.get(index, "") for index in range(max(cells) + 1)])
        return rows


def build_menu(rows: list[list[object]]) -> list[dict[str, object]]:
    if not rows:
        raise ValueError("Лист меню пуст")
    headers = {str(value).strip(): index for index, value in enumerate(rows[0])}
    required = [
        "ID", "Категория", "Название", "Описание", "Цена, ₽", "Вес / объём",
        "Время, мин", "Цех", "Популярное", "Файл изображения", "Модификаторы",
    ]
    missing = [name for name in required if name not in headers]
    if missing:
        raise ValueError("Не найдены столбцы: " + ", ".join(missing))

    def get(row: list[object], header: str):
        index = headers[header]
        return row[index] if index < len(row) else ""

    menu = []
    seen = set()
    for row_number, row in enumerate(rows[1:], start=2):
        item_id = str(get(row, "ID")).strip()
        if not item_id:
            continue
        if item_id in seen:
            raise ValueError(f"Повторяющийся ID в строке {row_number}: {item_id}")
        seen.add(item_id)
        station_text = str(get(row, "Цех")).strip().casefold()
        station = "kitchen" if station_text == "кухня" else "bar" if station_text == "бар" else ""
        if not station:
            raise ValueError(f"Неизвестный цех в строке {row_number}: {get(row, 'Цех')}")
        modifiers = [part.strip() for part in str(get(row, "Модификаторы")).split("|") if part.strip()]
        menu.append({
            "id": item_id,
            "category": str(get(row, "Категория")).strip(),
            "name": str(get(row, "Название")).strip(),
            "description": str(get(row, "Описание")).strip(),
            "price": int(float(get(row, "Цена, ₽"))),
            "weight": str(get(row, "Вес / объём")).strip(),
            "minutes": int(float(get(row, "Время, мин"))),
            "station": station,
            "image": str(get(row, "Файл изображения")).strip(),
            "popular": str(get(row, "Популярное")).strip().casefold() in {"да", "true", "1"},
            "modifiers": modifiers,
        })
    return menu


def main() -> None:
    workbook_path = Path(sys.argv[1] if len(sys.argv) > 1 else "data/menu.xlsx")
    destinations = [Path(value) for value in sys.argv[2:]] or [Path("data/menu.json"), Path("public/data/menu.json")]
    menu = build_menu(read_rows(workbook_path))
    payload = json.dumps(menu, ensure_ascii=False, indent=2) + "\n"
    for destination in destinations:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(payload, encoding="utf-8")
    print(f"Экспортировано позиций: {len(menu)}")


if __name__ == "__main__":
    main()
