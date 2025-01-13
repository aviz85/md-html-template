# API Endpoints

Base URL: `https://md-html-template.vercel.app`

## Convert Markdown to HTML
`POST /api/convert`

Converts an array of Markdown content to HTML with a styled template.

### Request
```json
{
  "markdowns": [
    "# First Document\n\nThis is document 1",
    "# Second Document\n\nThis is document 2",
    "# Third Document\n\nThis is document 3"
  ],
  "template_id": "google-sheet-id",
  "template": {
    "template_id": "google-sheet-id",
    "id": "google-sheet-id",
    "css": "custom CSS",
    "header_content": "header content (optional)",
    "footer_content": "footer content (optional)",
    "custom_fonts": [
      {
        "name": "font name",
          "file_path": "font file path",
        "font_family": "font family",
        "format": "font format"
      }
    ]
  }
}
```

### Response
```json
{
  "htmls": [
    "<!DOCTYPE html><html dir=\"rtl\">...(HTML for first document)...</html>",
    "<!DOCTYPE html><html dir=\"rtl\">...(HTML for second document)...</html>",
    "<!DOCTYPE html><html dir=\"rtl\">...(HTML for third document)...</html>"
  ]
}
```

### Full Example
```bash
# Using root level template_id
curl -X POST https://md-html-template.vercel.app/api/convert \
  -H "Content-Type: application/json" \
  -d '{
    "markdowns": [
      "# Document 1\n\nFirst content\n\n- Item 1.1\n- Item 1.2",
      "# Document 2\n\nSecond content\n\n- Item 2.1\n- Item 2.2"
    ],
    "template_id": "1hKt-OyUa-_01MzMJnw_Xa6lo-XizF4HJPH6aVSbcgBU"
  }'

# Using template object
curl -X POST https://md-html-template.vercel.app/api/convert \
  -H "Content-Type: application/json" \
  -d '{
    "markdowns": [
      "# Document 1\n\nFirst content\n\n- Item 1.1\n- Item 1.2",
      "# Document 2\n\nSecond content\n\n- Item 2.1\n- Item 2.2"
    ],
    "template": {
      "template_id": "1hKt-OyUa-_01MzMJnw_Xa6lo-XizF4HJPH6aVSbcgBU"
    }
  }'
```

Example Response:
```json
{
  "htmls": [
    "<!DOCTYPE html><html dir=\"rtl\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"><link href=\"https://fonts.googleapis.com/css2?family=Assistant:wght@400;500;700&display=swap\" rel=\"stylesheet\"><style>/* Template styles */</style></head><body><h1>Document 1</h1><p>First content</p><ul><li>Item 1.1</li><li>Item 1.2</li></ul></body></html>",
    "<!DOCTYPE html><html dir=\"rtl\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"><link href=\"https://fonts.googleapis.com/css2?family=Assistant:wght@400;500;700&display=swap\" rel=\"stylesheet\"><style>/* Template styles */</style></head><body><h1>Document 2</h1><p>Second content</p><ul><li>Item 2.1</li><li>Item 2.2</li></ul></body></html>"
  ]
}
```

## List Templates
`GET /api/templates/list`

Returns a list of all available templates.

### Response
```json
{
  "templates": [
    {
      "id": "template-id",
      "name": "template name",
      "template_gsheets_id": "Google Sheet ID (optional)"
    }
  ]
}
```

## Save Template
`POST /api/templates`

Creates or updates a template.

### Request```json
{
  "id": "template-id (optional for new template)",
  "name": "template name",
  "template_gsheets_id": "Google Sheet ID (optional)",
  "header_content": "header content (optional)",
  "footer_content": "footer content (optional)",
  "custom_fonts": [],
  "css": "CSS definitions",
  "color1": "#color1",
  "color2": "#color2",
  "color3": "#color3",
  "color4": "#color4"
}
```

### Response
- Success: `Template saved successfully`
- Failure: `Error saving template`

## Upload Fonts
`POST /api/fonts`

Uploads a custom font for a template.

### Request```json
{
  "templateId": "template-id",
  "fontName": "font name",
  "fileExt": "file extension (woff2/woff/ttf/otf)",
  "fileData": "font file byte array"
}
```

### Response
```json
{
  "fonts": [
    {
      "name": "font name",
      "file_path": "font file path",
      "font_family": "font family",
      "format": "font format"
    }
  ]
}
```

## Usage Examples

### Converting Markdown with Existing Template
```bash
curl -X POST https://md-html-template.vercel.app/api/convert \
  -H "Content-Type: application/json" \
  -d '{
    "markdown": "# Title\\n\\nExample content\\n\\n- Item 1\\n- Item 2",
    "template": {
      "id": "419860f3-bea1-4453-830e-55714131f7b6"
    }
  }'
```

### Getting Template List
```bash
curl https://md-html-template.vercel.app/api/templates/list


