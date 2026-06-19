import { DEMO_PAPERS } from '../data/demoLibrary';

export function seedDemoIfEmpty(library, onPaperSaved) {
  const hasDemo = library.some((p) => p.isDemo);
  if (hasDemo) return;
  DEMO_PAPERS.forEach((paper) => onPaperSaved(paper));
}

export function isDemoSeeded(library) {
  return library.some((p) => p.isDemo);
}
