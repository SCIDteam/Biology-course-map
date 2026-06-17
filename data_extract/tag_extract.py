import os
import re
import json
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer

def clean_text(text):
    if not isinstance(text, str):
        return ""
    text = text.lower()
    # Remove punctuation/numbers but keep text gaps clean
    text = re.sub(r'[^a-zA-Z\s\-]', '', text)
    # Filter out redundant academic noise words
    fillers = ['course', 'introduction', 'study', 'focus', 'emphasis', 'prerequisite', 'corequisite', 'students', 'biol', 'v']
    for word in fillers:
        text = text.replace(f" {word} ", " ")
    return text

def extract_reqs_helper(text, keyword):
    if isinstance(text, str):
        match = re.search(fr'{keyword}:.*?[.\]]', text, re.IGNORECASE)
        return match.group(0) if match else ''
    return ''

def standardize_courses(course_list):
    standardized_list = []
    for course in course_list:
        # Adds space between letters and numbers if missing (e.g., BIOL200 -> BIOL 200)
        standardized_course = re.sub(r'([A-Z]+)(\d+)', r'\1 \2', course)
        standardized_list.append(standardized_course)
    return standardized_list

if __name__ == "__main__":
    base_dir = os.path.abspath(os.path.dirname(__file__))
    excel_path = os.path.join(base_dir, "data", "Updated-Biology-Courses.xlsx")
    
    print("Ingesting data from Updated-Biology-Courses.xlsx...")
    try:
        # Load sheets directly. skiprows=1 handles the row offset in the Central sheet cleanly.
        raw_central = pd.read_excel(excel_path, sheet_name="Course Section Search - Central", skiprows=1)
        raw_tags = pd.read_excel(excel_path, sheet_name="Updated Tags - Course Category")
        print("Excel sheets successfully parsed.")
    except Exception as e:
        print(f"File reading error. Please ensure the file and sheet names match exactly: {e}")
        exit()
        
    # 1. Isolate the allowed 'Include' rows right away
    valid_tags_df = raw_tags[raw_tags['Include/Exclude'].str.strip().str.lower() == 'include'].copy()
    
    # 2. Reconstruct standardized base code column (e.g., "BIOL_V" + 111 -> "BIOL 111")
    raw_central['Course Code'] = (
        raw_central['Course Subject'].str.replace('_V', '', regex=False).str.strip() + 
        " " + 
        raw_central['Course Number'].astype(str).str.strip()
    )
    cleaned_central = raw_central.drop_duplicates(subset=['Course Code'])
    
    # Inner merge ensures we drop the unapproved gray rows
    target_map_code_col = 'Course Code\n(as it should appear in course map)'
    merged_df = cleaned_central.merge(valid_tags_df, left_on='Course Code', right_on=target_map_code_col, how='inner')
    
    # 3. Parse Out Prerequisite & Corequisite links using text descriptions
    merged_df['Description'] = merged_df['Description'].fillna('')
    merged_df['prereqs_raw'] = merged_df['Description'].apply(lambda x: extract_reqs_helper(x, 'Prerequisite'))
    merged_df['coreqs_raw'] = merged_df['Description'].apply(lambda x: extract_reqs_helper(x, 'Corequisite'))
    
    merged_df['prereq_list'] = merged_df['prereqs_raw'].apply(lambda x: re.findall(r'[A-Z]{4}\s?\d{3}', str(x)))
    merged_df['coreq_list'] = merged_df['coreqs_raw'].apply(lambda x: re.findall(r'[A-Z]{4}\s?\d{3}', str(x)))
    
    merged_df['prereq_list'] = merged_df['prereq_list'].apply(standardize_courses)
    merged_df['coreq_list'] = merged_df['coreq_list'].apply(standardize_courses)
    
    # 4. Unsupervised ML Tag Generation via TF-IDF
    print("Extracting course themes...")
    corpus = (merged_df['Course Name'].fillna('') + " " + merged_df['Description']).apply(clean_text).tolist()
    
    vectorizer = TfidfVectorizer(
        stop_words='english',
        ngram_range=(1, 2),  # Extract single tokens as well as terms like 'cell biology'
        max_df=0.6,          # Exclude tags appearing in more than 60% of courses (too generic)
        min_df=1
    )
    
    tfidf_matrix = vectorizer.fit_transform(corpus)
    feature_names = vectorizer.get_feature_names_out()
    
    # Parse semicolon strings into programmatic arrays
    merged_df['format_tags'] = merged_df['Tags: Set 2 (Instructional Format)'].fillna('').apply(
        lambda x: [item.strip() for item in x.split(';')] if x else []
    )
    merged_df['category_tags'] = merged_df['Tags: Set 1 (Program Category)'].fillna('').apply(
        lambda x: [item.strip() for item in x.split(';')] if x else []
    )
    
    courses_json = []
    valid_course_codes = set(merged_df['Course Code'].tolist())
    
    # Assemble finalized JSON entries
    for idx, row in merged_df.iterrows():
        # Find best 3 tracking keywords for this row entry
        row_vector = tfidf_matrix.getrow(idx).toarray()[0]
        top_indices = row_vector.argsort()[-3:][::-1]
        ml_themes = [feature_names[i].title() for i in top_indices if row_vector[i] > 0]
        
        if not ml_themes:
            ml_themes = ["General Biology"]
            
        course_entry = {
            "id": row['Course Code'],
            "code": row['Course Code'],
            "title": row['Course Name'],
            "description": row['Description'] if row['Description'] else "Not available",
            "prerequisites": [p for p in row['prereq_list'] if p in valid_course_codes],
            "corequisites": [c for c in row['coreq_list'] if c in valid_course_codes],
            "category": row['category_tags'],
            "components": row['format_tags'],
            "theme": ml_themes, # Filled by TF-IDF keywords
            "level": str(row['Course Number']) + " level",
            "credits": "Not available",
            "term": "Not available",
            "calendar_url": ""
        }
        courses_json.append(course_entry)
        
    # Enforce strict reciprocal linkage validation checks
    for course in courses_json:
        course['prerequisites'] = [p for p in course['prerequisites'] if p in valid_course_codes]
        course['corequisites'] = [c for c in course['corequisites'] if c in valid_course_codes]
        
    # Output the result to your app's frontend target location
    output_path = os.path.join(base_dir, "data", "bio_courses_tag.json")
    with open(output_path, 'w') as f:
        json.dump(courses_json, f, indent=4)
        
    print(f"Extraction successful! Frontend target updated seamlessly at: {output_path}")