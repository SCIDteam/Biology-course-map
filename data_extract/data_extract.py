import pandas as pd
import re
import json
import os

def load_excel_files():
    # Get the absolute path of the current script
    base_dir = os.path.abspath(os.path.dirname(__file__))

    # Define absolute paths to the data files (relative to the script's directory)
    file1_path = os.path.join(base_dir, "data", "Course_Section_Search_-_Central Term 1.xlsx")
    file2_path = os.path.join(base_dir, "data", "Course_Section_Search_-_Central Term 2 and Summer 2025.xlsx")
    themes_path = os.path.join(base_dir, "data", "course_themes.csv")

    # Load the Excel files into pandas DataFrames
    try:
        file1 = pd.read_excel(file1_path, skiprows=1)
        file2 = pd.read_excel(file2_path, skiprows=1)
        themes = pd.read_csv(themes_path)
        print("Files successfully loaded.")
        return file1, file2, themes
    except Exception as e:
        print(f"An error occurred while loading the files: {e}")
        return None, None, None
    
def clean_data(df1, df2):
    combined_df = pd.concat([df1, df2], ignore_index=True)
    combined_df = combined_df[combined_df['Course Subject']=='BIOL']
    combined_df = combined_df[combined_df['Course Number'] < 500]
    combined_df.loc[:, 'Course Code'] = combined_df['Course Subject'] + " " + combined_df['Course Number'].astype(str)
    cleaned_df = combined_df.drop_duplicates(subset=['Course Code'], keep='first')
    return cleaned_df

def clean_themes(themes):
    themes.drop(columns=['Department', 'Notes'], inplace=True)
    themes.iloc[:, 1:] = themes.iloc[:, 1:].notna()
    themes['Course Code'] = themes['Course Code'].str.replace('_V', '', regex=False)

    themes['themes'] = themes.iloc[:, 1:].apply(lambda x: list(themes.columns[1:][x]), axis=1)
    cleaned_themes = themes[['Course Code', 'themes']]

    return cleaned_themes

def extract_reqs_helper(text, keyword):
    if isinstance(text, str):
        match = re.search(fr'{keyword}:.*?[.\]]', text)
        return match.group(0) if match else ''
    return ''

def standardize_courses(list):
    standardized_list = []
    for course in list:
        # Use regex to find courses with no space before the number
        standardized_course = re.sub(r'([A-Z]+)(\d+)', r'\1 \2', course)
        standardized_list.append(standardized_course)
    return standardized_list

def extract_reqs(cleaned_df):
    course_description = cleaned_df[['Course Code', 'Section Title', 'Description']].copy()
    course_description.loc[:, 'reqs'] = course_description['Description'].str.extract(
        r'((prerequisite|corequisite)[\s\S]*)', 
        flags=re.IGNORECASE
    )[0]

    pattern = r'\b[A-Z]{4}\s\d{3}\sis\srecommended\.'

    # Remove the sentence if present
    course_description['reqs'] = course_description['reqs'].str.replace(pattern, '', regex=True)

    # Create 'prereqs' and 'coreqs' columns
    course_description['prereqs'] = course_description['reqs'].apply(lambda x: extract_reqs_helper(x, 'Prerequisite'))
    course_description['coreqs'] = course_description['reqs'].apply(lambda x: extract_reqs_helper(x, 'Corequisite'))

    course_description['prereq_courses'] = course_description['prereqs'].apply(
        lambda x: re.findall(r'[A-Z]{4}\s?\d{3}', str(x)) if isinstance(x, str) else []
    )
    course_description['coreq_courses'] = course_description['coreqs'].apply(
        lambda x: re.findall(r'[A-Z]{4}\s?\d{3}', str(x)) if isinstance(x, str) else []
    )

    course_description.drop(columns=['prereqs', 'coreqs', 'reqs'], inplace=True)

    course_description['prereq_courses'] = course_description['prereq_courses'].apply(standardize_courses)
    course_description['coreq_courses'] = course_description['coreq_courses'].apply(standardize_courses)

    course_description['Course Code'] = course_description['Course Code'].str.replace('_V', '', regex=False)

    courses_with_reqs = course_description.copy()

    return courses_with_reqs

if __name__ == "__main__":
    # Test loading the files
    df1, df2, themes = load_excel_files()
    cleaned_df = clean_data(df1, df2)
    cleaned_themes = clean_themes(themes)

    courses_with_reqs = extract_reqs(cleaned_df)

    courses_with_themes = courses_with_reqs.merge(themes, on='Course Code', how='left')
    courses_with_themes.loc[courses_with_themes['Description'].isna(), 'Description'] = ""

    courses_json = []

    for _, row in courses_with_themes.iterrows():
        course_entry = {
            "course_code": row['Course Code'],
            "course_title": row['Section Title'],
            "description": row['Description'],
            "prerequisites": row['prereq_courses'],  # Directly using the list from the CSV
            "corequisites": row['coreq_courses'],  # You can include other columns as needed
            "themes": row['themes']
        }
        courses_json.append(course_entry)

    # Extract all valid course codes into a set for fast lookup
    valid_course_codes = {course['course_code'] for course in courses_json}

    # Filter the prerequisites for each course
    for course in courses_json:
        # Keep only those prerequisites that are in the valid course codes
        course['prerequisites'] = [prereq for prereq in course['prerequisites'] if prereq in valid_course_codes]

    for course in courses_json:
        course['corequisites'] = [coreq for coreq in course['corequisites'] if coreq in valid_course_codes]

    # Save the modified courses_json_str back to the JSON file
    base_dir = os.path.abspath(os.path.dirname(__file__))
    with open(os.path.join(base_dir, "data", 'all_courses_py.json'), 'w') as file:
        json.dump(courses_json, file, indent=4)

    print("Prerequisites filtered successfully!")