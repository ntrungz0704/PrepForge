import os
import json
import sys
from pathlib import Path

def extract_pdf_text_pypdf(filepath):
    """Extract text from PDF using pypdf."""
    import pypdf
    reader = pypdf.PdfReader(filepath)
    pages_data = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        pages_data.append({
            "pageNumber": i + 1,
            "rawText": text
        })
    return pages_data

def extract_pdf_text_fitz(filepath):
    """Extract text from PDF using PyMuPDF (fitz) which is faster and cleaner."""
    import fitz
    doc = fitz.open(filepath)
    pages_data = []
    for i, page in enumerate(doc):
        # Extract text blocks with layout info
        text = page.get_text("text") or ""
        pages_data.append({
            "pageNumber": i + 1,
            "rawText": text
        })
    return pages_data

def extract_pdf_text_ocr(filepath):
    """Extract text using pdf2image and pytesseract for scanned pages."""
    try:
        from pdf2image import convert_from_path
        import pytesseract
        
        # Check if tesseract is in default Windows path
        tesseract_win = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
        if os.path.exists(tesseract_win):
            pytesseract.pytesseract.tesseract_cmd = tesseract_win
            
        images = convert_from_path(filepath)
        pages_data = []
        for i, img in enumerate(images):
            text = pytesseract.image_to_string(img) or ""
            pages_data.append({
                "pageNumber": i + 1,
                "rawText": text
            })
        return pages_data, "ocr_tesseract"
    except Exception as e:
        return None, str(e)

def extract_file(filepath):
    """Try to extract text using fitz, fallback to pypdf, fallback to OCR if empty."""
    pages_data = []
    method = ""
    
    try:
        import fitz
        pages_data = extract_pdf_text_fitz(filepath)
        method = "pymupdf"
    except ImportError:
        try:
            import pypdf
            pages_data = extract_pdf_text_pypdf(filepath)
            method = "pypdf"
        except ImportError:
            raise ImportError("Neither PyMuPDF (fitz) nor pypdf is installed in this Python environment.")
            
    has_text = any(len(p["rawText"].strip()) > 30 for p in pages_data)
    
    if not has_text:
        # Attempt OCR fallback
        ocr_data, ocr_msg = extract_pdf_text_ocr(filepath)
        if ocr_data:
            return ocr_data, ocr_msg
            
    return pages_data, method

def main():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    manifest_path = os.path.join(root_dir, "data", "manifests", "import-manifest.json")
    
    if not os.path.exists(manifest_path):
        print(f"Manifest not found at: {manifest_path}", file=sys.stderr)
        sys.exit(1)
        
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)
        
    extracted_dir = os.path.join(root_dir, "data", "extracted")
    os.makedirs(extracted_dir, exist_ok=True)
    
    total_extracted = 0
    total_files = manifest["summary"]["totalPdfFiles"]
    
    print("Starting text extraction phase...")
    
    # Iterate through folders and files
    for folder in manifest["folders"]:
        folder_id = folder["folderId"]
        folder_extracted_dir = os.path.join(extracted_dir, folder_id)
        os.makedirs(folder_extracted_dir, exist_ok=True)
        
        for file_info in folder["files"]:
            if file_info.get("status") != "pending":
                continue
                
            filename = file_info["fileName"]
            rel_path = file_info["relativePath"]
            abs_filepath = os.path.join(root_dir, rel_path)
            
            print(f"Extracting [{total_extracted + 1}/{total_files}]: {rel_path} ...", end="", flush=True)
            
            try:
                pages_data, method = extract_file(abs_filepath)
                
                # Create extraction result JSON
                extracted_result = {
                    "schemaVersion": "1.0",
                    "source": {
                        "fileName": filename,
                        "relativePath": rel_path,
                        "sha256": file_info["sha256"],
                        "pageCount": len(pages_data)
                    },
                    "extraction": {
                        "method": method,
                        "hasEmbeddedText": any(len(p["rawText"].strip()) > 0 for p in pages_data),
                        "usedOcr": False
                    },
                    "pages": pages_data,
                    "status": "extracted"
                }
                
                # Save extracted file
                dest_json_name = Path(filename).with_suffix(".extracted.json").name
                dest_json_path = os.path.join(folder_extracted_dir, dest_json_name)
                
                with open(dest_json_path, "w", encoding="utf-8") as out_f:
                    json.dump(extracted_result, out_f, indent=2, ensure_ascii=False)
                    
                file_info["status"] = "extracted"
                file_info["extractedJsonPath"] = os.path.relpath(dest_json_path, root_dir).replace("\\", "/")
                total_extracted += 1
                print(" DONE")
                
                # Write back manifest intermittently to prevent data loss
                if total_extracted % 5 == 0:
                    with open(manifest_path, "w", encoding="utf-8") as f:
                        json.dump(manifest, f, indent=2, ensure_ascii=False)
                        
            except Exception as e:
                file_info["status"] = "failed"
                file_info["error"] = str(e)
                print(f" FAILED ({e})")
                
    # Save final manifest
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        
    print(f"Extraction completed. Successfully extracted {total_extracted} files.")

if __name__ == "__main__":
    main()
