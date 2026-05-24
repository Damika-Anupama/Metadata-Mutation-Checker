# Metadata Mutation Checker Frontend

Single-deploy Next.js app for the PDF Metadata Mutation Checker portfolio demo.

## Local Development

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## API

The PDF analysis runs in the same Next.js deployment:

```text
POST /api/analyze
```

Upload field:

```text
file
```

## Deploy on Vercel

Use the `frontend` folder as the Vercel root directory.

Build command:

```bash
npm run build
```

Output is handled by Next.js automatically.

Optional environment variable:

```text
MAX_UPLOAD_SIZE_MB=8
```
