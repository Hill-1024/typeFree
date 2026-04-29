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
- pnpm

### Installation

1. Clone the repository.
2. Install dependencies:
   ```bash
   pnpm install
   ```

### Running the App

Start the development server:
```bash
pnpm run dev
```

The app will be available at `http://localhost:5173` (default Vite port).

## Project Structure

- `frontend/`: the React + Vite application.
- `frontend/App.tsx`: editor state, block transitions, and mode switching.
- `frontend/components/Block.tsx`: per-block editing and rendered preview.
- `frontend/utils.ts`: block parsing, Markdown helpers, and syntax highlighting.

## Custom Fonts

The app now defaults to a Google Sans font stack through the global `font-sans` definition.

The extension point is `frontend/public/fonts/custom-fonts.css`.

To bundle Google Sans with the app:

1. Put your font files under `frontend/public/fonts/`.
2. Uncomment the sample `@font-face` rules in `frontend/public/fonts/custom-fonts.css`.

To switch to another bundled font, update `--typefree-custom-font-sans` in that file and point the `@font-face` declarations at your font assets.

If no bundled font files are configured, the app will try locally installed `Google Sans` or `Product Sans` before falling back to the system sans-serif stack.
