export interface Heading {
  level: number;
  text: string;
}

// Turn the headings above a point (in document order) into a path.
// "## A", "### B", "## C", "### D" before the point gives ["## C", "### D"].
export function headingPath(headingsAbove: Heading[]): string[] {
  const stack: Heading[] = [];
  for (const h of headingsAbove) {
    while (stack.length > 0 && stack[stack.length - 1]!.level >= h.level) stack.pop();
    stack.push(h);
  }
  return stack.map((h) => `${"#".repeat(h.level)} ${h.text}`);
}
