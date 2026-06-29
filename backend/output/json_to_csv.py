import json
import csv
from pathlib import Path

input_file = Path("bio_courses_tag.json")
output_file = Path("bio_courses_tag.csv")

with open(input_file, "r", encoding="utf-8") as f:
    data = json.load(f)

def format_value(value):
    if isinstance(value, list):
        return "; ".join(str(item) for item in value)
    if isinstance(value, dict):
        return json.dumps(value, ensure_ascii=False)
    return value if value is not None else ""

fieldnames = [
    "course_code",
    "course title",
    "description",
    "prerequisites",
    "corequisites",
    "category",
    "components",
    "theme",
    "level",
    "credits",
    "term",
    "calendar_url"
]

with open(output_file, "w", encoding="utf-8", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()

    for row in data:
        writer.writerow({
            field: format_value(row.get(field, ""))
            for field in fieldnames
        })

print(f"CSV created: {output_file}")