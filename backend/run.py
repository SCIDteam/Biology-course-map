## Pipeline to orchestrate the backend steps
import os
import json
import pandas as pd

from preprocessing.data_extract import extract_course_data

def load_data(input_path, skiprows=None):
    # Load the Excel files into pandas DataFrames
    extension = os.path.splitext(input_path)[1]
    try:
        if extension == '.xlsx':
            df = pd.read_excel(input_path, skiprows=skiprows)
        elif extension == '.csv':
            df = pd.read_csv(input_path)
        print("Files successfully loaded.")
        return df
    except Exception as e:
        print(f"An error occurred while loading the files: {e}")
        return None

def save_json_to_ouput(courses_json, output_path):
    # Save the modified courses_json_str back to the JSON file
    with open(output_path, 'w') as file:
        json.dump(courses_json, file, indent=4)

def main():
    base_dir = os.path.abspath(os.path.dirname(__file__))
    input_path = os.path.join(base_dir, "data")
    output_path = os.path.join(base_dir, "output")

    # Read in data
    t1_course_section_path = os.path.join(input_path, "Course_Section_Search_-_Central Term 1.xlsx")
    t2_course_section_path = os.path.join(input_path, "Course_Section_Search_-_Central Term 2 and Summer 2025.xlsx")
    themes_path = os.path.join(input_path, "course_themes.csv")

    t1_course_section_df = load_data(t1_course_section_path, skiprows=1)
    t2_course_section_df = load_data(t2_course_section_path, skiprows=1)
    themes_df = load_data(themes_path, skiprows=1)

    # Extract course data
    courses_json = extract_course_data(
        t1_course_section_df, t2_course_section_df, themes_df
    )

    # Extract tags
    ...

    # Save to json
    courses_output_path = os.path.join(output_path, 'all_courses_py.json')
    save_json_to_ouput(courses_json, courses_output_path)

if __name__ == "__main__":
    main()