import os
import json
import sys
import time
import re
from pathlib import Path

# Try importing google-generativeai for fallback
try:
    import google.generativeai as genai
except ImportError:
    genai = None

def get_gemini_client():
    """Configure and return the Gemini client if API key is available."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        env_path = Path(__file__).parent.parent / ".env"
        if env_path.exists():
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip().startswith("GEMINI_API_KEY="):
                        api_key = line.strip().split("=", 1)[1].strip().strip('"').strip("'")
                        os.environ["GEMINI_API_KEY"] = api_key
                        break
                        
    if not api_key or genai is None:
        return None
        
    genai.configure(api_key=api_key)
    return genai

def clean_vietaccepted_text(raw_text):
    if "Lưu\n" in raw_text:
        return raw_text.split("Lưu\n")[-1].strip()
    return raw_text.strip()

def clean_common_watermarks(raw_text):
    """SYSTEMATIC CLEANING: Removes headers, footers, navigation junk, and watermarks."""
    # Slice off top web headers if "Lưu\n" is present
    if "Lưu\n" in raw_text:
        text = raw_text.split("Lưu\n")[-1].strip()
    else:
        text = raw_text.strip()
        
    # Strip known watermarks/garbage
    text = re.sub(r"\[vietacceptedsat\]", "", text, flags=re.IGNORECASE)
    text = re.sub(r"Mã đề:\s*\S+", "", text, flags=re.IGNORECASE)
    text = re.sub(r"satsuite\.vietaccepted\.edu\.vn\S*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"Trang chủ\s*\|\s*Khóa ôn đề.*?\n", "", text, flags=re.IGNORECASE)
    text = re.sub(r"CHỨC NĂNG CHÍNH.*?\n", "", text, flags=re.IGNORECASE)
    
    # Remove division line characters
    text = re.sub(r"[-—_=\s]{6,}", "\n", text)
    
    return text.strip()

def parse_sat_metadata(raw_text):
    title = None
    breadcrumb = None
    
    # Match title like "Streak 09 - Reading - COE Textual 01 (Easy)"
    title_match = re.search(
        r"(Streak\s*\d+[\s-]*[a-zA-Z\s]+[\s-]*[a-zA-Z0-9\s]+(?:\(Easy\)|\(Medium\)|\(Hard\)|\(Active\)|\(Passive\)|\bEasy\b|\bMedium\b|\bHard\b)?)",
        raw_text,
        re.IGNORECASE
    )
    if title_match:
        title = title_match.group(1).strip()
    else:
        fallback_match = re.search(r"(Streak\s*\d+[\s-]*[^\n]+)", raw_text, re.IGNORECASE)
        if fallback_match:
            title = fallback_match.group(1).strip()
            
    if title:
        title = re.sub(r"^.*?Streak", "Streak", title).strip()

    # Match breadcrumbs
    phase_match = re.search(r"(RW\s+Phase\s+\d+)", raw_text, re.IGNORECASE)
    collection_match = re.search(r"(Daily\s+Streak\s+P\d+)", raw_text, re.IGNORECASE)
    year_match = re.search(r"\b(20\d{2})\b", raw_text)
    
    parts = []
    if phase_match:
        parts.append(phase_match.group(1).strip())
    if collection_match:
        parts.append(collection_match.group(1).strip())
    if year_match:
        parts.append(year_match.group(1).strip())
        
    if parts:
        breadcrumb = " > ".join(parts)
        
    return title, breadcrumb

class ParserRegistry:
    """Chain of Responsibility pattern to run multiple parser strategies with confidence scoring."""
    def __init__(self):
        self.parsers = []

    def register(self, name, parser_func):
        self.parsers.append((name, parser_func))

    def parse(self, raw_text, folder_skill):
        best_result = None
        best_confidence = -1
        best_parser_name = None

        for name, parser_func in self.parsers:
            try:
                res = parser_func(raw_text, folder_skill)
                if res and isinstance(res, dict):
                    confidence = res.get("confidence", 0)
                    if confidence > best_confidence:
                        best_confidence = confidence
                        best_result = res
                        best_parser_name = name
            except Exception as e:
                print(f"[Parser Registry] Error running {name}: {e}", file=sys.stderr)

        if best_result and best_confidence >= 50:
            best_result["confidence"] = best_confidence / 100.0  # Normalize to 0.0 - 1.0 for system compatibility
            best_result["parser_name"] = best_parser_name
            return best_result
        return None

def try_vietaccepted_detail_parser(raw_text, folder_skill):
    """Deterministic parser for PDFs with [vietacceptedsat] markers."""
    try:
        cleaned_text = clean_vietaccepted_text(raw_text)
        parts = cleaned_text.split("[vietacceptedsat]")
        if len(parts) < 2:
            return None
            
        part_before = parts[0].strip()
        part_after = parts[1].strip()

        # 1. Extract Passage
        passage = part_before
        if "Lưu\n" in raw_text and not "Lưu\n" in cleaned_text:
            pass
        else:
            passage_match = re.search(r"Lưu\n(.*?)$", part_before, re.DOTALL)
            if passage_match:
                passage = passage_match.group(1).strip()

        # Clean watermarks/metadata from passage
        passage = clean_common_watermarks(passage)
            
        # 2. Extract Choices A, B, C, D (only from part_after)
        choices = []
        labels = ['A', 'B', 'C', 'D']
        choice_texts = {}
        
        for label in labels:
            match = re.search(rf"^{label}\.\s*(.*)$", part_after, re.MULTILINE)
            if match:
                text = match.group(1).strip()
                choices.append({"label": label, "text": text})
                choice_texts[label] = text.lower()
            else:
                match_fallback = re.search(rf"{label}\.\s*([^\n\r]*)", part_after)
                if match_fallback:
                    text = match_fallback.group(1).strip()
                    choices.append({"label": label, "text": text})
                    choice_texts[label] = text.lower()

        if len(choices) < 4:
            return None

        # 3. Extract Correct Answer (from part_before explanation block)
        correct_answer = None
        true_match = re.search(r"^(.*?)\s*\((?:True|Correct)\)", part_before, re.MULTILINE | re.IGNORECASE)
        if true_match:
            correct_word = true_match.group(1).strip().lower()
            correct_word_clean = re.sub(r'^[a-d]\.\s*', '', correct_word).strip()
            
            for label, text in choice_texts.items():
                if text == correct_word_clean or correct_word_clean in text or text in correct_word_clean:
                    correct_answer = label
                    break
        
        # 4. Extract Question Stem (from part_after)
        question_stem = "Which choice completes the text with the most logical and precise word or phrase?"
        stem_match = re.search(r"Mã đề:.*?\n(.*?)\n- - — —", part_after, re.DOTALL)
        if stem_match:
            question_stem = stem_match.group(1).strip()
        else:
            stem_match2 = re.search(r"^(.*?)\n- - — —", part_after, re.DOTALL)
            if stem_match2:
                question_stem = stem_match2.group(1).strip()
            else:
                # Fallback to lines before options in part_after
                lines_after = part_after.split('\n')
                stem_lines = []
                for line in lines_after:
                    if re.match(r'^\s*[A-D]\.', line):
                        break
                    stem_lines.append(line)
                if stem_lines:
                    question_stem = "\n".join(stem_lines).strip()
                    question_stem = re.sub(r"Mã đề:\s*\S+", "", question_stem)
                    question_stem = re.sub(r"Which choice completes.*?\?", "", question_stem, flags=re.IGNORECASE)
                    question_stem = question_stem.strip()
                    if not question_stem:
                        question_stem = "Which choice completes the text with the most logical and precise word or phrase?"

        # Clean stem from division lines
        question_stem = clean_common_watermarks(question_stem)

        # 5. Extract Explanation (from part_before)
        explanation = {
            "correctReason": "No explanation provided in PDF.",
            "choiceReasons": {
                "A": "No explanation provided in PDF.",
                "B": "No explanation provided in PDF.",
                "C": "No explanation provided in PDF.",
                "D": "No explanation provided in PDF."
            }
        }
        
        expl_block_match = re.search(r"\(3\) Explanation\n(.*?)\nNhập nội dung", part_before, re.DOTALL)
        if expl_block_match:
            expl_block = expl_block_match.group(1).strip()
            
            sections = []
            for c in choices:
                c_text = c["text"]
                c_match = re.search(rf"^(?:[A-D]\.\s*)?{re.escape(c_text)}(?:\s*\(True\))?$", expl_block, re.MULTILINE | re.IGNORECASE)
                if c_match:
                    sections.append((c["label"], c_match.start()))
                else:
                    letter_match = re.search(rf"^{c['label']}\.\s*", expl_block, re.MULTILINE)
                    if letter_match:
                        sections.append((c["label"], letter_match.start()))
            
            sections.sort(key=lambda x: x[1])
            
            reasons = {}
            for idx, (label, start_pos) in enumerate(sections):
                end_pos = sections[idx+1][1] if idx + 1 < len(sections) else len(expl_block)
                sect_text = expl_block[start_pos:end_pos].strip()
                
                lines = sect_text.split('\n')
                if len(lines) > 1:
                    reason_content = "\n".join(lines[1:]).strip()
                    reasons[label] = reason_content
                else:
                    reasons[label] = sect_text
            
            for label, reason in reasons.items():
                explanation["choiceReasons"][label] = reason
                if label == correct_answer:
                    explanation["correctReason"] = reason

        title, breadcrumb = parse_sat_metadata(raw_text)
        return {
            "passage": passage,
            "questionStem": question_stem,
            "choices": choices,
            "correctAnswer": correct_answer or "",
            "explanation": explanation,
            "skill": folder_skill,
            "confidence": 100 if correct_answer else 70,
            "title": title,
            "breadcrumb": breadcrumb
        }
    except Exception:
        return None

def try_generic_multiple_choice_parser(raw_text, folder_skill):
    """Fallback parser for multiple choice questions without a specific signature."""
    try:
        cleaned_text = clean_common_watermarks(raw_text)
        lines = cleaned_text.split('\n')
        
        choice_patterns = [
            (r'^\s*A\.\s*(.*)$', r'^\s*B\.\s*(.*)$', r'^\s*C\.\s*(.*)$', r'^\s*D\.\s*(.*)$'),
            (r'^\s*A\)\s*(.*)$', r'^\s*B\)\s*(.*)$', r'^\s*C\)\s*(.*)$', r'^\s*D\)\s*(.*)$'),
            (r'^\s*\(A\)\s*(.*)$', r'^\s*\(B\)\s*(.*)$', r'^\s*\(C\)\s*(.*)$', r'^\s*\(D\)\s*(.*)$')
        ]
        
        choices = []
        choices_start_idx = -1
        
        for pat_a, pat_b, pat_c, pat_d in choice_patterns:
            a_match = b_match = c_match = d_match = None
            for idx, line in enumerate(lines):
                if re.match(pat_a, line, re.IGNORECASE):
                    a_match = (idx, re.match(pat_a, line, re.IGNORECASE).group(1).strip())
                elif re.match(pat_b, line, re.IGNORECASE):
                    b_match = (idx, re.match(pat_b, line, re.IGNORECASE).group(1).strip())
                elif re.match(pat_c, line, re.IGNORECASE):
                    c_match = (idx, re.match(pat_c, line, re.IGNORECASE).group(1).strip())
                elif re.match(pat_d, line, re.IGNORECASE):
                    d_match = (idx, re.match(pat_d, line, re.IGNORECASE).group(1).strip())
            
            if a_match and b_match and c_match and d_match:
                if a_match[0] < b_match[0] and b_match[0] < c_match[0] and c_match[0] < d_match[0]:
                    choices = [
                        {"label": "A", "text": a_match[1]},
                        {"label": "B", "text": b_match[1]},
                        {"label": "C", "text": c_match[1]},
                        {"label": "D", "text": d_match[1]}
                    ]
                    choices_start_idx = a_match[0]
                    break
        
        if len(choices) < 4:
            return None
            
        before_choices_text = "\n".join(lines[:choices_start_idx]).strip()
        
        stem_match = re.search(r"((?:Which choice|Which sentence|Which option|Based on|According to|In the text|What is|Describe).*?\?)$", before_choices_text, re.DOTALL | re.IGNORECASE)
        if stem_match:
            question_stem = stem_match.group(1).strip()
            passage = before_choices_text[:stem_match.start()].strip()
        else:
            split_lines = [l.strip() for l in before_choices_text.split('\n') if l.strip()]
            if len(split_lines) > 1:
                question_stem = split_lines[-1]
                passage = "\n".join(split_lines[:-1])
            else:
                question_stem = before_choices_text
                passage = None

        # Clean passage and stem watermarks/division lines
        if passage:
            passage = clean_common_watermarks(passage)
        question_stem = clean_common_watermarks(question_stem)
        
        correct_answer = None
        ans_patterns = [
            r"(?:Correct\s+)?Answer:\s*([A-D])",
            r"Key:\s*([A-D])",
            r"Đáp án:\s*([A-D])",
            r"\(([A-D])\)\s+is\s+correct"
        ]
        for pat in ans_patterns:
            ans_match = re.search(pat, raw_text, re.IGNORECASE)
            if ans_match:
                correct_answer = ans_match.group(1).upper()
                break
                
        if not correct_answer:
            for choice in choices:
                if re.search(rf"{choice['label']}\..*?\(True\)", raw_text, re.IGNORECASE):
                    correct_answer = choice['label']
                    break
                    
        explanation = {
            "correctReason": "No explanation found.",
            "choiceReasons": {
                "A": "No explanation found.",
                "B": "No explanation found.",
                "C": "No explanation found.",
                "D": "No explanation found."
            }
        }
        
        expl_match = re.search(r"(?:Explanation|Giải thích):\n(.*)$", raw_text, re.DOTALL | re.IGNORECASE)
        if expl_match:
            explanation["correctReason"] = expl_match.group(1).strip()
            
        title, breadcrumb = parse_sat_metadata(raw_text)
        return {
            "passage": passage,
            "questionStem": question_stem,
            "choices": choices,
            "correctAnswer": correct_answer or "",
            "explanation": explanation,
            "skill": folder_skill,
            "confidence": 85 if correct_answer else 65,
            "title": title,
            "breadcrumb": breadcrumb
        }
    except Exception:
        return None

def try_abcd_parentheses_parser(raw_text, folder_skill):
    """Parser for parenthesized choices like (A) option1 (B) option2."""
    try:
        cleaned_text = clean_common_watermarks(raw_text)
        lines = cleaned_text.split('\n')
        
        choices = []
        choices_start_idx = -1
        
        # 1. Inline single line options: (A) xxx (B) yyy (C) zzz (D) www
        inline_pat = r'(?:\s|^)\(A\)\s*(.*?)\s*\(B\)\s*(.*?)\s*\(C\)\s*(.*?)\s*\(D\)\s*(.*)$'
        for idx, line in enumerate(lines):
            match = re.search(inline_pat, line, re.IGNORECASE)
            if match:
                choices = [
                    {"label": "A", "text": match.group(1).strip()},
                    {"label": "B", "text": match.group(2).strip()},
                    {"label": "C", "text": match.group(3).strip()},
                    {"label": "D", "text": match.group(4).strip()}
                ]
                choices_start_idx = idx
                break
                
        # 2. Newline-separated options: (A) xxx \n (B) yyy
        if len(choices) < 4:
            pat_a, pat_b, pat_c, pat_d = (
                r'^\s*\(A\)\s*(.*)$',
                r'^\s*\(B\)\s*(.*)$',
                r'^\s*\(C\)\s*(.*)$',
                r'^\s*\(D\)\s*(.*)$'
            )
            a_match = b_match = c_match = d_match = None
            for idx, line in enumerate(lines):
                if re.match(pat_a, line, re.IGNORECASE):
                    a_match = (idx, re.match(pat_a, line, re.IGNORECASE).group(1).strip())
                elif re.match(pat_b, line, re.IGNORECASE):
                    b_match = (idx, re.match(pat_b, line, re.IGNORECASE).group(1).strip())
                elif re.match(pat_c, line, re.IGNORECASE):
                    c_match = (idx, re.match(pat_c, line, re.IGNORECASE).group(1).strip())
                elif re.match(pat_d, line, re.IGNORECASE):
                    d_match = (idx, re.match(pat_d, line, re.IGNORECASE).group(1).strip())
            
            if a_match and b_match and c_match and d_match:
                if a_match[0] < b_match[0] and b_match[0] < c_match[0] and c_match[0] < d_match[0]:
                    choices = [
                        {"label": "A", "text": a_match[1]},
                        {"label": "B", "text": b_match[1]},
                        {"label": "C", "text": c_match[1]},
                        {"label": "D", "text": d_match[1]}
                    ]
                    choices_start_idx = a_match[0]
        
        if len(choices) < 4:
            return None
            
        before_choices_text = "\n".join(lines[:choices_start_idx]).strip()
        
        stem_match = re.search(r"((?:Which choice|Which sentence|Which option|Based on|According to|In the text|What is|Describe).*?\?)$", before_choices_text, re.DOTALL | re.IGNORECASE)
        if stem_match:
            question_stem = stem_match.group(1).strip()
            passage = before_choices_text[:stem_match.start()].strip()
        else:
            split_lines = [l.strip() for l in before_choices_text.split('\n') if l.strip()]
            if len(split_lines) > 1:
                question_stem = split_lines[-1]
                passage = "\n".join(split_lines[:-1])
            else:
                question_stem = before_choices_text
                passage = None
        
        if passage:
            passage = clean_common_watermarks(passage)
        question_stem = clean_common_watermarks(question_stem)
        
        correct_answer = None
        ans_patterns = [
            r"(?:Correct\s+)?Answer:\s*([A-D])",
            r"Key:\s*([A-D])",
            r"Đáp án:\s*([A-D])",
            r"\(([A-D])\)\s+is\s+correct"
        ]
        for pat in ans_patterns:
            ans_match = re.search(pat, raw_text, re.IGNORECASE)
            if ans_match:
                correct_answer = ans_match.group(1).upper()
                break
                
        title, breadcrumb = parse_sat_metadata(raw_text)
        return {
            "passage": passage,
            "questionStem": question_stem,
            "choices": choices,
            "correctAnswer": correct_answer or "",
            "explanation": {
                "correctReason": "No explanation found.",
                "choiceReasons": {"A": "No explanation found.", "B": "No explanation found.", "C": "No explanation found.", "D": "No explanation found."}
            },
            "skill": folder_skill,
            "confidence": 85 if correct_answer else 65,
            "title": title,
            "breadcrumb": breadcrumb
        }
    except Exception:
        return None

def try_answer_key_at_bottom_parser(raw_text, folder_skill):
    """Looks for explicit Answer Key listings at the bottom of the page."""
    try:
        lines = raw_text.strip().split('\n')
        bottom_section = "\n".join(lines[-10:])
        
        match = re.search(r"\b(?:Answer|Key|Đáp án|Correct)\s*[:=-]?\s*\b([A-D])\b", bottom_section, re.IGNORECASE)
        if match:
            res = try_generic_multiple_choice_parser(raw_text, folder_skill)
            if res and not res.get("correctAnswer"):
                res["correctAnswer"] = match.group(1).upper()
                res["confidence"] = 80
                return res
        return None
    except Exception:
        return None

def try_generic_two_column_parser(raw_text, folder_skill):
    """Detects tabular or side-by-side choices and aligns them."""
    try:
        cleaned_text = clean_common_watermarks(raw_text)
        lines = cleaned_text.split('\n')
        
        col_lines = []
        for line in lines:
            parts = re.split(r'\s{3,}', line.strip())
            if len(parts) >= 2:
                col_lines.append(parts)
                
        if len(col_lines) < 4:
            return None
            
        choices = []
        for row in col_lines:
            for part in row:
                match = re.match(r'^\s*([A-D])\.\s*(.*)$', part, re.IGNORECASE)
                if match:
                    choices.append({"label": match.group(1).upper(), "text": match.group(2).strip()})
                    
        unique_choices = []
        seen_labels = set()
        for c in choices:
            if c["label"] not in seen_labels:
                seen_labels.add(c["label"])
                unique_choices.append(c)
                
        if len(unique_choices) == 4:
            res = try_generic_multiple_choice_parser(raw_text, folder_skill)
            if res:
                res["choices"] = sorted(unique_choices, key=lambda x: x["label"])
                res["confidence"] = 75
                return res
        return None
    except Exception:
        return None

# Register all local parsers
registry = ParserRegistry()
registry.register("vietaccepted_detail", try_vietaccepted_detail_parser)
registry.register("abcd_parentheses", try_abcd_parentheses_parser)
registry.register("answer_key_at_bottom", try_answer_key_at_bottom_parser)
registry.register("generic_two_column", try_generic_two_column_parser)
registry.register("generic_mcq", try_generic_multiple_choice_parser)

def local_parse(raw_text, folder_skill):
    """Runs all registered parsers and returns the highest confidence result."""
    return registry.parse(raw_text, folder_skill)

def call_gemini_api(model, raw_text, folder_skill):
    """Call Gemini to normalize the raw text into structured JSON with automatic rate limit retries."""
    prompt = f"""
