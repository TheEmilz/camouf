/* eslint-env node */
/**
 * Script to generate SVG images from Mermaid diagrams using beautiful-mermaid
 * 
 * Usage: node scripts/generate-diagrams.js
 */

import { renderMermaid, THEMES } from 'beautiful-mermaid';
import * as fs from 'fs/promises';
import * as path from 'path';

const DIAGRAMS_DIR = path.join(process.cwd(), 'docs', 'diagrams');
const OUTPUT_DIR = path.join(process.cwd(), 'docs', 'images');

// Use github-dark theme for consistency
const THEME = THEMES['github-dark'];

async function generateDiagrams() {
  console.log('Generating Mermaid diagrams with beautiful-mermaid...\n');

  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Find all .mmd files
  const files = await fs.readdir(DIAGRAMS_DIR);
  const mmdFiles = files.filter(f => f.endsWith('.mmd'));

  console.log(`Found ${mmdFiles.length} diagram(s) to generate:\n`);

  for (const file of mmdFiles) {
    const inputPath = path.join(DIAGRAMS_DIR, file);
    const outputName = file.replace('.mmd', '.svg');
    const outputPath = path.join(OUTPUT_DIR, outputName);

    console.log(`  ${file} -> ${outputName}`);

    try {
      // Read mermaid source (skip the %%{init...}%% directive if present)
      let content = await fs.readFile(inputPath, 'utf-8');
      
      // Remove mermaid init directive (we use beautiful-mermaid theming instead)
      content = content.replace(/%%\{init:.*?\}%%\s*/s, '');
      content = content.trim();

      // Generate SVG using beautiful-mermaid
      const svg = await renderMermaid(content, THEME);
      
      await fs.writeFile(outputPath, svg, 'utf-8');
      console.log(`     Generated successfully`);
    } catch (error) {
      console.error(`     Failed: ${error.message}`);
    }
  }

  console.log('\nDone!');
  console.log(`Images saved to: ${OUTPUT_DIR}`);
}

generateDiagrams().catch(console.error);
