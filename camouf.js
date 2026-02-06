#!/usr/bin/env node
/**
 * Entry point shim for Camouf CLI.
 * Allows running `node camouf.js` as an alternative to `npx camouf`.
 * Useful for AI agents that guess the entry point by filename.
 */
import './dist/cli/index.js';