You are an expert SAT content parser. Your job is to extract a single SAT question from the raw text of a PDF document and output it in a structured JSON format.

Here is the raw text of the question page:
---
{raw_text}
---

Suggested Skill/Category: {folder_skill}

Please analyze the text and extract the following:
1. **passage**: The main text or passage associated with the question. This is the context paragraph.
2. **questionStem**: The actual question asked (e.g. "Which choice completes the text with the most logical and precise word or phrase?").
3. **choices**: An array of exactly 4 choices (A, B, C, D). Each choice should have a "label" (A, B, C, D) and "text" (the text content of the option).
4. **correctAnswer**: The correct option letter ("A", "B", "C", or "D"). Look closely at the explanation or answer key in the text.
5. **explanation**: An object containing:
   - "correctReason": Why the correct answer is right.
   - "choiceReasons": An object with keys "A", "B", "C", "D" explaining why each choice is correct or incorrect.
6. **skill**: The sub-skill category.

Rules:
- Strip out watermarks, page numbers, website footers/menus, email addresses, and account names.
- Do NOT fabricate any details. Extract only what is present in the text.
- Output MUST be valid JSON conforming to the schema below.

JSON Output Schema:
{{
  "passage": "string or null",
  "questionStem": "string",
  "choices": [
    {{ "label": "A", "text": "string" }},
    {{ "label": "B", "text": "string" }},
    {{ "label": "C", "text": "string" }},
    {{ "label": "D", "text": "string" }}
  ],
  "correctAnswer": "A|B|C|D|null",
  "explanation": {{
    "correctReason": "string",
    "choiceReasons": {{
      "A": "string",
      "B": "string",
      "C": "string",
      "D": "string"
    }}
  }},
  "skill": "string",
  "confidence": 0.0 to 1.0
}}
"""
    max_retries = 3
    retry_delay = 20  # Delay in seconds
    
    for attempt in range(max_retries):
        try:
            response = model.generate_content(
                prompt,
                generation_config={"response_mime_type": "application/json"}
            )
            data = json.loads(response.text)
            return data
        except Exception as e:
            err_msg = str(e)
            print(f"\nGemini API Error: {err_msg}.", file=sys.stderr)
            
            is_rate_limit = any(term in err_msg.lower() for term in ["429", "quota", "resourceexhausted", "limit"])
            if is_rate_limit and attempt < max_retries - 1:
                print(f"[Rate Limit] Vượt giới hạn API. Đang chờ {retry_delay} giây trước khi thử lại (Lần thử {attempt + 2}/{max_retries})...")
                time.sleep(retry_delay)
            else:
                break
    return None

def main():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    manifest_path = os.path.join(root_dir, "data", "manifests", "import-manifest.json")
    
    if not os.path.exists(manifest_path):
        print(f"Manifest not found at: {manifest_path}", file=sys.stderr)
        sys.exit(1)
        
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)
        
    client = get_gemini_client()
    model = None
    if client:
        model = client.GenerativeModel("gemini-2.5-flash")
        
    extracted_dir = os.path.join(root_dir, "data", "extracted")
    normalized_dir = os.path.join(root_dir, "data", "normalized")
    os.makedirs(normalized_dir, exist_ok=True)
    
    total_normalized = 0
    local_count = 0
    ai_count = 0
    
    files_to_process = []
    for folder in manifest["folders"]:
        folder_id = folder["folderId"]
        suggested_skill = folder["suggestedSkill"]
        for file_info in folder["files"]:
            # Process files that are not fully normalized or approved yet
            if file_info.get("status") in ("pending", "extracted", "normalized", "failed"):
                files_to_process.append((folder_id, suggested_skill, file_info))
                
    if not files_to_process:
        print("No files pending normalization.")
        sys.exit(0)
        
    print(f"Starting normalization for {len(files_to_process)} files...")
    
    for i, (folder_id, suggested_skill, file_info) in enumerate(files_to_process):
        filename = file_info["fileName"]
        extracted_rel_path = file_info.get("extractedJsonPath")
        
        if not extracted_rel_path:
            extracted_rel_path = f"data/extracted/{folder_id}/{filename.replace('.pdf', '.extracted.json')}"
            
        extracted_abs_path = os.path.join(root_dir, extracted_rel_path)
        
        print(f"Normalizing [{i+1}/{len(files_to_process)}]: {filename} ... ", end="", flush=True)
        
        if not os.path.exists(extracted_abs_path):
            print(f"FAILED (extracted file missing: {extracted_rel_path})")
            continue
            
        with open(extracted_abs_path, "r", encoding="utf-8") as f:
            extracted_data = json.load(f)
            
        raw_text = "\n".join([p["rawText"] for p in extracted_data["pages"]])
        
        # 1. Try local deterministic parser first
        normalized_data = local_parse(raw_text, suggested_skill)
        
        if normalized_data:
            local_count += 1
            method_used = "local_regex"
        else:
            # Check if AI Fallback is enabled in env
            ai_fallback_enabled = os.environ.get("AI_FALLBACK_ENABLED", "false").lower() == "true"
            # 2. Fallback to Gemini AI
            if model and ai_fallback_enabled:
                # Add small sleep to avoid rate limits
                time.sleep(1)
                normalized_data = call_gemini_api(model, raw_text, suggested_skill)
                if normalized_data:
                    ai_count += 1
                    method_used = "gemini_ai"
                else:
                    method_used = "failed"
            else:
                method_used = "failed"
                
        # If still no normalized data, generate a skeleton question for manual review and log failure
        if not normalized_data:
            # Failure logging
            try:
                logs_dir = os.path.join(root_dir, "data", "logs")
                os.makedirs(logs_dir, exist_ok=True)
                failures_path = os.path.join(logs_dir, "parser_failures.json")
                
                failure_entry = {
                    "fileName": filename,
                    "folderId": folder_id,
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "rawTextPreview": raw_text[:800]
                }
                
                failures = []
                if os.path.exists(failures_path):
                    with open(failures_path, "r", encoding="utf-8") as lf:
                        failures = json.load(lf)
                
                failures.append(failure_entry)
                failures = failures[-100:]  # Limit to last 100 entries
                with open(failures_path, "w", encoding="utf-8") as lf:
                    json.dump(failures, lf, indent=2, ensure_ascii=False)
            except Exception as le:
                print(f"[Logging Error] Failed to write parser failure log: {le}", file=sys.stderr)

            normalized_data = {
                "passage": raw_text,
                "questionStem": "Chưa nhận diện được cấu trúc câu hỏi tự động. Vui lòng kiểm tra và chỉnh sửa thủ công câu hỏi này.",
                "choices": [
                    {"label": "A", "text": "Lựa chọn A"},
                    {"label": "B", "text": "Lựa chọn B"},
                    {"label": "C", "text": "Lựa chọn C"},
                    {"label": "D", "text": "Lựa chọn D"}
                ],
                "correctAnswer": "A",
                "explanation": {
                    "correctReason": "Chưa có giải thích.",
                    "choiceReasons": {
                        "A": "Chưa có giải thích.",
                        "B": "Chưa có giải thích.",
                        "C": "Chưa có giải thích.",
                        "D": "Chưa có giải thích."
                    }
                },
                "skill": suggested_skill
            }
            method_used = "manual_review_skeleton"
            
        # Structure output JSON
        normalized_output = {
            "schemaVersion": "1.0",
            "source": {
                "fileName": filename,
                "relativePath": file_info["relativePath"],
                "sha256": file_info["sha256"]
            },
            "classification": {
                "folderSkill": folder_id,
                "detectedSkill": normalized_data.get("skill", folder_id),
                "skillConflict": folder_id != normalized_data.get("skill", "").lower().replace(" ", "-")
            },
            "questions": [
                {
                    "questionId": f"q-{file_info['sha256'][:10]}",
                    "passage": normalized_data.get("passage"),
                    "questionStem": normalized_data.get("questionStem"),
                    "choices": normalized_data.get("choices"),
                    "correctAnswer": normalized_data.get("correctAnswer"),
                    "explanation": normalized_data.get("explanation"),
                    "reviewStatus": "pending_review"
                }
            ],
            "normalizationMethod": method_used,
            "status": "normalized"
        }
        
        # Save file
        folder_normalized_dir = os.path.join(normalized_dir, folder_id)
        os.makedirs(folder_normalized_dir, exist_ok=True)
        
        dest_json_name = Path(filename).with_suffix(".normalized.json").name
        dest_json_path = os.path.join(folder_normalized_dir, dest_json_name)
        
        with open(dest_json_path, "w", encoding="utf-8") as out_f:
            json.dump(normalized_output, out_f, indent=2, ensure_ascii=False)
            
        # Update manifest
        file_info["status"] = "normalized"
        file_info["normalizedJsonPath"] = os.path.relpath(dest_json_path, root_dir).replace("\\", "/")
        total_normalized += 1
        print(f"DONE ({method_used})")
        
        # Save manifest intermittently
        if total_normalized % 10 == 0:
            with open(manifest_path, "w", encoding="utf-8") as f:
                json.dump(manifest, f, indent=2, ensure_ascii=False)
                
    # Save final manifest
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        
    print(f"\nNormalization completed successfully.")
    print(f"Total processed: {total_normalized}")
    print(f" - Local Regex: {local_count}")
    print(f" - Gemini API: {ai_count}")

if __name__ == "__main__":
    main()
