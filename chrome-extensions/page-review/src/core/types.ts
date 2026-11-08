export interface Anchor {
  kind: "text" | "element";
  // Text of the area, read from the page's concatenated text nodes.
  exact: string;
  prefix: string;
  suffix: string;
  // Only for element comments: how long the element's full text was.
  length: number;
  // Re-attach hint when the text is empty (e.g. an image) or was edited.
  selector: string | null;
}

export interface Comment {
  id: string;
  message: string;
  // Text shown to people and put in the copied pointer.
  quote: string;
  anchor: Anchor;
  // Headings above the area when it was created, e.g. ["## Findings", "### 2. Slow loop"].
  headingPath: string[];
  createdAt: number;
  updatedAt: number;
}

export interface PageRecord {
  version: 1;
  url: string;
  title: string;
  comments: Comment[];
  hidden: boolean;
}

export interface SourceInfo {
  // Where the page comes from. Set for mo pages.
  filePath: string | null;
  // Raw markdown. Lets us give line numbers.
  markdown: string | null;
}

export interface Pointer {
  lines: { start: number; end: number } | null;
  headingPath: string[];
  quote: string;
  selector: string | null;
}
