export interface BlockData {
  id: string;
  raw: string;
  trailing: string;
}

export type ViewMode = 'wysiwyg' | 'raw';

export type FocusInstruction = 
  | { id: string; type: 'start' | 'end'; _ts?: number }
  | { id: string; type: 'jump'; direction: 'up' | 'down'; col: number; _ts?: number }
  | { id: string; type: 'offset'; offset: number; _ts?: number };
