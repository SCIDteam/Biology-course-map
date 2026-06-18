import os
import re
import json
import pandas as pd
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.feature_extraction import text 
from sklearn.decomposition import LatentDirichletAllocation

def clean_text_for_ml(text):
    if not isinstance(text, str):
        return ""
    
    # Cut the text immediately if it hits prerequisites, corequisites, or the credit exclusion warning
    split_pattern = r'(prerequisite|corequisite|credit will be granted|please consult the faculty of science credit exclusion lists|Preference will be given to)'
    clean_text = re.split(split_pattern, text, flags=re.IGNORECASE)[0]
    
    clean_text = clean_text.lower()
    clean_text = re.sub(r'[^a-zA-Z\s\-]', '', clean_text)
    
    # Remove unhelpful academic filler words
    fillers = ['course', 'introduction', 'study', 'focus', 'emphasis', 'students', 'biol', 'v', 'science', 'topics']
    for word in fillers:
        clean_text = clean_text.replace(f" {word} ", " ")
    return clean_text.strip()

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
    excel_path = os.path.join(base_dir, "backend", "data", "Updated-Biology-Courses.xlsx")
    
    print("Ingesting Data Sheets...")
    try:
        raw_central = pd.read_excel(excel_path, sheet_name="Course Section Search - Central", skiprows=1)
        raw_tags = pd.read_excel(excel_path, sheet_name="Updated Tags - Course Category")
        print("Excel data successfully parsed.")
    except Exception as e:
        print(f"File path or Sheet name mismatch error: {e}")
        exit()
        
    # Isolate 'Include' rows 
    valid_tags_df = raw_tags[raw_tags['Include/Exclude'].str.strip().str.lower() == 'include'].copy()
    
    # Reconstruct clean course codes
    raw_central['Course Code'] = (
        raw_central['Course Subject'].str.replace('_V', '', regex=False).str.strip() + 
        " " + 
        raw_central['Course Number'].astype(str).str.strip()
    )
    cleaned_central = raw_central.drop_duplicates(subset=['Course Code'])
    
    # Merge datasets together to drop excluded rows
    target_map_code_col = 'Course Code\n(as it should appear in course map)'
    merged_df = cleaned_central.merge(valid_tags_df, left_on='Course Code', right_on=target_map_code_col, how='inner')
    
    # Parse requisites raw data strings before description cleaning
    merged_df['Description'] = merged_df['Description'].fillna('')
    merged_df['prereqs_raw'] = merged_df['Description'].apply(lambda x: extract_reqs_helper(x, 'Prerequisite'))
    merged_df['coreqs_raw'] = merged_df['Description'].apply(lambda x: extract_reqs_helper(x, 'Corequisite'))
    
    merged_df['prereq_list'] = merged_df['prereqs_raw'].apply(lambda x: re.findall(r'[A-Z]{4}\s?\d{3}', str(x)))
    merged_df['coreq_list'] = merged_df['coreqs_raw'].apply(lambda x: re.findall(r'[A-Z]{4}\s?\d{3}', str(x)))
    
    merged_df['prereq_list'] = merged_df['prereq_list'].apply(standardize_courses)
    merged_df['coreq_list'] = merged_df['coreq_list'].apply(standardize_courses)
    
    # =========================================================================
    # ADVANCED LATENT DIRICHLET ALLOCATION (LDA) THEME ENGINE
    # =========================================================================
    print("Building LDA Topic Model (Targeting global Categories)...")
    ml_corpus = (merged_df['Course Name'].fillna('') + " " + merged_df['Description']).apply(clean_text_for_ml).tolist()
    
    # 1. EXTEND SYSTEM STOP WORDS: Ban syllabus administrative vocabulary from the mathematical model
    academic_stop_words = {
        'using', 'issues', 'work', 'operative','introduction', 'processes', 'concepts', 'fundamental', 'understanding', 
        'topics', 'practical', 'approach', 'principles', 'aspects', 'applications', 
        'current', 'historical', 'selected', 'examine', 'examines', 
        'investigation', 'directed', 'allies', 'restricted', 'regulation', 
        'placement', 'year', 'years', 'consult', 'faculty'
    }
    custom_stop_words = list(text.ENGLISH_STOP_WORDS.union(academic_stop_words))
    
    # Use CountVectorizer with our new custom stop words list
    tf_vectorizer = CountVectorizer(stop_words=custom_stop_words, ngram_range=(1, 2), max_df=0.7, min_df=1)
    tf_matrix = tf_vectorizer.fit_transform(ml_corpus)
    tf_feature_names = tf_vectorizer.get_feature_names_out()
    
    # Define N global curriculum topics as requested by the department (e.g., 15 topics)
    NUM_TOPICS = 15 
    lda_model = LatentDirichletAllocation(n_components=NUM_TOPICS, random_state=42, max_iter=15)
    lda_output = lda_model.fit_transform(tf_matrix)
    
    # Explicitly specify the exact strings to filter out from themes
    exclusion_list = {
        "Lists", "Credit", "Section", "Calendar", "Laboratory", "Lab", "Lab Selections", "Structure", "Function",
        "Restricted", "Taken", "Systems", "Introduction", "Biology", "Animal", "Animals", "Tropical", "Plant", "Plants", "Science",
        "Molecular", "Ecological", "Evolutionary", "Biological", "Developmental", "Collections", "Cell", "Issues", "Operative", "Processes", "Sciences", 
        "Techniques", "Using", "Work", "Genetic", "Nervous" }
    
    # Automatically map vocabulary terms to discover names for each of our 15 clusters
    topic_to_keywords = {}
    for topic_idx, topic in enumerate(lda_model.components_):
        # Sort indices in descending order of weight to step through alternatives if a word is excluded
        top_keyword_indices = topic.argsort()[::-1] 
        
        valid_topic_tags = []
        for i in top_keyword_indices:
            tag_candidate = tf_feature_names[i].title().strip()
            
            # Check candidate against exclusion list rules
            if tag_candidate not in exclusion_list:
                valid_topic_tags.append(tag_candidate)
                
            # Exit loop early once 2 distinct valid tags are found
            if len(valid_topic_tags) == 2:
                break
                
        # If a topic happens to exhaust its vocabulary, provide a fallback
        if not valid_topic_tags:
            valid_topic_tags = ["General Biology"]
            
        topic_to_keywords[topic_idx] = valid_topic_tags
    # =========================================================================
    
    # Unpack structural arrays 
    merged_df['format_tags'] = merged_df['Tags: Set 2 (Instructional Format)'].fillna('').apply(
        lambda x: [item.strip() for item in x.split(';')] if x else []
    )
    merged_df['category_tags'] = merged_df['Tags: Set 1 (Program Category)'].fillna('').apply(
        lambda x: [item.strip() for item in x.split(';')] if x else []
    )
    
    courses_json = []
    valid_course_codes = set(merged_df['Course Code'].tolist())
    
    # Map back to structural layout properties
    for idx, row in merged_df.iterrows():
        # Identify the dominant global LDA topic index assigned to this row profile
        dominant_topic_id = lda_output[idx].argmax()
        assigned_theme = topic_to_keywords[dominant_topic_id]
        
        # Level extraction: Capture first character digit
        first_digit = str(row['Course Number'])[0]
        ui_level_tag = int(first_digit) # get only the first character for level categorization (e.g., 1, 2, 3, 4)
        
        # Credits extraction: Maximum Credits Column
        raw_credits = row['Maximum Credits']
        ui_credits = int(raw_credits) if pd.notna(raw_credits) and str(raw_credits).replace('.','',1).isdigit() else "Not available"
        
        # Term extraction logic conversion
        raw_term = str(row['Term']).strip()
        if 'W1-2' in raw_term:
            ui_term_array = ["Term 1", "Term 2"]
        elif 'W1' in raw_term:
            ui_term_array = ["Term 1"]
        elif 'W2' in raw_term:
            ui_term_array = ["Term 2"]
        else:
            ui_term_array = ["Not available"]
            
        course_entry = {
            "course_code": row['Course Code'],
            "course title": row['Course Name'],
            "description": row['Description'] if row['Description'] else "Not available",
            "prerequisites": [p for p in row['prereq_list'] if p in valid_course_codes],
            "corequisites": [c for c in row['coreq_list'] if c in valid_course_codes],
            "category": row['category_tags'],
            "components": row['format_tags'],
            "theme": assigned_theme, 
            "level": ui_level_tag,
            "credits": ui_credits,
            "term": ui_term_array,
            "calendar_url": ""
        }
        courses_json.append(course_entry)
        
    # Finalize dependency integrity validation loops
    for course in courses_json:
        course['prerequisites'] = [p for p in course['prerequisites'] if p in valid_course_codes]
        course['corequisites'] = [c for c in course['corequisites'] if c in valid_course_codes]
        
    # Output the result to your app's frontend target location
    output_path = os.path.join(base_dir, "data", "bio_courses_tag.json")
    with open(output_path, 'w') as f:
        json.dump(courses_json, f, indent=4)
        
    # =========================================================================
    # Print all unique assigned themes for verification
    # =========================================================================
    all_assigned_themes = set()
    for course in courses_json:
        for tag in course["theme"]:
            all_assigned_themes.add(tag)
            
    print("\n=======================================================")
    print(f"   FINAL MASTER FILTER TAGS GENERATED ({len(all_assigned_themes)} TOTAL)")
    print("=======================================================")
    for tag in sorted(list(all_assigned_themes)):
        print(f" * {tag}")
    print("=======================================================\n")
    # =========================================================================
    print(f"Success! Balanced LDA dataset generated directly at: {output_path}")
    
    