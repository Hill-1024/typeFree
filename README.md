# TypeFree React

A Typora-like rich text editor built with React. The editor keeps Markdown as the source of truth and projects it into a block-based WYSIWYG view.

## Features

- **Real-time WYSIWYG Editing**: Click any block to edit its raw Markdown, then click away to see it rendered.
- **LaTeX Support**: Inline and block math powered by MathJax.
- **Mermaid Diagrams**: Support for Mermaid charts and diagrams.
- **Block-Based Editing**: Each paragraph, quote, code block, or math block is edited independently.

## Getting Started

### Prerequisites

- Node.js (v18 or later recommended)
- npm

### Installation

1. Clone the repository.
2. Install root dependencies:
   ```bash
   npm install
   ```

### Running the App

Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173` (default Vite port).

## Project Structure

- `frontend/`: the React + Vite application.
- `frontend/App.tsx`: editor state, block transitions, and mode switching.
- `frontend/components/Block.tsx`: per-block editing and rendered preview.
- `frontend/utils.ts`: block parsing, Markdown helpers, and syntax highlighting.
