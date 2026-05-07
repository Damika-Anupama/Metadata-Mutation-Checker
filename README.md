# Document Metadata Mutation Checker

## Overview

This project is a full-stack application enabling users to upload PDF documents for metadata analysis. It extracts metadata and performs rule-based checks to highlight potential indicators of metadata mutations, though it does not confirm document tampering and only flags signals for manual review.

## Tech Stack

- Python
- FastAPI
- pypdf
- React
- Next.js
- Tailwind CSS

## Features

- PDF file upload
- Metadata extraction
- Rule-based suspicious metadata checks
- Risk score generation
- Risk level classification
- Findings with severity and confidence
- Recommended action
- Downloadable JSON report

## Metadata Fields Extracted

- File name
- File size
- File type
- PDF version
- Created date
- Modified date
- Author
- Creator
- Producer
- Title
- Subject
- Page count
- Encryption status

## Rules Implemented

### Date Checks

- Modified date exists but created date is missing
- Modified date is earlier than created date
- Modified date is much later than created date
- Created or modified date format is unusual
- Created and modified dates are missing

### Software Checks

- Creator and producer mismatch
- Metadata references editing/export tools such as Acrobat, Preview, Photoshop, Illustrator, Canva, scanner software, or online PDF editors

### Missing Metadata Checks

- Missing author
- Missing title

### Structural Checks

- PDF encryption status
- Zero page count

## Risk Scoring Logic

Each finding contributes to the final score based on severity and confidence.

Severity weights:

- Low: 10
- Medium: 25
- High: 45

The score is adjusted if multiple categories of findings are found together.

Weak findings alone are capped so that harmless metadata issues do not create a high-risk result.

Risk levels:

- 0–30: Low
- 31–65: Medium
- 66–100: High

## Setup Instructions

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
````

Backend runs at:

```text
http://127.0.0.1:8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at:

```text
http://localhost:3000
```

## Limitations

* This tool mainly supports PDF files.
* Metadata indicators are not proof of tampering.
* Some PDF generators do not save complete metadata.
* Scanned PDFs may contain limited metadata.
* Deep forensic checks are outside the scope of this assignment.

## Future Improvements

* Support JPG and PNG EXIF metadata
* Support DOCX metadata extraction
* Detect PDF incremental updates
* Compare two documents
* Generate a PDF summary report
* Show raw metadata and interpreted metadata separately
* Add technical and simple explanation modes
