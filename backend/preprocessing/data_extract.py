import pandas as pd
import re

def clean_data(df1, df2):
    combined_df = pd.concat([df1, df2], ignore_index=True).copy()
    combined_df = combined_df[
        (combined_df['Course Subject'] == 'BIOL_V') &
        (combined_df['Course Number'] < 500)
    ].copy()
    combined_df.loc[:, 'Course Code'] = combined_df['Course Subject'] + " " + combined_df['Course Number'].astype(str)
    cleaned_df = combined_df.drop_duplicates(subset=['Course Code'], keep='first')
    return cleaned_df

def clean_themes(themes):
    # Drop extra columns safely
    themes = themes.drop(columns=['Department', 'Notes'], errors='ignore').copy()

    # Clean Course Code
    themes.loc[:, 'Course Code'] = (
        themes['Course Code']
        .astype(str)
        .str.replace('_V', '', regex=False)
    )

    # Use positional logic (same as original, but safe)
    theme_cols = themes.columns[1:]

    # Convert to boolean flags
    theme_flags = themes.loc[:, theme_cols].notna()

    # Build theme lists
    themes.loc[:, 'themes'] = [
        list(theme_cols[row])
        for row in theme_flags.to_numpy()
    ]

    return themes.loc[:, ['Course Code', 'themes']].copy()

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
    COURSE_PATTERN = re.compile(r'[A-Z]{4}\s?\d{3}')
    RECOMMENDED_PATTERN = re.compile(r'\b[A-Z]{4}\s\d{3}\sis\srecommended\.', re.IGNORECASE)

    df = cleaned_df.loc[:, ['Course Code', 'Section Title', 'Description']].copy()

    df.loc[:, 'Course Code'] = (
        df['Course Code']
        .astype(str)
        .str.replace('_V', '', regex=False)
    )

    df.loc[:, 'reqs'] = df['Description'].str.extract(
        r'((prerequisite|corequisite)[\s\S]*)',
        flags=re.IGNORECASE
    )[0]

    df.loc[:, 'reqs'] = df['reqs'].str.replace(RECOMMENDED_PATTERN, '', regex=True)

    df.loc[:, 'prereqs'] = df['reqs'].apply(
        lambda x: extract_reqs_helper(x, 'Prerequisite')
    )
    df.loc[:, 'coreqs'] = df['reqs'].apply(
        lambda x: extract_reqs_helper(x, 'Corequisite')
    )

    df.loc[:, 'prereq_courses'] = df['prereqs'].apply(
        lambda x: COURSE_PATTERN.findall(x) if isinstance(x, str) else []
    )
    df.loc[:, 'coreq_courses'] = df['coreqs'].apply(
        lambda x: COURSE_PATTERN.findall(x) if isinstance(x, str) else []
    )

    df.loc[:, 'prereq_courses'] = df['prereq_courses'].apply(standardize_courses)
    df.loc[:, 'coreq_courses'] = df['coreq_courses'].apply(standardize_courses)

    df = df.drop(columns=['prereqs', 'coreqs', 'reqs'])

    return df

def create_courses_json(courses_with_themes):
    if courses_with_themes is None:
        return []
    
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
    return courses_json

def extract_course_data(df1, df2, themes):
    # Test loading the files
    cleaned_df = clean_data(df1, df2)
    cleaned_themes = clean_themes(themes)

    courses_with_reqs = extract_reqs(cleaned_df)

    courses_with_themes = courses_with_reqs.merge(cleaned_themes, on='Course Code', how='left')
    courses_with_themes.loc[courses_with_themes['Description'].isna(), 'Description'] = ""

    courses_json = create_courses_json(courses_with_themes)

    # Extract all valid course codes into a set for fast lookup
    valid_course_codes = {course['course_code'] for course in courses_json}

    # Filter the prerequisites for each course
    for course in courses_json:
        # Keep only those prerequisites that are in the valid course codes
        course['prerequisites'] = [prereq for prereq in course['prerequisites'] if prereq in valid_course_codes]

    for course in courses_json:
        course['corequisites'] = [coreq for coreq in course['corequisites'] if coreq in valid_course_codes]

    print("Prerequisites filtered successfully!")
    return courses_json