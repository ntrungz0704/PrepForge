import os
import hashlib
import json
import sys
from pathlib import Path

def calculate_sha256(filepath):
    """Calculate SHA-256 hash of a file."""
    sha256_hash = hashlib.sha256()
    with open(filepath, "rb") as f:
        # Read in chunks of 4096 bytes
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def scan_pdfs(root_dir):
    """Scan root_dir recursively for PDF files, ignoring system directories."""
    root_path = Path(root_dir).resolve()
    print(f"Scanning directory: {root_path}")
    
    # Folders to ignore
    ignore_dirs = {'.venv', '.git', 'web', 'data', 'scripts', 'node_modules'}
    
    pdf_files_by_folder = {}
    total_files = 0
    total_bytes = 0
    hashes = {}
    duplicates = []
    
    for dirpath, dirnames, filenames in os.walk(root_path):
        # Filter out ignored directories in-place to prevent os.walk from entering them
        dirnames[:] = [d for d in dirnames if d not in ignore_dirs and not d.startswith('.')]
        
        # Get relative folder path from root
        rel_dir = os.path.relpath(dirpath, root_path)
        folder_name = os.path.basename(dirpath)
        
        # If we are at the root, skip
        if rel_dir == '.':
            continue
            
        pdf_files = [f for f in filenames if f.lower().endswith('.pdf')]
        if not pdf_files:
            continue
            
        folder_id = folder_name.lower().replace(" ", "-")
        
        if folder_id not in pdf_files_by_folder:
            pdf_files_by_folder[folder_id] = {
                "folderId": folder_id,
                "folderName": folder_name,
                "relativePath": rel_dir.replace("\\", "/"),
                "suggestedSkill": folder_name.replace("_", " ").title(),
                "files": []
            }
            
        for filename in pdf_files:
            filepath = os.path.join(dirpath, filename)
            rel_filepath = os.path.relpath(filepath, root_path)
            
            try:
                size_bytes = os.path.getsize(filepath)
                file_hash = calculate_sha256(filepath)
                
                file_info = {
                    "fileName": filename,
                    "relativePath": rel_filepath.replace("\\", "/"),
                    "sizeBytes": size_bytes,
                    "sha256": file_hash,
                    "status": "pending"
                }
                
                # Check for duplicates
                if file_hash in hashes:
                    duplicates.append({
                        "file1": hashes[file_hash],
                        "file2": rel_filepath.replace("\\", "/")
                    })
                else:
                    hashes[file_hash] = rel_filepath.replace("\\", "/")
                    
                pdf_files_by_folder[folder_id]["files"].append(file_info)
                total_files += 1
                total_bytes += size_bytes
                
            except Exception as e:
                print(f"Error processing {filename}: {e}", file=sys.stderr)
                
    # Prepare final manifest JSON
    manifest = {
        "importId": f"prepforge-import-{int(os.path.getctime(root_path))}",
        "sourceRoot": str(root_path).replace("\\", "/"),
        "summary": {
            "totalFolders": len(pdf_files_by_folder),
            "totalPdfFiles": total_files,
            "totalBytes": total_bytes,
            "duplicateCount": len(duplicates),
            "duplicates": duplicates
        },
        "folders": list(pdf_files_by_folder.values())
    }
    
    return manifest

def main():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    manifest = scan_pdfs(root_dir)
    
    # Save manifest
    manifest_dir = os.path.join(root_dir, "data", "manifests")
    os.makedirs(manifest_dir, exist_ok=True)
    manifest_path = os.path.join(manifest_dir, "import-manifest.json")
    
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        
    print(f"Manifest written to: {manifest_path}")
    print(f"Found {manifest['summary']['totalPdfFiles']} PDF files in {manifest['summary']['totalFolders']} folders.")
    if manifest['summary']['duplicateCount'] > 0:
        print(f"Warning: Found {manifest['summary']['duplicateCount']} duplicate files!")

if __name__ == "__main__":
    main()
