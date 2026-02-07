/**
 * Test file for ai-hallucinated-imports rule
 * 
 * This file contains imports that don't exist - a common AI mistake
 */

// These imports should trigger violations - they don't exist
import { validateUser } from '@/utils/auth-helpers';  // Path alias to non-existent file
import { formatDate } from 'date-fns/helpers';        // Wrong path in real package
import { someFunction } from './non-existent-file';   // Local file doesn't exist
import { DataProcessor } from '../processors/data';   // Relative path doesn't exist

// This is a real import that should NOT trigger (if lodash is installed)
// import { debounce } from 'lodash';

export function processUser(userId: string) {
  const user = validateUser(userId);
  const date = formatDate(new Date());
  const data = someFunction();
  const processor = new DataProcessor();
  
  return { user, date, data, processor };
}
