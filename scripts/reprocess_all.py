import os
import json
import re
import sys
from pathlib import Path

# Add scripts directory to path to import normalize_ai
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from normalize_ai import local_parse

def main():
    root_dir = Path(__file__).parent.parent
    manifest_path = root_dir / "data" / "manifests" / "import-manifest.json"
    db_path = root_dir / "data" / "db.json"
    normalized_dir = root_dir / "data" / "normalized"
    
    if not manifest_path.exists():
        print("Manifest file not found.")
        return
        
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)
        
    if not db_path.exists():
        print("db.json file not found.")
        return
        
    with open(db_path, "r", encoding="utf-8") as f:
        db = json.load(f)
        
    # Build a map of existing questions by ID to preserve approval status
    questions_list = db.get("questions", [])
    
    # We will rebuild the questions list by replacing/updating them
    # Keep track of updated count
    updated_count = 0
    total_files = 0
    
    for folder in manifest["folders"]:
        folder_id = folder["folderId"]
        suggested_skill = folder["suggestedSkill"]
        
        for file_info in folder["files"]:
            filename = file_info["fileName"]
            sha256 = file_info["sha256"]
            old_status = file_info.get("status", "pending")
            total_files += 1
            
            # Find the extracted JSON
            extracted_rel = file_info.get("extractedJsonPath")
            if not extracted_rel:
                extracted_rel = f"data/extracted/{folder_id}/{filename.replace('.pdf', '.extracted.json')}"
            extracted_abs = root_dir / extracted_rel
            
            if not extracted_abs.exists():
                print(f"Skipping {filename}: extracted text missing at {extracted_rel}")
                continue
                
            with open(extracted_abs, "r", encoding="utf-8") as f:
                extracted_data = json.load(f)
                
            raw_text = "\n".join([p["rawText"] for p in extracted_data["pages"]])
            
            # Re-parse raw text using the updated parser
            parsed = local_parse(raw_text, suggested_skill)
            
            if not parsed:
                # Generate fallback skeleton
                parsed = {
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
                method = "manual_review_skeleton"
            else:
                method = "local_regex"
                
            q_id = f"q-{sha256[:10]}"
            
            # Create question structure
            db_question = {
                "questionId": q_id,
                "passage": parsed.get("passage"),
                "questionStem": parsed.get("questionStem"),
                "choices": parsed.get("choices"),
                "correctAnswer": parsed.get("correctAnswer") or "",
                "explanation": parsed.get("explanation"),
                "skill": suggested_skill,
                "folderId": folder_id,
                "sourceFileId": f"file-{sha256}",
                "approvedAt": file_info.get("approvedAt") or "2026-07-17T19:01:27.155Z",
                "title": parsed.get("title"),
                "breadcrumb": parsed.get("breadcrumb"),
                "confidence": parsed.get("confidence", 0.0),
                "parserName": parsed.get("parser_name", "manual_review_skeleton")
            }
            
            # Remove old question with this ID if it exists
            questions_list = [q for q in questions_list if q["questionId"] != q_id]
            questions_list.append(db_question)
            
            # Save normalized JSON file
            folder_normalized_dir = normalized_dir / folder_id
            folder_normalized_dir.mkdir(parents=True, exist_ok=True)
            dest_json_name = Path(filename).with_suffix(".normalized.json").name
            dest_json_path = folder_normalized_dir / dest_json_name
            
            normalized_output = {
                "schemaVersion": "1.0",
                "source": {
                    "fileName": filename,
                    "relativePath": file_info["relativePath"],
                    "sha256": sha256
                },
                "classification": {
                    "folderSkill": folder_id,
                    "detectedSkill": parsed.get("skill", folder_id),
                    "skillConflict": False
                },
                "questions": [
                    {
                        "questionId": q_id,
                        "passage": parsed.get("passage"),
                        "questionStem": parsed.get("questionStem"),
                        "choices": parsed.get("choices"),
                        "correctAnswer": parsed.get("correctAnswer"),
                        "explanation": parsed.get("explanation"),
                        "reviewStatus": "approved" if old_status == "approved" else "pending_review",
                        "title": parsed.get("title"),
                        "breadcrumb": parsed.get("breadcrumb"),
                        "confidence": parsed.get("confidence", 0.0),
                        "parserName": parsed.get("parser_name", "manual_review_skeleton")
                    }
                ],
                "normalizationMethod": method,
                "status": "normalized"
            }
            
            with open(dest_json_path, "w", encoding="utf-8") as out_f:
                json.dump(normalized_output, out_f, indent=2, ensure_ascii=False)
                
            # Update manifest paths
            file_info["normalizedJsonPath"] = str(dest_json_path.relative_to(root_dir)).replace("\\", "/")
            if file_info["status"] in ("pending", "extracted"):
                file_info["status"] = "normalized"
                
            updated_count += 1
            print(f"[{updated_count}/{total_files}] Reprocessed {filename} -> {method}")
            
    # Save back to db.json
    db["questions"] = questions_list
    with open(db_path, "w", encoding="utf-8") as f:
        json.dump(db, f, indent=2, ensure_ascii=False)
        
    # Save manifest
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        
    print("\nReprocessing finished successfully!")
    print(f"Total files reprocessed: {updated_count}")

if __name__ == "__main__":
    main()
